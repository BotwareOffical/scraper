// src/types/index.ts

export interface Product {
  title: string
  price: string
  time_remaining: string
  url: string
  images: string[]
  description?: string
}

export interface Bid {
  productUrl: string
  bidAmount: number
  timestamp: string
  title?: string
  thumbnailUrl?: string
}

export interface TrackedProduct extends Product {
  bidAmount: number
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

export interface UpdatedBid {
  productUrl: string
  price: string
  timeRemaining: string
  error?: string
}

export interface DetailsResponse {
  success: boolean
  updatedDetails?: Product[]
  error?: string
}

export interface UpdateBidPricesResponse {
  success: boolean
  updatedBids: UpdatedBid[]
  error?: string
}