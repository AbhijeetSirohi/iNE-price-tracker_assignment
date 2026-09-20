const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('https://demo.inelabteamdev.com/product/935', { waitUntil: 'networkidle' });
    
    // Wait for the Reveal Price button, which means page is loaded
    await page.waitForTimeout(2000); 

    // Find and click Reveal Price
    const revealButton = page.locator('button', { hasText: /Reveal\s*Price/i }).first();
    if (await revealButton.isVisible()) {
        await revealButton.click();
        await page.waitForTimeout(3000); // Wait for price and stock to appear
    }

    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log("BODY TEXT:");
    console.log(bodyText);
    
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    const fs = require('fs');
    fs.writeFileSync('dom_dump.html', bodyHtml);
    console.log("DOM dumped to dom_dump.html");
    
    await browser.close();
})();
