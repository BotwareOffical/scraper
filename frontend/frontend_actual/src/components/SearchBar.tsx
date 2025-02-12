import { useState } from 'react'
import { Search } from 'lucide-react'
import { SearchBarProps, SearchTerm } from '..'

const SearchBar = ({ onSearch }: SearchBarProps) => {
  const [searchTerms, setSearchTerms] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Clear any existing error
    setError('')
    
    // Don't search if the input is empty or only contains whitespace
    if (!searchTerms.trim()) {
      setError('Please enter search terms before searching')
      return
    }

    // Parse search terms with optional price ranges and category
    // Format: "keyword1:min-max:mode, keyword2:min-max, keyword3"
    const parsedSearches = searchTerms.split(',').map(term => {
      const trimmedTerm = term.trim()
      
      // Split the term by colons
      const parts = trimmedTerm.split(':')
      
      // If no colons, just return the term
      if (parts.length === 1) {
        return {
          term: parts[0],
          minPrice: '',
          maxPrice: ''
        }
      }
      
      const searchTerm: SearchTerm = {
        term: parts[0],
        minPrice: '',
        maxPrice: ''
      }

      // If we have a price range
      if (parts.length >= 2 && parts[1]) {
        const priceRange = parts[1].split('-')
        searchTerm.minPrice = priceRange[0] || ''
        searchTerm.maxPrice = priceRange[1] || ''
      }

      // If we have a category specified as 'mode'
      if (parts.length >= 3 && parts[2] === 'mode') {
        searchTerm.category = '23000'
      }
      
      return searchTerm
    })

    onSearch(parsedSearches)
  }

  return (
    <div className="max-w-2xl mx-auto mb-8">
      <form onSubmit={handleSubmit} className="flex gap-4">
        <input
          type="text"
          value={searchTerms}
          onChange={(e) => {
            setSearchTerms(e.target.value)
            setError('') // Clear error when user starts typing
          }}
          placeholder="Enter search terms (e.g., gucci:500-1000:mode, shoes:200)"
          className={`flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-red-500' : ''
          }`}
        />
        <button
          type="submit"
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          Search
        </button>
      </form>
      {error && (
        <div className="mt-2 text-red-500 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}

export default SearchBar