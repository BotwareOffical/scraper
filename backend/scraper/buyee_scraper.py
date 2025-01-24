from playwright.sync_api import sync_playwright
import logging
import time
import random

logger = logging.getLogger(__name__)

class BuyeeScraper:
    def __init__(self):
        self.base_url = "https://buyee.jp"

    def _setup_browser(self, playwright):
        browser = playwright.chromium.launch(headless=True)
        context = browser_context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            extra_http_headers={
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
            }
        )
        return context

    def scrape_product_details(self, page, product_url):
        try:
            page.goto(product_url, wait_until='domcontentloaded', timeout=30000)
            
            # Wait for description element
            description_elem = page.wait_for_selector('.Product__description', timeout=5000)
            description = description_elem.inner_text() if description_elem else ""
            
            # Get all product images
            image_elements = page.query_selector_all('.Product__image img')
            images = []
            for img in image_elements:
                src = img.get_attribute('src')
                if src:
                    images.append(src)
            
            return {
                "description": description,
                "images": images
            }
        except Exception as e:
            logger.error(f"Error scraping product details: {e}")
            return None

    def place_bid(self, product_id, bid_amount):
        with sync_playwright() as p:
            browser_context = self._setup_browser(p)
            page = browser_context.new_page()
            
            try:
                # Navigate to product page
                product_url = f"{self.base_url}/item/yahoo/auction/{product_id}"
                page.goto(product_url, wait_until='domcontentloaded', timeout=30000)
                
                # Wait for bid form to be available
                page.wait_for_selector('button[data-bind*="openBidsForm"]', timeout=5000)
                
                # Click bid button to open form
                page.click('button[data-bind*="openBidsForm"]')
                
                # Wait for bid input field
                page.wait_for_selector('input[name="price"]', timeout=5000)
                
                # Enter bid amount
                page.fill('input[name="price"]', str(bid_amount))
                
                # Submit bid
                page.click('button[type="submit"]')
                
                # Wait for confirmation
                success = page.wait_for_selector('.bid-success-message', timeout=5000)
                
                return {
                    "success": True if success else False,
                    "message": "Bid placed successfully" if success else "Failed to place bid"
                }
                
            except Exception as e:
                logger.error(f"Error placing bid: {e}")
                return {
                    "success": False,
                    "message": str(e)
                }
            finally:
                browser_context.close()

    def scrape_search_results(self, search_term):
        with sync_playwright() as p:
            browser_context = self._setup_browser(p)
            page = browser_context.new_page()

            try:
                # Add random delay between 1-3 seconds
                time.sleep(random.uniform(1, 3))
                
                encoded_term = search_term.replace(' ', '+')
                search_url = f"{self.base_url}/item/search/query/{encoded_term}"
                logger.info(f"Navigating to search URL: {search_url}")
                
                # Add random mouse movements and scrolls
                page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                page.mouse.move(random.randint(0, 800), random.randint(0, 600))
                
                # Wait for the search results to load
                page.wait_for_selector('.auctionSearchResult', timeout=10000)

                # Get all product items
                products = []
                items = page.query_selector_all('.itemCard')
                
                for item in items:
                    try:
                        # Basic product info
                        title_elem = item.query_selector('.itemCard__itemName a')
                        title = title_elem.inner_text() if title_elem else ""
                        link = title_elem.get_attribute('href') if title_elem else ""
                        
                        # Price info
                        price_elem = item.query_selector('.g-price')
                        price = price_elem.inner_text() if price_elem else ""
                        
                        # Time remaining
                        time_elem = item.query_selector('.g-text--attention')
                        time_remaining = time_elem.inner_text() if time_elem else ""
                        
                        # Get thumbnail image
                        img_elem = item.query_selector('.g-thumbnail__image')
                        thumbnail = img_elem.get_attribute('src') if img_elem else ""
                        
                        # Get number of bids
                        bids_elem = item.query_selector('.itemCard__infoItem:nth-child(2) .g-text')
                        num_bids = bids_elem.inner_text() if bids_elem else "0"
                        
                        # Get seller info
                        seller_elem = item.query_selector('.auctionSearchResult__seller a')
                        seller = seller_elem.inner_text() if seller_elem else ""

                        # Format the full URL if it's relative
                        if link and not link.startswith('http'):
                            link = f"{self.base_url}{link}"

                        product = {
                            "title": title,
                            "price": price,
                            "time_remaining": time_remaining,
                            "url": link,
                            "thumbnail": thumbnail,
                            "num_bids": num_bids,
                            "seller": seller,
                            "images": [thumbnail] # Initialize with thumbnail, full images can be fetched later
                        }
                        
                        products.append(product)

                    except Exception as e:
                        logger.error(f"Error processing search result item: {e}")
                        continue

                logger.info(f"Found {len(products)} products")
                return products

            except Exception as e:
                logger.error(f"Error during search scraping: {e}")
                return []
                
            finally:
                browser_context.close()