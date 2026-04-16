export default async function handler(req, res) {
  const { url: targetUrl } = req.query;

  if (!targetUrl) return res.status(400).json({ error: 'Brak URL' });

  // 1. Sprawdzamy klucz w różnych miejscach (case-insensitive)
  // Próbujemy małe litery, wielkie litery i zmienną środowiskową
  const apiKey = req.headers['x-api-key'] ||
    req.headers['X-API-Key'] ||
    process.env.DRUGS_API_KEY ||
    '4K2-BSyTP7OzEidtiiu7r5uHSJAI1oMukdmwvSPQ_sY'; // Wpisz tu świeży klucz na sztywno do testu

  if (!apiKey) {
    return res.status(401).json({ error: 'Proxy nadal nie widzi klucza API' });
  }

  try {
    const cleanUrl = decodeURIComponent(targetUrl);
    const finalUrl = new URL(cleanUrl);

    // 2. Wstrzykujemy klucz bezpośrednio do parametrów URL (najpewniejsza metoda)
    finalUrl.searchParams.set('apiKey', apiKey);

    const response = await fetch(finalUrl.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123.0.0.0'
      },
    });

    const body = await response.text();

    // 3. Obsługa specyficznych błędów DrugsAPI
    if (body.includes('efbc7cfa')) {
      return res.status(403).json({ error: 'Blokada WAF Cloudflare' });
    }

    res.status(response.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(body);

  } catch (err) {
    return res.status(500).json({ error: 'Błąd wewnętrzny proxy', details: err.message });
  }
}