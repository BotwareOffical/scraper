import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import ProductCard from './ProductCard';
import { Product } from '..';

// Hardcoded test URLs - replace with your actual tracked auction URLs
const TEST_AUCTION_URLS = [
  "https://buyee.jp/item/yahoo/auction/v1155809379?conversionType=YahooAuction_DirectSearch",
  // Add more test URLs here
];

interface TrackedAuctionsResponse {
  auctions: Product[];
  error?: string;
}

const TrackedAuctions: React.FC = () => {
  const [trackedProducts, setTrackedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrackedAuctions = async () => {
      try {
        // For testing, create dummy products from URLs
        const dummyProducts = TEST_AUCTION_URLS.map(url => ({
          title: "Test Auction Item",
          price: "¥5,000",
          time_remaining: "2 days 3 hours",
          url: url,
          images: ["/api/placeholder/400/400"]
        }));
        
        setTrackedProducts(dummyProducts);
        
        // Once backend is ready, replace with actual API call:
        /*
        const response = await fetch('/api/tracked-auctions/', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ urls: TEST_AUCTION_URLS })
        });
        const data = await response.json() as TrackedAuctionsResponse;
        
        if (!response.ok) throw new Error(data.error || 'Failed to fetch tracked auctions');
        setTrackedProducts(data.auctions);
        */
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    const interval = setInterval(fetchTrackedAuctions, 30000); // Update every 30 seconds
    fetchTrackedAuctions();

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-red-500 text-center py-8">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Tracked Auctions
        </h2>
        <span className="text-gray-600">{trackedProducts.length} items tracked</span>
      </div>

      {trackedProducts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No auctions currently being tracked
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {trackedProducts.map((product) => (
            <ProductCard key={product.url} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TrackedAuctions;