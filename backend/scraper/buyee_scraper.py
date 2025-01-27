from playwright.sync_api import sync_playwright
import logging
import time
import random

# Configure more detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class BuyeeScraper:
    def __init__(self):
        self.base_url = "https://buyee.jp"

    def _setup_browser(self, playwright):
        try:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                extra_http_headers={
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                }
            )
            logger.info("Browser context setup successfully")
            return context
        except Exception as e:
            logger.error(f"Error setting up browser: {e}")
            raise

    def scrape_search_results(self, term, min_price='', max_price='', page=1, detailed=True):
        with sync_playwright() as p:
            try:
                browser_context = self._setup_browser(p)
                browser_page = browser_context.new_page()

                # Construct search URL with page parameter
                search_url = f"{self.base_url}/item/search/query/{term}"
                params = []
                if min_price: params.append(f"aucminprice={min_price}")
                if max_price: params.append(f"aucmaxprice={max_price}")
                params.append("translationType=98")
                params.append(f"page={page}")  # Add page parameter
                if params: search_url += "?" + "&".join(params)

                logger.info(f"Searching with URL: {search_url}")
                browser_page.goto(search_url, wait_until='domcontentloaded', timeout=60000)
                
                # Get total matches from the result-num div
                total_matches = 0
                result_num_elem = browser_page.query_selector('.result-num')
                if result_num_elem:
                    text = result_num_elem.inner_text()
                    # Extract number from text like "1 - 20 / 77069 Treffer"
                    import re
                    matches = re.findall(r'/\s*(\d+,?\d*)', text)
                    if matches:
                        # Remove commas and convert to integer
                        total_matches = int(matches[0].replace(',', ''))
                
                logger.info(f"Total matches found: {total_matches}")
                
                # Get items from the current page
                items = browser_page.query_selector_all('.itemCard')
                logger.info(f"Found {len(items)} items on current page")
                
                products = []
                for item in items:
                    try:
                        title_elem = item.query_selector('.itemCard__itemName a')
                        if not title_elem:
                            logger.warning("No title element found for an item")
                            continue

                        title = title_elem.inner_text()
                        url = title_elem.get_attribute('href')
                        
                        if not url:
                            logger.warning(f"No URL found for item: {title}")
                            continue

                        if not url.startswith('http'):
                            url = f"{self.base_url}{url}"

                        # Image collection
                        images = []
                        img_elem = item.query_selector('.g-thumbnail__image')
                        if img_elem:
                            src = img_elem.get_attribute('data-src') or img_elem.get_attribute('src')
                            if src:
                                src = src.split('?')[0]
                                src = src.replace('?pri=l&w=300&h=300', '')
                                images.append(src)

                        # Get price and time remaining
                        price_elem = item.query_selector('.g-price')
                        time_elem = item.query_selector('.g-text--attention')
                        
                        product = {
                            "title": title,
                            "price": price_elem.inner_text() if price_elem else "Price Not Available",
                            "time_remaining": time_elem.inner_text() if time_elem else "Time Not Available",
                            "url": url,
                            "images": images
                        }
                        
                        products.append(product)

                    except Exception as item_e:
                        logger.error(f"Error processing individual item: {item_e}")
                        continue

                return products, total_matches

            except Exception as e:
                logger.error(f"Search scraping error: {e}", exc_info=True)
                return [], 0
            
            finally:
                try:
                    browser_context.close()
                except Exception as close_error:
                    logger.error(f"Error closing browser context: {close_error}")

    def scrape_item_details(self, url):
        with sync_playwright() as p:
            try:
                browser_context = self._setup_browser(p)
                page = browser_context.new_page()
                
                page.goto(url, wait_until='domcontentloaded', timeout=30000)
                
                # Get basic product info
                title_elem = page.query_selector('.ProductTitle__text')
                price_elem = page.query_selector('.Price__value')
                time_elem = page.query_selector('.CountDown__time')
                
                # Get all product images
                images = []
                img_elems = page.query_selector_all('a.js-smartPhoto img')
                for img in img_elems:
                    src = (
                        img.get_attribute('data-src') or 
                        img.get_attribute('src')
                    )
                    if src:
                        if not src.startswith('http'):
                            src = f"{self.base_url}{src}"
                        images.append(src)
                
                product = {
                    "title": title_elem.inner_text() if title_elem else "Title Not Available",
                    "price": price_elem.inner_text() if price_elem else "Price Not Available",
                    "time_remaining": time_elem.inner_text() if time_elem else "Time Not Available",
                    "url": url,
                    "images": images
                }
                
                return product
                
            except Exception as e:
                logger.error(f"Error scraping item details: {e}", exc_info=True)
                return None
            
            finally:
                try:
                    browser_context.close()
                except Exception as close_error:
                    logger.error(f"Error closing browser context: {close_error}")