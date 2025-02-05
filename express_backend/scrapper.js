const puppeteer = require('puppeteer');
const logger = require('pino')();
const fs = require('fs');
const path = require('path');
const bidFilePath = path.resolve(__dirname, '../bids.json');

class BuyeeScraper {
  constructor() {
    this.baseUrl = "https://buyee.jp";
  }

  async setupBrowser() {
    try {
      const browser = await puppeteer.launch({
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
        headless: 'new'
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      });

      logger.info('Browser setup successfully');
      return { browser, page };
    } catch (error) {
      logger.error(`Error setting up browser: ${error.message}`);
      throw error;
    }
  }

  async scrapeSearchResults(term, minPrice = "", maxPrice = "", category = "23000", totalPages = 1) {
    const { browser, page } = await this.setupBrowser();
    try {
      const allProducts = [];

      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        let searchUrl = `${this.baseUrl}/item/search/query/${term}`;
        
        if (category) {
          searchUrl += `/category/${category}`;
        }

        const params = [];
        if (minPrice) params.push(`aucminprice=${minPrice}`);
        if (maxPrice) params.push(`aucmaxprice=${maxPrice}`);
        params.push(`page=${currentPage}`);
        params.push("translationType=98");
        if (params.length) searchUrl += `?${params.join("&")}`;

        logger.info(`Searching with URL: ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'networkidle0' });

        try {
          await page.waitForSelector('.itemCard', { timeout: 10000 });
        } catch {
          logger.warn(`No items found on page ${currentPage}. Skipping...`);
          continue;
        }

        const products = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('.itemCard'));
          return items.map(item => {
            const titleElement = item.querySelector('.itemCard__itemName a');
            const imgElement = item.querySelector('.g-thumbnail__image');
            const priceElement = item.querySelector('.g-price');

            return {
              title: titleElement ? titleElement.textContent.trim() : 'No Title',
              price: priceElement ? priceElement.textContent.trim() : 'Price Not Available',
              url: titleElement ? titleElement.href : null,
              images: imgElement ? 
                [imgElement.getAttribute('data-src') || imgElement.src].map(src => src.split('?')[0]) : []
            };
          });
        });

        allProducts.push(...products.filter(product => product.url));
      }

      await browser.close();
      return allProducts;
    } catch (error) {
      console.error('Search scraping error:', error.message);
      await browser.close();
      return [];
    }
  }

  async scrapeDetails(urls = []) {
    const { browser, page } = await this.setupBrowser();
    try {
      const detailedProducts = [];

      for (const productUrl of urls) {
        try {
          console.log(`Navigating to URL: ${productUrl}`);
          await page.goto(productUrl, { waitUntil: 'networkidle0', timeout: 30000 });

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

            // Price extraction
            let price = 'Price Not Available';
            const priceElements = [
              document.querySelector('.current_price .price'),
              document.querySelector('.price'),
              document.querySelector('.itemPrice')
            ];
            for (const priceEl of priceElements) {
              if (priceEl && priceEl.textContent) {
                price = priceEl.textContent.trim();
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
            for (const timeEl of timeElements) {
              if (timeEl && timeEl.textContent) {
                time_remaining = timeEl.textContent.trim();
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
              const thumbnailElement = document.querySelector(selector);
              if (thumbnailElement) {
                thumbnailUrl = thumbnailElement.src || 
                              thumbnailElement.getAttribute('data-src');
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
      console.error('Details scraping error:', error.message);
      await browser.close();
      return [];
    }
  }

  async login(username, password) {
    const { browser, page } = await this.setupBrowser();
    try {
      await page.goto('https://buyee.jp/signup/login');
      await page.type('#login_mailAddress', username);
      await page.type('#login_password', password);
      await page.click('a[role="button"][class*="login"]');
      
      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle0' });
      
      const cookies = await page.cookies();
      fs.writeFileSync('login.json', JSON.stringify({ cookies }, null, 2));

      await browser.close();
      return { success: true };
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  async placeBid(productUrl, bidAmount) {
    const { browser, page } = await this.setupBrowser();
    try {
      // Load cookies if they exist
      if (fs.existsSync('login.json')) {
        const cookiesString = fs.readFileSync('login.json', 'utf8');
        const cookiesData = JSON.parse(cookiesString);
        await page.setCookie(...cookiesData.cookies);
      }

      await page.goto(productUrl);
      await page.waitForSelector('#bidNow', { timeout: 10000 });

      const productDetails = await page.evaluate(() => {
        const title = document.querySelector('h1')?.textContent || 
                     document.querySelector('.itemName')?.textContent || 
                     'No Title';

        const thumbnailSelector = '.flexslider .slides img, .itemImg img, .mainImage img, .g-thumbnail__image';
        const thumbnailElement = document.querySelector(thumbnailSelector);
        const thumbnailUrl = thumbnailElement ? 
          (thumbnailElement.getAttribute('data-src') || thumbnailElement.src) : null;

        const timeElement = document.querySelector('.itemInformation__infoItem .g-text--attention') ||
                          document.querySelector('.itemInfo__time span');
        
        return {
          title: title.trim(),
          thumbnailUrl: thumbnailUrl ? thumbnailUrl.split('?')[0] : null,
          timestamp: timeElement ? timeElement.textContent.trim() : 'Time not available'
        };
      });

      await page.click('#bidNow');
      await page.type('input[name="bidYahoo[price]"]', bidAmount.toString());

      const bidDetails = {
        productUrl,
        bidAmount,
        timestamp: productDetails.timestamp,
        title: productDetails.title,
        thumbnailUrl: productDetails.thumbnailUrl
      };

      let bidFileData = { bids: [] };
      if (fs.existsSync(bidFilePath)) {
        const fileContent = fs.readFileSync(bidFilePath, 'utf8');
        bidFileData = JSON.parse(fileContent);
      }

      const existingIndex = bidFileData.bids.findIndex(
        (bid) => bid.productUrl === productUrl
      );

      if (existingIndex !== -1) {
        bidFileData.bids[existingIndex] = bidDetails;
      } else {
        bidFileData.bids.push(bidDetails);
      }

      fs.writeFileSync(bidFilePath, JSON.stringify(bidFileData, null, 2));

      await browser.close();
      return {
        success: true,
        message: `Bid of ${bidAmount} placed successfully`,
        details: bidDetails
      };
    } catch (error) {
      await browser.close();
      throw new Error('Failed to place the bid. Please try again.');
    }
  }

  async updateBid(productUrl) {
    const { browser, page } = await this.setupBrowser();
    try {
      await page.goto(productUrl, { waitUntil: 'networkidle0' });

      const results = await page.evaluate(() => {
        let price = 'Price Not Available';
        const priceElements = [
          document.querySelector('.current_price .price'),
          document.querySelector('.price'),
          document.querySelector('.itemPrice')
        ];

        for (const el of priceElements) {
          if (el && el.textContent) {
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
          if (el && el.textContent) {
            timeRemaining = el.textContent.trim();
            break;
          }
        }

        return { price, timeRemaining };
      });

      await browser.close();
      return {
        productUrl,
        price: results.price,
        timeRemaining: results.timeRemaining
      };
    } catch (error) {
      await browser.close();
      return {
        productUrl,
        error: error.message
      };
    }
  }
}

module.exports = BuyeeScraper;