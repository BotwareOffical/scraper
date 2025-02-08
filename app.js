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
  exposedHeaders: ['Access-Control-Allow-Origin', 'Content-Length'],
  maxAge: 7200, // Increase preflight cache time to 2 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use((err, req, res, next) => {
  if (err.name === 'CORS Error') {
    console.error('CORS Error:', {
      origin: req.headers.origin,
      method: req.method,
      path: req.path
    });
  }
  next(err);
});

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
app.post('/search', async (req, res, next) => {
  const startTime = Date.now();
  const searchId = Math.random().toString(36).substring(7);

  try {
    console.log(`[${searchId}] === Starting Search Request ===`);
    console.log(`[${searchId}] Request data:`, JSON.stringify(req.body, null, 2));
    
    const { terms: searchTerms = [] } = req.body;

    if (!searchTerms.length) {
      return res.status(400).json({ 
        success: false,
        error: 'No search terms provided' 
      });
    }

    console.log(`[${searchId}] Processing ${searchTerms.length} search terms`);
    const results = [];
    const errors = [];
    let hasPartialSuccess = false;

    const batchSize = 2; // Reduced batch size for testing
    const totalBatches = Math.ceil(searchTerms.length / batchSize);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStartTime = Date.now();
      const startIndex = batchIndex * batchSize;
      const batch = searchTerms.slice(startIndex, startIndex + batchSize);
      
      console.log(`[${searchId}] Starting batch ${batchIndex + 1}/${totalBatches}`);
      console.log(`[${searchId}] Batch terms:`, batch.map(t => t.term));

      const batchPromises = batch.map(async searchTerm => {
        const termStartTime = Date.now();
        try {
          const { term = '', minPrice = '', maxPrice = '' } = searchTerm;
          console.log(`[${searchId}] Starting search for "${term}"`);
          
          const termResults = await scraper.scrapeSearchResults(term, minPrice, maxPrice);
          
          const duration = ((Date.now() - termStartTime) / 1000).toFixed(2);
          console.log(`[${searchId}] Completed "${term}" in ${duration}s with ${termResults.length} results`);
          
          if (termResults.length > 0) {
            hasPartialSuccess = true;
          }
          return termResults;
        } catch (termError) {
          console.error(`[${searchId}] Error searching "${searchTerm.term}":`, termError);
          errors.push({
            term: searchTerm.term,
            error: termError.message,
            time: new Date().toISOString()
          });
          return [];
        }
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.flat().filter(Boolean);
        results.push(...validResults);
        
        const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
        console.log(`[${searchId}] Batch ${batchIndex + 1} completed in ${batchDuration}s`);
        console.log(`[${searchId}] Total results so far: ${results.length}`);

        if (batchIndex < totalBatches - 1) {
          console.log(`[${searchId}] Adding delay between batches...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (batchError) {
        console.error(`[${searchId}] Batch ${batchIndex + 1} failed:`, batchError);
        errors.push({
          batch: batchIndex + 1,
          error: batchError.message,
          time: new Date().toISOString()
        });
        // Continue with next batch instead of failing completely
        continue;
      }
    }

    const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[${searchId}] === Search completed in ${totalDuration}s ===`);
    console.log(`[${searchId}] Final results: ${results.length}, Errors: ${errors.length}`);

    if (results.length > 0 || hasPartialSuccess) {
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.json({
        success: true,
        results,
        count: results.length,
        errors: errors.length > 0 ? errors : undefined,
        isPartialResult: errors.length > 0,
        duration: totalDuration,
        searchedTerms: searchTerms.length,
        successfulSearches: searchTerms.length - errors.length
      });
    } else {
      throw new Error(errors.map(e => `${e.term || `Batch ${e.batch}`}: ${e.error}`).join('; '));
    }
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`[${searchId}] Fatal error after ${duration}s:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      duration: duration,
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

const SERVER_TIMEOUT = 300000; // 5 minutes
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => console.log(`Server running on ${PORT}`));
server.timeout = SERVER_TIMEOUT;
