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
      console.log('Starting browser setup...');
      
      // Basic Linux-compatible configuration
      const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      console.log('Browser launched successfully');
      
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
  async scrapeSearchResults(term, minPrice = "", maxPrice = "", category = "23000", totalPages = 1) {
    console.log('=== Starting search process ===');
    console.log('Search parameters:', { term, minPrice, maxPrice, category, totalPages });
    
    const { browser, context } = await this.setupBrowser();
    console.log('Browser and context set up successfully');
    
    try {
      const allProducts = [];
      console.log('Initialized products array');

      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.log(`Processing page ${currentPage} of ${totalPages}`);
        const pageInstance = await context.newPage();
        console.log('New page instance created');

        // Construct search URL
        let searchUrl = `${this.baseUrl}/item/search/query/${term}`;

        // Add category to the URL if provided
        if (category) {
          searchUrl += `/category/${category}`;
        }

        // Query params
        const params = [];
        if (minPrice) params.push(`aucminprice=${minPrice}`);
        if (maxPrice) params.push(`aucmaxprice=${maxPrice}`);
        params.push(`page=${currentPage}`);
        params.push("translationType=98");
        if (params.length) searchUrl += `?${params.join("&")}`;

        console.log(`Attempting to navigate to URL: ${searchUrl}`);
        console.log('Navigation options:', { waitUntil: "domcontentloaded", timeout: 50000 });
        
        await pageInstance.goto(searchUrl, {
          waitUntil: "networkidle",  // Changed from domcontentloaded
          timeout: 60000,  // Increased timeout
        });

        // Update the selector wait logic
        try {
          console.log('Waiting for items to appear on page...');
          await pageInstance.waitForSelector(".itemCard, .g-item-list, .p-items", { 
            timeout: 30000,
            state: 'attached'
          });
          
          // Add debug logging
          const content = await pageInstance.content();
          console.log('Page content sample:', content.substring(0, 500));
          
          // Try multiple selectors
          const items = await pageInstance.$$(`.itemCard, .g-item-list > div, .p-items > div`);
          console.log(`Found ${items.length} items on page ${currentPage}`);
        } catch (error) {
          console.log(`No items found on page ${currentPage}. Error:`, error.message);
          console.log('Current URL:', await pageInstance.url());
          await pageInstance.close();
          continue;
        }

        console.log('Attempting to get all item cards...');
        const items = await pageInstance.$$(".itemCard");
        console.log(`Found ${items.length} items on page ${currentPage}`);
        console.log('Item cards retrieved successfully');

        for (const item of items) {
          try {
            console.log('Processing item...');
            const titleElement = await item.$(".itemCard__itemName a");
            const title = titleElement
              ? await titleElement.innerText()
              : "No Title";
            let url = titleElement
              ? await titleElement.getAttribute("href")
              : null;
            
            if (!url) {
              console.log('Skipping item - no URL found');
              continue;
            }
            
            if (!url.startsWith("http")) url = `${this.baseUrl}${url}`;

            const imgElement = await item.$(".g-thumbnail__image");
            const imgSrc = imgElement
              ? (await imgElement.getAttribute("data-src")) ||
                (await imgElement.getAttribute("src"))
              : null;

            const priceElement = await item.$(".g-price");
            const price = priceElement
              ? await priceElement.innerText()
              : "Price Not Available";

            console.log('Item processed successfully:', { title, url });
            allProducts.push({
              title,
              price,
              url,
              images: imgSrc ? [imgSrc.split("?")[0]] : [],
            });
          } catch (itemError) {
            console.error('Error processing individual item:', itemError);
          }
        }

        console.log(`Completed processing page ${currentPage}`);
        await pageInstance.close();
        console.log('Page instance closed');
      }

      // Save all products to search.json
      const filePath = path.join(__dirname, "search.json");
      console.log(`Saving results to ${filePath}`);
      fs.writeFileSync(filePath, JSON.stringify(allProducts, null, 2), "utf-8");
      console.log(`Successfully saved ${allProducts.length} products to file`);

      console.log('=== Search completed successfully ===');
      console.log(`Total products found: ${allProducts.length}`);
      await browser.close();
      return allProducts;
      
    } catch (error) {
      console.error('=== Search failed ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      await browser.close();
      return [];
    }
}

  // Scrape additional details and update search.json
  async scrapeDetails(urls = []) {
    const { browser, context } = await this.setupBrowser();

    try {
      const detailedProducts = [];

      for (const productUrl of urls) {
        const productPage = await context.newPage();
        
        try {
          console.log(`Navigating to URL: ${productUrl}`);
          
          // More aggressive navigation options
          await productPage.goto(productUrl, {
            waitUntil: 'load',
            timeout: 45000
          });

          // Additional wait for network to settle
          await productPage.waitForTimeout(3000);

          // Extract product details directly from the page
          const productDetails = await productPage.evaluate(() => {
            // More aggressive title extraction
            let title = 'No Title';
            const titleElements = [
              document.querySelector('h1'),
              document.querySelector('.itemName'),
              document.querySelector('.itemInfo__name'),
              document.title
            ];
            for (const titleEl of titleElements) {
              if (titleEl && titleEl.textContent) {
                title = titleEl.textContent.trim();
                break;
              }
            }

            // More aggressive price extraction
            let price = 'Price Not Available';
            const priceElements = [
              document.querySelector('.current_price .price'),
              document.querySelector('.price'),
              document.querySelector('.itemPrice'),
              document.querySelector('.current_price .g-text--attention')
            ];
            for (const priceEl of priceElements) {
              if (priceEl && priceEl.textContent) {
                price = priceEl.textContent.trim();
                break;
              }
            }

            // More aggressive time remaining extraction
            let time_remaining = 'Time Not Available';
            const timeElements = [
              document.querySelector('.itemInformation__infoItem .g-text--attention'),
              document.querySelector('.itemInfo__time span'),
              document.querySelector('.timeLeft'),
              document.querySelector('.g-text--attention'),
              document.querySelector('.itemInformation .g-text')
            ];
            for (const timeEl of timeElements) {
              if (timeEl && timeEl.textContent) {
                time_remaining = timeEl.textContent.trim();
                break;
              }
            }

            // More comprehensive thumbnail extraction
            let thumbnailUrl = null;
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
              const thumbnailElement = document.querySelector(selector);
              if (thumbnailElement) {
                thumbnailUrl = thumbnailElement.src || 
                              thumbnailElement.getAttribute('data-src') || 
                              thumbnailElement.getAttribute('data-original');
                if (thumbnailUrl) {
                  thumbnailUrl = thumbnailUrl.split('?')[0];
                  break;
                }
              }
            }

            return {
              title,
              price,
              time_remaining,
              url: window.location.href,
              images: thumbnailUrl ? [thumbnailUrl] : []
            };
          });

          console.log('Extracted Product Details:', JSON.stringify(productDetails, null, 2));

          detailedProducts.push(productDetails);
        } catch (pageError) {
          console.error(`Error scraping details for ${productUrl}:`, pageError);
        } finally {
          await productPage.close();
        }
      }

      await browser.close();
      return detailedProducts;
    } catch (error) {
      console.error("Details scraping error:", error.message);
      await browser.close();
      return [];
    }
  }

  async placeBid(productUrl, bidAmount) {
    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });    
    const context = await browser.newContext({ storageState: "login.json" });

    try {
      const page = await context.newPage();
      await page.goto(productUrl);

      await page.waitForTimeout(2000);

      // Check if the "Bid Now" button exists
      const bidNowButton = page.locator("#bidNow");
      if (!(await bidNowButton.count())) {
        console.warn('No "Bid Now" button found on the page');
        return {
          success: false,
          message: 'No "Bid Now" button found on the page',
        };
      }

      // Extract product details
      const productDetails = await page.evaluate(() => {
        // Title extraction
        let title = 'No Title';
        const titleElements = [
          document.querySelector('h1'),
          document.querySelector('.itemName'),
          document.querySelector('.itemInfo__name'),
          document.title
        ];
        for (const titleEl of titleElements) {
          if (titleEl && titleEl.textContent) {
            title = titleEl.textContent.trim();
            break;
          }
        }

        // Thumbnail extraction
        let thumbnailUrl = null;
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
          const thumbnailElement = document.querySelector(selector);
          if (thumbnailElement) {
            thumbnailUrl = thumbnailElement.src || 
                           thumbnailElement.getAttribute('data-src') || 
                           thumbnailElement.getAttribute('data-original');
            if (thumbnailUrl) {
              thumbnailUrl = thumbnailUrl.split('?')[0];
              break;
            }
          }
        }

        // Time remaining extraction
        let timeRemaining = 'Time Not Available';
        const timeElements = [
          document.querySelector('.itemInformation__infoItem .g-text--attention'),
          document.querySelector('.itemInfo__time span'),
          document.querySelector('.timeLeft'),
          document.querySelector('.g-text--attention'),
          document.querySelector('.itemInformation .g-text')
        ];
        for (const timeEl of timeElements) {
          if (timeEl && timeEl.textContent) {
            timeRemaining = timeEl.textContent.trim();
            break;
          }
        }

        return { title, thumbnailUrl, timeRemaining };
      });

      // Extract the time remaining for the auction
      const timeRemaining = await page
        .locator('//span[contains(@class, "g-title")]/following-sibling::span')
        .first()
        .textContent();

      // Click the "Bid Now" button
      await bidNowButton.click();

      // Clear and fill the bid amount (convert to string)
      const bidInput = page.locator('input[name="bidYahoo[price]"]');
      await bidInput.clear();
      await bidInput.fill(bidAmount.toString());

      // Uncomment if a confirmation step is required
      // await page.locator("#bid_submit").click();

      // Save bid details to JSON file
      const bidDetails = {
        productUrl,
        bidAmount,
        timestamp: timeRemaining.trim(),
        title: productDetails.title,
        thumbnailUrl: productDetails.thumbnailUrl
      };

      let bidFileData = { bids: [] }; // Default structure for the JSON file

      // Check if the JSON file exists and read its contents
      if (fs.existsSync(bidFilePath)) {
        const fileContent = fs.readFileSync(bidFilePath, "utf8");
        bidFileData = JSON.parse(fileContent);
      }

      // Check if the product URL already exists in the file
      const existingIndex = bidFileData.bids.findIndex(
        (bid) => bid.productUrl === productUrl
      );

      if (existingIndex !== -1) {
        // Update existing entry
        bidFileData.bids[existingIndex] = bidDetails;
      } else {
        // Add new entry
        bidFileData.bids.push(bidDetails);
      }

      // Write the updated structure to the file
      fs.writeFileSync(bidFilePath, JSON.stringify(bidFileData, null, 2));

      return {
        success: true,
        message: `Bid of ${bidAmount} placed successfully`,
        details: bidDetails
      };
    } catch (error) {
      console.error("Error during bid placement:", error);
      throw new Error("Failed to place the bid. Please try again.");
    } finally {
      // Close context and browser to avoid resource leaks
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
        timeout: 30000
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
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      }
    });
  
    const page = await context.newPage();
    
    try {
      console.log('Navigating to login page...');
      await page.goto("https://buyee.jp/signup/login", {
        waitUntil: 'networkidle',
        timeout: 30000
      });
      
      console.log('Page HTML content:');
      console.log(await page.content());
  
      await context.storageState({ path: "login.json" });
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      await browser.close();
    }
  }
}  

module.exports = BuyeeScraper;