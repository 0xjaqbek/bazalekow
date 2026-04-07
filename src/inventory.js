/**
 * Drug inventory manager — stores drug entries via Vercel Serverless API (Neon PostgreSQL).
 */
import { v4 as uuidv4 } from 'uuid';

const CREW_KEY = 'bazalekow_crew_id';

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
 */
export function getCachedInventory() {
  return _inventoryCache || [];
}

/**
 * Fetch inventory from the database for the current crew.
 * @returns {Promise<Array>} Array of drug entries.
 */
export async function loadInventory() {
  try {
    const crewId = getCrewId();
    const res = await fetch(`/api/drugs?crewId=${encodeURIComponent(crewId)}`);
    if (!res.ok) throw new Error('Failed to fetch inventory');
    const data = await res.json();
    _inventoryCache = data;
    return data;
  } catch (err) {
    console.error('loadInventory error:', err);
    return _inventoryCache; // Fallback to cache
  }
}

/**
 * Add a drug entry to the database.
 * @param {object} drug - Drug data
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
    source: drug.source || 'manual', // 'api' or 'manual'
    apiDrugId: drug.apiDrugId || null,
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
    
    // Update local cache
    _inventoryCache.push(entry);
    
    // Sort array
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
    
    // Push successful entries to cache
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
 * @param {object} updates - Fields to update
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
    
    // Update local cache
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
    
    // Update local cache
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
 * @returns {object} { substanceName: [drugEntries] }
 */
export function getGroupedInventory() {
  const drugs = getCachedInventory();
  const grouped = {};
  for (const drug of drugs) {
    const key = drug.substance || 'Nieprzypisane';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(drug);
  }
  // Sort groups alphabetically
  const sorted = {};
  for (const key of Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'pl'))) {
    sorted[key] = grouped[key];
  }
  return sorted;
}

/**
 * Search cached inventory.
 * @param {string} query - Search query
 * @returns {Array} Matching drug entries
 */
export function searchInventory(query) {
  const cache = getCachedInventory();
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
  
  // This could be optimized into a single bulk insert in the API, 
  // but for simplicity we iterate.
  const existingIds = new Set(getCachedInventory().map(d => d.id));
  
  for (const drug of importedDrugs) {
    if (!existingIds.has(drug.id)) {
      await addDrug(drug);
    }
  }
  
  // Reload full fresh state
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
