import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import TrackedAuctions from './TrackedAuctions';
import { LayoutDashboard, Search } from 'lucide-react';

const Dashboard = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r">
        <div className="p-4">
          <h2 className="text-xl font-bold text-blue-600">Buyee Dashboard</h2>
        </div>
        <nav className="mt-4">
          <Link
            to="/dashboard"
            className={`flex items-center gap-2 px-4 py-2 ${
              location.pathname === '/dashboard' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </Link>
          <Link
            to="/"
            className={`flex items-center gap-2 px-4 py-2 ${
              location.pathname === '/' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Search className="w-5 h-5" />
            Search
          </Link>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-8">Your Tracked Auctions</h1>
        <TrackedAuctions />
      </div>
    </div>
  );
};

export default Dashboard;