import React, { useState, useEffect } from 'react';
import { Bell as BellIcon, RefreshCw, Image as ImageIcon } from 'lucide-react';
import ProductCard from './ProductCard';
import {
  Product,
  Bid,
  TrackedProduct,
  UpdatedBid,
  DetailsResponse,
  UpdateBidPricesResponse
} from '..';

const TrackedAuctions: React.FC = () => {
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchTrackedAuctions = async () => {
    try {
      setError(null);
      setLoading(true);
      
      // First, fetch the bids to get tracked URLs
      console.log('Fetching bids from /api/bids...');
      const bidsResponse = await fetch(`${import.meta.env.VITE_API_URL}/bids`);
      const bidsData = await bidsResponse.json() as Bid[];
      console.log('Received bids data:', JSON.stringify(bidsData, null, 2));
      
      // Filter bids with amount 999 (tracked items)
      const trackedBids = bidsData.filter((bid: Bid) => bid.bidAmount === 999);
      console.log('Filtered tracked bids (amount=999):', JSON.stringify(trackedBids, null, 2));
      
      if (trackedBids.length === 0) {
        console.log('No tracked bids found');
        setTrackedProducts([]);
        setLoading(false);
        return;
      }

      // Fetch product details for tracked URLs
      console.log('Fetching product details for tracked URLs:', 
        trackedBids.map(bid => bid.productUrl));
      
        const productsResponse = await fetch(`${import.meta.env.VITE_API_URL}/details`, {
          method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: trackedBids.map(bid => bid.productUrl)
        })
      });

      const productsData = await productsResponse.json() as DetailsResponse;
      console.log('Received products data:', JSON.stringify(productsData, null, 2));
      
      // Handle empty results gracefully
      if (!productsData.success || !productsData.updatedDetails || productsData.updatedDetails.length === 0) {
        console.warn('No product details found. Raw response:', productsData);
        setTrackedProducts([]);
        setLoading(false);
        return;
      }
      
      // Combine product data with bid information
      const productsWithBids: TrackedProduct[] = productsData.updatedDetails.map((product: Product) => {
        const matchingBid = trackedBids.find(bid => bid.productUrl === product.url);
        return {
          ...product,
          bidAmount: matchingBid?.bidAmount || 0,
          title: matchingBid?.title || product.title,
          images: matchingBid?.thumbnailUrl ? [matchingBid.thumbnailUrl] : product.images
        };
      });

      console.log('Final processed products:', JSON.stringify(productsWithBids, null, 2));
      setTrackedProducts(productsWithBids);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      console.error('Error in fetchTrackedAuctions:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const refreshBidPrices = async () => {
    if (isRefreshing || trackedProducts.length === 0) return;
    
    setIsRefreshing(true);
    console.log('Refreshing bid prices for products:', 
      trackedProducts.map(p => p.url));

    try {
      // Use the update-bid-prices endpoint to refresh current prices
      const response = await fetch(`${import.meta.env.VITE_API_URL}/update-bid-prices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productUrls: trackedProducts.map(product => product.url)
        })
      });

      if (!response.ok) {
        throw new Error('Failed to refresh bid prices');
      }

      const data = await response.json() as UpdateBidPricesResponse;
      console.log('Received refreshed price data:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to refresh bid prices');
      }

      // Update products with new prices
      setTrackedProducts(prev => prev.map(product => {
        const updatedBid = data.updatedBids.find(bid => bid.productUrl === product.url);
        return updatedBid ? {
          ...product,
          price: updatedBid.price,
          time_remaining: updatedBid.timeRemaining
        } : product;
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh bid prices';
      console.error('Error in refreshBidPrices:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Set up automatic refresh interval
  useEffect(() => {
    console.log('Setting up initial fetch and refresh interval');
    fetchTrackedAuctions();
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing tracked auctions...');
      refreshBidPrices();
    }, 30000); // Update every 30 seconds
    
    return () => {
      console.log('Cleaning up refresh interval');
      clearInterval(interval);
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <BellIcon className="w-6 h-6" />
            Tracked Auctions
          </h2>
          <span className="text-gray-600">
            {trackedProducts.length} {trackedProducts.length === 1 ? 'item' : 'items'} tracked
          </span>
        </div>
        
        <button
          onClick={refreshBidPrices}
          disabled={isRefreshing}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
            isRefreshing ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Bids'}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

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