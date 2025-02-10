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
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        });
      }
      
      // Load stored login state
      const loginData = JSON.parse(fs.readFileSync('login.json', 'utf8'));
      
      // Create context with stored state
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'Europe/Berlin',
        storageState: 'login.json',
        acceptDownloads: true
      });
      
      // Add cookies explicitly
      for (const cookie of loginData.cookies) {
        await context.addCookies([{
          ...cookie,
          secure: cookie.secure || false,
          httpOnly: cookie.httpOnly || false,
          sameSite: cookie.sameSite || 'Lax',
          expires: cookie.expires || (Date.now() / 1000 + 86400)
        }]);
      }
      
      // Log the setup
      const cookies = await context.cookies();
      console.log('Browser context created with cookies:', 
        cookies.map(c => `${c.name}=${c.value}`).join('; '));
      
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
      
      // Set shorter timeouts to avoid Heroku 30s limit
      pageInstance.setDefaultTimeout(25000);
      pageInstance.setDefaultNavigationTimeout(25000);
      
      // Construct search URL with explicit page parameter
      let searchUrl = `${this.baseUrl}/item/search/query/${encodeURIComponent(term)}`;
      
      const params = [];
      if (minPrice) params.push(`aucminprice=${encodeURIComponent(minPrice)}`);
      if (maxPrice) params.push(`aucmaxprice=${encodeURIComponent(maxPrice)}`);
      params.push("translationType=98");
      params.push(`page=${page}`);
      
      searchUrl += `?${params.join("&")}`;

      // Add console logging for debugging
      console.log(`Navigating to: ${searchUrl}`);

      // Navigate with shorter timeout
      await pageInstance.goto(searchUrl, {
        waitUntil: "domcontentloaded", // Changed from networkidle to faster option
        timeout: 25000,
      });

      console.log('Page loaded, checking for items...');

      // Extract total products on first page with error handling
      let totalProducts = 0;
      if (page === 1) {
        try {
          const totalProductsElement = await pageInstance.$('.result-num');
          if (totalProductsElement) {
            const totalProductsText = await totalProductsElement.innerText();
            const totalProductsMatch = totalProductsText.match(/\/\s*(\d+)/);
            totalProducts = totalProductsMatch ? parseInt(totalProductsMatch[1], 10) : 0;
          }
        } catch (extractionError) {
          console.warn('Could not extract total products:', extractionError);
        }
      }

      // Check for no results message first
      const noResultsElement = await pageInstance.$('.search-no-hits');
      if (noResultsElement) {
        console.log('No results found for search');
        return {
          products: [],
          totalProducts: 0,
          currentPage: page
        };
      }

      // Wait for items with shorter timeout and fallback
      let items = [];
      try {
        await pageInstance.waitForSelector(".itemCard", { timeout: 15000 });
        items = await pageInstance.$$(".itemCard");
      } catch (selectorError) {
        console.log('Timeout waiting for .itemCard, checking alternative selectors...');
        
        // Try alternative selectors
        const alternativeSelectors = ['.g-thumbnail', '.itemCard__itemName'];
        for (const selector of alternativeSelectors) {
          try {
            await pageInstance.waitForSelector(selector, { timeout: 5000 });
            items = await pageInstance.$$(selector);
            if (items.length > 0) break;
          } catch (e) {
            console.log(`Alternative selector ${selector} not found`);
          }
        }
      }

      console.log(`Found ${items.length} items`);
      const products = [];

      for (const item of items) {
        try {
          const productData = await pageInstance.evaluate((itemEl) => {
            const titleElement = itemEl.querySelector(".itemCard__itemName a") || 
                              itemEl.querySelector("a[data-testid='item-name']");
            const title = titleElement ? titleElement.textContent.trim() : "No Title";
            
            let url = titleElement ? titleElement.getAttribute("href") : null;
            if (!url) return null;
            
            url = url.startsWith("http") ? url : `https://buyee.jp${url}`;

            const imgElement = itemEl.querySelector(".g-thumbnail__image") || 
                            itemEl.querySelector("img[data-testid='item-image']");
            const imgSrc = imgElement 
              ? (imgElement.getAttribute("data-src") || 
                imgElement.getAttribute("src") || 
                imgElement.src)
              : null;

            const priceElement = itemEl.querySelector(".g-price") ||
                              itemEl.querySelector("[data-testid='item-price']");
            const price = priceElement ? priceElement.textContent.trim() : "Price Not Available";

            const timeElements = [
              itemEl.querySelector('.itemCard__time'),
              itemEl.querySelector('.g-text--attention'),
              itemEl.querySelector('.timeLeft'),
              itemEl.querySelector('[data-testid="time-remaining"]')
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
      // Return empty results instead of throwing
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
  
      // Enable verbose network logging
      page.on('request', request => {
        console.log(`>> ${request.method()} ${request.url()}`);
        console.log('Request headers:', request.headers());
      });
  
      page.on('response', response => {
        console.log(`<< ${response.status()} ${response.url()}`);
        if (response.status() === 302) {
          console.log('Redirect headers:', response.headers());
        }
      });
  
      // Set extra headers to mimic browser better
      await context.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      });
  
      console.log('Navigating to:', productUrl);
      await page.goto(productUrl, { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });
  
      console.log('Current URL after navigation:', page.url());
      console.log('Current cookies:', await context.cookies());
  
      // Remove any overlays and wait a bit
      await page.evaluate(() => {
        const elements = document.querySelectorAll('.overlay, .cookie-banner');
        elements.forEach(el => el.remove());
      });
      await page.waitForTimeout(2000);
  
      // Wait for and click bid button
      console.log('Waiting for bid button...');
      const bidButton = await page.waitForSelector('#bidNow', { 
        timeout: 30000,
        state: 'visible' 
      });
  
      // Take screenshot before clicking
      await page.screenshot({ path: 'pre-bid-click.png' });
      
      // Click without using Promise.all to better track the navigation
      console.log('Clicking bid button...');
      await bidButton.click();
      
      // Wait for either form or navigation
      console.log('Waiting for post-click result...');
      try {
        await Promise.race([
          page.waitForSelector('.bidInput__main', { timeout: 10000 }),
          page.waitForSelector('.modal-body', { timeout: 10000 }),
          page.waitForNavigation({ timeout: 10000 })
        ]);
      } catch (e) {
        console.log('Timeout waiting for post-click result:', e.message);
      }
  
      // Take screenshot after click
      await page.screenshot({ path: 'post-bid-click.png' });
      
      console.log('Current URL after bid click:', page.url());
      console.log('Current page content:', await page.content());
  
      if (page.url().includes('signup/login')) {
        throw new Error('Session expired during bid');
      }
  
      // Try to detect what happened after the click
      const formExists = await Promise.race([
        page.waitForSelector('.bidInput__main', { timeout: 5000 })
          .then(() => 'main-form'),
        page.waitForSelector('.modal-body', { timeout: 5000 })
          .then(() => 'modal-form'),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))
      ]);
  
      console.log('Form detection result:', formExists);
  
      if (formExists === 'timeout') {
        throw new Error('Could not detect bid form after button click');
      }
  
      // Fill the form
      console.log('Filling bid form...');
      await page.evaluate((amount) => {
        const priceInput = document.querySelector('#bidYahoo_price');
        if (!priceInput) throw new Error('Price input not found');
        
        priceInput.value = amount.toString();
        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
  
        const planSelect = document.querySelector('#bidYahoo_plan');
        if (!planSelect) throw new Error('Plan select not found');
        
        planSelect.value = '99';
        planSelect.dispatchEvent(new Event('change', { bubbles: true }));
  
        const paymentRadio = document.querySelector('#bidYahoo_payment_method_type_2');
        if (!paymentRadio) throw new Error('Payment radio not found');
        
        if (!paymentRadio.checked) {
          paymentRadio.click();
        }
      }, bidAmount);
  
      await page.waitForTimeout(1000);
  
      // Submit the bid
      console.log('Looking for submit button...');
      const submitButton = await page.waitForSelector('#bid_submit', { timeout: 5000 });
      
      console.log('Submitting bid...');
      const [response] = await Promise.all([
        page.waitForNavigation({ timeout: 30000 }),
        submitButton.click()
      ]);
  
      console.log('Post-submit URL:', page.url());
      await page.screenshot({ path: 'post-submit.png' });
  
      if (page.url().includes('/bid/confirm')) {
        console.log('Bid confirmed successfully');
        return { success: true, message: `Bid of ${bidAmount} placed successfully` };
      }
  
      throw new Error('Bid confirmation page not reached');
  
    } catch (error) {
      console.error('Bid placement failed:', error);
      
      // Take error screenshot
      await page?.screenshot({ path: 'bid-error.png' });
  
      // Get additional debug info
      const debugInfo = {
        url: page?.url(),
        cookies: await context?.cookies(),
        content: await page?.content().catch(() => 'Could not get content')
      };
      
      console.log('Debug info:', debugInfo);
      
      return { 
        success: false, 
        message: `Bid failed: ${error.message}`,
        debug: debugInfo
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
        timeout: 60000
      });
  
      console.log('Filling login form...');
      await page.fill('#login_mailAddress', username);
      await page.waitForTimeout(500);
      await page.fill('#login_password', password);
      await page.waitForTimeout(500);
  
      // Setup navigation promise before clicking
      const navigationPromise = page.waitForNavigation({
        timeout: 60000,
        waitUntil: 'networkidle'
      });
  
      // Click submit and wait for navigation
      await page.click('#login_submit');
      await navigationPromise;
  
      console.log('Post-login URL:', page.url());
  
      // Save cookies and local storage
      const cookies = await context.cookies();
      const storage = await context.storageState();
  
      // Check if we're on the 2FA page
      const is2FAPage = page.url().includes('/signup/twoFactor');
      
      if (is2FAPage) {
        console.log('Two-factor authentication required');
        
        // Save temporary state
        await context.storageState({ path: "temp_login.json" });
        
        return { 
          success: false, 
          requiresTwoFactor: true,
          cookies,
          storage
        };
      }
  
      // Save final login state
      await context.storageState({ path: "login.json" });
      
      return { 
        success: true,
        cookies,
        storage
      };
  
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