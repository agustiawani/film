import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import MovieCard from '../components/MovieCard';

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [moviesRes, seriesRes] = await Promise.all([
          fetch('/api/trending?type=movie&country=ID'),
          fetch('/api/trending?type=tv&country=ID'),
        ]);
        const moviesData = await moviesRes.json();
        const seriesData = await seriesRes.json();
        setMovies(moviesData.items || []);
        setSeries(seriesData.items || []);
      } catch (error) {
        console.error('Gagal fetch:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-10">Memuat...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="mb-10">
        <h2 className="text-2xl font-bold mb-4">🔥 Trending Film</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {movies.map((item) => (
            <MovieCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">📺 Trending Series</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {series.map((item) => (
            <MovieCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </Layout>
  );
}
