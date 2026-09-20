"use strict";

/**
 * scraperService.js
 *
 * Scraping logic is taken verbatim from scrapers/scraper4.js.
 * The outer scrapeProduct() function retains the existing
 * DB-write contract so the controller and routes are untouched.
 */

const { chromium } = require("playwright");
const productService = require("./productService");

// ─── Per-run timeout (mirrors scraper4.js) ────────────────────────────────────
const RUN_TIMEOUT_MS = 25000;

// ============================================================
// MOUSE MOVEMENT
// ============================================================

async function moveMouseAround(page) {
    await page.mouse.move(200, 200, { steps: 8 });
    await page.waitForTimeout(100);
    await page.mouse.move(500, 350, { steps: 8 });
    await page.waitForTimeout(100);
    await page.mouse.move(800, 500, { steps: 8 });
    await page.waitForTimeout(100);
}

// ============================================================
// COOKIE BANNER  (full scraper4.js version)
// ============================================================

async function handleCookieBanner(page, maxChecks = 12) {
    const cookieBanner = page.locator(
        'div.cookie-banner[role="dialog"][aria-label="Cookie consent"]'
    );
    const acceptButton = page.locator(
        'div.cookie-banner[role="dialog"] button[aria-label="Accept cookies"]'
    );
    const declineButton = page.locator(
        'div.cookie-banner[role="dialog"] button[aria-label="Decline cookies"]'
    );

    for (let attempt = 1; attempt <= maxChecks; attempt++) {
        const bannerVisible = await cookieBanner.isVisible().catch(() => false);
        if (!bannerVisible) {
            await page.waitForTimeout(250);
            continue;
        }

        console.log("\n🍪 COOKIE BANNER FOUND!");

        const acceptVisible  = await acceptButton.isVisible().catch(() => false);
        const declineVisible = await declineButton.isVisible().catch(() => false);
        console.log(`   Accept visible: ${acceptVisible}`);
        console.log(`   Decline visible: ${declineVisible}`);

        if (!acceptVisible) {
            await page.waitForTimeout(200);
            continue;
        }

        await acceptButton.scrollIntoViewIfNeeded().catch(() => {});
        let box = await acceptButton.boundingBox().catch(() => null);
        if (!box) { await page.waitForTimeout(200); continue; }

        let x = box.x + box.width  / 2;
        let y = box.y + box.height / 2;
        console.log(`   📍 Accept position: ${x.toFixed(1)}, ${y.toFixed(1)}`);

        await page.mouse.move(x - 100, y - 50, { steps: 12 });
        await page.waitForTimeout(100);
        await page.mouse.move(x, y, { steps: 12 });
        await page.waitForTimeout(200);

        // Recheck position after movement
        box = await acceptButton.boundingBox().catch(() => null);
        if (!box) continue;
        x = box.x + box.width  / 2;
        y = box.y + box.height / 2;
        console.log(`   🔄 Current position: ${x.toFixed(1)}, ${y.toFixed(1)}`);

        await page.mouse.move(x, y, { steps: 10 });
        await page.waitForTimeout(250);

        const stillVisible = await acceptButton.isVisible().catch(() => false);
        const enabled      = await acceptButton.isEnabled().catch(() => false);
        if (!stillVisible || !enabled) {
            console.log("   ⚠️ Accept changed before click");
            continue;
        }

        console.log("   🖱️ Clicking Accept...");
        await acceptButton.click();
        console.log("   ✅ Accept clicked");

        try {
            await cookieBanner.waitFor({ state: "hidden", timeout: 3000 });
            console.log("   ✅ Cookie banner disappeared!");
            return true;
        } catch (_) {
            console.log("   ⚠️ Banner still visible");
        }
        await page.waitForTimeout(200);
    }
    return false;
}

async function checkCookieQuickly(page) {
    const cookieBanner = page.locator(
        'div.cookie-banner[role="dialog"][aria-label="Cookie consent"]'
    );
    const visible = await cookieBanner.isVisible().catch(() => false);
    if (visible) {
        console.log("🍪 Cookie popup appeared during the flow!");
        await handleCookieBanner(page, 5);
        return true;
    }
    return false;
}

// ============================================================
// GET REVEAL BUTTON
// ============================================================

