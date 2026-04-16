/**
 * Drug inventory manager — stores drug entries via Vercel Serverless API (Neon PostgreSQL).
 * Supports dual-location: 'ambulans' (ambulance) and 'magazyn' (storeroom).
 */
import { v4 as uuidv4 } from 'uuid';

const CREW_KEY = 'bazalekow_crew_id';
const DEFAULT_MIN_QUANTITY = 5;

let _inventoryCache = [];

/**
 * Get crew ID.
 */
export function getCrewId() {
  return localStorage.getItem(CREW_KEY) || 'ZRM-01';
}

export function setCrewId(id) {
  localStorage.setItem(CREW_KEY, id.trim());
}

/**
 * Get the currently cached inventory. Use this for synchronous operations like grouping.
 * @param {string} [location] - Optional location filter ('ambulans' or 'magazyn')
 */
export function getCachedInventory(location) {
  const cache = _inventoryCache || [];
  if (!location) return cache;
  return cache.filter(d => d.location === location);
}

/**
 * Fetch inventory from the database for the current crew.
 * @param {string} [location] - Optional filter: 'ambulans' or 'magazyn'
 * @returns {Promise<Array>} Array of drug entries.
 */
export async function loadInventory(location) {
  try {
    const crewId = getCrewId();
    let url = `/api/drugs?crewId=${encodeURIComponent(crewId)}`;
    if (location) url += `&location=${encodeURIComponent(location)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch inventory');
    const data = await res.json();
    if (location) {
      // Merge into cache: replace entries for this location, keep the rest
      _inventoryCache = _inventoryCache.filter(d => d.location !== location).concat(data);
    } else {
      _inventoryCache = data;
    }
    return data;
  } catch (err) {
    console.error('loadInventory error:', err);
    return location ? getCachedInventory(location) : _inventoryCache;
  }
}

/**
 * Add a drug entry to the database.
 * @param {object} drug - Drug data (must include location)
 * @returns {Promise<object>} The created drug entry with ID
 */
export async function addDrug(drug) {
  const crewId = getCrewId();
  const entry = {
    id: uuidv4(),
    crewId,
    substance: drug.substance || '',
    productName: drug.productName || '',
    concentration: drug.concentration || '',
    form: drug.form || '',
    ean: drug.ean || '',
    expiryDate: drug.expiryDate || '',
    batchNumber: drug.batchNumber || '',
    quantity: parseInt(drug.quantity, 10) || 1,
    unit: drug.unit || 'szt.',
    source: drug.source || 'manual',
    apiDrugId: drug.apiDrugId || null,
    location: drug.location || 'magazyn',
    minQuantity: drug.minQuantity != null ? parseInt(drug.minQuantity, 10) : DEFAULT_MIN_QUANTITY,
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch('/api/drugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to add drug: ${errorText}`);
    }
    
    _inventoryCache.push(entry);
    _inventoryCache.sort((a, b) => a.substance.localeCompare(b.substance) || a.productName.localeCompare(b.productName));
  } catch (err) {
    console.error('addDrug error:', err);
    throw err;
  }
}

/**
 * Add multiple drugs at once via bulk API
 */
