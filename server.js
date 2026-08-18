const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { detectService, resolveBypass } = require('./services/bypasser');
const { streamVideoProxy, checkCodec } = require('./services/streamer');
const { handleArchive } = require('./services/archive');
const { proxySubtitle, searchMetadata, searchShows } = require('./services/subtitle');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Range', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// 7. Status & Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
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
