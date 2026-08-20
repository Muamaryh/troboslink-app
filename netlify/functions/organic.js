const { resolveBypass } = require('../../services/bypasser');
const { sendTelegramLog } = require('../../services/telegram');

// Rate limiting in memory (per IP window)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 menit
const MAX_REQUESTS_PER_WINDOW = 25; // Maks 25 request per menit

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.startTime > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  entry.count++;
  return false;
}

// Clean old entries periodically
if (rateLimitMap.size > 2000) {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now - v.startTime > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
  }
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method Not Allowed' }) };
  }

  // 1. Anti-Bot Filter (Block automated raw scraping libraries)
  const userAgent = (event.headers['user-agent'] || '').toLowerCase();
  const blockedBots = [
    'python-requests', 'aiohttp', 'curl/', 'wget/', 'scrapy', 'postmanruntime',
    'insomnia/', 'httpie/', 'axios/', 'go-http-client', 'urllib/', 'undici',
    'headlesschrome', 'puppeteer', 'playwright', 'selenium'
  ];
  if (userAgent && blockedBots.some(bot => userAgent.includes(bot))) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        status: 'blocked',
        code: 403,
        alert: '🚨 Ups, terdeteksi bot scraper / ngoprek!',
        message: 'Daripada ngoprek mending tf buat next update 😉',
        qris: {
          merchant_name: 'MARSZEN DIGITAL PREMIUM',
          nmid: 'ID1024325433604',
          image_url: '/qris.jpg'
        }
      })
    };
  }

  // 2. IP Rate Limiting
  const clientIp = event.headers['x-forwarded-for']?.split(',')[0]?.trim() || event.headers['client-ip'] || 'unknown';
  if (clientIp !== 'unknown' && isRateLimited(clientIp)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        status: 'rate_limited',
        code: 429,
        message: 'Terlalu banyak permintaan! Daripada ngoprek mending tf buat next update 😉',
        qris_url: '/qris.jpg'
      })
    };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body || {});
    if (!body.url) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Parameter URL diperlukan' }) };
    }

    const result = await resolveBypass(body.url);
    sendTelegramLog({ event, originalUrl: body.url, result }).catch(() => {});
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };
  } catch (err) {
    sendTelegramLog({ event, originalUrl: (typeof event.body === 'string' ? JSON.parse(event.body || '{}').url : event.body?.url) || 'Unknown', error: err.message }).catch(() => {});
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: 'Gagal memproses link' })
    };
  }
};
