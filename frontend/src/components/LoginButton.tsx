import React, { useState } from 'react';
import { LogIn } from 'lucide-react';

interface LoginResponse {
  loginUrl?: string;
  error?: string;
}

const LoginButton: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json() as LoginResponse;
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.loginUrl) {
        window.location.href = data.loginUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white transition-colors ${
          isLoading ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'
        }`}
      >
        <LogIn className="w-4 h-4" />
        {isLoading ? 'Logging in...' : 'Login'}
      </button>
      
      {error && (
        <div className="absolute top-full mt-2 w-full px-4 py-2 text-sm text-red-500 bg-red-50 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default LoginButton;