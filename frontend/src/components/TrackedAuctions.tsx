import React, { useState, useEffect } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import ProductCard from './ProductCard';
import { Product } from '..';

interface Bid {
  productUrl: string;
  bidAmount: number;
  timestamp: string;
}

interface TrackedProduct extends Product {
  bidAmount: number;
}

const TrackedAuctions: React.FC = () => {
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initial fetch of tracked auctions
  const fetchInitialTrackedAuctions = async () => {
    console.log('TrackedAuctions: Starting initial fetch...');
    try {
      // First, fetch the bids.json to get tracked URLs
      const bidsResponse = await fetch('/api/bids');
      const bidsData = await bidsResponse.json() as Bid[];
      console.log('TrackedAuctions: Received bids data:', bidsData);
      
      if (bidsData.length === 0) {
        setTrackedProducts([]);
        return;
      }

      // Convert bids data directly to products
      const productsWithBids = bidsData.map(bid => ({
        url: bid.productUrl,
        title: 'Loading...', // Will be updated by refresh
        price: 'Loading...',
        time_remaining: bid.timestamp,
        images: [],
        bidAmount: bid.bidAmount
      }));

      setTrackedProducts(productsWithBids);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching tracked auctions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh function that hits the update-bid-prices endpoint
  const handleRefresh = async (currentBids?: Bid[]) => {
    console.log('TrackedAuctions: Starting refresh with update-bid-prices...');
    setIsRefreshing(true);
    try {
      const bidsToUse = currentBids || trackedProducts.map(product => ({
        productUrl: product.url,
        bidAmount: product.bidAmount,
        timestamp: product.time_remaining
      }));

      if (bidsToUse.length === 0) {
        console.log('No products to refresh');
        return;
      }

      const response = await fetch('/api/update-bid-prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productUrls: bidsToUse.map(bid => bid.productUrl)
        })
      });

      const data = await response.json();
      console.log('TrackedAuctions: Update bid prices response:', data);

      if (!response.ok || !data.success) {
        throw new Error('Failed to update prices');
      }

      // Update the products with the new data
      if (data.updatedBids) {
        const updatedProducts = data.updatedBids.map((updatedBid: any) => {
          const existingProduct = trackedProducts.find(p => p.url === updatedBid.productUrl);
          return {
            ...existingProduct,
            price: updatedBid.price || 'N/A',
            time_remaining: updatedBid.timeRemaining || 'N/A'
          };
        });
        setTrackedProducts(updatedProducts);
      }
    } catch (err) {
      console.error('Error updating bid prices:', err);
      setError(err instanceof Error ? err.message : 'Failed to update prices');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    console.log('TrackedAuctions: Running initial fetch');
    fetchInitialTrackedAuctions();
  }, []); // Only run once on mount

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
        <div className="flex items-center gap-4">
          <button
            onClick={() => handleRefresh()}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:bg-blue-300"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <span className="text-gray-600">
            {trackedProducts.length} {trackedProducts.length === 1 ? 'item' : 'items'} tracked
          </span>
        </div>
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