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

export interface SearchBarProps {
  onSearch: (terms: string) => Promise<void>
}

export interface SearchResponse {
  success: boolean
  results: Product[]
  count: number
  error?: string
}