import { Veloflix } from '../../../../lib/veloflix';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, id } = req.query;

  const scraper = new Veloflix({ timeoutMs: 8000, retries: 1 });

  try {
    const detail = await scraper.getTitle(type, id);
    res.status(200).json(detail);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
