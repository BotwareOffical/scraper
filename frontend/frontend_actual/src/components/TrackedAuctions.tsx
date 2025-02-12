import React, { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import ProductCard from './ProductCard';
import { Product } from '..';
const backendUrl = process.env.REACT_APP_BACKEND_URL

interface Bid {
  productUrl: string;
  bidAmount: number;
}

interface TrackedProduct extends Product {
  bidAmount: number;
}

const TrackedAuctions: React.FC = () => {
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTrackedAuctions = async () => {
      try {
        // First, fetch the bids.json to get tracked URLs
        const bidsResponse = await fetch(`${backendUrl}/api/bids`);
        const bidsData = await bidsResponse.json() as Bid[];
        
        // Filter bids with amount 999
        const trackedBids = bidsData.filter(bid => bid.bidAmount === 999);
        
        if (trackedBids.length === 0) {
          setTrackedProducts([]);
          return;
        }

        // Fetch product details for each tracked URL
        const productsResponse = await fetch(`${backendUrl}/api/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            urls: trackedBids.map(bid => bid.productUrl)
          })
        });

        if (!productsResponse.ok) {
          throw new Error('Failed to fetch product details');
        }

        const productsData = await productsResponse.json();
        
        // Combine product data with bid amounts
        const productsWithBids = productsData.map((product: Product) => ({
          ...product,
          bidAmount: trackedBids.find(bid => bid.productUrl === product.url)?.bidAmount || 0
        }));

        setTrackedProducts(productsWithBids);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
        console.error('Error fetching tracked auctions:', err);
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
        <span className="text-gray-600">
          {trackedProducts.length} {trackedProducts.length === 1 ? 'item' : 'items'} tracked
        </span>
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