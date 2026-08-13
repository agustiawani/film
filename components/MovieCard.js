import Link from 'next/link';
import Image from 'next/image';

export default function MovieCard({ item }) {
  const poster = item.posterUrl || '/no-poster.png';
  const title = item.title || 'Untitled';
  const year = item.year || '';
  const rating = item.rating ? item.rating.toFixed(1) : null;

  return (
    <Link href={`/title/${item.mediaType}/${item.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow cursor-pointer">
        <div className="relative h-64 w-full">
          <Image
            src={poster}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 200px"
          />
        </div>
        <div className="p-3">
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          <div className="flex justify-between items-center text-xs text-gray-500">
            <span>{year}</span>
            {rating && <span>⭐ {rating}</span>}
          </div>
        </div>
      </div>
    </Link>
  );
}
