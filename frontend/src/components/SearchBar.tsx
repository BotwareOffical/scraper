import { useState } from 'react'
import { Search } from 'lucide-react'
import { SearchBarProps } from '..'

const SearchBar = ({ onSearch }: SearchBarProps) => {
  const [searchTerms, setSearchTerms] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Parse search terms with optional price ranges
    // Format: "keyword1:min-max, keyword2:min-max"
    const parsedSearches = searchTerms.split(',').map(term => {
      const trimmedTerm = term.trim()
      const priceMatch = trimmedTerm.match(/:(\d+)?-?(\d+)?$/)
      
      if (priceMatch) {
        const keyword = trimmedTerm.replace(priceMatch[0], '').trim()
        return {
          term: keyword,
          minPrice: priceMatch[1] || '',
          maxPrice: priceMatch[2] || ''
        }
      }
      
      return {
        term: trimmedTerm,
        minPrice: '',
        maxPrice: ''
      }
    })

    onSearch(parsedSearches)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-4 max-w-2xl mx-auto mb-8">
      <input
        type="text"
        value={searchTerms}
        onChange={(e) => setSearchTerms(e.target.value)}
        placeholder="Enter search terms (e.g., gucci:500-1000, shoes:200)"
        className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
      >
        <Search className="w-4 h-4" />
        Search
      </button>
    </form>
  )
}

export default SearchBar