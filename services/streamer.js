const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Normalisasi URL video dari berbagai hoster
 */
async function normalizeVideoUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

  // PixelDrain: ubah /u/{id} ke /api/file/{id}
  const pd = url.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i);
  if (pd) {
    return `https://pixeldrain.com/api/file/${pd[1]}`;
  }

  // Google Drive: ubah /file/d/{id} ke direct stream
  const gd = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i);
  if (gd) {
    return `https://drive.google.com/uc?export=download&id=${gd[1]}`;
  }

  // MediaFire: scrape direct link jika link adalah halaman file
  if (url.includes('mediafire.com/file/')) {
    try {
      const cheerio = require('cheerio');
      const mfRes = await axios.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 8000 });
      const $ = cheerio.load(mfRes.data);
      const direct = $('#downloadButton').attr('href') || $('a[aria-label="Download file"]').attr('href');
      if (direct && direct.startsWith('http')) return direct;
    } catch {}
  }

  return url;
}

/**
 * Proxy stream video dengan Range header (Seeking support & CORS)
 */
async function streamVideoProxy(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Parameter url diperlukan' });
  }

  const finalUrl = await normalizeVideoUrl(targetUrl);
  const range = req.headers.range;

  const requestHeaders = {
    'User-Agent': USER_AGENT,
    'Accept': '*/*',
    'Referer': finalUrl
  };

  if (range) {
    requestHeaders['Range'] = range;
  }

  try {
    const upstream = await axios({
      method: req.method,
      url: finalUrl,
      headers: requestHeaders,
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 30000,
      validateStatus: (s) => s >= 200 && s < 400
    });

    // Forward status (200 / 206)
    res.status(upstream.status);

    // Forward essential media headers
    const forwardHeaders = [
      'content-range',
      'content-length',
      'content-type',
      'accept-ranges',
      'last-modified',
      'etag',
      'cache-control'
    ];

    forwardHeaders.forEach((header) => {
      if (upstream.headers[header]) {
        res.setHeader(header, upstream.headers[header]);
      }
    });

    // Default media headers jika upstream tidak menyertakan
    if (!res.getHeader('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    if (!res.getHeader('content-type')) {
      res.setHeader('Content-Type', 'video/mp4');
    }

    // Izinkan CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Origin, Content-Type');

    if (req.method === 'HEAD') {
      return res.end();
    }

    upstream.data.pipe(res);

    upstream.data.on('error', (err) => {
      console.error('Stream piping error:', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    req.on('close', () => {
      if (upstream.data && typeof upstream.data.destroy === 'function') {
        upstream.data.destroy();
      }
    });

  } catch (error) {
    console.error('Streaming error:', error.message);
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({
        error: 'Gagal memuat video stream: ' + error.message
      });
    }
  }
}

/**
 * Cek metadata / codec file video
 */
async function checkCodec(req, res) {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Parameter url diperlukan' });
  }

  const finalUrl = await normalizeVideoUrl(targetUrl);

  try {
    const head = await axios.head(finalUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 5
    });

    const contentType = head.headers['content-type'] || '';
    let codec = 'other';

    if (contentType.includes('hevc') || contentType.includes('hvc1')) {
      codec = 'hevc';
    } else if (contentType.includes('mp4') || contentType.includes('webm')) {
      codec = 'h264';
    }

    res.json({
      success: true,
      url: finalUrl,
      contentType,
      contentLength: head.headers['content-length'] || 0,
      codec
    });
  } catch (e) {
    res.json({
      success: false,
      codec: 'other',
      error: e.message
    });
  }
}

module.exports = {
  normalizeVideoUrl,
  streamVideoProxy,
  checkCodec
};