async function getRevealButton(page) {
    const revealButton = page.locator("button")
        .filter({ hasText: /Reveal\s*Price/i })
        .first();
    try {
        await revealButton.waitFor({ state: "visible", timeout: 10000 });
        return revealButton;
    } catch (_) {
        console.log("❌ Reveal Price button not found");
        return null;
    }
}

// ============================================================
// WAIT FOR REVEAL BUTTON TO BECOME ENABLED
// ============================================================

async function waitForRevealEnabled(page, revealButton) {
    await revealButton.scrollIntoViewIfNeeded().catch(() => {});

    for (let attempt = 1; attempt <= 40; attempt++) {
        await checkCookieQuickly(page);

        const box = await revealButton.boundingBox().catch(() => null);
        if (!box) { await page.waitForTimeout(150); continue; }

        const x = box.x + box.width  / 2;
        const y = box.y + box.height / 2;

        await page.mouse.move(x - 80, y - 40, { steps: 8 });
        await page.waitForTimeout(80);
        await page.mouse.move(x, y, { steps: 12 });
        await page.waitForTimeout(150);

        await checkCookieQuickly(page);

        const visible  = await revealButton.isVisible().catch(() => false);
        const enabled  = await revealButton.isEnabled().catch(() => false);
        console.log(`   Reveal attempt ${attempt}: enabled = ${enabled}`);

        if (visible && enabled) return true;
        await page.waitForTimeout(150);
    }
    return false;
}

// ============================================================
// PRICE-MAIN FINDER
// ============================================================

async function findPriceMain(page) {
    const priceMain = page.locator('[class~="price-main"]').first();
    try {
        await priceMain.waitFor({ state: "visible", timeout: 1000 });
        return priceMain;
    } catch (_) {
        return null;
    }
}

// ============================================================
// NORMALIZE PRICE CANDIDATE
// ============================================================

function normalizePriceCandidate(rawText) {
    if (!rawText || typeof rawText !== "string") return null;

    let text = rawText.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return null;

    text = text.replace(/(?:INR|Rs\.?|₹)\s*/gi, "");

    // Comma-formatted integer (e.g. 1,24,999)
    const commaMatch = text.match(/\b\d{1,3}(?:,\d{2,3})+\b/);
    if (commaMatch) {
        const value = Number(commaMatch[0].replace(/,/g, ""));
        if (Number.isFinite(value) && value > 0)
            return { value, formatted: value.toLocaleString("en-IN") };
    }

    // Plain integer
    const intMatches = text.match(/\b\d{3,9}\b/g);
    if (intMatches) {
        const values = intMatches.map(Number).filter(v => Number.isFinite(v) && v > 0);
        if (values.length > 0) {
            values.sort((a, b) => String(b).length - String(a).length);
            const value = values[0];
            return { value, formatted: value.toLocaleString("en-IN") };
        }
    }

    // Decimal fallback
    const decMatch = text.match(/\b\d+(?:\.\d{1,2})?\b/);
    if (decMatch) {
        const value = Number(decMatch[0]);
        if (Number.isFinite(value) && value > 0)
            return { value, formatted: value.toLocaleString("en-IN") };
    }

    return null;
}

// ============================================================
// EXTRACT ALL PRICE CANDIDATES
// ============================================================

