import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import SearchBar from './SearchBar'
import ProductGrid from './ProductGrid'
import { Product } from '..'

const BuyeeSearch = () => {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = async (searchTerms: Array<{term: string, minPrice: string, maxPrice: string}>) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ terms: searchTerms })
      })

      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`)
      if (!data.success) throw new Error(data.error || 'Search failed')

      setProducts(data.results)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(`Search failed: ${errorMessage}. Please try again in a few moments.`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Buyee Product Search</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          <LayoutDashboard className="w-5 h-5" />
          View Tracked Auctions
        </button>
      </div>
      
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