/**
 * JSON data export/import for the drug inventory.
 */
import { loadInventory, importDrugs, getCrewId } from './inventory.js';

const EXPORT_VERSION = '1.0';

/**
 * Export inventory as a downloadable JSON file.
 */
export function exportInventory() {
  const drugs = loadInventory();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];

  const exportData = {
    version: EXPORT_VERSION,
    exportDate: now.toISOString(),
    crewId: getCrewId(),
    drugsCount: drugs.length,
    drugs: drugs,
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `bazalekow_${getCrewId()}_${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return exportData;
}

/**
 * Import inventory from a JSON file.
 * @param {File} file - JSON file to import
 * @param {boolean} replace - Replace existing inventory or merge
 * @returns {Promise<{count: number, crewId: string}>}
 */
export function importInventoryFile(file, replace = false) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        if (!data.drugs || !Array.isArray(data.drugs)) {
          reject(new Error('Nieprawidłowy format pliku. Brak tablicy "drugs".'));
          return;
        }

        // Validate each drug entry has required fields
        const validDrugs = data.drugs.filter(d => d.id && d.substance);

        importDrugs(validDrugs, replace);
        resolve({
          count: validDrugs.length,
          crewId: data.crewId || 'unknown',
          version: data.version,
          exportDate: data.exportDate,
        });
      } catch (err) {
        reject(new Error('Błąd parsowania pliku JSON: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Błąd odczytu pliku.'));
    reader.readAsText(file);
  });
}

/**
 * Get the inventory as a JSON Blob for sharing/saving.
 */
export function getInventoryBlob() {
  const drugs = loadInventory();
  const exportData = {
    version: EXPORT_VERSION,
    exportDate: new Date().toISOString(),
    crewId: getCrewId(),
    drugsCount: drugs.length,
    drugs: drugs,
  };
  return new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
}
