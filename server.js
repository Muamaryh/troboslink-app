const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { detectService, resolveBypass } = require('./services/bypasser');
const { streamVideoProxy, checkCodec } = require('./services/streamer');
const { handleArchive } = require('./services/archive');
const { proxySubtitle, searchMetadata, searchShows } = require('./services/subtitle');
const { getSources, getFeed, searchDramas, getDramaDetail, getDramaEpisode } = require('./services/anichin');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory Rate Limiter
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 menit
const MAX_REQUESTS_PER_WINDOW = 30; // Max 30 request per menit per IP

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

// Clean old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now - v.startTime > RATE_LIMIT_WINDOW) rateLimitMap.delete(k);
  }
}, 60000);

// QRIS Anti-Bobol Payload Helper
function sendAntiBobolResponse(req, res, customReason = 'Bot / Automated Scraper Terdeteksi') {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol || 'http';
  const qrisUrl = `${protocol}://${host}/qris.jpg`;

  // Response text khusus untuk pengguna terminal / cURL
  if (ua.includes('curl') || ua.includes('wget') || ua.includes('httpie')) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(403).send(`
======================================================================
🚨 AKSES DITOLAK / ACCESS DENIED - TROBOSLINK GUARD
======================================================================
[!] Alasan: ${customReason}

💡 "Daripada ngoprek mending tf buat next update 😉"

👉 QRIS Donasi : MARSZEN DIGITAL PREMIUM
👉 NMID         : ID1024325433604
👉 Gambar QRIS  : ${qrisUrl}

Terima kasih atas dukungannya untuk kelanjutan server & fitur TrobosLink!
======================================================================
\n`);
  }

  // Response JSON standar untuk scraper / bot
  return res.status(403).json({
    status: 'blocked',
    code: 403,
    alert: '🚨 Ups, terdeteksi aktivitas bot / scraper / ngoprek!',
    reason: customReason,
    message: 'Daripada ngoprek mending tf buat next update 😉',
    qris: {
      merchant_name: 'MARSZEN DIGITAL PREMIUM',
      nmid: 'ID1024325433604',
      image_url: '/qris.jpg',
      full_url: qrisUrl,
      note: 'Dukung developer agar engine TrobosLink tetap online dan update terus!'
    }
  });
}

// Security Hardening
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  // Anti-Bot & Scraper Filter for API routes
  if (req.path.startsWith('/api/') && req.path !== '/api/health') {
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    
    // 1. Cek User-Agent Kosong
    if (!ua) {
      return sendAntiBobolResponse(req, res, 'Missing User-Agent Header');
    }

    // 2. Cek Automated Scraping Tools / Bot User-Agents
    const blockedBots = [
      'python-requests', 'aiohttp', 'curl/', 'wget/', 'scrapy', 'postmanruntime',
      'insomnia/', 'httpie/', 'axios/', 'go-http-client', 'urllib/', 'undici', 'java/',
      'apache-httpclient', 'okhttp/', 'libwww-perl', 'headlesschrome', 'puppeteer',
      'playwright', 'selenium', 'phantomjs', 'restsharp', 'colly', 'guzzlehttp', 'node-fetch/'
    ];

    if (blockedBots.some(bot => ua.includes(bot))) {
      return sendAntiBobolResponse(req, res, `Scraper / Bot Signature Terdeteksi (${ua.split(' ')[0]})`);
    }

    // 3. Rate Limiting per IP
    const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
    if (isRateLimited(clientIp)) {
      return res.status(429).json({
        status: 'rate_limited',
        code: 429,
        message: 'Terlalu banyak permintaan! Daripada ngoprek mending tf buat next update 😉',
        qris_url: '/qris.jpg'
      });
    }
  }
  next();
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// ===== API ROUTES =====

// 1. Deteksi service URL
app.post('/api/check', (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ valid: false, error: 'URL tidak boleh kosong' });
  }

  try {
    let cleanUrl = url.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;
    new URL(cleanUrl); // validasi format

    const serviceName = detectService(cleanUrl);
    res.json({
      valid: true,
      service: serviceName,
      url: cleanUrl
    });
  } catch (err) {
    res.status(400).json({ valid: false, error: 'Format URL tidak valid' });
  }
});

// 2. Resolver Bypass Shortlink
app.post(['/api/organic', '/api/bypass'], async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL tidak boleh kosong' });
  }

  try {
    const result = await resolveBypass(url);
    res.json(result);
  } catch (error) {
    console.error('Bypass error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Gagal memproses bypass URL'
    });
  }
});

// 3. Video Streaming Proxy (Range Request & Seeking)
app.all('/api/stream/stream', (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin, Content-Type');
    return res.status(204).end();
  }

  const { action } = req.query;
  if (action === 'codec') {
    return checkCodec(req, res);
  }

  return streamVideoProxy(req, res);
});

// 4. Archive Remote Video Reader & Streamer
app.get('/api/stream/archive', handleArchive);

// 5. Subtitle Proxy & Converter (SRT -> WebVTT)
app.get('/api/stream/subtitle', proxySubtitle);

// 6. Metadata & Title Search
app.get('/api/stream/metadata', searchMetadata);
app.get('/api/stream/search', searchShows);

// ===== AIO SHORT DRAMA API ROUTES (Anichin Official) =====
app.get('/api/drama/sources', (req, res) => {
  try {
    const sources = getSources();
    res.json({ success: true, sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/drama/feed', async (req, res) => {
  const { source = 'dramabox', type = 'trending', page = 1 } = req.query;
  try {
    const feed = await getFeed(source, type, Number(page));
    res.json(feed);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/drama/search', async (req, res) => {
  const { source = 'dramabox', query = '' } = req.query;
  try {
    const results = await searchDramas(source, query);
    res.json(results);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/drama/detail', async (req, res) => {
  const { source = 'dramabox', id } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'ID drama diperlukan' });
  try {
    const detail = await getDramaDetail(source, id);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/drama/episode', async (req, res) => {
  const { source = 'dramabox', id, ep = 1 } = req.query;
  if (!id) return res.status(400).json({ success: false, error: 'ID drama diperlukan' });
  try {
    const episode = await getDramaEpisode(source, id, Number(ep));
    res.json(episode);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Status & Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 8. QRIS / Donate Info Endpoint
app.get(['/api/qris', '/api/donate'], (req, res) => {
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol || 'http';
  res.json({
    quote: "Daripada ngoprek mending tf buat next update 😉",
    merchant_name: "MARSZEN DIGITAL PREMIUM",
    nmid: "ID1024325433604",
    qris_image: `${protocol}://${host}/qris.jpg`,
    message: "Terima kasih sudah mendukung TrobosLink!"
  });
});

// Fallback ke index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 TrobosLink App Server aktif di:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`=========================================`);
});
