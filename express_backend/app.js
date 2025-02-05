const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const BuyeeScraper = require('./scrapper');
const logger = require('morgan');
const fs = require('fs');
const path = require('path');
const bidFilePath = path.resolve(__dirname, '../bids.json');

const app = express();

// Middleware configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['*'],
  credentials: true,
  preflightContinue: true,
  optionsSuccessStatus: 204
}));

// Body parser middleware - IMPORTANT: This must come before your routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Additional CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Credentials', true);
  
  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
});

const scraper = new BuyeeScraper();


app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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

app.post('/search', async (req, res) => {
  console.log('Search endpoint hit with body:', req.body);
  
  try {
    // Validate request body
    if (!req.body || !req.body.terms) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required field: terms' 
      });
    }

    const { terms: searchTerms = [] } = req.body;
    
    // Validate searchTerms array
    if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Search terms must be a non-empty array' 
      });
    }

    console.log('Processing search terms:', searchTerms);

    const results = [];
    for (const searchTerm of searchTerms) {
      const { term = '', minPrice = '', maxPrice = '', category = '', page = 1 } = searchTerm;

      // Basic validation of individual search term
      if (!term) {
        console.warn('Empty search term encountered');
        continue;
      }

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
    res.status(500).json({ 
      success: false,
      error: 'Failed to search products',
      details: error.message 
    });
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

