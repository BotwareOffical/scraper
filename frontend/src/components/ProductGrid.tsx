import React, { useState, useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { ProductGridProps } from '..';
import ProductCard from './ProductCard';

interface PriceRange {
  min: string;
  max: string;
}

const ProductGrid: React.FC<ProductGridProps> = ({ products }) => {
  const [sortBy, setSortBy] = useState<string>('default');
  const [priceRange, setPriceRange] = useState<PriceRange>({ min: '', max: '' });
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const filteredAndSortedProducts = useMemo(() => {
    let result = [...products];

    // Apply price filter
    if (priceRange.min !== '' || priceRange.max !== '') {
      result = result.filter(product => {
        const price = parseFloat(product.price.replace(/[^0-9.-]+/g, ''));
        const minPrice = priceRange.min === '' ? -Infinity : parseFloat(priceRange.min);
        const maxPrice = priceRange.max === '' ? Infinity : parseFloat(priceRange.max);
        return price >= minPrice && price <= maxPrice;
      });
    }

    // Apply sorting
    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => 
          parseFloat(a.price.replace(/[^0-9.-]+/g, '')) - 
          parseFloat(b.price.replace(/[^0-9.-]+/g, ''))
        );
        break;
      case 'price-desc':
        result.sort((a, b) => 
          parseFloat(b.price.replace(/[^0-9.-]+/g, '')) - 
          parseFloat(a.price.replace(/[^0-9.-]+/g, ''))
        );
        break;
      case 'time':
        result.sort((a, b) => 
          (a.time_remaining || '').localeCompare(b.time_remaining || '')
        );
        break;
    }

    return result;
  }, [products, sortBy, priceRange]);

  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No products found. Try adjusting your search terms!
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">
          {filteredAndSortedProducts.length} products found
        </p>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          type="button"
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filters
        </button>
      </div>

      {showFilters && (
        <div className="bg-white p-4 rounded-lg shadow-sm space-y-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort by
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="default">Default</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="time">Time Remaining</option>
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Price Range
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={priceRange.min}
                  onChange={(e) => setPriceRange(prev => ({ ...prev, min: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={priceRange.max}
                  onChange={(e) => setPriceRange(prev => ({ ...prev, max: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredAndSortedProducts.map((product, index) => (
          <ProductCard key={index} product={product} />
        ))}
      </div>
    </div>
  );
};

export default ProductGrid;