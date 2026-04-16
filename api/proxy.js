export default async function handler(req, res) {
  // 1. Pobieramy pełną ścieżkę z zapytania (wszystko po /api/proxy?url=)
  const { url: targetUrl } = req.query;

  if (!targetUrl) {
    return res.status(400).json({ error: 'Brak parametru url w zapytaniu proxy' });
  }

  // 2. Przygotowujemy nagłówki - kluczowe dla uniknięcia blokady "bot"
  const headers = {
    // Przekazujemy klucz API wysłany z frontendu
    'X-API-Key': req.headers['x-api-key'] || '',
    'Accept': 'application/json',
    // Używamy User-Agent popularnej przeglądarki, aby oszukać WAF/Cloudflare
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://drugsapi.miniporadnia.pl/',
    'Cache-Control': 'no-cache'
  };

  try {
    // 3. Wykonujemy faktyczne zapytanie do DrugsAPI
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
    });

    // 4. Pobieramy nagłówki limitów z odpowiedzi, aby frontend mógł je wyświetlić
    const rateLimitHeaders = [
      'x-ratelimit-rps-limit',
      'x-ratelimit-rps-remaining',
      'x-ratelimit-requests-limit',
      'x-ratelimit-requests-remaining',
      'x-ratelimit-records-limit',
      'x-ratelimit-records-remaining',
      'retry-after'
    ];

    rateLimitHeaders.forEach(h => {
      const val = response.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    // 5. Ustawiamy status i typ zawartości zgodny z tym, co zwróciło API
    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    // 6. Odczytujemy body jako tekst
    const body = await response.text();

    // Logika bezpieczeństwa: Jeśli serwer zwrócił dziwny kod zamiast JSON, 
    // rzucamy błąd, aby frontend wiedział, że coś poszło nie tak.
    if (body.includes('efbc7cfa') || body.startsWith('rs;')) {
      console.error('Proxy: Wykryto blokadę Cloudflare/WAF');
      return res.status(403).json({
        error: 'Zapytanie zablokowane przez serwer bazy danych (Security Challenge).',
        details: 'Spróbuj ponownie za chwilę lub sprawdź klucz API.'
      });
    }

    return res.send(body);

  } catch (err) {
    console.error('Proxy Error:', err);
    return res.status(500).json({
      error: 'Błąd wewnętrzny proxy',
      details: err.message
    });
  }
}