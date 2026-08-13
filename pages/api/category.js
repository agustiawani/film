import { Veloflix } from '../../../lib/veloflix';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    type = 'movie',
    page = 1,
    genre,
    sort,
    year,
    minRating,
    country,
    q,
  } = req.query;

  const scraper = new Veloflix({ timeoutMs: 8000, retries: 1 });

  try {
    const data = await scraper.getCategoryPage({
      type,
      page: parseInt(page, 10),
      genre: genre ? parseInt(genre, 10) : undefined,
      sort,
      year: year ? parseInt(year, 10) : undefined,
      minRating: minRating ? parseFloat(minRating) : undefined,
      country,
      q,
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
