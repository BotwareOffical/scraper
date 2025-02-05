import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import SearchBar from './SearchBar'
import ProductGrid from './ProductGrid'
import { Product, SearchTerm } from '..'

const BuyeeSearch = () => {
  const navigate = useNavigate()
  const [products, setProducts] = useState<Product[]>([])
  const [totalMatches, setTotalMatches] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [currentSearchTerms, setCurrentSearchTerms] = useState<SearchTerm[]>([])

  const handleSearch = async (searchTerms: Array<{term: string, minPrice: string, maxPrice: string}>) => {
    setIsLoading(true)
    setError(null)
    setCurrentPage(1)
    setProducts([])
    setTotalMatches(0)
    setCurrentSearchTerms(searchTerms)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ 
          terms: searchTerms,
          page: 1
        })
      })

      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`)
      if (!data.success) throw new Error(data.error || 'Search failed')

      setProducts(data.results)
      setTotalMatches(data.totalMatches || data.results.length)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(`Search failed: ${errorMessage}. Please try again in a few moments.`)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMoreProducts = async () => {
    if (isLoading) return;
    
    const nextPage = currentPage + 1;
    setIsLoading(true)
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ 
          terms: currentSearchTerms,
          page: nextPage
        })
      })

      const data = await response.json()
      
      if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`)
      if (!data.success) throw new Error(data.error || 'Search failed')

      setProducts(prev => [...prev, ...data.results])
      setCurrentPage(nextPage)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
      setError(`Failed to load more products: ${errorMessage}`)
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
      
      {isLoading && products.length === 0 && (
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
        <ProductGrid 
          products={products} 
          totalMatches={totalMatches}
          currentPage={currentPage}
          onLoadMore={loadMoreProducts}
          isLoading={isLoading}
        />
      )}
      
      {!isLoading && !error && products.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No products found. Try different search terms.
        </div>
      )}

      {isLoading && products.length > 0 && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      )}
    </div>
  )
}

export default BuyeeSearch