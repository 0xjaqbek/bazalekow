export default async function handler(req, res) {
  const { url: targetUrl } = req.query;

  if (!targetUrl) return res.status(400).json({ error: 'Brak URL' });

  const cleanUrl = decodeURIComponent(targetUrl).trim();
  const apiKey = req.headers['x-api-key'] || process.env.DRUGS_API_KEY;

  if (!apiKey) {
    return res.status(401).json({ error: 'Brak klucza API w proxy' });
  }

  try {
    // Budujemy URL z kluczem w parametrze (najskuteczniejsza metoda autoryzacji)
    const urlObj = new URL(cleanUrl);
    urlObj.searchParams.set('apiKey', apiKey);

    const response = await fetch(urlObj.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9',
        'Cache-Control': 'no-cache'
      },
    });

    const body = await response.text();

    // Przekazujemy nagłówki limitów do frontendu
    const rateLimitHeaders = [
      'x-ratelimit-requests-remaining',
      'x-ratelimit-records-remaining',
      'x-ratelimit-requests-limit',
      'x-ratelimit-records-limit'
    ];

    rateLimitHeaders.forEach(h => {
      const val = response.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    // Obsługa blokady Cloudflare
    if (body.includes('efbc7cfa') || response.status === 403) {
      return res.status(403).json({ error: 'Serwer API zablokował połączenie automatyczne (WAF).' });
    }

    res.status(response.status);
    res.setHeader('Content-Type', 'application/json');
    return res.send(body);

  } catch (err) {
    return res.status(500).json({ error: 'Proxy Error', details: err.message });
  }
}