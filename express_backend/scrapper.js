const { chromium } = require('playwright');
const logger = require('pino')();

class BuyeeScraper {
  constructor() {
    this.baseUrl = 'https://buyee.jp';
  }

  // Setup browser and context
  async setupBrowser() {
    try {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
        },
      });
      logger.info('Browser context setup successfully');
      return { browser, context };
    } catch (error) {
      logger.error(`Error setting up browser: ${error.message}`);
      throw error;
    }
  }

// Scrape search results
async scrapeSearchResults(term, minPrice = '', maxPrice = '', page = 1, detailed = true) {
  const { browser, context } = await this.setupBrowser();
  try {
    const pageInstance = await context.newPage();

    // Construct search URL
    let searchUrl = `${this.baseUrl}/item/search/query/${term}`;
    const params = [];
    if (minPrice) params.push(`aucminprice=${minPrice}`);
    if (maxPrice) params.push(`aucmaxprice=${maxPrice}`);
    if (page > 1) params.push(`page=${page}`);
    params.push('translationType=98');
    if (params.length) searchUrl += `?${params.join('&')}`;

    logger.info(`Searching with URL: ${searchUrl}`);
    await pageInstance.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for items to load
    await pageInstance.waitForSelector('.itemCard', { timeout: 10000 });

    const items = await pageInstance.$$('.itemCard');
    logger.info(`Found ${items.length} items in search results`);

    const products = [];
    for (const item of items) {
      try {
        const titleElement = await item.$('.itemCard__itemName a');
        if (!titleElement) {
          logger.warn('No title element found for an item');
          continue;
        }

        const title = await titleElement.innerText();
        let url = await titleElement.getAttribute('href');
        if (!url) {
          logger.warn(`No URL found for item: ${title}`);
          continue;
        }
        if (!url.startsWith('http')) url = `${this.baseUrl}${url}`;

        // Extract image
        const images = [];
        const imgElement = await item.$('.g-thumbnail__image');
        if (imgElement) {
          let src = (await imgElement.getAttribute('data-src')) || (await imgElement.getAttribute('src'));
          if (src) {
            src = src.split('?')[0].replace('?pri=l&w=300&h=300', '');
            images.push(src);
          }
        }

        // Extract price and time remaining
        const priceElement = await item.$('.g-price');
        const price = priceElement ? await priceElement.innerText() : 'Price Not Available';

        const timeElement = await item.$('.g-text--attention');
        const timeRemaining = timeElement ? await timeElement.innerText() : 'Time Not Available';

        // Create product object
        const product = {
          title,
          price,
          timeRemaining,
          url,
          images
        };
        products.push(product);
      } catch (itemError) {
        logger.error(`Error processing individual item: ${itemError.message}`);
      }
    }

    // Send initial data immediately
    console.log("INITIAL PRODUCT DETAILS", products);

    // Fetch additional images asynchronously
    for (const product of products) {
      try {
        const productPage = await context.newPage();
        await productPage.goto(product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const additionalImages = await productPage.evaluate(() => {
          const images = document.querySelectorAll('ol.flex-control-nav li img');
          return Array.from(images).map(img => img.src);
        });

        // Merge additional images into the existing images array
        product.images = [...new Set([...product.images, ...additionalImages])];

        await productPage.close();

        // Notify front end with updated product
        console.log("UPDATED PRODUCT WITH MERGED IMAGES", product);
      } catch (additionalImageError) {
        logger.error(`Error fetching additional images for ${product.title}: ${additionalImageError.message}`);
      }
    }

    await browser.close();
    return products;
  } catch (error) {
    logger.error(`Comprehensive search scraping error: ${error.message}`, error);
    await browser.close();
    return [];
  }
}

  // Scrape multiple pages
  async scrapeAllPages(term, minPrice = '', maxPrice = '', maxPages = 3) {
    logger.info(`Starting multi-page scrape for term: ${term}`);
    const allProducts = [];
    for (let page = 1; page <= maxPages; page++) {
      logger.info(`Scraping page ${page}`);
      const products = await this.scrapeSearchResults(term, minPrice, maxPrice, page, true);

      if (!products.length) {
        logger.info(`No more products found after page ${page}`);
        break;
      }

      allProducts.push(...products);
      logger.info(`Total products collected so far: ${allProducts.length}`);
    }

    logger.info(`Total products collected: ${allProducts.length}`);
    return allProducts;
  }

  async placeBid(productUrl, bidAmount) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: "login.json" });
  
    try {
      const page = await context.newPage();
      await page.goto(productUrl);
  
      // Click the "Bid Now" button
      await page.locator('#bidNow').click();
  
      // Clear and fill the bid amount (convert to string)
      await page.locator('input[name="bidYahoo[price]"]').clear();
      await page.locator('input[name="bidYahoo[price]"]').fill(bidAmount.toString());
  
      // Uncomment if a confirmation step is required
      // await page.locator("#bid_submit").click();
    } catch (error) {
      console.error('Error during bid placement:', error);
      throw new Error('Failed to place the bid. Please try again.');
    } finally {
      // Close context and browser to avoid resource leaks
      await context.close();
      await browser.close();
    }
  }

  async login(username, password) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('https://buyee.jp/signup/login');
    await page.locator('#login_mailAddress').fill(username);
    await page.locator('#login_password').fill(password);
    await page.getByRole('link', { name: 'Login' }).click();
    await page.pause();

    await context.storageState({ path: "login.json"});
  }
}

module.exports = BuyeeScraper;
