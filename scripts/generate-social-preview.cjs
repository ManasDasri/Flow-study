const { chromium } = require('playwright');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
        await page.goto(pathToFileURL(resolve(__dirname, 'social-preview.html')).href);
        const fonts = await page.evaluate(() => document.fonts.load('600 76px "Instrument Sans"').then(loaded => loaded.length));
        if (!fonts) throw new Error('Instrument Sans did not load; preview was not generated.');
        await page.screenshot({ path: resolve(__dirname, '../public/social-preview.png') });
        console.log('Generated public/social-preview.png (1200 × 630)');
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
