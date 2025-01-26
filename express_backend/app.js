const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const BuyeeScraper = require('./scrapper');
const logger = require('morgan');

const app = express();

// Configure CORS with more permissive settings
const corsOptions = {
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Type', 'Authorization'],
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
      await scraper.placeBid(productUrl, bidAmount);
  
      res.json({
        success: true,
        message: `Bid of ${bidAmount} placed on ${productUrl}`,
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
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    return res.json({ message: 'OK' });
  }

  try {
    const { terms: searchTerms = [] } = req.body;
    console.log('Received search request with data:', req.body);

    if (!searchTerms.length) {
      console.warn('No search terms provided in request');
      return res.status(400).json({ error: 'No search terms provided' });
    }

    const results = [];

    for (const searchTerm of searchTerms) {
      const { term = '', minPrice = '', maxPrice = '' } = searchTerm;

      // Basic search logic
      const termResults = await scraper.scrapeSearchResults(term, minPrice, maxPrice);
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
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: `Search failed: ${error.message}`,
    });
  }
});

// Start the server
const PORT = 5000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running on http://127.0.0.1:${PORT}`);
});
