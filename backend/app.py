from flask import Flask, request, jsonify
from flask_cors import CORS
from scraper.buyee_scraper import BuyeeScraper
import logging
import time
import random


app = Flask(__name__)

# Configure CORS with more permissive settings
CORS(app, 
     resources={r"/*": {
         "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
         "methods": ["GET", "POST", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"],
         "expose_headers": ["Content-Type", "Authorization"],
         "supports_credentials": True,
         "send_wildcard": False
     }})

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scraper = BuyeeScraper()

@app.route('/place-bid', methods=['POST'])
def place_bid():
    try:
        data = request.json
        product_id = data.get('productId')
        bid_amount = data.get('amount')
        
        if not product_id or not bid_amount:
            return jsonify({
                "success": False,
                "message": "Product ID and bid amount are required"
            }), 400
            
        result = scraper.place_bid(product_id, bid_amount)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Bid error: {e}")
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@app.route('/search', methods=['POST', 'OPTIONS'])
def search():
    if request.method == 'OPTIONS':
        # Handle preflight request
        response = jsonify({'message': 'OK'})
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return response

    try:  # Fixed indentation here
        data = request.json
        logger.info(f"Received search request with data: {data}")
        
        search_terms = data.get('terms', [])
        
        if not search_terms:
            logger.warning("No search terms provided in request")
            return jsonify({"error": "No search terms provided"}), 400
        
        results = []
        for term in search_terms:
            logger.info(f"Searching for term: {term}")
            try:
                # Add delay between searches to avoid rate limiting
                time.sleep(2)  # Add this import: import time
                term_results = scraper.scrape_search_results(term)
                logger.info(f"Found {len(term_results)} results for term: {term}")
                results.extend(term_results)
            except Exception as term_error:
                logger.error(f"Error searching for term '{term}': {str(term_error)}")
                raise
        
        logger.info(f"Search completed successfully with {len(results)} total results")
        return jsonify({
            "success": True,
            "results": results,
            "count": len(results)
        })
        
    except Exception as e:
        logger.error(f"Search error: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Search failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)