async function extractPriceCandidates(priceMain) {
    const candidates = [];

    const elements    = priceMain.locator("*");
    const count       = await elements.count();
    const allLocators = [priceMain];
    for (let i = 0; i < count; i++) allLocators.push(elements.nth(i));

    for (const element of allLocators) {
        const visible = await element.isVisible().catch(() => false);
        if (!visible) continue;

        const innerText   = await element.innerText().catch(() => "");
        const textContent = await element.textContent().catch(() => "");
        const combined    = `${innerText || ""} ${textContent || ""}`.replace(/\s+/g, " ").trim();
        if (!combined) continue;

        const tagName   = await element.evaluate(el => el.tagName?.toLowerCase() || "").catch(() => "");
        const className = await element.getAttribute("class").catch(() => "");
        const style     = await element.evaluate(el => {
            const c = window.getComputedStyle(el);
            return {
                fontSize:       c.fontSize,
                fontWeight:     c.fontWeight,
                textDecoration: c.textDecoration,
            };
        }).catch(() => ({ fontSize: "", fontWeight: "", textDecoration: "" }));

        const rawCandidates = [];

        const currencyMatches = combined.match(/(?:₹|Rs\.?|INR)\s*[\d,\s]+(?:\.\d{1,2})?/gi) || [];
        for (const v of currencyMatches) rawCandidates.push({ raw: v, hasCurrency: true });

        const numberMatches = combined.match(/\b\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\b|\b\d{3,9}(?:\.\d{1,2})?\b/g) || [];
        for (const v of numberMatches) rawCandidates.push({ raw: v, hasCurrency: /(?:₹|Rs\.?|INR)/i.test(combined) });

        const seenRaw = new Set();
        for (const candidate of rawCandidates) {
            const raw = candidate.raw.trim();
            if (!raw || seenRaw.has(raw)) continue;
            seenRaw.add(raw);

            const normalized = normalizePriceCandidate(raw);
            if (!normalized) continue;

            const numericValue = normalized.value;
            if (numericValue < 100 && !candidate.hasCurrency) continue;

            const context = `${combined} ${className || ""}`.toLowerCase();
            let score = 0;

            if (candidate.hasCurrency)              score += 50;

            const digitCount = String(Math.trunc(numericValue)).length;
            if (digitCount >= 4) score += 15;
            if (digitCount >= 5) score += 10;

            const fontSize   = parseFloat(style.fontSize)   || 0;
            const fontWeight = parseInt(style.fontWeight, 10) || 0;
            if (fontSize   >= 20) score += 15; else if (fontSize   >= 16) score += 8;
            if (fontWeight >= 700) score += 8; else if (fontWeight >= 600) score += 4;

            if (/current|actual|selling|sale|final|payable|total|amount/.test(context)) score += 30;
            if (/price|fare|cost/.test(context))                                         score += 12;

            if (/old|original|mrp|was|strike|striked|discount/.test(context))       score -= 45;
            if (/line-through|linethrough/.test(style.textDecoration || ""))         score -= 60;
            if (combined.includes("%"))                                               score -= 80;
            if (numericValue <= 99 && !candidate.hasCurrency)                        score -= 25;

            candidates.push({
                value:     numericValue,
                formatted: `₹${normalized.formatted}`,
                raw,
                score,
                tagName,
                className,
                context:   combined.slice(0, 250),
                fontSize,
                fontWeight,
            });
        }
    }
    return candidates;
}

// ============================================================
// CHOOSE BEST PRICE
// ============================================================

