const { chromium } = require("playwright-core");
const logger = require("pino")();
const fs = require("fs");
const path = require("path");
const bidFilePath = path.resolve(__dirname, "../bids.json");

class BuyeeScraper {
  constructor() {
    this.baseUrl = "https://buyee.jp";
  }

  // Setup browser and context
  async setupBrowser() {
    try {
      
      // Basic Linux-compatible configuration
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
            
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      
      console.log('Browser context created');
      return { browser, context };
    } catch (error) {
      console.error('Browser setup failed:', error);
      throw error;
    }
  }

  // Scrape search results and save to search.json
  async scrapeSearchResults(term, minPrice = "", maxPrice = "", page = 1) {
    console.log(`Searching for "${term}" - Page ${page}`);
    
    const { browser, context } = await this.setupBrowser();
    
    try {
      const pageInstance = await context.newPage();
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
  
      await pageInstance.close();
      await browser.close();
  
      return {
        products,
        totalProducts: totalProducts || products.length,
        currentPage: page
      };
    } catch (error) {
      console.error('Search failed:', error);
      
      // Ensure browser is closed
      if (browser) await browser.close();
      
      return {
        products: [],
        totalProducts: 0,
        currentPage: page
      };
    }
  }

  async placeBid(productUrl, bidAmount) {
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    try {
        const context = await browser.newContext({
            storageState: "login.json",
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        // Navigate to product page
        console.log('Navigating to:', productUrl);
        await page.goto(productUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        // Log current URL
        const currentUrl = page.url();
        console.log('Current URL:', currentUrl);
        if (currentUrl.includes('signup/login')) {
            throw new Error('Login session expired');
        }

        // Find and click bid button
        console.log('Looking for bid button...');
        const bidButton = page.locator('#bidNow');
        await bidButton.waitFor({ state: 'visible', timeout: 20000 });
        console.log('Clicking bid button...');
        await bidButton.click();
        await page.waitForTimeout(5000);  // Allow time for form to load

        // 🔍 **Debugging: What Changed After Clicking?**
        console.log('Checking if bid form exists...');
        const formExists = await page.locator('#bid_form').count();
        console.log('Bid form on same page?', formExists);

        if (!formExists) {
            // **Take a screenshot to see the page after clicking**
            await page.screenshot({ path: 'bid-after-click.png', fullPage: true });
            console.log('Saved bid-after-click.png for debugging.');

            // **Print all visible elements on the page**
            const visibleElements = await page.evaluate(() => {
                return [...document.querySelectorAll('*')]
                    .filter(el => el.offsetParent !== null) // Only visible elements
                    .map(el => el.tagName + (el.id ? `#${el.id}` : '') + (el.className ? `.${el.className}` : ''));
            });
            console.log('Visible elements on page:', visibleElements.slice(0, 50)); // Log first 50 elements

            // **Check for alerts or dialogs**
            const alertText = await page.evaluate(() => window.alert?.message || null);
            if (alertText) {
                console.log('JavaScript alert found:', alertText);
            }

            // **Check if a new tab opened**
            const pages = context.pages();
            console.log('Number of open tabs:', pages.length);

            if (pages.length > 1) {
                const bidPage = pages[pages.length - 1];
                await bidPage.bringToFront();
                await bidPage.waitForLoadState('networkidle');
                console.log('Switched to new tab:', bidPage.url());
            } else {
                throw new Error('Bid form did not open on the same page or in a new tab');
            }
        }

        // If we reached this point, the form should be available
        console.log('Proceeding with bid...');
        const bidPage = page;
        await bidPage.fill('#bidYahoo_price', bidAmount.toString());
        await bidPage.selectOption('#bidYahoo_plan', '99');
        await bidPage.check('#bidYahoo_payment_method_type_2');
        await bidPage.click('#bid_submit');
        await bidPage.waitForTimeout(3000);

        console.log('Bid placed successfully!');
        return { success: true, message: `Bid of ${bidAmount} placed successfully` };

    } catch (error) {
        console.error('Bid placement error:', error);
        return { success: false, message: error.message || 'Failed to place bid' };
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}


  async checkLoginState() {
    try {
        const loginData = JSON.parse(fs.readFileSync('login.json', 'utf8'));
        console.log('Login file exists');
        
        // Check cookies
        const cookies = loginData.cookies || [];
        const hasLoginCookie = cookies.some(cookie => 
            (cookie.name === 'otherbuyee' || cookie.name === 'userProfile') && 
            !cookie.expired
        );
        
        console.log('Has valid login cookie:', hasLoginCookie);
        console.log('Number of cookies:', cookies.length);
        
        // Check for specific required cookies
        const requiredCookies = ['otherbuyee', 'userProfile', 'userId'];
        const missingCookies = requiredCookies.filter(name => 
            !cookies.some(cookie => cookie.name === name)
        );
        
        if (missingCookies.length > 0) {
            console.log('Missing required cookies:', missingCookies);
            return false;
        }
        
        return hasLoginCookie;
    } catch (error) {
        console.error('Error checking login state:', error);
        return false;
    }
  }

  // Update bid prices
  async updateBid(productUrl) {
    const browser = await chromium.launch({ 
      headless: true, 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const context = await browser.newContext({ storageState: "login.json" });

    try {
      const page = await context.newPage();
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
      await context.close();
      await browser.close();
    }
  }

  async login(username, password) {
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  
    const page = await context.newPage();
    
    try {
      console.log('Starting login process...');
      
      await page.goto("https://buyee.jp/signup/login", {
        waitUntil: 'networkidle',
        timeout: 30000
      });
  
      await page.fill('#login_mailAddress', username);
      await page.waitForTimeout(500);
      await page.fill('#login_password', password);
      await page.waitForTimeout(500);
  
      const form = await page.$('#login_form');
      if (!form) {
        throw new Error('Login form not found');
      }
  
      await page.evaluate(() => {
        document.querySelector('#login_submit').click();
      });
  
      await page.waitForNavigation({ timeout: 30000 });
  
      // Check if we're redirected to the 2FA page
      if (page.url().includes('https://buyee.jp/signup/twoFactor')) {
        console.log('Two-factor authentication required');
        // Save the context for later use
        await context.storageState({ path: "temp_login.json" });
        return { success: false, requiresTwoFactor: true };
      }
  
      // If no 2FA required, complete the login process
      await context.storageState({ path: "login.json" });
      return { success: true };
  
    } catch (error) {
      console.error('Login error:', error);
      await page.screenshot({ path: 'login-error.png' });
      throw error;
    } finally {
      await browser.close();
    }
  }
  
  async submitTwoFactorCode(twoFactorCode) {
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      storageState: "temp_login.json"
    });
  
    const page = await context.newPage();
    
    try {
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
      await page.screenshot({ path: 'two-factor-error.png' });
      throw error;
    } finally {
      await browser.close();
    }
  }
}

module.exports = BuyeeScraper;