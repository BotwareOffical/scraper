import React, { useState, useRef } from 'react';
import { LogIn } from 'lucide-react';

const backendUrl = process.env.REACT_APP_BACKEND_URL

interface LoginResponse {
  loginUrl?: string;
  error?: string;
  success?: boolean;
}

const LoginButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDialogElement>(null);
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const openModal = () => {
    modalRef.current?.showModal();
  };

  const closeModal = () => {
    modalRef.current?.close();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Log the data being sent
      console.log('Sending login data:', {
        username: formData.username,
        // Don't log the actual password in production
        hasPassword: !!formData.password
      });

      const response = await fetch(`${backendUrl}/api/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'http://localhost:5173'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json() as LoginResponse;
      
      // Log the response (excluding sensitive data)
      console.log('Login response received:', {
        status: response.status,
        success: data.success,
        hasLoginUrl: !!data.loginUrl
      });
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.loginUrl) {
        window.location.href = data.loginUrl;
      } else if (data.success) {
        closeModal();
        // Handle successful login without redirect
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-blue-500 hover:bg-blue-600 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        Login
      </button>

      <dialog
        ref={modalRef}
        className="w-full max-w-md rounded-lg p-6 bg-white shadow-xl"
        onClick={(e) => {
          if (e.target === modalRef.current) {
            closeModal();
          }
        }}
      >
        <div className="relative">
          <h2 className="text-xl font-bold mb-4">Login to Your Account</h2>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={formData.username}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div>
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            {error && (
              <div className="p-3 text-sm text-red-500 bg-red-50 rounded-lg">
                {error}
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className={`px-4 py-2 rounded-lg text-white transition-colors ${
                  isLoading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
                }`}
              >
                {isLoading ? 'Logging in...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
};

export default LoginButton;