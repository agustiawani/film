import { useState } from 'react';
import { useRouter } from 'next/router';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari film..."
        className="px-3 py-1 border rounded-l-md focus:outline-none focus:ring-2 focus:ring-red-400 dark:bg-gray-700 dark:border-gray-600"
      />
      <button
        type="submit"
        className="px-3 py-1 bg-red-600 text-white rounded-r-md hover:bg-red-700"
      >
        Cari
      </button>
    </form>
  );
}
