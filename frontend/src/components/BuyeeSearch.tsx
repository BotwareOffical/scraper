// src/components/BuyeeSearch.tsx
import { useState } from 'react'
import SearchBar from './SearchBar'
import ProductGrid from './ProductGrid'
import { Product, SearchResponse } from '..'

const BuyeeSearch = () => {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (searchTerms: string) => {
    setIsLoading(true)
    setError(null)

    try {
      console.log('Initiating search with terms:', searchTerms)
      
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          terms: searchTerms.split(',').map(term => term.trim()).filter(Boolean)
        })
      })

      const data = await response.json()
      
      if (!response.ok) {
        console.error('Server responded with error:', data)
        throw new Error(data.error || `Server error: ${response.status}`)
      }

      if (!data.success) {
        console.error('Search failed:', data.error)
        throw new Error(data.error || 'Search failed')
      }

      console.log(`Search successful, found ${data.count} results`)
      setProducts(data.results)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      console.error('Search error:', err)
      setError(`Search failed: ${errorMessage}. Please try again in a few moments.`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Buyee Product Search</h1>
      <SearchBar onSearch={handleSearch} />
      
      {isLoading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      )}
      
      {error && (
        <div className="text-red-500 text-center mb-8">
          <p className="font-bold">Error:</p>
          <p>{error}</p>
        </div>
      )}
      
      {!isLoading && !error && products.length > 0 && (
        <ProductGrid products={products} />
      )}
      
      {!isLoading && !error && products.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No products found. Try different search terms.
        </div>
      )}
    </div>
  )
}

export default BuyeeSearch