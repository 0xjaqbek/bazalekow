export default async function handler(req, res) {
  const { path } = req.query;
  
  if (!path) {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  const BASE_URL = 'https://drugsapi.miniporadnia.pl';
  const url = `${BASE_URL}${path}`;

  const headers = {};
  // Forward the required headers (case-insensitive check)
  const apiKey = req.headers['x-api-key'] || req.headers['X-API-Key'];
  const acceptHeader = req.headers['accept'] || 'application/json';
  
  if (apiKey) headers['X-API-Key'] = apiKey;
  headers['Accept'] = acceptHeader;

  try {
    const response = await fetch(url, {
      method: req.method,
      headers
    });

    // proxy rate limit headers back to client
    const rateLimitHeaders = [
      'X-RateLimit-RPS-Limit', 
      'X-RateLimit-RPS-Remaining', 
      'X-RateLimit-Requests-Limit', 
      'X-RateLimit-Requests-Remaining', 
      'X-RateLimit-Records-Limit', 
      'X-RateLimit-Records-Remaining', 
      'Retry-After'
    ];
    
    rateLimitHeaders.forEach(h => {
      const val = response.headers.get(h);
      // Ensure lower case matching just in case
      const valLower = response.headers.get(h.toLowerCase());
      if (val) {
        res.setHeader(h, val);
      } else if (valLower) {
        res.setHeader(h, valLower);
      }
    });

    res.status(response.status);
    
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    const body = await response.text();
    return res.send(body);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy implementation error', details: err.message });
  }
}
