import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import MovieCard from '../../components/MovieCard';

export default function Category() {
  const router = useRouter();
  const { type, page = 1, genre, sort, year } = router.query;
  const [items, setItems] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!type) return;
    const fetchCategory = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          type,
          page: currentPage,
          ...(genre && { genre }),
          ...(sort && { sort }),
          ...(year && { year }),
        });
        const res = await fetch(`/api/category?${params}`);
        const data = await res.json();
        setItems(data.items || []);
        setTotalPages(data.totalPages || 1);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategory();
  }, [type, currentPage, genre, sort, year]);

  const changePage = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      router.push({
        pathname: router.pathname,
        query: { ...router.query, page: newPage },
      });
    }
  };

  const titleMap = {
    movie: 'Film',
    tv: 'TV Series',
  };
  const pageTitle = `${titleMap[type] || 'Kategori'} – Halaman ${currentPage}`;

  return (
    <Layout title={pageTitle}>
      <h2 className="text-2xl font-bold mb-4">{pageTitle}</h2>
      {loading && <p>Memuat...</p>}
      {!loading && items.length === 0 && <p>Tidak ada item.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((item) => (
          <MovieCard key={item.id} item={item} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-center items-center space-x-4 mt-6">
          <button
            onClick={() => changePage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Sebelumnya
          </button>
          <span>
            Halaman {currentPage} dari {totalPages}
          </span>
          <button
            onClick={() => changePage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-4 py-2 bg-gray-200 rounded disabled:opacity-50"
          >
            Selanjutnya
          </button>
        </div>
      )}
    </Layout>
  );
}