export async function bulkAddDrugs(drugsArray) {
  const crewId = getCrewId();
  
  const entries = drugsArray.map(drug => ({
    id: uuidv4(),
    crewId,
    substance: drug.substance || '',
    productName: drug.productName || '',
    concentration: drug.concentration || '',
    form: drug.form || '',
    ean: drug.ean || '',
    expiryDate: drug.expiryDate || '',
    batchNumber: drug.batchNumber || '',
    quantity: parseInt(drug.quantity, 10) || 1,
    unit: drug.unit || 'szt.',
    source: drug.source || 'api',
    apiDrugId: drug.apiDrugId || null,
    location: drug.location || 'magazyn',
    minQuantity: drug.minQuantity != null ? parseInt(drug.minQuantity, 10) : DEFAULT_MIN_QUANTITY,
    addedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  try {
    const res = await fetch('/api/bulk-drugs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drugs: entries })
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to bulk add drugs: ${errorText}`);
    }
    
    const { count } = await res.json();
    
    _inventoryCache.push(...entries);
    _inventoryCache.sort((a, b) => a.substance.localeCompare(b.substance) || a.productName.localeCompare(b.productName));
    
    return count;
  } catch (err) {
    console.error('bulkAddDrugs error:', err);
    throw err;
  }
}

/**
 * Update an existing drug entry in the database.
 * @param {string} id - Drug entry ID
 * @param {object} updates - Fields to update (can include location, minQuantity)
 * @returns {Promise<object|null>} Updated entry or null if not found
 */
export async function updateDrug(id, updates) {
  try {
    const res = await fetch('/api/drugs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, updates })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to update drug: ${errorText}`);
    }
    
    const index = _inventoryCache.findIndex(d => d.id === id);
    if (index !== -1) {
      _inventoryCache[index] = {
        ..._inventoryCache[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      return _inventoryCache[index];
    }
    return null;
  } catch (err) {
    console.error('updateDrug error:', err);
    throw err;
  }
}

/**
 * Transfer a drug to another location.
 * @param {string} id - Drug entry ID
 * @param {string} targetLocation - 'ambulans' or 'magazyn'
 */
export async function transferDrug(id, targetLocation) {
  return updateDrug(id, { location: targetLocation });
}

/**
 * Delete a drug entry from the database.
 * @param {string} id - Drug entry ID
 */
export async function deleteDrug(id) {
  try {
    const res = await fetch(`/api/drugs?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to delete drug: ${errorText}`);
    }
    
    _inventoryCache = _inventoryCache.filter(d => d.id !== id);
  } catch (err) {
    console.error('deleteDrug error:', err);
    throw err;
  }
}

/**
 * Clear entire inventory for the current crew.
 */
export async function clearInventory() {
  try {
    const crewId = getCrewId();
    const res = await fetch(`/api/drugs?crewId=${encodeURIComponent(crewId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to clear inventory: ${errorText}`);
    }
    
    _inventoryCache = [];
  } catch (err) {
    console.error('clearInventory error:', err);
    throw err;
  }
}

/**
 * Get cached inventory grouped by substance.
 * @param {string} [location] - Optional location filter
 * @returns {object} { substanceName: [drugEntries] }
 */
export function getGroupedInventory(location) {
  const drugs = getCachedInventory(location);
  const grouped = {};
  for (const drug of drugs) {
    const key = drug.substance || 'Nieprzypisane';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(drug);
  }
  const sorted = {};
  for (const key of Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pl'))) {
    sorted[key] = grouped[key];
  }
  return sorted;
}

/**
 * Search cached inventory.
 * @param {string} query - Search query
 * @param {string} [location] - Optional location filter
 * @returns {Array} Matching drug entries
 */
export function searchInventory(query, location) {
  const cache = getCachedInventory(location);
  if (!query || query.length < 2) return cache;
  const q = query.toLowerCase();
  return cache.filter(d =>
    (d.substance && d.substance.toLowerCase().includes(q)) ||
    (d.productName && d.productName.toLowerCase().includes(q)) ||
    (d.ean && d.ean.includes(q)) ||
    (d.concentration && d.concentration.toLowerCase().includes(q))
  );
}

/**
 * Import drugs from a JSON dataset (merge or replace) into the database.
 * @param {Array} importedDrugs - Array of drug entries
 * @param {boolean} replace - If true, replace entire inventory; if false, merge (add new)
 */
export async function importDrugs(importedDrugs, replace = false) {
  if (replace) {
    await clearInventory();
  }
  
  const existingIds = new Set(getCachedInventory().map(d => d.id));
  
  for (const drug of importedDrugs) {
    if (!existingIds.has(drug.id)) {
      await addDrug(drug);
    }
  }
  
  await loadInventory();
}

/**
 * Check if a drug is expiring soon (within 30 days) or expired.
 * @param {string} expiryDate - ISO date string
 * @returns {'expired'|'expiring'|'ok'|'unknown'}
 */
export function getExpiryStatus(expiryDate) {
  if (!expiryDate) return 'unknown';
  const now = new Date();
  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) return 'unknown';
  
  const diffDays = (expiry - now) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return 'expired';
  if (diffDays < 30) return 'expiring';
  return 'ok';
}

/**
 * Check if a drug is low on stock.
 * @param {object} drug - Drug entry with quantity and minQuantity
 * @returns {boolean}
 */
export function isLowStock(drug) {
  const min = drug.minQuantity != null ? drug.minQuantity : DEFAULT_MIN_QUANTITY;
  return (drug.quantity || 0) <= min;
}

/**
 * Get summary stats for a location (or all).
 * @param {string} [location] - 'ambulans', 'magazyn', or undefined for all
 * @returns {object} { total, expired, expiring, lowStock, ok }
 */
export function getLocationStats(location) {
  const drugs = getCachedInventory(location);
  const stats = { total: drugs.length, expired: 0, expiring: 0, lowStock: 0, ok: 0 };
  
  for (const drug of drugs) {
    const expiryStatus = getExpiryStatus(drug.expiryDate);
    if (expiryStatus === 'expired') stats.expired++;
    else if (expiryStatus === 'expiring') stats.expiring++;
    
    if (isLowStock(drug)) stats.lowStock++;
    else stats.ok++;
  }
  
  return stats;
}

/**
 * Get drugs with alerts (expired, expiring soon, or low stock).
 * @param {string} [location] - Optional location filter
 * @returns {Array} Drugs with alert info
 */
export function getAlertDrugs(location) {
  const drugs = getCachedInventory(location);
  return drugs
    .map(drug => {
      const expiryStatus = getExpiryStatus(drug.expiryDate);
      const lowStock = isLowStock(drug);
      if (expiryStatus === 'expired' || expiryStatus === 'expiring' || lowStock) {
        return { ...drug, expiryStatus, lowStock };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      // Expired first, then expiring, then low stock
      const priority = { expired: 0, expiring: 1, ok: 2, unknown: 3 };
      const pa = priority[a.expiryStatus] ?? 3;
      const pb = priority[b.expiryStatus] ?? 3;
      if (pa !== pb) return pa - pb;
      if (a.lowStock && !b.lowStock) return -1;
      if (!a.lowStock && b.lowStock) return 1;
      return 0;
    });
}

/**
 * Run database migration to add location and min_quantity columns.
 */
export async function runMigration() {
  try {
    const res = await fetch('/api/migrate', { method: 'POST' });
    if (!res.ok) throw new Error('Migration failed');
    return await res.json();
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  }
}
