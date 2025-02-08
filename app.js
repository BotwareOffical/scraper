const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const BuyeeScraper = require('./scrapper');
const logger = require('morgan');
const fs = require('fs');
const path = require('path');
const bidFilePath = path.resolve(__dirname, './data/bids.json');

const app = express();

// Configure CORS with more permissive settings
const corsOptions = {
  origin: function(origin, callback) {
    console.log('Request Origin:', origin);
    const allowedOrigins = [
      'https://buyee-scraper-frontend-new-23f2627c6b90.herokuapp.com',
      'http://localhost:5173'
    ];
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Origin not allowed:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  exposedHeaders: ['Access-Control-Allow-Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};


app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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
app.post('/search', async (req, res, next) => {
  try {
    console.log('Received search request');
    const { terms: searchTerms = [] } = req.body;
    console.log('Received search request with data:', req.body);

    if (!searchTerms.length) {
      return res.status(400).json({ 
        success: false,
        error: 'No search terms provided' 
      });
    }

    const results = [];
    const errors = [];
    let hasPartialSuccess = false;

    // Process search terms in parallel with a concurrency limit of 4
    const batchSize = 4; // Process 4 terms at a time
    const totalBatches = Math.ceil(searchTerms.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startIndex = batchIndex * batchSize;
      const batch = searchTerms.slice(startIndex, startIndex + batchSize);
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches} with ${batch.length} terms`);

      const batchPromises = batch.map(async searchTerm => {
        try {
          const { 
            term = '', 
            minPrice = '', 
            maxPrice = ''
          } = searchTerm;

          console.log(`Starting search for term: ${term}`);
          
          // Use scraper's default values for category and totalPages
          const termResults = await scraper.scrapeSearchResults(
            term, 
            minPrice, 
            maxPrice
          );
          
          console.log(`Found ${termResults.length} results for term: ${term}`);
          if (termResults.length > 0) {
            hasPartialSuccess = true;
          }
          return termResults;
        } catch (termError) {
          console.error(`Error searching for term ${searchTerm.term}:`, termError);
          errors.push({
            term: searchTerm.term,
            error: termError.message
          });
          return [];
        }
      });

      // Wait for current batch to complete
      try {
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.flat().filter(result => result); // Filter out null/undefined
        results.push(...validResults);
        
        console.log(`Batch ${batchIndex + 1} completed. Total results so far: ${results.length}`);

        // Add delay between batches, but not after the last batch
        if (batchIndex < totalBatches - 1) {
          console.log('Adding delay between batches...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (batchError) {
        console.error(`Error processing batch ${batchIndex + 1}:`, batchError);
        errors.push({
          batch: batchIndex + 1,
          error: batchError.message
        });
      }
    }

    // Return results
    if (results.length > 0 || hasPartialSuccess) {
      res.json({
        success: true,
        results,
        count: results.length,
        errors: errors.length > 0 ? errors : undefined,
        isPartialResult: errors.length > 0,
        searchedTerms: searchTerms.length,
        successfulSearches: searchTerms.length - errors.length
      });
    } else {
      // If no results at all, return error
      throw new Error(
        errors.length > 0 
          ? errors.map(e => `${e.term || `Batch ${e.batch}`}: ${e.error}`).join('; ')
          : 'No results found for any search terms'
      );
    }
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Search failed. Please try with fewer terms or try again later.'
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
    
    // Ensure bids is an array
    const bids = Array.isArray(bidsData) 
      ? bidsData 
      : (bidsData.bids || []);
    
    console.log('Bids retrieved:', bids);
    res.json(bids);
  } catch (error) {
    console.error(`Error reading bids: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    console.log('=== Login Request ===');
    console.log('Request URL:', req.url);
    console.log('Origin:', req.headers.origin);
    console.log('Login data:', {
      hasUsername: !!req.body.username,
      hasPassword: !!req.body.password
    });

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password required'
      });
    }

    const loginResult = await scraper.login(username, password);
    res.json({
      success: true,
      message: 'Login successful',
      data: loginResult
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false, 
      message: error.message || 'Login failed'
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

// Debug middleware - add before routes
app.use((req, res, next) => {
  console.log('\n=== Request ===');
  console.log(`${req.method} ${req.url}`);
  console.log('Origin:', req.headers.origin);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'accept': req.headers.accept,
    'origin': req.headers.origin
  });
  next();
});

// Error handling - keep as is at end of file
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));