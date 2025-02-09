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
  async scrapeDetails(urls = []) {
    const { browser, context } = await this.setupBrowser();
  
    try {
      const detailedProducts = [];
  
      for (const productUrl of urls) {
        const productPage = await context.newPage();
        
        try {
          console.log(`Navigating to URL: ${productUrl}`);
          
          await productPage.goto(productUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 25000
          });
  
          await productPage.waitForTimeout(1480);
  
          const productDetails = await productPage.evaluate(() => {
            const getElement = (selectors) => {
              for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent) {
                  return element.textContent.trim();
                }
              }
              return null;
            };
  
            const title = getElement(['h1', '.itemName', '.itemInfo__name']) || document.title;
            const price = getElement(['.current_price .price', '.price', '.itemPrice', '.current_price .g-text--attention']) || 'Price Not Available';
            const time_remaining = getElement(['.itemInformation__infoItem .g-text--attention', '.itemInfo__time span', '.timeLeft', '.g-text--attention', '.itemInformation .g-text']) || 'Time Not Available';
  
            // Image extraction logic from the previous version
            const images = [];
            const thumbnailSelectors = [
              '.flexslider .slides img',
              '.flex-control-nav .slides img',
              '.itemImg img',
              '.mainImage img',
              '.g-thumbnail__image',
              '.itemPhoto img',
              'img.primary-image'
            ];
  
            for (const selector of thumbnailSelectors) {
              const thumbnailElements = document.querySelectorAll(selector);
              thumbnailElements.forEach(element => {
                const thumbnailUrl = element.src || 
                                     element.getAttribute('data-src') || 
                                     element.getAttribute('data-original');
                if (thumbnailUrl && !thumbnailUrl.includes('loading-spacer.gif')) {
                  const cleanUrl = thumbnailUrl.split('?')[0];
                  if (!images.includes(cleanUrl)) {
                    images.push(cleanUrl);
                  }
                }
              });
              if (images.length > 0) break;
            }
  
            return {
              title,
              price,
              time_remaining,
              url: window.location.href,
              images
            };
          });
  
          console.log('Extracted Product Details:', JSON.stringify(productDetails, null, 2));
          detailedProducts.push(productDetails);
        } catch (pageError) {
          console.error(`Error scraping details for ${productUrl}:`, pageError);
        } finally {
          await productPage.close();
        }
  
        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
  
      return detailedProducts;
    } catch (error) {
      console.error("Details scraping error:", error.message);
      return [];
    } finally {
      await browser.close();
    }
  }

  // Add this debugging method to help track what's happening
  async removeFinishedAuctions(finishedUrls) {
    try {
      const bidFilePath = path.resolve(__dirname, "../bids.json");
      console.log('Attempting to remove finished auctions...');
      console.log('Finished URLs:', finishedUrls);
      
      if (!fs.existsSync(bidFilePath)) {
        console.log(`Bids file not found at path: ${bidFilePath}`);
        return;
      }

      // Read and log current bids
      const data = fs.readFileSync(bidFilePath, 'utf8');
      const bidsData = JSON.parse(data);
      console.log('Current bids before removal:', bidsData.bids.length);
      
      // Filter out finished auctions
      const originalLength = bidsData.bids.length;
      bidsData.bids = bidsData.bids.filter(bid => {
        const shouldKeep = !finishedUrls.includes(bid.productUrl);
        if (!shouldKeep) {
          console.log(`Removing finished auction: ${bid.productUrl}`);
        }
        return shouldKeep;
      });

      // Log the difference
      const removedCount = originalLength - bidsData.bids.length;
      console.log(`Removed ${removedCount} finished auctions`);
      console.log('Remaining bids:', bidsData.bids.length);

      // Write back to file
      fs.writeFileSync(bidFilePath, JSON.stringify(bidsData, null, 2));
      
      if (removedCount > 0) {
        console.log('Successfully updated bids.json');
      } else {
        console.log('No auctions were removed');
      }
      
    } catch (error) {
      console.error('Error in removeFinishedAuctions:', error);
      // Log more details about the error
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
  }
  async placeBid(productUrl, bidAmount) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
        storageState: "login.json",
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        extraHTTPHeaders: {
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://buyee.jp/',
            'Origin': 'https://buyee.jp',
            'DNT': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin'
        }
    });

    try {
        const page = await context.newPage();
        console.log('Attempting to navigate to:', productUrl);
        
        await page.goto(productUrl, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Check for 403 Forbidden
        const pageContent = await page.content();
        if (pageContent.includes('403 Forbidden')) {
            console.warn('Encountered 403 Forbidden! Retrying with delay...');
            await page.waitForTimeout(5000); // Wait before retrying
            await page.reload({ waitUntil: 'networkidle' });
        }

        console.log('Page loaded, checking content...');
        console.log('Current page URL:', page.url());

        // Mimic human behavior
        await page.mouse.move(500, 500);
        await page.waitForTimeout(2000);
        await page.evaluate(() => window.scrollBy(0, 200));

        console.log('Checking for bid button...');
        const bidNowButton = page.locator("#bidNow");
        const bidButtonExists = await bidNowButton.count();
        
        if (!bidButtonExists) {
            console.warn('No "Bid Now" button found on the page');
            return { success: false, message: 'No "Bid Now" button found on the page' };
        }

        // Extract product details
        const productDetails = await page.evaluate(() => {
            const getElementText = (selectors) => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element && element.textContent) {
                        return element.textContent.trim();
                    }
                }
                return null;
            };

            const title = getElementText(['h1', '.itemName', '.itemInfo__name']) || 'No Title';
            let thumbnailUrl = null;
            const imageSelectors = ['.flexslider .slides img', '.mainImage img', '.g-thumbnail__image'];
            for (const selector of imageSelectors) {
                const imageElement = document.querySelector(selector);
                if (imageElement) {
                    thumbnailUrl = imageElement.src || imageElement.getAttribute('data-src');
                    break;
                }
            }
            return { title, thumbnailUrl };
        });

        // Click the "Bid Now" button
        await bidNowButton.click();
        await page.waitForTimeout(2000);

        // Fill in the bid form
        const bidInput = page.locator('input[name="bidYahoo[price]"]');
        await bidInput.waitFor({ state: 'visible', timeout: 10000 });
        await bidInput.click({ clickCount: 3 });
        await bidInput.press('Backspace');
        await bidInput.fill(bidAmount.toString());

        // Select the Lite plan if available
        try {
            await page.selectOption('select[name="bidYahoo[plan]"]', '99');
        } catch (error) {
            console.log('Plan selection not available or already selected');
        }

        // Submit bid
        await page.waitForTimeout(1000);
        const submitButton = page.locator('#bid_submit');
        if (await submitButton.count()) {
            await submitButton.click();
            await page.waitForTimeout(2000);
        }

        // Save bid details
        const bidDetails = {
            productUrl,
            bidAmount,
            title: productDetails.title,
            thumbnailUrl: productDetails.thumbnailUrl
        };

        let bidFileData = { bids: [] };
        if (fs.existsSync(bidFilePath)) {
            const fileContent = fs.readFileSync(bidFilePath, "utf8");
            bidFileData = JSON.parse(fileContent);
        }

        const existingIndex = bidFileData.bids.findIndex(bid => bid.productUrl === productUrl);
        if (existingIndex !== -1) {
            bidFileData.bids[existingIndex] = bidDetails;
        } else {
            bidFileData.bids.push(bidDetails);
        }

        fs.writeFileSync(bidFilePath, JSON.stringify(bidFileData, null, 2));

        return { success: true, message: `Bid of ${bidAmount} placed successfully`, details: bidDetails };

    } catch (error) {
        console.error("Error during bid placement:", error);
        return { success: false, message: "Failed to place the bid. Please try again." };
    } finally {
        await context.close();
        await browser.close();
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