import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function init() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  console.log('Connecting to Neon DB and creating tables...');

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS drugs (
        id VARCHAR(50) PRIMARY KEY,
        crew_id VARCHAR(50) NOT NULL,
        substance VARCHAR(255),
        product_name VARCHAR(255),
        concentration VARCHAR(100),
        form VARCHAR(100),
        ean VARCHAR(20),
        expiry_date VARCHAR(20),
        batch_number VARCHAR(100),
        quantity INTEGER DEFAULT 1,
        unit VARCHAR(50),
        source VARCHAR(50),
        api_drug_id INTEGER,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_crew_id ON drugs(crew_id);
    `;

    console.log('Database successfully initialized!');
  } catch (err) {
    console.error('Failed to initialize database:', err);
  }
}

init();
