import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import MovieCard from '../components/MovieCard';

export default function Search() {
  const router = useRouter();
  const { q } = router.query;
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q) return;
    const fetchSearch = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchSearch();
  }, [q]);

  return (
    <Layout title={`Hasil pencarian: ${q || ''}`}>
      <h2 className="text-2xl font-bold mb-4">
        Hasil pencarian untuk &quot;{q}&quot;
      </h2>
      {loading && <p>Memuat...</p>}
      {!loading && results.length === 0 && <p>Tidak ditemukan.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {results.map((item) => (
          <MovieCard key={item.id} item={item} />
        ))}
      </div>
    </Layout>
  );
}
