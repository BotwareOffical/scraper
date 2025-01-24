import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ProductCardProps } from '..';

const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [isBidding, setIsBidding] = useState<boolean>(false);
  const [bidError, setBidError] = useState<string | null>(null);

  // Touch handling for image swiping
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    
    const currentTouch = e.targetTouches[0].clientX;
    const diff = touchStart - currentTouch;

    // If swipe is significant enough, change image and reset touch
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextImage();
      } else {
        prevImage();
      }
      setTouchStart(null);
    }
  };

  // Image preloading
  useEffect(() => {
    if (product.images.length > 0) {
      const preloadImages = async () => {
        const loadPromises = product.images.map(src => {
          return new Promise<string>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(src);
            img.onerror = reject;
            img.src = src;
          });
        });

        try {
          const loadedSrcs = await Promise.all(loadPromises);
          setLoadedImages(loadedSrcs);
        } catch (error) {
          console.error('Failed to load some images:', error);
        }
      };

      preloadImages();
    }
  }, [product.images]);

  const nextImage = () => {
    setCurrentImageIndex(prev => 
      prev === (product.images.length - 1) ? 0 : prev + 1
    );
  };

  const prevImage = () => {
    setCurrentImageIndex(prev => 
      prev === 0 ? product.images.length - 1 : prev - 1
    );
  };

  const handleBid = async () => {
    if (!bidAmount || isNaN(Number(bidAmount))) {
      setBidError('Please enter a valid bid amount');
      return;
    }

    setIsBidding(true);
    setBidError(null);

    try {
      const response = await fetch('/api/place-bid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: product.url.split('/').pop(),
          amount: Number(bidAmount)
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to place bid');
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
      <div 
        className="aspect-square relative group"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        {loadedImages.length > 0 ? (
          <img
            src={loadedImages[currentImageIndex]}
            alt={`${product.title} - Image ${currentImageIndex + 1}`}
            className="w-full h-full object-cover"
            loading={currentImageIndex === 0 ? "eager" : "lazy"}
          />
        ) : (
          <div className="w-full h-full bg-gray-200 animate-pulse" />
        )}

        {product.images.length > 1 && (
          <>
            <button
              onClick={prevImage}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              type="button"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextImage}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              type="button"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
              {product.images.map((_, index) => (
                <div
                  key={index}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

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