async function chooseBestPrice(priceMain) {
    const candidates = await extractPriceCandidates(priceMain);
    if (candidates.length === 0) return null;

    const bestByValue = new Map();
    for (const c of candidates) {
        const existing = bestByValue.get(c.value);
        if (!existing || c.score > existing.score) bestByValue.set(c.value, c);
    }

    const unique = Array.from(bestByValue.values()).sort((a, b) => b.score - a.score);

    console.log("\n🔎 PRICE CANDIDATES:");
    unique.slice(0, 10).forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.formatted} | score=${c.score} | tag=${c.tagName} | class=${c.className || "-"}`);
        console.log(`      context: ${c.context}`);
    });

    const best = unique[0];
    if (!best || !Number.isFinite(best.value) || best.value <= 0) return null;

    console.log(`\n💰 SELECTED PRICE: ${best.formatted}`);
    return best.formatted;
}

// ============================================================
// NORMALIZE STOCK TEXT
// Returns { status, quantity } or null if text is unrelated to stock.
//
// Recognised patterns (case-insensitive):
//   "Out of stock"                         → status=out_of_stock, quantity=0
//   "Hurry, just 84 left"                  → status=in_stock,     quantity=84
//   "Selling fast, 158 left"               → status=in_stock,     quantity=158
//   "Only 151 left"                        → status=in_stock,     quantity=151
//   "In stock"                             → status=in_stock,     quantity=null
//   "Limited stock"                        → status=in_stock,     quantity=null
//   Any text containing "left" near a digit → in_stock + quantity
//   Any "N available" / "N items"          → in_stock + quantity
// ============================================================

function normalizeStockText(raw) {
    if (!raw || typeof raw !== "string") return null;

    const text = raw
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!text) return null;

    const lower = text.toLowerCase();

    // ── Explicit out-of-stock signals ─────────────────────────
    if (/out[\s-]of[\s-]stock|unavailable|not\s+available|sold\s+out/i.test(lower)) {
        return { status: "out_of_stock", quantity: 0 };
    }

    // ── Quantity-bearing in-stock phrases ─────────────────────
    const leftMatch = lower.match(
        /(?:just|only|hurry[^0-9]*|selling\s+fast[^0-9]*|limited[^0-9]*)(\d+)\s*(?:items?\s+)?left/i
    );
    if (leftMatch) {
        const qty = parseInt(leftMatch[1], 10);
        if (Number.isFinite(qty) && qty >= 0) {
            return { status: "in_stock", quantity: qty };
        }
    }

    // Plain "N left" without lead-in phrase
    const plainLeft = lower.match(/\b(\d+)\s*(?:items?\s+)?left\b/i);
    if (plainLeft) {
        const qty = parseInt(plainLeft[1], 10);
        if (Number.isFinite(qty) && qty >= 0) {
            return { status: "in_stock", quantity: qty };
        }
    }

    // "N available" or "N items available"
    const availMatch = lower.match(/\b(\d+)\s*(?:items?\s+)?available\b/i);
    if (availMatch) {
        const qty = parseInt(availMatch[1], 10);
        if (Number.isFinite(qty) && qty >= 0) {
            return { status: "in_stock", quantity: qty };
        }
    }

    // "N in stock"
    const inStockQty = lower.match(/\b(\d+)\s+in\s+stock\b/i);
    if (inStockQty) {
        const qty = parseInt(inStockQty[1], 10);
        if (Number.isFinite(qty) && qty >= 0) {
            return { status: "in_stock", quantity: qty };
        }
    }

    // ── Generic in-stock signals (no quantity) ─────────────────
    if (/\bin[\s-]stock\b|in\s+stock|available|limited\s+stock|low\s+stock/i.test(lower)) {
        return { status: "in_stock", quantity: null };
    }

    // ── Hurry/selling fast without a number ───────────────────
    if (/hurry|selling\s+fast/i.test(lower)) {
        return { status: "in_stock", quantity: null };
    }

    return null;
}

// ============================================================
// SCORE A STOCK CANDIDATE
// ============================================================

function scoreStockCandidate(text, className) {
    const normalized = normalizeStockText(text);
    if (!normalized) return null;

    const lower = (text + " " + (className || "")).toLowerCase();
    let score = 10;

    if (/stock-badge|stock_badge|stockbadge/i.test(lower))    score += 40;
    if (/out-stock|out_stock/i.test(lower))                   score += 30;
    if (/in-stock|in_stock/i.test(lower))                     score += 30;
    if (/price-facets|price_facets|pricefacets/i.test(lower)) score += 20;
    if (/price-block|price_block|priceblock/i.test(lower))    score += 15;
    if (/stock|availability|inventory/i.test(lower))          score += 15;

    if (normalized.quantity !== null)                         score += 25;
    if (normalized.status === "out_of_stock")                 score += 10;

    if (text.length > 80)                                     score -= 20;
    if (text.length > 200)                                    score -= 40;

    if (/(?:₹|Rs\.?|INR)/i.test(text))                       score -= 30;

    return score;
}

// ============================================================
// EXTRACT STOCK FROM PAGE
//
// Called after the Reveal-Price flow completes (revealed state).
// Searches a wide set of candidate containers and scores them.
// Returns { status, quantity, rawText } on confident match,
// or { status: "unknown", quantity: null, rawText: null } if
// nothing credible is found.
// ============================================================

async function extractStockFromPage(page) {
    const candidates = [];

    async function collectFromLocator(locator, source, extraScore = 0) {
        let count;
        try { count = await locator.count(); } catch (_) { return; }

        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            const visible = await el.isVisible().catch(() => false);
            if (!visible) continue;

            const text = (await el.innerText().catch(() => "")).trim();
            if (!text || text.length < 2) continue;

            const className = await el.getAttribute("class").catch(() => "");
            const score = scoreStockCandidate(text, className);
            if (score === null) continue;

            candidates.push({ text, className: className || "", score: score + extraScore, source });
        }
    }

    // 1. Direct stock badge selectors (known from observed DOM)
    await collectFromLocator(page.locator(".stock-badge"),           "stock-badge",    +20);
    await collectFromLocator(page.locator(".stock-badge.out-stock"), "stock-badge.out",+30);
    await collectFromLocator(page.locator(".stock-badge.in-stock"),  "stock-badge.in", +30);
    await collectFromLocator(page.locator("[class*='stock-badge']"), "stock-badge-*",  +20);
    await collectFromLocator(page.locator("[class*='stockBadge']"),  "stockBadge-*",   +20);
    await collectFromLocator(page.locator("[class*='stock_badge']"), "stock_badge-*",  +20);

    // 2. Price-related ancestor containers (observed: .price-facets, .price-block)
    await collectFromLocator(page.locator("[class*='price-facet']"),  "price-facet",   +10);
    await collectFromLocator(page.locator("[class*='price-block']"),  "price-block",   +10);
    await collectFromLocator(page.locator("[class*='price-success']"),"price-success", +10);
    await collectFromLocator(page.locator("[class*='priceFacet']"),   "priceFacet",    +10);
    await collectFromLocator(page.locator("[class*='priceBlock']"),   "priceBlock",    +10);

    // 3. Any element whose class contains "stock" or "availability"
    await collectFromLocator(page.locator("[class*='stock']"),        "class*stock",   +5);
    await collectFromLocator(page.locator("[class*='availability']"), "class*avail",   +5);
    await collectFromLocator(page.locator("[class*='inventory']"),    "class*inventory",+5);

    // 4. Siblings / nearby elements to .price-main
    await collectFromLocator(page.locator('[class~="price-main"] ~ *'), "price-main-sibling", +5);
    await collectFromLocator(page.locator('[class~="price-main"] + *'), "price-main-next",    +5);

    // 5. Broad page scan as a last resort
    await collectFromLocator(page.locator("p, span, div, small, strong, li"), "broad", 0);

    if (candidates.length === 0) {
        console.log("📦 STOCK: no candidates found → unknown");
        return { status: "unknown", quantity: null, rawText: null };
    }

    // De-duplicate by text — keep highest score per unique text
    const bestByText = new Map();
    for (const c of candidates) {
        const key = c.text.toLowerCase().trim();
        const existing = bestByText.get(key);
        if (!existing || c.score > existing.score) bestByText.set(key, c);
    }

    const ranked = Array.from(bestByText.values()).sort((a, b) => b.score - a.score);

    console.log("\n📦 STOCK CANDIDATES:");
    ranked.slice(0, 6).forEach((c, i) => {
        const norm = normalizeStockText(c.text);
        console.log(`   ${i + 1}. "${c.text}" | score=${c.score} | class="${c.className}" | source=${c.source}`);
        console.log(`      → ${JSON.stringify(norm)}`);
    });

    const CONFIDENCE_THRESHOLD = 20;
    const best = ranked[0];

    if (best.score < CONFIDENCE_THRESHOLD) {
        console.log(`📦 STOCK: top candidate score ${best.score} < threshold ${CONFIDENCE_THRESHOLD} → unknown`);
        return { status: "unknown", quantity: null, rawText: null };
    }

    const normalized = normalizeStockText(best.text);
    if (!normalized) {
        console.log("📦 STOCK: normalisation returned null → unknown");
        return { status: "unknown", quantity: null, rawText: null };
    }

    console.log(`\n📦 SELECTED STOCK: "${best.text}" → status=${normalized.status}, qty=${normalized.quantity}`);
    return {
        status:   normalized.status,
        quantity: normalized.quantity,
        rawText:  best.text,
    };
}

// ============================================================
// WAIT FOR A VALID PRICE  (polls price-main for up to maxWaitMs)
// ============================================================

async function waitForValidPrice(page, runDeadline, maxWaitMs = 5000) {
    const localDeadline = Math.min(Date.now() + maxWaitMs, runDeadline);
    let sawPriceMain = false;

    while (Date.now() < localDeadline) {
        await checkCookieQuickly(page);

        const priceMain = await findPriceMain(page);
        if (priceMain) {
            sawPriceMain = true;
            const price = await chooseBestPrice(priceMain);
            if (price) return { price, sawPriceMain: true };
        }
        await page.waitForTimeout(100);
    }
    return { price: null, sawPriceMain };
}

// ============================================================
// CLICK REVEAL + WAIT FOR VALID PRICE
// ============================================================

async function clickRevealAndWait(page, revealButton, clickNumber, runDeadline) {
    if (Date.now() >= runDeadline) {
        console.log(`⏰ Run deadline reached before Reveal #${clickNumber}`);
        return null;
    }

    await checkCookieQuickly(page);

    const visible = await revealButton.isVisible().catch(() => false);
    if (!visible) {
        console.log(`❌ Reveal #${clickNumber}: button not visible`);
        return null;
    }

    await revealButton.scrollIntoViewIfNeeded().catch(() => {});

    const box = await revealButton.boundingBox().catch(() => null);
    if (!box) {
        console.log(`❌ Reveal #${clickNumber}: could not get button position`);
        return null;
    }

    const x = box.x + box.width  / 2;
    const y = box.y + box.height / 2;

    console.log(`\n🖱️ REVEAL #${clickNumber}`);
    console.log(`   Button position: ${x.toFixed(1)}, ${y.toFixed(1)}`);

    await page.mouse.move(x - 80, y - 40, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.move(x, y, { steps: 12 });
    await page.waitForTimeout(200);

    await checkCookieQuickly(page);

    const enabled = await revealButton.isEnabled().catch(() => false);
    if (!enabled) {
        console.log(`❌ Reveal #${clickNumber}: button disabled`);
        return null;
    }

    console.log(`   🖱️ Clicking Reveal Price #${clickNumber}...`);
    try {
        await revealButton.click({ timeout: 2000 });
    } catch (err) {
        console.log(`❌ Reveal #${clickNumber} click failed:`, err.message);
        return null;
    }
    console.log(`   ✅ Reveal #${clickNumber} clicked`);

    console.log(`   🔍 Watching for actual price for up to 5 seconds...`);
    const result = await waitForValidPrice(page, runDeadline, 5000);

    if (result.price) {
        console.log(`   🎯 VALID PRICE FOUND after Reveal #${clickNumber}`);
        return result.price;
    }

    if (result.sawPriceMain) {
        console.log(`   ⚠️ .price-main appeared, but no valid price was extracted`);
    } else {
        console.log(`   ⚠️ .price-main did not produce a valid price`);
    }
    return null;
}

