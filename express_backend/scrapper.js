const { chromium } = require("playwright");
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
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        extraHTTPHeaders: {
          "Accept-Language": "en-US,en;q=0.9",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
        },
      });
      logger.info("Browser context setup successfully");
      return { browser, context };
    } catch (error) {
      logger.error(`Error setting up browser: ${error.message}`);
      throw error;
    }
  }

  // Scrape search results and save to search.json
  async scrapeSearchResults(
    term,
    minPrice = "",
    maxPrice = "",
    category = "23000",
    totalPages = 1
  ) {
    const { browser, context } = await this.setupBrowser();
    try {
      const allProducts = [];

      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        const pageInstance = await context.newPage();

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

        logger.info(`Searching with URL: ${searchUrl}`);
        await pageInstance.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        // Wait for items to load
        try {
          await pageInstance.waitForSelector(".itemCard", { timeout: 10000 });
        } catch {
          logger.warn(`No items found on page ${currentPage}. Skipping...`);
          await pageInstance.close();
          continue;
        }

        const items = await pageInstance.$$(".itemCard");
        logger.info(`Found ${items.length} items on page ${currentPage}`);

        for (const item of items) {
          const titleElement = await item.$(".itemCard__itemName a");
          const title = titleElement
            ? await titleElement.innerText()
            : "No Title";
          let url = titleElement
            ? await titleElement.getAttribute("href")
            : null;
          if (!url) continue;
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

          allProducts.push({
            title,
            price,
            url,
            images: imgSrc ? [imgSrc.split("?")[0]] : [],
          });
        }

        await pageInstance.close(); // Close the page after processing
      }

      // Save all products to search.json
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

  // Scrape additional details and update search.json
  async scrapeDetails(urls = []) {
    const filePath = path.join(__dirname, "search.json");
    if (!fs.existsSync(filePath)) {
      console.error("search.json not found. Please run a search first.");
      return [];
    }

    // Load existing products
    const products = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // Filter products based on provided URLs
    const filteredProducts = products.filter((product) =>
      urls.includes(product.url)
    );
    if (filteredProducts.length === 0) {
      console.error("No matching products found for the provided URLs.");
      return [];
    }

    const { browser, context } = await this.setupBrowser();

    try {
      for (const product of filteredProducts) {
        const productPage = await context.newPage();
        await productPage.goto(product.url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });

        const additionalImages = await productPage.evaluate(() => {
          const images = document.querySelectorAll(
            "ol.flex-control-nav li img"
          );
          return Array.from(images).map((img) => img.src.split("?")[0]); // Removing query parameters
        });

        // Update product images
        product.images = [...new Set([...product.images, ...additionalImages])];
        await productPage.close();
      }

      // Save updated products back to search.json
      fs.writeFileSync(filePath, JSON.stringify(products, null, 2), "utf-8");
      logger.info(`Updated search.json with additional details`);

      await browser.close();
      return filteredProducts; // Return updated products
    } catch (error) {
      console.error("Details scraping error:", error.message);
      await browser.close();
      return [];
    }
  }

  async placeBid(productUrl, bidAmount) {
    const browser = await chromium.launch({ headless: false });
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
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: "login.json" });

    try {
      const page = await context.newPage();
      await page.goto(productUrl);

      // Extract price and time remaining
      const price = await page.locator("div.price").textContent();
      console.log("PRICE:", price);

      const timeRemaining = await page
        .locator('//span[contains(@class, "g-title")]/following-sibling::span')
        .first()
        .textContent();
      console.log("TIME REMAINING:", timeRemaining);

      return {
        productUrl,
        price: price.trim(),
        timeRemaining: timeRemaining.trim(),
      };
    } catch (error) {
      console.error("Error during scraping bid details:", error);
      throw new Error("Failed to scrape bid details");
    } finally {
      await context.close();
      await browser.close();
    }
  }

  async login(username, password) {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://buyee.jp/signup/login");
    await page.locator("#login_mailAddress").fill(username);
    await page.locator("#login_password").fill(password);
    await page.getByRole("link", { name: "Login" }).click();
    await page.pause();
    await context.storageState({ path: "login.json" });
    await browser.close();
  }
}

module.exports = BuyeeScraper;
