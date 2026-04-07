import { neon, neonConfig } from '@neondatabase/serverless';

// Optionally enable caching or specialized config here if needed
// neonConfig.fetchConnectionCache = true;

/**
 * Returns a configured Neon db client instance.
 * Environment variables must be set (e.g. DATABASE_URL).
 */
export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  
  let rawUrl = process.env.DATABASE_URL.trim();
  
  // Clean up if the user pasted the entire "psql '...'" CLI command by accident
  if (rawUrl.startsWith("psql ")) {
    rawUrl = rawUrl.replace("psql ", "").trim();
  }
  if (rawUrl.startsWith("'") && rawUrl.endsWith("'")) {
    rawUrl = rawUrl.slice(1, -1);
  } else if (rawUrl.startsWith('"') && rawUrl.endsWith('"')) {
    rawUrl = rawUrl.slice(1, -1);
  }

  const sql = neon(rawUrl);
  return sql;
}
