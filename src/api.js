/**
 * DrugsAPI client for drugsapi.miniporadnia.pl
 */

const BASE_URL = 'https://drugsapi.miniporadnia.pl';

/**
 * Get the stored API key from localStorage.
 */
export function getApiKey() {
  return localStorage.getItem('bazalekow_api_key') || '';
}

/**
 * Save API key to localStorage.
 */
export function setApiKey(key) {
  localStorage.setItem('bazalekow_api_key', key.trim());
}

/**
 * Check if API key is configured.
 */
export function hasApiKey() {
  return !!getApiKey();
}

/**
 * Make an authenticated request to the DrugsAPI.
 */
async function apiRequest(endpoint) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Brak klucza API. Ustaw klucz w ustawieniach.');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'X-API-Key': key,
      'Accept': 'application/json',
    },
  });

  // Parse rate limit headers
  const rateLimits = {
    rpsLimit: response.headers.get('X-RateLimit-RPS-Limit'),
    rpsRemaining: response.headers.get('X-RateLimit-RPS-Remaining'),
    requestsLimit: response.headers.get('X-RateLimit-Requests-Limit'),
    requestsRemaining: response.headers.get('X-RateLimit-Requests-Remaining'),
    recordsLimit: response.headers.get('X-RateLimit-Records-Limit'),
    recordsRemaining: response.headers.get('X-RateLimit-Records-Remaining'),
  };

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const err = new Error(`Przekroczono limit zapytań. Spróbuj za ${retryAfter || '?'}s`);
    err.retryAfter = parseInt(retryAfter, 10) || 5;
    err.rateLimits = rateLimits;
    throw err;
  }

  if (response.status === 401) {
    throw new Error('Nieprawidłowy klucz API lub klucz wygasł.');
  }

  if (!response.ok) {
    throw new Error(`Błąd API: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return { data, rateLimits };
}

/**
 * Search drugs by EAN code.
 * @param {string} ean - EAN code (8-14 digits)
 * @param {number} page - Page number (0-based)
 * @param {number} size - Results per page (1-100)
 */
export async function searchByEan(ean, page = 0, size = 20) {
  const cleaned = ean.replace(/\D/g, '');
  if (cleaned.length < 8 || cleaned.length > 14) {
    throw new Error('EAN musi mieć 8-14 cyfr.');
  }
  return apiRequest(`/v1/drugs/by-ean-page/${cleaned}?page=${page}&size=${size}`);
}

/**
 * Search drugs by active substance name.
 * @param {string} substance - Substance name (3-120 chars)
 */
export async function searchBySubstance(substance, page = 0, size = 20) {
  if (substance.length < 3) {
    throw new Error('Nazwa substancji musi mieć min. 3 znaki.');
  }
  return apiRequest(`/v1/drugs/by-subst-page/${encodeURIComponent(substance)}?page=${page}&size=${size}`);
}

/**
 * Search drugs by product name.
 * @param {string} name - Product name (3-80 chars)
 */
export async function searchByName(name, page = 0, size = 20) {
  if (name.length < 3) {
    throw new Error('Nazwa leku musi mieć min. 3 znaki.');
  }
  return apiRequest(`/v1/drugs/by-nazwa-page/${encodeURIComponent(name)}?page=${page}&size=${size}`);
}

/**
 * Get full drug record by ID.
 * @param {number} id - Drug record ID
 */
export async function getDrugById(id) {
  return apiRequest(`/v1/drugs/${id}`);
}

/**
 * Check API usage/quota.
 */
export async function checkUsage() {
  return apiRequest('/v1/usage');
}

/**
 * Check if the API is reachable (public endpoint, no auth needed).
 */
export async function healthCheck() {
  try {
    const response = await fetch(`${BASE_URL}/health/db`);
    const text = await response.text();
    return text.includes('ok');
  } catch {
    return false;
  }
}
