export default async function handler(req, res) {
  const { url: targetUrl } = req.query;

  if (!targetUrl) return res.status(400).json({ error: 'Brak URL' });

  // Czyścimy URL z ewentualnych spacji
  const cleanUrl = decodeURIComponent(targetUrl).trim();

  try {
    const response = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'X-API-Key': req.headers['x-api-key'] || process.env.DRUGS_API_KEY,
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Accept-Language': 'pl-PL,pl;q=0.9',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-site',
        'Pragma': 'no-cache'
      },
    });

    const body = await response.text();

    // Przekazujemy status i nagłówki limitów
    res.status(response.status);

    // Jeśli dostaniemy ten dziwny kod Cloudflare, zmieniamy status na 403, żebyś wiedział w konsoli
    if (body.includes('efbc7cfa')) {
      return res.status(403).json({ error: 'Blokada WAF/Cloudflare - Serwer odrzucił połączenie automatyczne.' });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.send(body);

  } catch (err) {
    return res.status(500).json({ error: 'Proxy Error', details: err.message });
  }
}