// ============================================================
// SCRAPE ONE PRODUCT  (exact scraper4.js flow)
// ============================================================

async function scrapeSingleProduct(page, url) {
    const runStart    = Date.now();
    const runDeadline = runStart + RUN_TIMEOUT_MS;

    function timeLeft()  { return Math.max(0, runDeadline - Date.now()); }
    function timedOut()  { return Date.now() >= runDeadline; }

    // 1. Navigate
    if (timedOut()) throw new Error("RUN_TIMEOUT");
    console.log(`🌐 Opening: ${url}`);
    await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout:   Math.max(1, Math.min(10000, timeLeft())),
    });
    console.log("   ✅ Product page loaded");

    // 2. Initial mouse movement
    if (timedOut()) throw new Error("RUN_TIMEOUT");
    await moveMouseAround(page);
    if (timedOut()) throw new Error("RUN_TIMEOUT");

    // 3. Cookie banner
    console.log("🍪 Checking cookie banner...");
    await handleCookieBanner(page, 12);
    if (timedOut()) throw new Error("RUN_TIMEOUT");

    // 4. Find reveal button
    console.log("🔍 Looking for Reveal Price button...");
    const revealButton = await getRevealButton(page);
    if (!revealButton) throw new Error("Reveal Price button not found");
    if (timedOut()) throw new Error("RUN_TIMEOUT");

    // 5. Wait for reveal to become enabled
    console.log("⏳ Waiting for Reveal Price to become enabled...");
    const revealReady = await waitForRevealEnabled(page, revealButton);
    if (!revealReady) throw new Error("Reveal Price never became enabled");
    if (timedOut()) throw new Error("RUN_TIMEOUT");
    console.log("✅ Reveal Price is ENABLED");

    // 6. Reveal #1
    const firstPrice = await clickRevealAndWait(page, revealButton, 1, runDeadline);
    if (firstPrice) {
        // Extract stock from the now-revealed page state
        const stock = await extractStockFromPage(page).catch(() => ({
            status: "unknown", quantity: null, rawText: null
        }));
        return { price: firstPrice, stock };
    }

    // 7. First reveal failed — try second
    if (timedOut()) throw new Error("RUN_TIMEOUT");
    console.log("\n⚠️ FIRST REVEAL DID NOT PRODUCE A VALID PRICE");
    console.log("🔄 Preparing SECOND Reveal attempt...");
    await page.waitForTimeout(Math.min(200, timeLeft()));
    if (timedOut()) throw new Error("RUN_TIMEOUT");

    // 8. Re-locate reveal button (live locator resolves current DOM)
    const secondRevealButton = page.locator("button")
        .filter({ hasText: /Reveal\s*Price/i })
        .first();
    const secondVisible = await secondRevealButton.isVisible().catch(() => false);
    if (!secondVisible) throw new Error("Reveal button no longer available for attempt #2");

    // 9. Wait for second reveal to become enabled
    const secondReady = await waitForRevealEnabled(page, secondRevealButton);
    if (!secondReady) throw new Error("Second Reveal Price never became enabled");
    if (timedOut()) throw new Error("RUN_TIMEOUT");

    // 10. Reveal #2
    const secondPrice = await clickRevealAndWait(page, secondRevealButton, 2, runDeadline);
    if (secondPrice) {
        // Extract stock from the now-revealed page state
        const stock = await extractStockFromPage(page).catch(() => ({
            status: "unknown", quantity: null, rawText: null
        }));
        return { price: secondPrice, stock };
    }

    throw new Error("Both reveal attempts failed to produce a valid price");
}

