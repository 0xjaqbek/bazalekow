import { getDb } from './db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sql = getDb();
    
    // Create the drugs table
    await sql`
      CREATE TABLE IF NOT EXISTS drugs (
        id VARCHAR(50) PRIMARY KEY,
        crew_id VARCHAR(50) NOT NULL,
        substance TEXT,
        product_name TEXT,
        concentration TEXT,
        form TEXT,
        ean VARCHAR(20),
        expiry_date VARCHAR(20),
        batch_number VARCHAR(255),
        quantity INTEGER DEFAULT 1,
        unit VARCHAR(50),
        source VARCHAR(50),
        api_drug_id INTEGER,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create an index on crew_id for faster lookups
    await sql`
      CREATE INDEX IF NOT EXISTS idx_crew_id ON drugs(crew_id);
    `;

    return res.status(200).json({ success: true, message: 'Database tables initialized successfully.' });
  } catch (error) {
    console.error('Init DB Error:', error);
    return res.status(500).json({ error: 'Failed to initialize database.', detail: error.message });
  }
}
