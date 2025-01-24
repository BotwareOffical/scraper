import BuyeeSearch from './components/BuyeeSearch'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-blue-600">Buyee Search</h1>
        </div>
      </nav>
      
      <main className="w-full">
        <BuyeeSearch />
      </main>
      
      <footer className="mt-12 py-6 bg-white border-t">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>© {new Date().getFullYear()} Buyee Search. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default App