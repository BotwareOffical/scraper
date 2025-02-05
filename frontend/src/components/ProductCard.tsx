import React, { useState } from 'react';
import { ProductCardProps } from '..';
import ProductImageCarousel from './ProductImageCarousel';

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [bidAmount, setBidAmount] = useState<string>('');
  const [isBidding, setIsBidding] = useState<boolean>(false);
  const [bidError, setBidError] = useState<string | null>(null);

  const handleBid = async () => {
    if (!bidAmount || isNaN(Number(bidAmount))) {
      setBidError('Please enter a valid bid amount');
      return;
    }
  
    setIsBidding(true);
    setBidError(null);
  
    try {
      // First, place the bid
      const bidResponse = await fetch(`${import.meta.env.VITE_API_URL}/place-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.url,
          amount: Number(bidAmount)
        })
      });
  
      const bidData = await bidResponse.json();
      if (!bidData.success) {
        throw new Error(bidData.message || 'Failed to place bid');
      }

      // If bid is successful, update tracking with fixed amount
      const trackResponse = await fetch(`${import.meta.env.VITE_API_URL}/update-bid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: product.url,
          amount: 999
        })
      });

      const trackData = await trackResponse.json();
      if (!trackData.success) {
        console.error('Failed to update bid tracking:', trackData.message);
      }
  
      setBidAmount(''); // Clear bid amount on success
    } catch (error) {
      setBidError(error instanceof Error ? error.message : 'Failed to place bid');
    } finally {
      setIsBidding(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <ProductImageCarousel images={product.images} />

      <div className="p-4">
        <h3 className="font-semibold text-lg mb-2 line-clamp-2">{product.title}</h3>
        <p className="text-xl font-bold text-blue-600 mb-2">{product.price}</p>
        
        {product.time_remaining && (
          <p className="text-sm text-gray-600 mb-4">
            Time remaining: {product.time_remaining}
          </p>
        )}

        <div className="flex gap-2 mb-4">
          <input
            type="number"
            value={bidAmount}
            onChange={(e) => {
              setBidAmount(e.target.value);
              setBidError(null);
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
              isBidding 
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600'
            }`}
            disabled={isBidding}
            type="button"
          >
            {isBidding ? 'Bidding...' : 'Place Bid'}
          </button>
        </div>

        {bidError && (
          <p className="text-red-500 text-sm mb-4">{bidError}</p>
        )}

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