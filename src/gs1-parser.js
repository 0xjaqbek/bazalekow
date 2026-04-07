/**
 * GS1 DataMatrix parser for pharmaceutical packaging.
 * 
 * EU drug packaging uses GS1 DataMatrix with Application Identifiers (AI):
 *   AI 01 = GTIN (14 digits, fixed length)
 *   AI 17 = Expiry date YYMMDD (6 digits, fixed length)
 *   AI 10 = Batch/Lot number (variable length, up to 20 chars)
 *   AI 21 = Serial number (variable length, up to 20 chars)
 *   AI 11 = Production date YYMMDD (6 digits, fixed length)
 *   AI 30 = Quantity (variable length, up to 8 digits)
 * 
 * Variable-length fields are terminated by GS (Group Separator, \x1D) or end of string.
 */

const GS = '\x1D'; // Group Separator character (FNC1 in DataMatrix)

// AI definitions: [aiCode, name, fixedLength or null for variable, maxLength]
const AI_DEFINITIONS = [
  { ai: '01', name: 'gtin',       fixed: 14 },
  { ai: '17', name: 'expiryDate', fixed: 6 },
  { ai: '11', name: 'prodDate',   fixed: 6 },
  { ai: '10', name: 'batch',      fixed: null, maxLen: 20 },
  { ai: '21', name: 'serial',     fixed: null, maxLen: 20 },
  { ai: '30', name: 'quantity',   fixed: null, maxLen: 8 },
  { ai: '240', name: 'additionalId', fixed: null, maxLen: 30 },
  { ai: '710', name: 'nhrn_de',   fixed: null, maxLen: 20 },
  { ai: '711', name: 'nhrn_fr',   fixed: null, maxLen: 20 },
  { ai: '712', name: 'nhrn_es',   fixed: null, maxLen: 20 },
  { ai: '713', name: 'nhrn_br',   fixed: null, maxLen: 20 },
  { ai: '714', name: 'nhrn_pt',   fixed: null, maxLen: 20 },
];

/**
 * Parse a GS1 encoded string from a DataMatrix barcode.
 * @param {string} raw - Raw scanned string (may contain GS characters or ]d2 prefix)
 * @returns {object} Parsed fields: { gtin, ean, expiryDate, expiryFormatted, batch, serial, quantity, raw }
 */
export function parseGS1(raw) {
  if (!raw || typeof raw !== 'string') {
    return null;
  }

  // Remove common DataMatrix symbology identifiers
  let data = raw;
  if (data.startsWith(']d2') || data.startsWith(']D2')) {
    data = data.substring(3);
  }
  if (data.startsWith(']C1')) {
    data = data.substring(3);
  }

  const result = {
    gtin: null,
    ean: null,
    expiryDate: null,
    expiryFormatted: null,
    batch: null,
    serial: null,
    quantity: null,
    prodDate: null,
    raw: raw,
  };

  let pos = 0;
  let safety = 0;

  while (pos < data.length && safety < 50) {
    safety++;

    // Skip GS separators
    if (data[pos] === GS) {
      pos++;
      continue;
    }

    // Try to match an AI
    let matched = false;

    // Sort AI definitions by length descending so 3-char AIs are tried before 2-char
    const sortedAIs = [...AI_DEFINITIONS].sort((a, b) => b.ai.length - a.ai.length);

    for (const def of sortedAIs) {
      if (data.substring(pos, pos + def.ai.length) === def.ai) {
        pos += def.ai.length;

        let value;
        if (def.fixed) {
          // Fixed-length field
          value = data.substring(pos, pos + def.fixed);
          pos += def.fixed;
        } else {
          // Variable-length field — read until GS or end of string
          const gsIndex = data.indexOf(GS, pos);
          if (gsIndex !== -1) {
            value = data.substring(pos, gsIndex);
            pos = gsIndex + 1; // skip the GS
          } else {
            value = data.substring(pos);
            pos = data.length;
          }
        }

        result[def.name] = value;
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Unknown AI or garbage — try to skip ahead
      pos++;
    }
  }

  // Post-process GTIN → EAN
  if (result.gtin) {
    result.ean = gtinToEan(result.gtin);
  }

  // Post-process expiry date
  if (result.expiryDate) {
    result.expiryFormatted = parseExpiryDate(result.expiryDate);
  }

  return result;
}

/**
 * Convert 14-digit GTIN to EAN-13 by stripping leading zero(s).
 * GTIN-14 often has a leading '0' making it a GTIN-13 (EAN-13).
 */
function gtinToEan(gtin) {
  if (!gtin) return null;
  // Strip leading zeros to get to 13 digits
  let ean = gtin.replace(/^0+/, '');
  // EAN-13 should be 13 digits; pad back if we stripped too much
  while (ean.length < 13) {
    ean = '0' + ean;
  }
  // If still more than 13, return as-is (GTIN-14)
  return ean;
}

/**
 * Parse YYMMDD expiry date string to ISO date.
 * Note: MM=00 means "no specific month" (just year), DD=00 means end of month.
 */
function parseExpiryDate(yymmdd) {
  if (!yymmdd || yymmdd.length !== 6) return null;

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = parseInt(yymmdd.substring(2, 4), 10);
  const dd = parseInt(yymmdd.substring(4, 6), 10);

  // Determine century: 00-49 → 2000s, 50-99 → 1900s
  const year = yy < 50 ? 2000 + yy : 1900 + yy;
  const month = mm || 12; // 00 → treat as December (end of year)
  
  let day = dd;
  if (day === 0) {
    // Day 00 means last day of the month
    day = new Date(year, month, 0).getDate();
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Try to detect if a raw string is a plain EAN-13 barcode (not GS1 DataMatrix).
 * @param {string} raw
 * @returns {object|null} { ean } or null
 */
export function tryParseEAN(raw) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s/g, '');
  
  // EAN-13: exactly 13 digits
  if (/^\d{13}$/.test(cleaned)) {
    return { ean: cleaned, raw };
  }
  // EAN-8: exactly 8 digits
  if (/^\d{8}$/.test(cleaned)) {
    return { ean: cleaned, raw };
  }
  // EAN-14/GTIN-14: exactly 14 digits
  if (/^\d{14}$/.test(cleaned)) {
    return { ean: gtinToEan(cleaned), raw };
  }
  return null;
}

/**
 * Main entry point: try to parse scanned barcode data.
 * Tries GS1 DataMatrix first, then falls back to plain EAN.
 * @param {string} raw - Raw scanned text
 * @returns {object} Parsed result with at least { ean, raw }
 */
export function parseScan(raw) {
  // First try GS1 DataMatrix
  const gs1 = parseGS1(raw);
  if (gs1 && gs1.ean) {
    return gs1;
  }

  // Fall back to plain EAN
  const ean = tryParseEAN(raw);
  if (ean) {
    return {
      ...ean,
      gtin: null,
      expiryDate: null,
      expiryFormatted: null,
      batch: null,
      serial: null,
      quantity: null,
    };
  }

  // Return raw data if nothing matched
  return {
    ean: null,
    gtin: null,
    expiryDate: null,
    expiryFormatted: null,
    batch: null,
    serial: null,
    quantity: null,
    raw,
    parseError: true,
  };
}
