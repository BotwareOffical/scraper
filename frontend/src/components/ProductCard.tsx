import React, { useState } from 'react';
import { ProductCardProps } from '..';
import ProductImageCarousel from './ProductImageCarousel';
import { RefreshCw } from 'lucide-react';

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [bidAmount, setBidAmount] = useState<string>('');
  const [isBidding, setIsBidding] = useState<boolean>(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidSuccess, setBidSuccess] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);

  const handleBid = async () => {
    if (!bidAmount || isNaN(Number(bidAmount))) {
      setBidError('Please enter a valid bid amount');
      setBidSuccess(null);
      return;
    }

    setIsBidding(true);
    setBidError(null);
    setBidSuccess(null);

    try {
      const bidResponse = await fetch('/api/place-bid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.url,
          amount: Number(bidAmount),
        }),
      });

      const bidData = await bidResponse.json();
      if (!bidData.success) {
        throw new Error(bidData.message || 'Failed to place bid');
      }

      setBidSuccess('Bid placed successfully!');
    } catch (error) {
      setBidError(error instanceof Error ? error.message : 'Failed to place bid');
    } finally {
      setIsBidding(false);
    }
  };

  const handleGetDetails = async () => {
    console.log('ProductCard: Getting details for product:', product.url);
    setIsLoadingDetails(true);
    try {
      const response = await fetch('/api/details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          urls: [product.url],
        }),
      });

      const data = await response.json();
      console.log('ProductCard: Details endpoint response:', data);
      if (!response.ok || !data.success) {
        throw new Error('Failed to fetch details');
      }
    } catch (error) {
      console.error('Failed to get details:', error);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <ProductImageCarousel images={product.images} />

      <div className="p-4">
        <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.title}</h3>
        <p className="text-xl font-bold text-blue-600 mb-2">{product.price}</p>

        {product.time_remaining && (
          <p className="text-sm text-gray-600 mb-4">Time remaining: {product.time_remaining}</p>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="number"
            value={bidAmount}
            onChange={(e) => {
              setBidAmount(e.target.value);
              setBidError(null);
              setBidSuccess(null);
            }}
            placeholder="Enter bid amount"
            className={`flex-1 px-3 py-2 border rounded focus:outline-none focus:ring-2 ${
              bidError ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500'
            }`}
            disabled={isBidding}
          />
          <button
            onClick={handleBid}
            className={`px-4 py-2 text-white rounded transition-colors ${
              isBidding ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
            }`}
            disabled={isBidding}
            type="button"
          >
            {isBidding ? 'Bidding...' : 'Place Bid'}
          </button>
          <button
            onClick={handleGetDetails}
            disabled={isLoadingDetails}
            className={`px-4 py-2 rounded transition-colors flex items-center gap-2 ${
              isLoadingDetails ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            type="button"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingDetails ? 'animate-spin' : ''}`} />
            Details
          </button>
        </div>

        {bidError && <p className="text-red-500 text-sm mb-4">{bidError}</p>}
        {bidSuccess && <p className="text-green-500 text-sm mb-4">{bidSuccess}</p>}

        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center py-2 text-blue-500 hover:bg-blue-50 rounded transition-colors"
        >
          View on Buyee
        </a>
      </div>
    </div>
  );
};

export default ProductCard;
