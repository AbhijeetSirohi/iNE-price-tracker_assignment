const { chromium } = require("playwright");

(async () => {

    // ============================================================
    // CONFIG
    // ============================================================

    const BASE_URL =
        "https://demo.inelabteamdev.com/product/";

    const START_ID = 1;
    const END_ID = 1000;

    // Maximum complete runs for the same product ID.
    const MAX_PRODUCT_RETRIES = 2;


    // ============================================================
    // START BROWSER
    // ============================================================

    console.log("========================================");
    console.log("🚀 INE 1000-PRODUCT PRICE SCRAPER");
    console.log("========================================");


    const browser = await chromium.launch({
        headless: false,
        slowMo: 0
    });


    const context = await browser.newContext({
        viewport: {
            width: 1440,
            height: 900
        }
    });


    const page = await context.newPage();


    // ============================================================
    // OPTIONAL NETWORK DEBUGGING
    // ============================================================

    const DEBUG_NETWORK = false;


    if (DEBUG_NETWORK) {

        page.on("request", request => {

            const url = request.url();

            if (
                url.includes("/api/challenge") ||
                url.includes("/api/session") ||
                url.includes("/api/products/")
            ) {

                console.log(
                    `➡️ ${request.method()} ${url}`
                );
            }
        });


        page.on("response", response => {

            const url = response.url();

            if (
                url.includes("/api/challenge") ||
                url.includes("/api/session") ||
                url.includes("/api/products/")
            ) {

                console.log(
                    `⬅️ ${response.status()} ${url}`
                );
            }
        });
    }


    page.on("requestfailed", request => {

        console.log(
            "❌ REQUEST FAILED:",
            request.url()
        );

        console.log(
            "   ",
            request.failure()?.errorText
        );
    });


    page.on("pageerror", error => {

        console.log(
            "❌ PAGE ERROR:",
            error.message
        );
    });


    // ============================================================
    // MOUSE MOVEMENT
    // ============================================================

    async function moveMouseAround() {

        await page.mouse.move(
            200,
            200,
            {
                steps: 8
            }
        );

        await page.waitForTimeout(100);


        await page.mouse.move(
            500,
            350,
            {
                steps: 8
            }
        );

        await page.waitForTimeout(100);


        await page.mouse.move(
            800,
            500,
            {
                steps: 8
            }
        );

        await page.waitForTimeout(100);
    }


    // ============================================================
    // COOKIE BANNER
    // ============================================================

    async function handleCookieBanner(
        maxChecks = 12
    ) {

        const cookieBanner =
            page.locator(
                'div.cookie-banner[role="dialog"][aria-label="Cookie consent"]'
            );


        const acceptButton =
            page.locator(
                'div.cookie-banner[role="dialog"] button[aria-label="Accept cookies"]'
            );


        const declineButton =
            page.locator(
                'div.cookie-banner[role="dialog"] button[aria-label="Decline cookies"]'
            );


        for (
            let attempt = 1;
            attempt <= maxChecks;
            attempt++
        ) {

            const bannerVisible =
                await cookieBanner
                    .isVisible()
                    .catch(() => false);


            if (!bannerVisible) {

                await page.waitForTimeout(250);

                continue;
            }


            console.log(
                "\n🍪 COOKIE BANNER FOUND!"
            );


            const acceptVisible =
                await acceptButton
                    .isVisible()
                    .catch(() => false);


            const declineVisible =
                await declineButton
                    .isVisible()
                    .catch(() => false);


            console.log(
                `   Accept visible: ${acceptVisible}`
            );

            console.log(
                `   Decline visible: ${declineVisible}`
            );


            if (!acceptVisible) {

                await page.waitForTimeout(200);

                continue;
            }


            // ====================================================
            // GET CURRENT ACCEPT BUTTON POSITION
            // ====================================================

            await acceptButton
                .scrollIntoViewIfNeeded()
                .catch(() => {});


            let box =
                await acceptButton
                    .boundingBox()
                    .catch(() => null);


            if (!box) {

                await page.waitForTimeout(200);

                continue;
            }


            let x =
                box.x +
                box.width / 2;

            let y =
                box.y +
                box.height / 2;


            console.log(
                `   📍 Accept position: ${x.toFixed(1)}, ${y.toFixed(1)}`
            );


            // ====================================================
            // MOVE TOWARDS ACCEPT
            // ====================================================

            await page.mouse.move(
                x - 100,
                y - 50,
                {
                    steps: 12
                }
            );


            await page.waitForTimeout(100);


            await page.mouse.move(
                x,
                y,
                {
                    steps: 12
                }
            );


            await page.waitForTimeout(200);


            // ====================================================
            // RECHECK POSITION
            // ====================================================

            box =
                await acceptButton
                    .boundingBox()
                    .catch(() => null);


            if (!box) {
                continue;
            }


            x =
                box.x +
                box.width / 2;

            y =
                box.y +
                box.height / 2;


            console.log(
                `   🔄 Current position: ${x.toFixed(1)}, ${y.toFixed(1)}`
            );


            await page.mouse.move(
                x,
                y,
                {
                    steps: 10
                }
            );


            await page.waitForTimeout(250);


            // ====================================================
            // FINAL CHECK
            // ====================================================

            const stillVisible =
                await acceptButton
                    .isVisible()
                    .catch(() => false);


            const enabled =
                await acceptButton
                    .isEnabled()
                    .catch(() => false);


            if (
                !stillVisible ||
                !enabled
            ) {

                console.log(
                    "   ⚠️ Accept changed before click"
                );

                continue;
            }


            // ====================================================
            // CLICK ACCEPT
            // ====================================================

            console.log(
                "   🖱️ Clicking Accept..."
            );


            await acceptButton.click();


            console.log(
                "   ✅ Accept clicked"
            );


            // ====================================================
            // VERIFY BANNER DISAPPEARED
            // ====================================================

            try {

                await cookieBanner.waitFor({
                    state: "hidden",
                    timeout: 3000
                });


                console.log(
                    "   ✅ Cookie banner disappeared!"
                );


                return true;

            } catch (error) {

                console.log(
                    "   ⚠️ Banner still visible"
                );
            }


            await page.waitForTimeout(200);
        }


        return false;
    }


    // ============================================================
    // QUICK COOKIE CHECK
    // ============================================================

    async function checkCookieQuickly() {

        const cookieBanner =
            page.locator(
                'div.cookie-banner[role="dialog"][aria-label="Cookie consent"]'
            );


        const visible =
            await cookieBanner
                .isVisible()
                .catch(() => false);


        if (visible) {

            console.log(
                "🍪 Cookie popup appeared during the flow!"
            );


            await handleCookieBanner(5);

            return true;
        }


        return false;
    }


    // ============================================================
    // GET REVEAL BUTTON
    // ============================================================

    async function getRevealButton() {

        const revealButton =
            page
                .locator("button")
                .filter({
                    hasText: /Reveal\s*Price/i
                })
                .first();


        try {

            await revealButton.waitFor({
                state: "visible",
                timeout: 10000
            });


            return revealButton;

        } catch (error) {

            console.log(
                "❌ Reveal Price button not found"
            );


            return null;
        }
    }


    // ============================================================
    // WAIT FOR REVEAL BUTTON TO BECOME ENABLED
    // ============================================================

    async function waitForRevealEnabled(
        revealButton
    ) {

        await revealButton
            .scrollIntoViewIfNeeded()
            .catch(() => {});


        // Approximately 12 seconds maximum.
        for (
            let attempt = 1;
            attempt <= 40;
            attempt++
        ) {

            // Cookie can appear asynchronously.
            await checkCookieQuickly();


            const box =
                await revealButton
                    .boundingBox()
                    .catch(() => null);


            if (!box) {

                await page.waitForTimeout(150);

                continue;
            }


            const x =
                box.x +
                box.width / 2;

            const y =
                box.y +
                box.height / 2;


            // ====================================================
            // MOVE TOWARDS BUTTON
            // ====================================================

            await page.mouse.move(
                x - 80,
                y - 40,
                {
                    steps: 8
                }
            );


            await page.waitForTimeout(80);


            // ====================================================
            // MOVE ONTO BUTTON
            // ====================================================

            await page.mouse.move(
                x,
                y,
                {
                    steps: 12
                }
            );


            await page.waitForTimeout(150);


            // Cookie may have appeared during movement.
            await checkCookieQuickly();


            // ====================================================
            // CHECK BUTTON
            // ====================================================

            const visible =
                await revealButton
                    .isVisible()
                    .catch(() => false);


            const enabled =
                await revealButton
                    .isEnabled()
                    .catch(() => false);


            console.log(
                `   Reveal attempt ${attempt}: enabled = ${enabled}`
            );


            if (
                visible &&
                enabled
            ) {

                return true;
            }


            await page.waitForTimeout(150);
        }


        return false;
    }


    // ============================================================
    // PRICE-MAIN FINDER
    // ============================================================

    async function findPriceMain() {

        const priceMain =
            page
                .locator('[class~="price-main"]')
                .first();


        try {

            await priceMain.waitFor({
                state: "visible",
                timeout: 1000
            });


            return priceMain;

        } catch (error) {

            return null;
        }
    }


    // ============================================================
    // NORMALIZE PRICE CANDIDATE
    // ============================================================

    function normalizePriceCandidate(
        rawText
    ) {

        if (
            !rawText ||
            typeof rawText !== "string"
        ) {

            return null;
        }


        let text =
            rawText
                .replace(/\u00A0/g, " ")
                .replace(/\s+/g, " ")
                .trim();


        if (!text) {
            return null;
        }


        // --------------------------------------------------------
        // Remove common currency text while preserving digits.
        // --------------------------------------------------------

        text =
            text.replace(
                /(?:INR|Rs\.?|₹)\s*/gi,
                ""
            );


        // --------------------------------------------------------
        // First preference:
        // integer containing commas.
        // Example: 1,24,999
        // --------------------------------------------------------

        const commaMatch =
            text.match(
                /\b\d{1,3}(?:,\d{2,3})+\b/
            );


        if (commaMatch) {

            const numeric =
                commaMatch[0]
                    .replace(/,/g, "");


            const value =
                Number(numeric);


            if (
                Number.isFinite(value) &&
                value > 0
            ) {

                return {
                    value,
                    formatted:
                        value.toLocaleString("en-IN")
                };
            }
        }


        // --------------------------------------------------------
        // Second preference:
        // plain integer.
        // --------------------------------------------------------

        const integerMatches =
            text.match(/\b\d{3,9}\b/g);


        if (integerMatches) {

            const values =
                integerMatches
                    .map(value => Number(value))
                    .filter(value =>
                        Number.isFinite(value) &&
                        value > 0
                    );


            if (values.length > 0) {

                // Usually the longest numeric sequence is the
                // actual price when the DOM is fragmented.
                values.sort(
                    (a, b) =>
                        String(b).length -
                        String(a).length
                );


                const value =
                    values[0];


                return {
                    value,
                    formatted:
                        value.toLocaleString("en-IN")
                };
            }
        }


        // --------------------------------------------------------
        // Decimal fallback.
        // --------------------------------------------------------

        const decimalMatch =
            text.match(
                /\b\d+(?:\.\d{1,2})?\b/
            );


        if (decimalMatch) {

            const value =
                Number(decimalMatch[0]);


            if (
                Number.isFinite(value) &&
                value > 0
            ) {

                return {
                    value,
                    formatted:
                        value.toLocaleString("en-IN")
                };
            }
        }


        return null;
    }


    // ============================================================
    // EXTRACT ALL PRICE CANDIDATES
    // ============================================================

    async function extractPriceCandidates(
        priceMain
    ) {

        const candidates = [];


        // Root + every descendant.
        const elements =
            priceMain.locator("*");


        const count =
            await elements.count();


        // Include the root itself.
        const allLocators = [
            priceMain
        ];


        for (
            let i = 0;
            i < count;
            i++
        ) {

            allLocators.push(
                elements.nth(i)
            );
        }


        for (
            let i = 0;
            i < allLocators.length;
            i++
        ) {

            const element =
                allLocators[i];


            const visible =
                await element
                    .isVisible()
                    .catch(() => false);


            if (!visible) {
                continue;
            }


            const innerText =
                await element
                    .innerText()
                    .catch(() => "");


            const textContent =
                await element
                    .textContent()
                    .catch(() => "");


            const combinedText =
                `${innerText || ""} ${textContent || ""}`
                    .replace(/\s+/g, " ")
                    .trim();


            if (!combinedText) {
                continue;
            }


            const tagName =
                await element
                    .evaluate(
                        el =>
                            el.tagName
                                ?.toLowerCase() || ""
                    )
                    .catch(() => "");


            const className =
                await element
                    .getAttribute("class")
                    .catch(() => "");


            const style =
                await element
                    .evaluate(el => {

                        const computed =
                            window.getComputedStyle(el);

                        return {
                            fontSize:
                                computed.fontSize,

                            fontWeight:
                                computed.fontWeight,

                            textDecoration:
                                computed.textDecoration,

                            display:
                                computed.display,

                            visibility:
                                computed.visibility
                        };

                    })
                    .catch(() => ({
                        fontSize: "",
                        fontWeight: "",
                        textDecoration: "",
                        display: "",
                        visibility: ""
                    }));


            // ----------------------------------------------------
            // Candidate text extraction
            // ----------------------------------------------------

            const rawCandidates = [];


            // Currency-prefixed values.
            const currencyMatches =
                combinedText.match(
                    /(?:₹|Rs\.?|INR)\s*[\d,\s]+(?:\.\d{1,2})?/gi
                ) || [];


            for (
                const value of currencyMatches
            ) {

                rawCandidates.push({
                    raw: value,
                    hasCurrency: true
                });
            }


            // Plain numeric values.
            const numberMatches =
                combinedText.match(
                    /\b\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?\b|\b\d{3,9}(?:\.\d{1,2})?\b/g
                ) || [];


            for (
                const value of numberMatches
            ) {

                rawCandidates.push({
                    raw: value,
                    hasCurrency:
                        /(?:₹|Rs\.?|INR)/i
                            .test(combinedText)
                });
            }


            // ----------------------------------------------------
            // Deduplicate raw candidates for this element.
            // ----------------------------------------------------

            const seenRaw =
                new Set();


            for (
                const candidate
                of rawCandidates
            ) {

                const raw =
                    candidate.raw
                        .trim();


                if (
                    !raw ||
                    seenRaw.has(raw)
                ) {
                    continue;
                }


                seenRaw.add(raw);


                const normalized =
                    normalizePriceCandidate(
                        raw
                    );


                if (!normalized) {
                    continue;
                }


                const numericValue =
                    normalized.value;


                // Ignore absurdly tiny values unless currency is
                // explicitly attached.
                if (
                    numericValue < 100 &&
                    !candidate.hasCurrency
                ) {
                    continue;
                }


                // ------------------------------------------------
                // Build scoring context.
                // ------------------------------------------------

                const context =
                    `${combinedText} ${className || ""}`
                        .toLowerCase();


                let score = 0;


                // Currency is a very strong signal.
                if (
                    candidate.hasCurrency
                ) {
                    score += 50;
                }


                // Larger numbers are generally more likely to be
                // the actual product price than UI counters.
                const digitCount =
                    String(
                        Math.trunc(
                            numericValue
                        )
                    ).length;


                if (digitCount >= 4) {
                    score += 15;
                }


                if (digitCount >= 5) {
                    score += 10;
                }


                // ------------------------------------------------
                // Visual prominence.
                // ------------------------------------------------

                const fontSize =
                    parseFloat(
                        style.fontSize
                    ) || 0;


                if (fontSize >= 20) {
                    score += 15;
                } else if (
                    fontSize >= 16
                ) {
                    score += 8;
                }


                const fontWeight =
                    parseInt(
                        style.fontWeight,
                        10
                    ) || 0;


                if (fontWeight >= 700) {
                    score += 8;
                } else if (
                    fontWeight >= 600
                ) {
                    score += 4;
                }


                // ------------------------------------------------
                // Semantic positive signals.
                // ------------------------------------------------

                if (
                    /current|actual|selling|sale|final|payable|total|amount/
                        .test(context)
                ) {
                    score += 30;
                }


                if (
                    /price|fare|cost/
                        .test(context)
                ) {
                    score += 12;
                }


                // ------------------------------------------------
                // Semantic negative signals.
                // ------------------------------------------------

                if (
                    /old|original|mrp|was|strike|striked|discount/
                        .test(context)
                ) {
                    score -= 45;
                }


                if (
                    /line-through|linethrough/
                        .test(
                            style.textDecoration ||
                            ""
                        )
                ) {
                    score -= 60;
                }


                // Percentage values should never become prices.
                if (
                    combinedText.includes("%")
                ) {
                    score -= 80;
                }


                // Tiny values without currency are usually not
                // product prices.
                if (
                    numericValue <= 99 &&
                    !candidate.hasCurrency
                ) {
                    score -= 25;
                }


                candidates.push({
                    value: numericValue,
                    formatted:
                        `₹${normalized.formatted}`,
                    raw,
                    score,
                    tagName,
                    className,
                    context:
                        combinedText.slice(
                            0,
                            250
                        ),
                    fontSize,
                    fontWeight
                });
            }
        }


        return candidates;
    }


    // ============================================================
    // CHOOSE BEST PRICE
    // ============================================================

    async function chooseBestPrice(
        priceMain
    ) {

        const candidates =
            await extractPriceCandidates(
                priceMain
            );


        if (
            candidates.length === 0
        ) {

            return null;
        }


        // --------------------------------------------------------
        // Deduplicate candidates by numeric value.
        // Keep the highest-scoring occurrence.
        // --------------------------------------------------------

        const bestByValue =
            new Map();


        for (
            const candidate
            of candidates
        ) {

            const existing =
                bestByValue.get(
                    candidate.value
                );


            if (
                !existing ||
                candidate.score >
                    existing.score
            ) {

                bestByValue.set(
                    candidate.value,
                    candidate
                );
            }
        }


        const uniqueCandidates =
            Array.from(
                bestByValue.values()
            );


        uniqueCandidates.sort(
            (a, b) =>
                b.score - a.score
        );


        console.log(
            "\n🔎 PRICE CANDIDATES:"
        );


        uniqueCandidates
            .slice(0, 10)
            .forEach(
                (candidate, index) => {

                    console.log(
                        `   ${index + 1}. ${candidate.formatted} | score=${candidate.score} | tag=${candidate.tagName} | class=${candidate.className || "-"}`
                    );

                    console.log(
                        `      context: ${candidate.context}`
                    );
                }
            );


        const best =
            uniqueCandidates[0];


        if (!best) {
            return null;
        }


        // Final sanity check.
        if (
            !Number.isFinite(
                best.value
            ) ||
            best.value <= 0
        ) {

            return null;
        }


        console.log(
            `\n💰 SELECTED PRICE: ${best.formatted}`
        );


        return best.formatted;
    }


    // ============================================================
    // WAIT FOR A VALID PRICE
    // ============================================================

    async function waitForValidPrice(
        runDeadline,
        maxWaitMs = 5000
    ) {

        const localStart =
            Date.now();


        const localDeadline =
            Math.min(
                localStart + maxWaitMs,
                runDeadline
            );


        let sawPriceMain = false;


        while (
            Date.now() < localDeadline
        ) {

            // Cookie can unexpectedly appear during the wait.
            await checkCookieQuickly();


            const priceMain =
                await findPriceMain();


            if (priceMain) {

                sawPriceMain = true;


                const price =
                    await chooseBestPrice(
                        priceMain
                    );


                if (price) {

                    return {
                        price,
                        sawPriceMain: true
                    };
                }
            }


            // Poll frequently instead of blindly sleeping 5 sec.
            await page.waitForTimeout(100);
        }


        return {
            price: null,
            sawPriceMain
        };
    }
        // ============================================================
    // CLICK REVEAL + WAIT FOR VALID PRICE
    // ============================================================

    async function clickRevealAndWait(
        revealButton,
        clickNumber,
        runDeadline
    ) {

        // --------------------------------------------------------
        // Make sure we still have time left in this run.
        // --------------------------------------------------------

        if (Date.now() >= runDeadline) {

            console.log(
                `⏰ Run deadline reached before Reveal #${clickNumber}`
            );

            return null;
        }


        // --------------------------------------------------------
        // Handle cookies if they appeared.
        // --------------------------------------------------------

        await checkCookieQuickly();


        // --------------------------------------------------------
        // Make sure button is still visible.
        // --------------------------------------------------------

        const visible =
            await revealButton
                .isVisible()
                .catch(() => false);


        if (!visible) {

            console.log(
                `❌ Reveal #${clickNumber}: button not visible`
            );

            return null;
        }


        // --------------------------------------------------------
        // Scroll button into view.
        // --------------------------------------------------------

        await revealButton
            .scrollIntoViewIfNeeded()
            .catch(() => {});


        // --------------------------------------------------------
        // Get current button position.
        // --------------------------------------------------------

        const box =
            await revealButton
                .boundingBox()
                .catch(() => null);


        if (!box) {

            console.log(
                `❌ Reveal #${clickNumber}: could not get button position`
            );

            return null;
        }


        const x =
            box.x +
            box.width / 2;

        const y =
            box.y +
            box.height / 2;


        console.log(
            `\n🖱️ REVEAL #${clickNumber}`
        );


        console.log(
            `   Button position: ${x.toFixed(1)}, ${y.toFixed(1)}`
        );


        // --------------------------------------------------------
        // Move mouse onto button.
        // --------------------------------------------------------

        await page.mouse.move(
            x - 80,
            y - 40,
            {
                steps: 10
            }
        );


        await page.waitForTimeout(100);


        await page.mouse.move(
            x,
            y,
            {
                steps: 12
            }
        );


        await page.waitForTimeout(200);


        // --------------------------------------------------------
        // Recheck cookie.
        // --------------------------------------------------------

        await checkCookieQuickly();


        // --------------------------------------------------------
        // Recheck button state.
        // --------------------------------------------------------

        const enabled =
            await revealButton
                .isEnabled()
                .catch(() => false);


        if (!enabled) {

            console.log(
                `❌ Reveal #${clickNumber}: button disabled`
            );

            return null;
        }


        // --------------------------------------------------------
        // Click Reveal.
        // --------------------------------------------------------

        console.log(
            `   🖱️ Clicking Reveal Price #${clickNumber}...`
        );


        try {

            await revealButton.click({
                timeout: 2000
            });

        } catch (error) {

            console.log(
                `❌ Reveal #${clickNumber} click failed:`,
                error.message
            );


            return null;
        }


        console.log(
            `   ✅ Reveal #${clickNumber} clicked`
        );


        // --------------------------------------------------------
        // IMPORTANT:
        //
        // .price-main appearing is NOT success.
        //
        // We continuously inspect it for up to 5 seconds
        // and return immediately once a VALID price is found.
        // --------------------------------------------------------

        console.log(
            `   🔍 Watching for actual price for up to 5 seconds...`
        );


        const result =
            await waitForValidPrice(
                runDeadline,
                5000
            );


        if (result.price) {

            console.log(
                `   🎯 VALID PRICE FOUND after Reveal #${clickNumber}`
            );


            return result.price;
        }


        if (result.sawPriceMain) {

            console.log(
                `   ⚠️ .price-main appeared, but no valid price was extracted`
            );

        } else {

            console.log(
                `   ⚠️ .price-main did not produce a valid price`
            );
        }


        return null;
    }


    // ============================================================
    // RUN TIME LIMIT
    // ============================================================

    const RUN_TIMEOUT_MS = 25000;


    // ============================================================
    // SCRAPE ONE PRODUCT
    //
    // IMPORTANT:
    // One complete run for one product can take at most 25 sec.
    //
    // Flow:
    //
    //   open product
    //       ↓
    //   cookies
    //       ↓
    //   mouse movement
    //       ↓
    //   find Reveal
    //       ↓
    //   wait Reveal enabled
    //       ↓
    //   Reveal #1
    //       ↓
    //   watch price <= 5 sec
    //       ↓
    //   if failed
    //       ↓
    //   Reveal #2
    //       ↓
    //   watch price <= 5 sec
    //       ↓
    //   success / run failure
    //
    // ============================================================

    async function scrapeProduct(
        productId
    ) {

        const runStart =
            Date.now();


        const runDeadline =
            runStart +
            RUN_TIMEOUT_MS;


        // --------------------------------------------------------
        // Remaining time helper.
        // --------------------------------------------------------

        function timeLeft() {

            return Math.max(
                0,
                runDeadline -
                    Date.now()
            );
        }


        function timedOut() {

            return Date.now() >=
                runDeadline;
        }


        console.log(
            "\n========================================"
        );

        console.log(
            `🔎 PRODUCT ${productId}`
        );

        console.log(
            "========================================"
        );


        try {

            // ====================================================
            // 1. NAVIGATE TO PRODUCT
            // ====================================================

            if (timedOut()) {
                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            const url =
                `${BASE_URL}${productId}`;


            console.log(
                `🌐 Opening: ${url}`
            );


            const navigationTimeout =
                Math.max(
                    1,
                    Math.min(
                        10000,
                        timeLeft()
                    )
                );


            await page.goto(
                url,
                {
                    waitUntil: "domcontentloaded",
                    timeout:
                        navigationTimeout
                }
            );


            console.log(
                "   ✅ Product page loaded"
            );


            // ====================================================
            // 2. INITIAL MOUSE MOVEMENT
            // ====================================================

            if (timedOut()) {
                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            await moveMouseAround();


            if (timedOut()) {
                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            // ====================================================
            // 3. HANDLE COOKIE BANNER
            // ====================================================

            console.log(
                "🍪 Checking cookie banner..."
            );


            await handleCookieBanner(12);


            if (timedOut()) {
                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            // ====================================================
            // 4. FIND REVEAL BUTTON
            // ====================================================

            console.log(
                "🔍 Looking for Reveal Price button..."
            );


            const revealButton =
                await getRevealButton();


            if (!revealButton) {

                console.log(
                    "❌ Could not find Reveal Price button"
                );


                return null;
            }


            if (timedOut()) {
                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            // ====================================================
            // 5. WAIT FOR REVEAL TO BECOME ENABLED
            // ====================================================

            console.log(
                "⏳ Waiting for Reveal Price to become enabled..."
            );


            const revealReady =
                await waitForRevealEnabled(
                    revealButton
                );


            if (!revealReady) {

                console.log(
                    "❌ Reveal Price never became enabled"
                );


                return null;
            }


            if (timedOut()) {
                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            console.log(
                "✅ Reveal Price is ENABLED"
            );


            // ====================================================
            // 6. REVEAL #1
            // ====================================================

            const firstPrice =
                await clickRevealAndWait(
                    revealButton,
                    1,
                    runDeadline
                );


            if (firstPrice) {

                console.log(
                    `\n🎉 PRODUCT ${productId} SUCCESS`
                );


                console.log(
                    `💰 PRICE: ${firstPrice}`
                );


                console.log(
                    `⏱️ Run time: ${
                        Date.now() - runStart
                    } ms`
                );


                return firstPrice;
            }


            // ====================================================
            // 7. FIRST REVEAL FAILED
            //
            // Do NOT immediately fail.
            //
            // We get a SECOND Reveal click.
            // ====================================================

            if (timedOut()) {

                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            console.log(
                "\n⚠️ FIRST REVEAL DID NOT PRODUCE A VALID PRICE"
            );


            console.log(
                "🔄 Preparing SECOND Reveal attempt..."
            );


            // Small transition delay, but never beyond deadline.
            const transitionWait =
                Math.min(
                    200,
                    timeLeft()
                );


            if (
                transitionWait > 0
            ) {

                await page.waitForTimeout(
                    transitionWait
                );
            }


            if (timedOut()) {

                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            // ====================================================
            // 8. RECHECK REVEAL BUTTON
            //
            // Locator is live, so it can resolve a replaced
            // button from the current DOM.
            // ====================================================

            const secondRevealButton =
                page
                    .locator("button")
                    .filter({
                        hasText: /Reveal\s*Price/i
                    })
                    .first();


            const secondButtonVisible =
                await secondRevealButton
                    .isVisible()
                    .catch(() => false);


            if (!secondButtonVisible) {

                console.log(
                    "❌ Reveal button no longer available for attempt #2"
                );


                return null;
            }


            // ====================================================
            // 9. WAIT UNTIL SECOND REVEAL IS ENABLED
            //
            // We use the same live locator.
            // ====================================================

            const secondRevealReady =
                await waitForRevealEnabled(
                    secondRevealButton
                );


            if (!secondRevealReady) {

                console.log(
                    "❌ Second Reveal Price never became enabled"
                );


                return null;
            }


            if (timedOut()) {

                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            // ====================================================
            // 10. REVEAL #2
            // ====================================================

            const secondPrice =
                await clickRevealAndWait(
                    secondRevealButton,
                    2,
                    runDeadline
                );


            if (secondPrice) {

                console.log(
                    `\n🎉 PRODUCT ${productId} SUCCESS`
                );


                console.log(
                    `💰 PRICE: ${secondPrice}`
                );


                console.log(
                    `⏱️ Run time: ${
                        Date.now() - runStart
                    } ms`
                );


                return secondPrice;
            }


            // ====================================================
            // 11. SECOND REVEAL ALSO FAILED
            // ====================================================

            if (timedOut()) {

                throw new Error(
                    "RUN_TIMEOUT"
                );
            }


            console.log(
                `\n❌ PRODUCT ${productId} FAILED THIS RUN`
            );


            console.log(
                `⏱️ Run time: ${
                    Date.now() - runStart
                } ms`
            );


            return null;


        } catch (error) {

            // ====================================================
            // TIMEOUT
            // ====================================================

            if (
                error.message ===
                "RUN_TIMEOUT"
            ) {

                console.log(
                    `\n⏰ PRODUCT ${productId} RUN TIMEOUT`
                );


                console.log(
                    `   Maximum run time: ${RUN_TIMEOUT_MS} ms`
                );


                console.log(
                    `   Actual elapsed: ${
                        Date.now() - runStart
                    } ms`
                );


                return null;
            }


            // ====================================================
            // OTHER ERROR
            // ====================================================

            console.log(
                `\n❌ ERROR scraping product ${productId}:`
            );


            console.log(
                error.message
            );


            console.log(
                `⏱️ Run time: ${
                    Date.now() - runStart
                } ms`
            );


            return null;
        }
    }


    // ============================================================
    // RESULTS
    // ============================================================

    const results = [];


    // ============================================================
    // MAIN PRODUCT LOOP
    // ============================================================

    for (
        let productId = START_ID;
        productId <= END_ID;
        productId++
    ) {

        console.log(
            "\n\n"
        );


        console.log(
            "############################################################"
        );


        console.log(
            `############ PRODUCT ${productId} / ${END_ID} ############`
        );


        console.log(
            "############################################################"
        );


        let finalPrice =
            null;


        // ========================================================
        // MAXIMUM 2 COMPLETE RUNS
        // ========================================================

        for (
            let run = 1;
            run <= MAX_PRODUCT_RETRIES;
            run++
        ) {

            console.log(
                `\n🔁 PRODUCT ${productId} — COMPLETE RUN ${run}/${MAX_PRODUCT_RETRIES}`
            );


            console.log(
                "------------------------------------------------------------"
            );


            finalPrice =
                await scrapeProduct(
                    productId
                );


            // ====================================================
            // SUCCESS
            // ====================================================

            if (finalPrice) {

                results.push({
                    productId,
                    price: finalPrice,
                    status: "SUCCESS",
                    attempts: run
                });


                console.log(
                    `\n✅ PRODUCT ${productId} COMPLETED`
                );


                console.log(
                    `💰 ${finalPrice}`
                );


                console.log(
                    `🔁 Complete runs used: ${run}`
                );


                break;
            }


            // ====================================================
            // FAILURE
            // ====================================================

            console.log(
                `\n⚠️ PRODUCT ${productId} failed complete run ${run}/${MAX_PRODUCT_RETRIES}`
            );


            if (
                run <
                MAX_PRODUCT_RETRIES
            ) {

                console.log(
                    `🔄 Starting a COMPLETELY FRESH run for product ${productId}...`
                );


                // Give browser a tiny breathing period before
                // starting the next complete run.
                await page.waitForTimeout(
                    300
                );
            }
        }


        // ========================================================
        // FINAL FAILURE AFTER 2 COMPLETE RUNS
        // ========================================================

        if (!finalPrice) {

            results.push({
                productId,
                price: null,
                status: "FAILED",
                attempts:
                    MAX_PRODUCT_RETRIES
            });


            console.log(
                `\n❌ PRODUCT ${productId} PERMANENTLY FAILED`
            );


            console.log(
                `   Maximum complete runs reached: ${MAX_PRODUCT_RETRIES}`
            );
        }


        // ========================================================
        // PROGRESS LOG
        // ========================================================

        if (
            productId % 10 === 0 ||
            productId === END_ID
        ) {

            const successful =
                results.filter(
                    item =>
                        item.status ===
                        "SUCCESS"
                ).length;


            const failed =
                results.filter(
                    item =>
                        item.status ===
                        "FAILED"
                ).length;


            console.log(
                "\n============================================================"
            );


            console.log(
                `📊 PROGRESS: ${productId}/${END_ID}`
            );


            console.log(
                `   ✅ Success: ${successful}`
            );


            console.log(
                `   ❌ Failed: ${failed}`
            );


            console.log(
                "============================================================"
            );
        }
    }


    // ============================================================
    // FINAL RESULTS
    // ============================================================

    console.log(
        "\n\n============================================================"
    );


    console.log(
        "🏁 SCRAPING COMPLETED"
    );


    console.log(
        "============================================================"
    );


    const successfulResults =
        results.filter(
            item =>
                item.status ===
                "SUCCESS"
        );


    const failedResults =
        results.filter(
            item =>
                item.status ===
                "FAILED"
        );


    console.log(
        `\n📦 Total products: ${results.length}`
    );


    console.log(
        `✅ Successful: ${successfulResults.length}`
    );


    console.log(
        `❌ Failed: ${failedResults.length}`
    );


    console.log(
        "\n📋 RESULTS:"
    );


    for (
        const result of results
    ) {

        if (
            result.status ===
            "SUCCESS"
        ) {

            console.log(
                `Product ${result.productId}: ${result.price} | attempts=${result.attempts}`
            );

        } else {

            console.log(
                `Product ${result.productId}: FAILED | attempts=${result.attempts}`
            );
        }
    }


    // ============================================================
    // SAVE RESULTS
    // ============================================================

    const fs =
        require("fs");


    try {

        fs.writeFileSync(
            "scraper-results.json",
            JSON.stringify(
                results,
                null,
                2
            )
        );


        console.log(
            "\n💾 Results saved to scraper-results.json"
        );

    } catch (error) {

        console.log(
            "\n⚠️ Could not save results:",
            error.message
        );
    }


    // ============================================================
    // CLOSE BROWSER
    // ============================================================

    console.log(
        "\n🔒 Closing browser..."
    );


    await browser.close();


    console.log(
        "✅ Browser closed."
    );


})();