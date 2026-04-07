import { neon, neonConfig } from '@neondatabase/serverless';

// Optionally enable caching or specialized config here if needed
// neonConfig.fetchConnectionCache = true;

/**
 * Returns a configured Neon db client instance.
 * Environment variables must be set (e.g. DATABASE_URL).
 */
export function getDb() {
  const sql = neon(process.env.DATABASE_URL);
  return sql;
}
