import { getDb } from './db.js';

export default async function handler(req, res) {
  try {
    const sql = getDb();
    // GET: Fetch all drugs for a specific crew
    if (req.method === 'GET') {
      const { crewId } = req.query;
      if (!crewId) {
        return res.status(400).json({ error: 'crewId is required' });
      }

      const rows = await sql`SELECT * FROM drugs WHERE crew_id = ${crewId} ORDER BY substance ASC, product_name ASC`;
      
      // Map back from snake_case to camelCase
      const formatted = rows.map(r => ({
        id: r.id,
        crewId: r.crew_id,
        substance: r.substance,
        productName: r.product_name,
        concentration: r.concentration,
        form: r.form,
        ean: r.ean,
        expiryDate: r.expiry_date,
        batchNumber: r.batch_number,
        quantity: r.quantity,
        unit: r.unit,
        source: r.source,
        apiDrugId: r.api_drug_id,
        addedAt: r.added_at,
        updatedAt: r.updated_at
      }));

      return res.status(200).json(formatted);
    }

    // POST: Add a new drug
    if (req.method === 'POST') {
      const d = req.body;
      if (!d || !d.id || !d.crewId) {
        return res.status(400).json({ error: 'Missing required fields (id, crewId)' });
      }

      await sql`
        INSERT INTO drugs (
          id, crew_id, substance, product_name, concentration, form, ean, 
          expiry_date, batch_number, quantity, unit, source, api_drug_id, added_at, updated_at
        ) VALUES (
          ${d.id}, ${d.crewId}, ${d.substance}, ${d.productName}, ${d.concentration}, ${d.form}, ${d.ean},
          ${d.expiryDate}, ${d.batchNumber}, ${d.quantity}, ${d.unit}, ${d.source}, ${d.apiDrugId}, 
          ${new Date(d.addedAt || Date.now())}, ${new Date(d.updatedAt || Date.now())}
        )
      `;
      return res.status(201).json({ success: true, id: d.id });
    }

    // PUT: Update an existing drug
    if (req.method === 'PUT') {
      const { id, updates } = req.body;
      if (!id || !updates) {
        return res.status(400).json({ error: 'Missing id or updates' });
      }

      await sql`
        UPDATE drugs SET
          substance = COALESCE(${updates.substance}, substance),
          product_name = COALESCE(${updates.productName}, product_name),
          concentration = COALESCE(${updates.concentration}, concentration),
          form = COALESCE(${updates.form}, form),
          ean = COALESCE(${updates.ean}, ean),
          expiry_date = COALESCE(${updates.expiryDate}, expiry_date),
          batch_number = COALESCE(${updates.batchNumber}, batch_number),
          quantity = COALESCE(${updates.quantity}, quantity),
          unit = COALESCE(${updates.unit}, unit),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
      `;
      
      return res.status(200).json({ success: true, id });
    }

    // DELETE: Remove a drug or clear all for crew
    if (req.method === 'DELETE') {
      const { id, crewId } = req.query;

      if (id) {
        await sql`DELETE FROM drugs WHERE id = ${id}`;
        return res.status(200).json({ success: true, id });
      } 
      
      if (crewId) {
        await sql`DELETE FROM drugs WHERE crew_id = ${crewId}`;
        return res.status(200).json({ success: true, cleared: true, crewId });
      }

      return res.status(400).json({ error: 'Must provide id or crewId to delete' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', detail: error.message });
  }
}