// ============================================================
// PUBLIC: scrapeProduct
//
// Keeps the same DB-write contract as before so the controller
// and routes need no changes.
// ============================================================

async function scrapeProduct(trackedProduct) {
    const product   = trackedProduct.products;
    const trackedId = trackedProduct.id;
    const url       = product.url;

    const isHeadless = process.env.SCRAPER_HEADLESS === "true";
    const maxRetries = parseInt(process.env.MAX_PRODUCT_RETRIES || "2", 10);

    const browser = await chromium.launch({ headless: isHeadless, slowMo: 0 });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    let finalResult = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let page;
        try {
            console.log(`[SCRAPER] Product ${product.store_product_id} — attempt ${attempt}/${maxRetries}`);
            page = await context.newPage();

            page.on("requestfailed", req =>
                console.log("❌ REQUEST FAILED:", req.url(), req.failure()?.errorText)
            );
            page.on("pageerror", err =>
                console.log("❌ PAGE ERROR:", err.message)
            );

            const { price: priceFormatted, stock } = await scrapeSingleProduct(page, url);

            // Convert "₹1,23,456" → numeric
            const numericPrice   = parseFloat(priceFormatted.replace(/[^0-9.]/g, ""));
            const stockStatus    = stock?.status   ?? "unknown";
            const stockQuantity  = stock?.quantity ?? null;

            console.log(`[SCRAPER] ✅ Price: ${priceFormatted} (${numericPrice}) for product ${product.store_product_id}`);
            console.log(`[SCRAPER] 📦 Stock: status=${stockStatus}, qty=${stockQuantity}`);

            const scrapedAt = new Date().toISOString();

            // Build observed_stock string for the log
            let observedStockText = stockStatus;
            if (stockQuantity !== null) observedStockText += ` (qty=${stockQuantity})`;

            await productService.addScrapeLog({
                tracked_product_id: trackedId,
                attempt_timestamp:  scrapedAt,
                attempt_number:     attempt,
                status:             "success",
                error_message:      null,
                observed_price:     numericPrice,
                observed_stock:     observedStockText,
                stock_quantity:     stockQuantity,
            });

            await productService.addPriceHistory({
                tracked_product_id: trackedId,
                price:              numericPrice,
                stock_status:       stockStatus,
                stock_quantity:     stockQuantity,
                scraped_at:         scrapedAt,
            });

            finalResult = {
                success:       true,
                productId:     product.id,
                url,
                price:         numericPrice,
                stockStatus,
                stockQuantity,
                scrapedAt,
                error:         null,
            };
            break;

        } catch (error) {
            console.log(`[SCRAPER] ❌ Attempt ${attempt} failed: ${error.message}`);

            await productService.addScrapeLog({
                tracked_product_id: trackedId,
                attempt_timestamp:  new Date().toISOString(),
                attempt_number:     attempt,
                status:             "failed",
                error_message:      error.message,
                observed_price:     null,
                observed_stock:     null,
                stock_quantity:     null,
            }).catch(() => {});

            finalResult = {
                success:       false,
                productId:     product.id,
                url,
                price:         null,
                stockStatus:   "unknown",
                stockQuantity: null,
                scrapedAt:     new Date().toISOString(),
                error:         error.message,
            };

            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
        } finally {
            if (page) await page.close().catch(() => {});
        }
    }

    await browser.close().catch(() => {});
    return finalResult;
}

module.exports = { scrapeProduct };
