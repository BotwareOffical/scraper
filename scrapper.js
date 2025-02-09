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
  async scrapeSearchResults(term, minPrice = "", maxPrice = "", category = "23000", totalPages = null) {
    console.log('=== Starting search process ===');
    console.log('Search parameters:', { term, minPrice, maxPrice, category });
    
    const { browser, context } = await this.setupBrowser();
    console.log('Browser and context set up successfully');
    
    try {
      // Use a temporary file to store results instead of keeping everything in memory
      const searchResultsPath = path.join(__dirname, `search_${Date.now()}.json`);
      const writeStream = fs.createWriteStream(searchResultsPath, { flags: 'a' });
      
      // Create a single page and reuse it
      const pageInstance = await context.newPage();
      pageInstance.setDefaultTimeout(2000000);
      pageInstance.setDefaultNavigationTimeout(2000000);
      
      // Construct initial search URL
      let searchUrl = `${this.baseUrl}/item/search/query/${term}`;
      if (category) searchUrl += `/category/${category}`;
  
      const params = [];
      if (minPrice) params.push(`aucminprice=${minPrice}`);
      if (maxPrice) params.push(`aucmaxprice=${maxPrice}`);
      params.push("translationType=98");
      if (params.length) searchUrl += `?${params.join("&")}`;
  
      await pageInstance.goto(searchUrl);
  
      // Extract total number of products
      const totalProductsElement = await pageInstance.$('.result-num');
      const totalProductsText = totalProductsElement 
        ? await totalProductsElement.innerText() 
        : '0 / 0';
      
      // Extract total from text like "1 - 20 / 77412 Treffer"
      const totalProductsMatch = totalProductsText.match(/\/\s*(\d+)/);
      const totalProducts = totalProductsMatch 
        ? parseInt(totalProductsMatch[1], 10) 
        : 0;
  
      const productsPerPage = 20; // Buyee's standard
      
      // Calculate total pages
      const calculatedTotalPages = Math.min(
        Math.ceil(totalProducts / productsPerPage), 
        totalProducts < productsPerPage ? 1 : 3 // Limit to 3 pages instead of 10
      );
      totalPages = totalPages || calculatedTotalPages;
  
      console.log(`Total products: ${totalProducts}, Total pages: ${totalPages}`);
  
      // Write metadata to the first line of the file
      writeStream.write(JSON.stringify({
        term,
        totalProducts,
        totalPages,
        timestamp: Date.now()
      }) + '\n');
  
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        // Construct search URL with page number
        const pageSearchUrl = searchUrl.includes('?') 
          ? `${searchUrl}&page=${currentPage}`
          : `${searchUrl}?page=${currentPage}`;
          
        await pageInstance.goto(pageSearchUrl, {
          waitUntil: "networkidle",
          timeout: 200000,
        });
  
        try {
          await pageInstance.waitForSelector(".itemCard, .g-item-list, .p-items", { 
            timeout: 200000,
            state: 'attached'
          });
          
          const items = await pageInstance.$$(".itemCard");
          console.log(`Found ${items.length} items on page ${currentPage}`);
  
          for (const item of items) {
            try {
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
  
              // Extract time remaining - multiple selector approach
              let timeRemaining = 'Time Not Available';
              const timeElements = [
                await item.$('.itemCard__time'),
                await item.$('.g-text--attention'),
                await item.$('.timeLeft')
              ];
  
              for (const timeEl of timeElements) {
                if (timeEl) {
                  try {
                    timeRemaining = await timeEl.innerText();
                    if (timeRemaining) break;
                  } catch {}
                }
              }
  
              // Write each product as a separate line in the JSON file
              const productEntry = JSON.stringify({
                title,
                price,
                url,
                time_remaining: timeRemaining,
                images: imgSrc ? [imgSrc.split("?")[0]] : [],
              }) + '\n';
              
              writeStream.write(productEntry);
            } catch (itemError) {
              console.error('Error processing individual item:', itemError);
            }
          }
  
          console.log(`Completed processing page ${currentPage}`);
  
          // Clear page content to reduce memory usage
          await pageInstance.evaluate(() => {
            document.body.innerHTML = '';
          });
  
          // Add a small delay between pages to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.log(`No items found on page ${currentPage}. Error:`, error.message);
          continue;
        }
      }
  
      // Close write stream
      writeStream.end();
  
      console.log('=== Search completed successfully ===');
      
      // Close browser and page
      await pageInstance.close();
      await browser.close();
      
      // Return the path to the search results file
      return searchResultsPath;
    } catch (error) {
      console.error('=== Search failed ===');
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      
      // Ensure browser is closed even if an error occurs
      await browser.close();
      return null;
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
  
      // Fill the form fields
      await page.fill('#login_mailAddress', username);
      await page.waitForTimeout(500);
      await page.fill('#login_password', password);
      await page.waitForTimeout(500);
  
      // Get the form element
      const form = await page.$('#login_form');
      if (!form) {
        throw new Error('Login form not found');
      }
  
      // Submit the form using JavaScript click on the login button
      await page.evaluate(() => {
        document.querySelector('#login_submit').click();
      });
  
      // Wait for navigation
      await page.waitForNavigation({ timeout: 30000 });
  
      // Save login state immediately
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
}

module.exports = BuyeeScraper;