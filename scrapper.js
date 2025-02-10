const { chromium } = require("playwright-core");
const logger = require("pino")();
const fs = require("fs");
const path = require("path");
const bidFilePath = path.resolve(__dirname, "../bids.json");

class BuyeeScraper {
  constructor() {
    this.baseUrl = "https://buyee.jp";
    this.browser = null;
  }

  // Setup browser and context
  async setupBrowser() {
    try {
      if (!this.browser || !this.browser.isConnected()) {
        this.browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
      }
      
      const context = await this.browser.newContext({
        storageState: "login.json", // Use the stored login session
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      console.log('Browser context created');
      return { browser: this.browser, context };
    } catch (error) {
      console.error('Browser setup failed:', error);
      throw error;
    }
  }

  // Scrape search results and save to search.json
  async scrapeSearchResults(term, minPrice = "", maxPrice = "", page = 1) {
    console.log(`Searching for "${term}" - Page ${page}`);
    
    let context;
    let pageInstance;
    try {
      ({ context } = await this.setupBrowser());
      
      pageInstance = await context.newPage();
      pageInstance.setDefaultTimeout(300000);
      pageInstance.setDefaultNavigationTimeout(300000);
      
      // Construct search URL with explicit page parameter
      let searchUrl = `${this.baseUrl}/item/search/query/${encodeURIComponent(term)}`;
      
      const params = [];
      if (minPrice) params.push(`aucminprice=${encodeURIComponent(minPrice)}`);
      if (maxPrice) params.push(`aucmaxprice=${encodeURIComponent(maxPrice)}`);
      params.push("translationType=98");
      params.push(`page=${page}`);
      
      searchUrl += `?${params.join("&")}`;
  
      await pageInstance.goto(searchUrl, {
        waitUntil: "networkidle",
        timeout: 300000,
      });
  
      // Extract total products on first page
      let totalProducts = 0;
      if (page === 1) {
        try {
          const totalProductsElement = await pageInstance.$('.result-num');
          const totalProductsText = totalProductsElement 
            ? await totalProductsElement.innerText() 
            : '0 / 0';
          
          const totalProductsMatch = totalProductsText.match(/\/\s*(\d+)/);
          totalProducts = totalProductsMatch 
            ? parseInt(totalProductsMatch[1], 10) 
            : 0;
        } catch (extractionError) {
          console.warn('Could not extract total products:', extractionError);
        }
      }
  
      // Wait for items
      await pageInstance.waitForSelector(".itemCard", { timeout: 50000 });
      
      const items = await pageInstance.$$(".itemCard");
      const products = [];
  
      for (const item of items) {
        try {
          const productData = await pageInstance.evaluate((itemEl) => {
            const titleElement = itemEl.querySelector(".itemCard__itemName a");
            const title = titleElement ? titleElement.textContent.trim() : "No Title";
            
            let url = titleElement ? titleElement.getAttribute("href") : null;
            if (!url) return null;
            
            url = url.startsWith("http") ? url : `https://buyee.jp${url}`;
  
            const imgElement = itemEl.querySelector(".g-thumbnail__image");
            const imgSrc = imgElement 
              ? (imgElement.getAttribute("data-src") || 
                 imgElement.getAttribute("src") || 
                 imgElement.src)
              : null;
  
            const priceElement = itemEl.querySelector(".g-price");
            const price = priceElement ? priceElement.textContent.trim() : "Price Not Available";
  
            const timeElements = [
              itemEl.querySelector('.itemCard__time'),
              itemEl.querySelector('.g-text--attention'),
              itemEl.querySelector('.timeLeft')
            ];
  
            const timeRemaining = timeElements.find(el => el && el.textContent)
              ?.textContent.trim() || 'Time Not Available';
  
            return {
              title,
              price,
              url,
              time_remaining: timeRemaining,
              images: imgSrc ? [imgSrc.split("?")[0]] : [],
            };
          }, item);
  
          if (productData) {
            products.push(productData);
          }
        } catch (itemError) {
          console.error('Error processing individual item:', itemError);
        }
      }
  
      return {
        products,
        totalProducts: totalProducts || products.length,
        currentPage: page
      };
    } catch (error) {
      console.error('Search failed:', error);
      return {
        products: [],
        totalProducts: 0,
        currentPage: page
      };
    } finally {
      if (pageInstance) await pageInstance.close();
      if (context) await context.close();
    }
  }
  
  async placeBid(productUrl, bidAmount) {
    let context;
    let page;
  
    try {
      // First verify login state
      let isLoggedIn = await this.checkLoginState();
      if (!isLoggedIn) {
        console.log('Session expired - refreshing login');
        await this.refreshLoginSession();
        isLoggedIn = await this.checkLoginState();
        if (!isLoggedIn) {
          throw new Error('Failed to refresh login session');
        }
      }
  
      ({ context } = await this.setupBrowser());
      page = await context.newPage();
  
      // Log all navigations and redirects
      page.on('response', response => {
        console.log(`Response: ${response.status()} ${response.url()}`);
        if (response.status() === 302) {
          console.log('Redirect detected to:', response.headers()['location']);
        }
      });
  
      console.log('Navigating to:', productUrl);
      await page.goto(productUrl, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
  
      // Check if we landed on login page
      if (page.url().includes('signup/login')) {
        console.log('Initial navigation redirected to login page');
        throw new Error('Session invalid - login required');
      }
  
      // Remove any overlays that might block clicking
      await page.evaluate(() => {
        const elements = document.querySelectorAll('.overlay, .cookie-banner');
        elements.forEach(el => el.remove());
      });
  
      // Wait for and click bid button
      console.log('Waiting for bid button...');
      const bidButton = await page.waitForSelector('#bidNow', { 
        timeout: 30000,
        state: 'visible' 
      });
  
      // Take screenshot before clicking
      await page.screenshot({ path: 'pre-bid-click.png' });
      
      console.log('Clicking bid button...');
      await Promise.all([
        page.waitForNavigation({ timeout: 30000 }),
        bidButton.click()
      ]);
  
      // Take screenshot after navigation
      await page.screenshot({ path: 'post-bid-click.png' });
      
      console.log('Post-click URL:', page.url());
  
      // Check if click redirected us to login
      if (page.url().includes('signup/login')) {
        console.log('Bid button click redirected to login page');
        throw new Error('Session expired during bid');
      }
  
      // Wait for bid form
      console.log('Waiting for bid form...');
      const formLocator = '.bidInput__main #bidYahoo_price, .modal-body #bidYahoo_price';
      await page.waitForSelector(formLocator, { 
        timeout: 30000,
        state: 'visible'
      });
  
      // Fill the form
      console.log('Filling bid form...');
      await page.evaluate((amount) => {
        const priceInput = document.querySelector('#bidYahoo_price');
        if (priceInput) {
          priceInput.value = amount.toString();
          priceInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
  
        const planSelect = document.querySelector('#bidYahoo_plan');
        if (planSelect) {
          planSelect.value = '99';
          planSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
  
        const paymentRadio = document.querySelector('#bidYahoo_payment_method_type_2');
        if (paymentRadio && !paymentRadio.checked) {
          paymentRadio.click();
        }
      }, bidAmount);
  
      // Submit the bid
      console.log('Submitting bid...');
      const [response] = await Promise.all([
        page.waitForNavigation({ timeout: 30000 }),
        page.click('#bid_submit')
      ]);
  
      if (response.url().includes('/bid/confirm')) {
        console.log('Bid confirmed successfully');
        return { success: true, message: `Bid of ${bidAmount} placed successfully` };
      }
  
      throw new Error('Bid confirmation page not reached');
  
    } catch (error) {
      console.error('Bid placement failed:', error);
      await page?.screenshot({ path: 'bid-error.png' });
      
      return { 
        success: false, 
        message: `Bid failed: ${error.message}`,
        debug: {
          url: page?.url(),
          cookies: await context?.cookies()
        }
      };
    } finally {
      if (page) await page.close();
      if (context) await context.close();
    }
  }
  
  // Add retry utility
  async retry(fn, retries = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  async updateBid(productUrl) {
    let context;
    let page;
    try {
      ({ context } = await this.setupBrowser());
      page = await context.newPage();
      await page.goto(productUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 300000
      });
  
      // Extract price with multiple selectors
      let price = 'Price Not Available';
      const priceElements = [
        page.locator('.current_price .price'),
        page.locator('.price'),
        page.locator('.itemPrice')
      ];
  
      for (const priceElement of priceElements) {
        try {
          const priceText = await priceElement.textContent();
          if (priceText) {
            price = priceText.trim();
            break;
          }
        } catch {}
      }
  
      // Extract time remaining with multiple selectors
      let timeRemaining = 'Time Not Available';
      const timeRemainingElements = [
        page.locator('.itemInformation__infoItem .g-text--attention'),
        page.locator('.itemInfo__time span'),
        page.locator('.timeLeft'),
        page.locator('.g-text--attention')
      ];
  
      for (const timeElement of timeRemainingElements) {
        try {
          const timeText = await timeElement.textContent();
          if (timeText) {
            timeRemaining = timeText.trim();
            break;
          }
        } catch {}
      }
  
      return {
        productUrl,
        price: price.trim(),
        timeRemaining: timeRemaining.trim()
      };
    } catch (error) {
      console.error("Error during bid update:", error);
      return {
        productUrl,
        error: error.message
      };
    } finally {
      if (page) await page.close();
    }
  }
  
  async login(username, password) {
    let context;
    let page;
  
    try {
      ({ context } = await this.setupBrowser());
      page = await context.newPage();
      
      console.log('Starting login process...');
      
      await page.goto("https://buyee.jp/signup/login", {
        waitUntil: 'networkidle',
        timeout: 30000
      });
  
      console.log('Filling login form...');
      await page.fill('#login_mailAddress', username);
      await page.waitForTimeout(500);
      await page.fill('#login_password', password);
      await page.waitForTimeout(500);
  
      const form = await page.$('#login_form');
      if (!form) {
        throw new Error('Login form not found');
      }
  
      console.log('Submitting login form...');
      await page.evaluate(() => {
        document.querySelector('#login_submit').click();
      });
  
      await page.waitForNavigation({ timeout: 30000 });
      console.log('Post-login URL:', page.url());
  
      if (page.url().includes('https://buyee.jp/signup/twoFactor')) {
        console.log('Two-factor authentication required');
        await context.storageState({ path: "temp_login.json" });
        return { success: false, requiresTwoFactor: true };
      }
  
      await context.storageState({ path: "login.json" });
      console.log('Login session saved to login.json');
  
      const cookies = await context.cookies();
      console.log('Cookies after login:', JSON.stringify(cookies, null, 2));
  
      return { success: true };
  
    } catch (error) {
      console.error('Login error:', error);
      await page?.screenshot({ path: 'login-error.png' });
      throw error;
    } finally {
      if (page) await page.close();
    }
  }
  
  async submitTwoFactorCode(twoFactorCode) {
    let context;
    let page;
  
    try {
      ({ context } = await this.setupBrowser());
      page = await context.newPage();
      
      await page.goto("https://buyee.jp/signup/twoFactor", {
        waitUntil: 'networkidle',
        timeout: 30000
      });
  
      // Fill in the 2FA code
      for (let i = 0; i < 6; i++) {
        await page.fill(`#input${i + 1}`, twoFactorCode[i]);
      }
  
      // Submit the form
      await page.click('button[type="submit"]');
  
      await page.waitForNavigation({ timeout: 30000 });
  
      // Check if login was successful
      if (page.url().includes('https://buyee.jp/signup/twoFactor')) {
        throw new Error('Invalid two-factor code');
      }
  
      // Save the final login state
      await context.storageState({ path: "login.json" });
      return { success: true };
  
    } catch (error) {
      console.error('Two-factor authentication error:', error);
      await page?.screenshot({ path: 'two-factor-error.png' });
      throw error;
    } finally {
      if (page) await page.close();
    }
  }
  
  async refreshLoginSession() {
    console.log('Refreshing login session...');
    const loginResult = await this.login('teege@machen-sachen.com', '&7.s!M47&zprEv.');
    if (loginResult.success) {
      console.log('Login session refreshed successfully');
      await this.checkLoginState(); // Verify the new session
    } else {
      console.error('Failed to refresh login session');
      throw new Error('Failed to refresh login session');
    }
  }
  
  async checkLoginState() {
    try {
      const loginData = JSON.parse(fs.readFileSync('login.json', 'utf8'));
      console.log('Login file contents:', JSON.stringify(loginData, null, 2));
      
      const cookies = loginData.cookies || [];
      const requiredCookies = ['otherbuyee', 'userProfile', 'userId'];
      
      const hasAllRequiredCookies = requiredCookies.every(name => 
        cookies.some(cookie => cookie.name === name && !cookie.expired)
      );
      
      console.log('Has all required cookies:', hasAllRequiredCookies);
      console.log('Number of cookies:', cookies.length);
      
      if (!hasAllRequiredCookies) {
        const missingCookies = requiredCookies.filter(name => 
          !cookies.some(cookie => cookie.name === name && !cookie.expired)
        );
        console.log('Missing or expired cookies:', missingCookies);
      }
      
      return hasAllRequiredCookies;
    } catch (error) {
      console.error('Error checking login state:', error);
      return false;
    }
  }
} 
module.exports = BuyeeScraper;