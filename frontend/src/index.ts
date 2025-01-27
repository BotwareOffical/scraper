// src/types/index.ts

export interface Product {
  title: string
  price: string
  time_remaining: string
  url: string
  images: string[]
  description?: string
}

export interface ProductCardProps {
  product: Product
}

export interface ProductGridProps {
  products: Product[]
  totalMatches: number
  currentPage: number
  onLoadMore: () => void
  isLoading: boolean
}

export interface SearchTerm {
  term: string
  minPrice: string
  maxPrice: string
  category?: string,
  page?: number
}

export interface SearchBarProps {
  onSearch: (terms: SearchTerm[]) => Promise<void>
}

export interface SearchResponse {
  success: boolean
  results: Product[]
  totalMatches: number
  error?: string
}