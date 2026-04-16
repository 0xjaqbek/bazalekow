/**
 * DrugsAPI client for drugsapi.miniporadnia.pl
 */

const BASE_API_URL = 'https://drugsapi.miniporadnia.pl';

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
 * Make an authenticated request to the DrugsAPI via Vercel Proxy.
 */
async function apiRequest(endpoint) {
  const key = getApiKey();
  if (!key) {
    throw new Error('Brak klucza API. Ustaw klucz w ustawieniach.');
  }

  // Budujemy pełny docelowy URL do API
  const targetUrl = `${BASE_API_URL}${endpoint}`;

  // Przekazujemy go jako parametr do naszego proxy
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`;

  const response = await fetch(proxyUrl, {
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
    throw new Error('Nieprawidłowy klucz API lub klucz wygasł (401).');
  }

  if (response.status === 403) {
    throw new Error('Zapytanie zablokowane przez zabezpieczenia serwera (403).');
  }

  if (!response.ok) {
    throw new Error(`Błąd API: ${response.status}`);
  }

  const text = await response.text();
  if (!text || text.trim().length === 0) {
    return { data: null, rateLimits };
  }

  try {
    const data = JSON.parse(text);
    return { data, rateLimits };
  } catch (err) {
    throw new Error(`Błąd parsowania danych z API.`);
  }
}

/**
 * Search drugs by EAN code.
 */
export async function searchByEan(ean) {
  const cleaned = ean.replace(/\D/g, '');
  if (cleaned.length < 8 || cleaned.length > 14) {
    throw new Error('EAN musi mieć 8-14 cyfr.');
  }
  return apiRequest(`/v1/drugs/by-ean-page/${cleaned}?page=0&size=20`);
}

/**
 * Search drugs by active substance name.
 */
export async function searchBySubstance(substance, page = 0, size = 20) {
  return apiRequest(`/v1/drugs/by-subst-page/${encodeURIComponent(substance)}?page=${page}&size=${size}`);
}

/**
 * Search drugs by product name.
 */
export async function searchByName(name, page = 0, size = 20) {
  return apiRequest(`/v1/drugs/by-nazwa-page/${encodeURIComponent(name)}?page=${page}&size=${size}`);
}

/**
 * Get full drug record by ID.
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
 * Check if the API is reachable.
 */
export async function healthCheck() {
  try {
    const target = `${BASE_API_URL}/health/db`;
    const response = await fetch(`/api/proxy?url=${encodeURIComponent(target)}`);
    return response.ok;
  } catch {
    return false;
  }
}