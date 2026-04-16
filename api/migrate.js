import { getDb } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getDb();
    const results = [];

    // Add location column
    try {
      await sql`ALTER TABLE drugs ADD COLUMN IF NOT EXISTS location VARCHAR(20) DEFAULT 'magazyn'`;
      results.push('Added location column (default: magazyn)');
    } catch (e) {
      results.push(`location column: ${e.message}`);
    }

    // Add min_quantity column
    try {
      await sql`ALTER TABLE drugs ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 5`;
      results.push('Added min_quantity column (default: 5)');
    } catch (e) {
      results.push(`min_quantity column: ${e.message}`);
    }

    // Add index on (crew_id, location)
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_crew_location ON drugs(crew_id, location)`;
      results.push('Added index on (crew_id, location)');
    } catch (e) {
      results.push(`index: ${e.message}`);
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('Migration Error:', error);
    return res.status(500).json({ error: 'Migration failed', detail: error.message });
  }
}
