import Head from 'next/head';
import Link from 'next/link';
import SearchBar from './SearchBar';

export default function Layout({ children, title = 'Veloflix Preview' }) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="Nonton film dan series gratis" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <header className="bg-white dark:bg-gray-800 shadow-sm">
          <div className="container mx-auto px-4 py-3 flex flex-wrap items-center justify-between">
            <Link href="/">
              <span className="text-2xl font-bold text-red-600">Veloflix</span>
            </Link>
            <div className="flex items-center space-x-4">
              <SearchBar />
              <Link href="/category/movie" className="text-sm hover:underline">Movies</Link>
              <Link href="/category/tv" className="text-sm hover:underline">TV Series</Link>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-4 py-6">
          {children}
        </main>
        <footer className="text-center text-sm text-gray-500 py-4 border-t">
          &copy; {new Date().getFullYear()} Veloflix Preview – data dari veloflix.my.id
        </footer>
      </div>
    </>
  );
}
