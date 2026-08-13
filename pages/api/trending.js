import { Veloflix } from '../../../lib/veloflix';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { country = 'ID', type = 'movie', page = 1 } = req.query;

  const scraper = new Veloflix({
    lang: 'id',
    timeoutMs: 8000, // batas waktu agar tidak timeout di Vercel (10s)
    retries: 1,
    delayMs: 300,
  });

  try {
    const data = await scraper.getTrendingCountry({
      country,
      type,
      page: parseInt(page, 10),
    });
    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Gagal mengambil trending' });
  }
}
