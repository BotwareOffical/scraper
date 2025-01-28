import logging
from playwright.sync_api import sync_playwright
import random
import time

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def download_html(url, output_file):
    """Download and save the HTML of a webpage with anti-detection measures and logging."""
    user_agents = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/604.1'
    ]

    logger.info(f"Starting download process for URL: {url}")
    
    with sync_playwright() as p:
        logger.info("Launching browser...")
        browser = p.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-blink-features=AutomationControlled']
        )
        
        selected_agent = random.choice(user_agents)
        logger.info(f"Selected User-Agent: {selected_agent}")
        
        context = browser.new_context(
            user_agent=selected_agent,
            viewport={'width': 1920, 'height': 1080}
        )
        
        page = context.new_page()
        logger.info("Browser page created")
        
        # Mask automation
        page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        """)
        logger.info("Added anti-detection scripts")

        try:
            logger.info("Attempting to navigate to page...")
            response = page.goto(url, wait_until='domcontentloaded', timeout=60000)
            
            if response is None:
                logger.error("No response received from the server")
                return
                
            logger.info(f"Response status: {response.status}")
            logger.info(f"Response headers: {response.headers}")
            
            if response.ok:
                logger.info("Successfully reached page, waiting for content to load...")
                # Try to wait for some content to appear
                try:
                    page.wait_for_selector('body', timeout=10000)
                except Exception as e:
                    logger.warning(f"Timeout waiting for body: {e}")
                
                delay = random.uniform(2, 5)
                logger.info(f"Adding random delay of {delay:.2f} seconds")
                time.sleep(delay)
                
                html_content = page.content()
                logger.info(f"Retrieved HTML content (length: {len(html_content)})")
                
                with open(output_file, 'w', encoding='utf-8') as file:
                    file.write(html_content)
                logger.info(f"HTML saved to {output_file}")
            else:
                logger.error(f"Failed to load page. Status code: {response.status}")

        except Exception as e:
            logger.error(f"Error during scraping: {str(e)}", exc_info=True)

        finally:
            logger.info("Closing browser")
            browser.close()

if __name__ == "__main__":
    url = "https://buyee.jp/item/yahoo/auction/x1170673963?conversionType=YahooAuction_DirectSearch"
    output_file = "buyee_search_results.html"
    download_html(url, output_file)