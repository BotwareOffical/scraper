import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const ProductImageCarousel = ({ images }: { images: string[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<string[]>([]);
  const [imageLoadErrors, setImageLoadErrors] = useState<string[]>([]);

  useEffect(() => {
    console.log('Images received in carousel:', images);
    if (images && images.length > 0) {
      const preloadImages = async () => {
        const loadPromises = images.map(src => {
          return new Promise<{ src: string, success: boolean }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ src, success: true });
            img.onerror = () => resolve({ src, success: false });
            img.src = src;
          });
        });

        try {
          const loadResults = await Promise.all(loadPromises);
          
          const successfulImages = loadResults
            .filter(result => result.success)
            .map(result => result.src);
          
          const failedImages = loadResults
            .filter(result => !result.success)
            .map(result => result.src);

          setLoadedImages(successfulImages);
          setImageLoadErrors(failedImages);

          console.log('Image Load Summary:');
          console.log(`- Total images: ${images.length}`);
          console.log(`- Successfully loaded: ${successfulImages.length}`);
          console.log(`- Failed to load: ${failedImages.length}`);
          if (failedImages.length > 0) {
            console.log('Failed image URLs:', failedImages);
          }
        } catch (error) {
          console.error('Failed to load images:', error);
        }
      };

      preloadImages();
    }
  }, [images]);

  const nextImage = () => {
    const availableImages = loadedImages.length > 0 ? loadedImages : images;
    setCurrentIndex(prev => prev === (availableImages.length - 1) ? 0 : prev + 1);
  };

  const prevImage = () => {
    const availableImages = loadedImages.length > 0 ? loadedImages : images;
    setCurrentIndex(prev => prev === 0 ? availableImages.length - 1 : prev - 1);
  };

  if (!images || images.length === 0) {
    return <div className="w-full aspect-square bg-gray-200" />;
  }

  const displayImages = loadedImages.length > 0 ? loadedImages : images;

  return (
    <div className="relative w-full aspect-square overflow-hidden group">
      <img
        src={displayImages[currentIndex]}
        alt={`Product image ${currentIndex + 1}`}
        className="w-full h-full object-cover"
        loading={currentIndex === 0 ? "eager" : "lazy"}
      />

      <button
        onClick={prevImage}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
        type="button"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        onClick={nextImage}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 text-white p-2 rounded-full hover:bg-black/70 transition-colors"
        type="button"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
        {displayImages.map((_, idx) => (
          <div
            key={idx}
            className={`w-2 h-2 rounded-full ${
              idx === currentIndex ? 'bg-white' : 'bg-white/50'
            }`}
          />
        ))}
      </div>

      {imageLoadErrors.length > 0 && (
        <div className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 rounded text-xs z-10">
          {imageLoadErrors.length} image(s) failed to load
        </div>
      )}
    </div>
  );
};


export default ProductImageCarousel;