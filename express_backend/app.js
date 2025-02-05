const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const BuyeeScraper = require('./scrapper');
const logger = require('morgan');
const fs = require('fs');
const path = require('path');
const bidFilePath = path.resolve(__dirname, '../bids.json');

const app = express();

// Configure CORS with more permissive settings
const corsOptions = {
  origin: '*',
  credentials: true,
};
app.use(cors(corsOptions));

// Middleware
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const scraper = new BuyeeScraper();

// Place bid endpoint
app.post('/place-bid', async (req, res) => {
  try {
    console.log('Received bid request data:', req.body);

    const { productId: productUrl, amount: bidAmount } = req.body;

    console.log('Bid Details:');
    console.log(`Product URL: ${productUrl}`);
    console.log(`Bid Amount: ${bidAmount}`);

    if (!productUrl || !bidAmount || isNaN(bidAmount) || bidAmount <= 0) {
      console.warn('Invalid product URL or bid amount');
      return res.status(400).json({
        success: false,
        message: 'Product URL must be valid, and bid amount must be a positive number',
      });
    }

    // Call the scraper's placeBid method
    const response = await scraper.placeBid(productUrl, bidAmount);

    if (!response.success) {
      return res.status(400).json(response);
    }

    const updatedBids = JSON.parse(fs.readFileSync(bidFilePath, 'utf8'));

    res.json({
      success: true,
      message: response.message,
      updatedBids,
    });
  } catch (error) {
    console.error('Bid placement error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place the bid. Please try again.',
    });
  }
});

// Search endpoint
app.post('/search', async (req, res) => {
  console.log('Received search request');
  try {
    const { terms: searchTerms = [] } = req.body;
    console.log('Received search request with data:', req.body);

    if (!searchTerms.length) {
      console.warn('No search terms provided in request');
      return res.status(400).json({ error: 'No search terms provided' });
    }

    const results = [];

    for (const searchTerm of searchTerms) {
      const { term = '', minPrice = '', maxPrice = '', category='', page=0 } = searchTerm;

      // Basic search logic
      const termResults = await scraper.scrapeSearchResults(term, minPrice, maxPrice, category, page);
      console.log(`Found ${termResults.length} results for term: ${term}`);
      results.push(...termResults);

      // Avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// Details Endpoint
app.post('/details', async (req, res) => {
  try {
    const { urls = [] } = req.body;

    if (!urls.length) {
      return res.status(400).json({ 
        success: false,
        error: 'No URLs provided' 
      });
    }

    // Log incoming URLs for debugging
    console.log('Received URLs for details:', urls);

    const updatedDetails = await scraper.scrapeDetails(urls);

    console.log('Scraped Details:', updatedDetails);

    if (updatedDetails.length === 0) {
      return res.status(200).json({
        success: true,
        updatedDetails: [],
        error: 'No details found for the provided URLs'
      });
    }

    res.json({
      success: true,
      updatedDetails,
    });
  } catch (error) {
    console.error('Details error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch additional details' 
    });
  }
});

app.get('/bids', (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const data = fs.readFileSync(bidFilePath, 'utf-8');
    const bidsData = JSON.parse(data);
    console.log(bidsData)
    res.json(bidsData.bids);
  } catch (error) {
    console.error(`Error reading bids: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Login endpoint
app.post('/login', async (req, res) => {
  try {
    console.log('Received login request:', req.body);

    const { username, password } = req.body;

    if (!username || !password) {
      console.warn('Username or password missing');
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
      });
    }

    // Call the scraper's login method
    const loginResult = await scraper.login(username, password);

    res.json({
      success: true,
      message: 'Login successful',
      data: loginResult,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please check your credentials and try again.',
    });
  }
});

// Update bid prices endpoint
app.post('/update-bid-prices', async (req, res) => {
  try {
    console.log('Received update bid prices request:', req.body);

    const { productUrls } = req.body;

    if (!Array.isArray(productUrls) || productUrls.length === 0) {
      console.warn('Invalid or empty product URLs array');
      return res.status(400).json({
        success: false,
        message: 'Product URLs must be an array and cannot be empty',
      });
    }

    const updatedBids = [];

    for (const productUrl of productUrls) {
      try {
        const bidDetails = await scraper.updateBid(productUrl);
        updatedBids.push(bidDetails);
      } catch (error) {
        console.error(`Failed to update bid for URL: ${productUrl}`, error);
        updatedBids.push({
          productUrl,
          error: error.message || 'Failed to retrieve bid details',
        });
      }

      // Avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    res.json({
      success: true,
      updatedBids,
      count: updatedBids.length,
    });
  } catch (error) {
    console.error('Update bid prices error:', error);
    res.status(500).json({
      success: false,
      error: `Failed to update bid prices: ${error.message}`,
    });
  }
});

// Start the server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

