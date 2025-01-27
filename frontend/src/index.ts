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
}

export interface SearchTerm {
  term: string
  minPrice: string
  maxPrice: string
  category?: string  // Made optional since it won't always be present
}

export interface SearchBarProps {
  onSearch: (terms: SearchTerm[]) => Promise<void>
}

export interface SearchResponse {
  success: boolean
  results: Product[]
  count: number
  error?: string
}