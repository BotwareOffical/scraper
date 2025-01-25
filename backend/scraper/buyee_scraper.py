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

                # Construct search URL
                search_url = f"{self.base_url}/item/search/query/{term}"
                params = []
                if min_price: params.append(f"aucminprice={min_price}")
                if max_price: params.append(f"aucmaxprice={max_price}")
                if page > 1: params.append(f"page={page}")
                params.append("translationType=98")
                if params: search_url += "?" + "&".join(params)

                logger.info(f"Searching with URL: {search_url}")
                browser_page.goto(search_url, wait_until='domcontentloaded', timeout=30000)
                
                # Wait for items to be present
                browser_page.wait_for_selector('.itemCard', timeout=10000)

                products = []
                items = browser_page.query_selector_all('.itemCard')
                logger.info(f"Found {len(items)} items in search results")
                
                for item in items:
                    try:
                        # Extract basic product info with robust error handling
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
                                # Clean and normalize thumbnail
                                src = src.split('?')[0]
                                src = src.replace('?pri=l&w=300&h=300', '')
                                images.append(src)

                        # Price and time info
                        price_elem = item.query_selector('.g-price')
                        price = price_elem.inner_text() if price_elem else "Price Not Available"
                        
                        time_elem = item.query_selector('.g-text--attention')
                        time_remaining = time_elem.inner_text() if time_elem else "Time Not Available"

                        # Detailed image collection
                        if detailed:
                            try:
                                detailed_page = browser_context.new_page()
                                detailed_page.goto(url, wait_until='domcontentloaded', timeout=30000)
                                
                                # Comprehensive image selectors
                                image_selectors = [
                                    '.js-item-image',
                                    '.Product__gallery img',
                                    '.Product__mainImage img',
                                    '.itemDetail__thumbList img',
                                    '[data-image-role="gallery-image"]'
                                ]
                                
                                for selector in image_selectors:
                                    detail_images = detailed_page.query_selector_all(selector)
                                    for img in detail_images:
                                        src = (
                                            img.get_attribute('href') or 
                                            img.get_attribute('data-src') or 
                                            img.get_attribute('src')
                                        )
                                        if src:
                                            # Normalize image URL
                                            src = src.split('?')[0]
                                            if not src.startswith('http'):
                                                src = f"{self.base_url}{src}"
                                            
                                            # Prevent duplicates
                                            if src not in images:
                                                images.append(src)
                                
                                detailed_page.close()
                                logger.info(f"Collected {len(images)} images for {title}")
                            
                            except Exception as detail_e:
                                logger.error(f"Detailed image collection error: {detail_e}")

                        # Create product dictionary
                        product = {
                            "title": title,
                            "price": price,
                            "time_remaining": time_remaining,
                            "url": url,
                            "images": images
                        }
                        
                        products.append(product)

                    except Exception as item_e:
                        logger.error(f"Error processing individual item: {item_e}")

                return products

            except Exception as e:
                logger.error(f"Comprehensive search scraping error: {e}", exc_info=True)
                return []
            
            finally:
                try:
                    browser_context.close()
                except Exception as close_error:
                    logger.error(f"Error closing browser context: {close_error}")

    def scrape_all_pages(self, term, min_price='', max_price='', max_pages=3):
        logger.info(f"Starting multi-page scrape for term: {term}")
        all_products = []
        for page in range(1, max_pages + 1):
            logger.info(f"Scraping page {page}")
            products = self.scrape_search_results(term, min_price, max_price, page, detailed=True)
            
            if not products:
                logger.info(f"No more products found after page {page}")
                break
            
            all_products.extend(products)
            logger.info(f"Total products collected so far: {len(all_products)}")
        
        logger.info(f"Total products collected: {len(all_products)}")
        return all_products