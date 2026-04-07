import { getDb } from './db.js';

export default async function handler(req, res) {
  try {
    const sql = getDb();
    
    console.log('Starting schema migration...');
    
    // Perform Alter Table commands
    await sql`ALTER TABLE drugs ALTER COLUMN substance TYPE TEXT`;
    await sql`ALTER TABLE drugs ALTER COLUMN product_name TYPE TEXT`;
    await sql`ALTER TABLE drugs ALTER COLUMN concentration TYPE TEXT`;
    await sql`ALTER TABLE drugs ALTER COLUMN form TYPE TEXT`;
    await sql`ALTER TABLE drugs ALTER COLUMN batch_number TYPE VARCHAR(255)`;

    return res.status(200).json({ 
      success: true, 
      message: 'Database schema updated successfully. Fields are now large enough for IZAS-05 and other complex entries.' 
    });
  } catch (error) {
    console.error('Migration Error:', error);
    return res.status(500).json({ 
      error: 'Migration failed', 
      detail: error.message 
    });
  }
}
