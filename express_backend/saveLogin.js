const { chromium } = require('playwright'); // Import Playwright

(async () => {

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://buyee.jp/signup/login');
    await page.locator('#login_mailAddress').fill("teege@machen-sachen.com");
    await page.locator('#login_password').fill("&7.s!M47&zprEv.");
    await page.getByRole('link', { name: 'Login' }).click();
    await page.pause();

    await context.storageState({ path: "login.json"});
    await browser.close();
})();
