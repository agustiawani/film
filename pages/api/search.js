import { Veloflix } from '../../../lib/veloflix';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query parameter q required' });
  }

  const scraper = new Veloflix({ timeoutMs: 8000, retries: 1 });

  try {
    const results = await scraper.search(q);
    res.status(200).json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
