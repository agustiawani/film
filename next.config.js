/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['image.tmdb.org'], // izinkan gambar dari TMDB
  },
};

module.exports = nextConfig;
