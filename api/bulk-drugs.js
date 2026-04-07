import { getDb } from './db.js';

export default async function handler(req, res) {
  const sql = getDb();

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { drugs } = req.body;
    if (!drugs || !Array.isArray(drugs)) {
      return res.status(400).json({ error: 'Missing drugs array array' });
    }

    // Filter out invalid items
    const validDrugs = drugs.filter(d => d && d.id && d.crewId);

    if (validDrugs.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    // Build the values array for multi-row insert
    const insertValues = validDrugs.map(d => [
      d.id,
      d.crewId,
      d.substance || '',
      d.productName || '',
      d.concentration || '',
      d.form || '',
      d.ean || '',
      d.expiryDate || '',
      d.batchNumber || '',
      parseInt(d.quantity, 10) || 1,
      d.unit || 'szt.',
      d.source || 'api',
      d.apiDrugId || null,
      d.addedAt ? new Date(d.addedAt) : new Date(),
      d.updatedAt ? new Date(d.updatedAt) : new Date()
    ]);

    await sql`
      INSERT INTO drugs (
        id, crew_id, substance, product_name, concentration, form, ean, 
        expiry_date, batch_number, quantity, unit, source, api_drug_id, added_at, updated_at
      )
      ${sql(insertValues)}
    `;

    return res.status(201).json({ success: true, count: validDrugs.length });

  } catch (error) {
    console.error('API Bulk Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
}
