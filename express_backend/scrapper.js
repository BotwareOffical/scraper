const puppeteer = require('puppeteer');
const logger = require("pino")();
const fs = require("fs");
const path = require("path");
const bidFilePath = path.resolve(__dirname, "../bids.json");

class BuyeeScraper {
  constructor() {
    this.baseUrl = "https://buyee.jp";
  }

  async setupBrowser() {
    try {
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newPage();
      await context.setViewport({ width: 1920, height: 1080 });
      await context.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      });
      await context.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      return { browser, context };
    } catch (error) {
      logger.error(`Error setting up browser: ${error.message}`);
      throw error;
    }
  }

  async scrapeSearchResults(term, minPrice = "", maxPrice = "", category = "23000", totalPages = 1) {
    const { browser, context } = await this.setupBrowser();
    try {
      const allProducts = [];

      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        let searchUrl = `${this.baseUrl}/item/search/query/${term}`;
        if (category) searchUrl += `/category/${category}`;
        
        const params = [];
        if (minPrice) params.push(`aucminprice=${minPrice}`);
        if (maxPrice) params.push(`aucmaxprice=${maxPrice}`);
        params.push(`page=${currentPage}`);
        params.push("translationType=98");
        if (params.length) searchUrl += `?${params.join("&")}`;

        logger.info(`Searching with URL: ${searchUrl}`);
        await context.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });

        try {
          await context.waitForSelector('.itemCard', { timeout: 10000 });
        } catch {
          logger.warn(`No items found on page ${currentPage}. Skipping...`);
          continue;
        }

        const items = await context.evaluate(() => {
          return Array.from(document.querySelectorAll('.itemCard')).map(item => {
            const titleEl = item.querySelector('.itemCard__itemName a');
            const imgEl = item.querySelector('.g-thumbnail__image');
            const priceEl = item.querySelector('.g-price');
            
            let url = titleEl?.href || null;
            if (url && !url.startsWith('http')) {
              url = 'https://buyee.jp' + url;
            }

            return {
              title: titleEl?.textContent.trim() || 'No Title',
              url,
              images: imgEl ? [(imgEl.dataset.src || imgEl.src)?.split('?')[0]] : [],
              price: priceEl?.textContent.trim() || 'Price Not Available'
            };
          }).filter(item => item.url);
        });

        allProducts.push(...items);
      }

      const filePath = path.join(__dirname, "search.json");
      fs.writeFileSync(filePath, JSON.stringify(allProducts, null, 2), "utf-8");
      logger.info(`Saved all search results to ${filePath}`);

      await browser.close();
      return allProducts;
    } catch (error) {
      console.error("Search scraping error:", error.message);
      await browser.close();
      return [];
    }
  }

  async scrapeDetails(urls = []) {
    const { browser, context } = await this.setupBrowser();
    try {
      const detailedProducts = [];

      for (const productUrl of urls) {
        try {
          await context.goto(productUrl, { waitUntil: 'networkidle0', timeout: 45000 });
          await context.waitForTimeout(3000);

          const productDetails = await context.evaluate(() => {
            // Title extraction
            let title = 'No Title';
            const titleElements = [
              document.querySelector('h1'),
              document.querySelector('.itemName'),
              document.querySelector('.itemInfo__name'),
              document.title
            ];
            for (const el of titleElements) {
              if (el?.textContent) {
                title = el.textContent.trim();
                break;
              }
            }

            // Price extraction
            let price = 'Price Not Available';
            const priceElements = [
              document.querySelector('.current_price .price'),
              document.querySelector('.price'),
              document.querySelector('.itemPrice'),
              document.querySelector('.current_price .g-text--attention')
            ];
            for (const el of priceElements) {
              if (el?.textContent) {
                price = el.textContent.trim();
                break;
              }
            }

            // Time remaining extraction
            let time_remaining = 'Time Not Available';
            const timeElements = [
              document.querySelector('.itemInformation__infoItem .g-text--attention'),
              document.querySelector('.itemInfo__time span'),
              document.querySelector('.timeLeft')
            ];
            for (const el of timeElements) {
              if (el?.textContent) {
                time_remaining = el.textContent.trim();
                break;
              }
            }

            // Thumbnail extraction
            let thumbnailUrl = null;
            const thumbnailSelectors = [
              '.flexslider .slides img',
              '.itemImg img',
              '.mainImage img',
              '.g-thumbnail__image'
            ];
            for (const selector of thumbnailSelectors) {
              const el = document.querySelector(selector);
              if (el) {
                thumbnailUrl = el.src || el.dataset.src || el.dataset.original;
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

          detailedProducts.push(productDetails);
        } catch (error) {
          console.error(`Error scraping details for ${productUrl}:`, error);
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
    const browser = await puppeteer.launch({ headless: false });
    const context = await browser.newPage();
    
    try {
      const cookies = JSON.parse(fs.readFileSync('login.json', 'utf8'));
      await context.setCookie(...cookies);
      
      await context.goto(productUrl);
      await context.waitForTimeout(2000);

      const bidButton = await context.$('#bidNow');
      if (!bidButton) {
        return {
          success: false,
          message: 'No "Bid Now" button found'
        };
      }

      const productDetails = await context.evaluate(() => {
        let title = 'No Title';
        const titleElements = [
          document.querySelector('h1'),
          document.querySelector('.itemName'),
          document.querySelector('.itemInfo__name')
        ];
        for (const el of titleElements) {
          if (el?.textContent) {
            title = el.textContent.trim();
            break;
          }
        }

        let thumbnailUrl = null;
        const imgElements = [
          '.flexslider .slides img',
          '.itemImg img',
          '.mainImage img'
        ].map(sel => document.querySelector(sel));
        
        for (const el of imgElements) {
          if (el) {
            thumbnailUrl = el.src || el.dataset.src;
            if (thumbnailUrl) {
              thumbnailUrl = thumbnailUrl.split('?')[0];
              break;
            }
          }
        }

        let timeRemaining = document.querySelector('.itemInfo__time span')?.textContent || 'Time Not Available';

        return { title, thumbnailUrl, timeRemaining };
      });

      await bidButton.click();
      const bidInput = await context.$('input[name="bidYahoo[price]"]');
      await bidInput.click({ clickCount: 3 });
      await bidInput.type(bidAmount.toString());

      const bidDetails = {
        productUrl,
        bidAmount,
        timestamp: productDetails.timeRemaining.trim(),
        title: productDetails.title,
        thumbnailUrl: productDetails.thumbnailUrl
      };

      let bidFileData = { bids: [] };
      if (fs.existsSync(bidFilePath)) {
        bidFileData = JSON.parse(fs.readFileSync(bidFilePath, 'utf8'));
      }

      const existingIndex = bidFileData.bids.findIndex(bid => bid.productUrl === productUrl);
      if (existingIndex !== -1) {
        bidFileData.bids[existingIndex] = bidDetails;
      } else {
        bidFileData.bids.push(bidDetails);
      }

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
      await browser.close();
    }
  }

  async updateBid(productUrl) {
    const { browser, context } = await this.setupBrowser();
    try {
      await context.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const data = await context.evaluate(() => {
        let price = 'Price Not Available';
        const priceElements = [
          document.querySelector('.current_price .price'),
          document.querySelector('.price'),
          document.querySelector('.itemPrice')
        ];
        for (const el of priceElements) {
          if (el?.textContent) {
            price = el.textContent.trim();
            break;
          }
        }

        let timeRemaining = 'Time Not Available';
        const timeElements = [
          document.querySelector('.itemInformation__infoItem .g-text--attention'),
          document.querySelector('.itemInfo__time span'),
          document.querySelector('.timeLeft')
        ];
        for (const el of timeElements) {
          if (el?.textContent) {
            timeRemaining = el.textContent.trim();
            break;
          }
        }

        return { price, timeRemaining };
      });

      return {
        productUrl,
        price: data.price,
        timeRemaining: data.timeRemaining
      };
    } catch (error) {
      console.error("Error during bid update:", error);
      return { productUrl, error: error.message };
    } finally {
      await browser.close();
    }
  }

  async login(username, password) {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    try {
      await page.goto("https://buyee.jp/signup/login");
      await page.type("#login_mailAddress", username);
      await page.type("#login_password", password);
      await page.click('a[data-testid="loginBtn"]');
      await page.waitForNavigation();
      
      const cookies = await page.cookies();
      fs.writeFileSync('login.json', JSON.stringify(cookies, null, 2));
    } finally {
      await browser.close();
    }
  }
}

module.exports = BuyeeScraper;