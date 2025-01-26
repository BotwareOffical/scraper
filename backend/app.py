from flask import Flask, request, jsonify
from flask_cors import CORS
from scraper.buyee_scraper import BuyeeScraper
import logging
import time

# At the top of app.py, update the CORS configuration
app = Flask(__name__)

CORS(app, 
     resources={
         r"/*": {
             "origins": ["http://localhost:5173"],
             "methods": ["GET", "POST", "OPTIONS"],
             "allow_headers": ["Content-Type", "Accept"],  # Added Accept
             "expose_headers": ["Content-Type"],
             "supports_credentials": True,
             "max_age": 600
         }
     })

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

scraper = BuyeeScraper()


def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = 'http://localhost:5173'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept'
    return response

@app.after_request
def after_request(response):
    return add_cors_headers(response)
@app.route('/login', methods=['POST', 'OPTIONS'])
def login():
    if request.method == 'OPTIONS':
        response = jsonify({'message': 'OK'})
        return add_cors_headers(response)

    try:
        data = request.json
        logger.info(f"Received login request with data: {data}")
        
        username = data.get('username')
        has_password = 'password' in data
        
        logger.info(f"Login attempt from username: {username}, password provided: {has_password}")
        
        response = jsonify({
            "success": True,
            "message": "Login successful",
            "receivedUsername": username
        })
        
        return response
        
    except Exception as e:
        logger.error(f"Login error: {str(e)}", exc_info=True)
        return jsonify({
            "success": False,
            "error": f"Login failed: {str(e)}"
        }), 500

@app.route('/place-bid', methods=['POST'])
def place_bid():
    try:
        # Log the entire request data for debugging
        logger.info(f"Received bid request data: {request.json}")
        
        data = request.json
        product_url = data.get('productId')  # Full product URL
        bid_amount = data.get('amount')
        
        # Log extracted details
        logger.info(f"Bid Details:")
        logger.info(f"Product URL: {product_url}")
        logger.info(f"Bid Amount: {bid_amount}")
        
        if not product_url or not bid_amount:
            logger.warning("Missing product URL or bid amount")
            return jsonify({
                "success": False,
                "message": "Product URL and bid amount are required"
            }), 400
        
        # Placeholder for actual bid placement logic
        result = {
            "success": True,
            "message": f"Bid of {bid_amount} placed on {product_url}"
        }
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Bid placement error: {e}", exc_info=True)
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

@app.route('/search', methods=['POST', 'OPTIONS'])
def search():
    if request.method == 'OPTIONS':
        response = jsonify({'message': 'OK'})
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return response

    try:
        data = request.json
        logger.info(f"Received search request with data: {data}")
        search_terms = data.get('terms', [])
        
        if not search_terms:
            logger.warning("No search terms provided in request")
            return jsonify({"error": "No search terms provided"}), 400
        
        results = []
        for search_term in search_terms:
            term = search_term.get('term', '')
            min_price = search_term.get('minPrice', '')
            max_price = search_term.get('maxPrice', '')
            
            # Basic search first
            term_results = scraper.scrape_search_results(term, min_price, max_price)
            logger.info(f"Found {len(term_results)} results for term: {term}")
            results.extend(term_results)
            time.sleep(2)  # Avoid rate limiting
        
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