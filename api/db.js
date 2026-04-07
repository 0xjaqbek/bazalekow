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
  
  // Robustly extract the URL part only (handles psql 'url' or "url" or psql url)
  const match = rawUrl.match(/(postgresql:\/\/[^\s'"]+)/i);
  if (match) {
    rawUrl = match[1];
  }

  const sql = neon(rawUrl);
  return sql;
}
