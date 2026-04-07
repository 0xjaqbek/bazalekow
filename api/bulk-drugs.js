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

    if (drugs.length === 0) {
      return res.status(200).json({ success: true, count: 0 });
    }

    let successCount = 0;

    for (const d of drugs) {
      if (!d.id || !d.crewId) continue;
      
      try {
        await sql`
          INSERT INTO drugs (
            id, crew_id, substance, product_name, concentration, form, ean, 
            expiry_date, batch_number, quantity, unit, source, api_drug_id, added_at, updated_at
          ) VALUES (
            ${d.id}, ${d.crewId}, ${d.substance || ''}, ${d.productName || ''}, ${d.concentration || ''}, ${d.form || ''}, ${d.ean || ''},
            ${d.expiryDate || ''}, ${d.batchNumber || ''}, ${d.quantity || 1}, ${d.unit || 'szt.'}, ${d.source || 'api'}, ${d.apiDrugId || null}, 
            ${new Date(d.addedAt || Date.now())}, ${new Date(d.updatedAt || Date.now())}
          )
        `;
        successCount++;
      } catch (err) {
        console.error('Failed to insert drug in bulk:', d.id, err);
        // We continue inserting others even if one fails
      }
    }

    return res.status(201).json({ success: true, count: successCount });

  } catch (error) {
    console.error('API Bulk Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
}
