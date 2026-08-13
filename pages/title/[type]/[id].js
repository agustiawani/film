import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Layout from '../../../components/Layout';
import MovieCard from '../../../components/MovieCard';

export default function TitleDetail() {
  const router = useRouter();
  const { type, id } = router.query;
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!type || !id) return;
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/title/${type}/${id}`);
        const data = await res.json();
        setDetail(data);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [type, id]);

  if (loading) {
    return (
      <Layout title="Memuat...">
        <div className="text-center py-10">Memuat...</div>
      </Layout>
    );
  }

  if (!detail) {
    return (
      <Layout title="Tidak ditemukan">
        <div className="text-center py-10">Data tidak ditemukan.</div>
      </Layout>
    );
  }

  const poster = detail.posterUrl || '/no-poster.png';
  const backdrop = detail.backdropUrl || poster;

  return (
    <Layout title={detail.title || 'Detail'}>
      <div className="relative w-full h-64 md:h-80 lg:h-96 rounded-lg overflow-hidden">
        <Image src={backdrop} alt={detail.title} fill className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        <div className="absolute bottom-4 left-4 flex items-end space-x-4">
          <div className="w-24 h-36 relative rounded shadow-lg overflow-hidden flex-shrink-0">
            <Image src={poster} alt={detail.title} fill className="object-cover" />
          </div>
          <div className="text-white">
            <h1 className="text-3xl font-bold">{detail.title}</h1>
            <p className="text-sm">
              {detail.year} • {detail.mediaType === 'tv' ? 'Series' : 'Film'}
              {detail.rating && ` • ⭐ ${detail.rating.toFixed(1)}`}
            </p>
            {detail.genres?.length > 0 && (
              <p className="text-sm text-gray-300">
                {detail.genres.map((g) => g.name || g).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {detail.overview && (
          <div className="mb-4">
            <h3 className="text-xl font-semibold">Sinopsis</h3>
            <p className="text-gray-700 dark:text-gray-300">{detail.overview}</p>
          </div>
        )}

        {detail.cast && detail.cast.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2">Pemeran</h3>
            <div className="flex flex-wrap gap-3">
              {detail.cast.slice(0, 8).map((actor) => (
                <div key={actor.id} className="text-center w-20">
                  <div className="w-16 h-16 relative rounded-full overflow-hidden mx-auto bg-gray-200">
                    {actor.profileUrl ? (
                      <Image src={actor.profileUrl} alt={actor.name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                        No img
                      </div>
                    )}
                  </div>
                  <p className="text-xs font-medium truncate">{actor.name}</p>
                  <p className="text-xs text-gray-500 truncate">{actor.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {detail.recommendations && detail.recommendations.length > 0 && (
          <div>
            <h3 className="text-xl font-semibold mb-2">Rekomendasi</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {detail.recommendations.map((item) => (
                <MovieCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
