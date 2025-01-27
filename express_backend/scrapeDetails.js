const { chromium } = require('playwright'); // Import Playwright

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // await page.goto('https://buyee.jp/item/yahoo/auction/c1170109320?conversionType=YahooAuction_DirectSearch');

    // // Extract image src values
    const imageSources = await page.evaluate(() => {
        const images = document.querySelectorAll('ol.flex-control-nav li img');
        return Array.from(images).map(img => img.src);
    });

    // console.log(imageSources);

    // await browser.close();


    // for extracting product details
    await page.goto('')
})();
