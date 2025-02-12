import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import BuyeeSearch from './components/BuyeeSearch';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {
        path: '/',
        element: <BuyeeSearch />
      },
      {
        path: '/dashboard',
        element: <Dashboard />
      }
    ]
  }
]);