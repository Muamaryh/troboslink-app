const axios = require('axios');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const WYZIE_KEY = 'wyzie-61f7quy31m8al8ll5m09l9lazhlvrd07';

/**
 * Konversi SRT Subtitle ke WebVTT
 */
function srtToVtt(srtText) {
  let vtt = 'WEBVTT\n\n';
  // Hapus BOM jika ada
  let content = srtText.replace(/^\uFEFF/, '');

  // Normalisasi line breaks
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Ganti format timestamp koma (00:01:23,456) ke titik (00:01:23.456)
  content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');

  vtt += content;
  return vtt;
}

/**
 * Proxy Subtitle & Konversi ke WebVTT
 */
async function proxySubtitle(req, res) {
  const subUrl = req.query.url;
  if (!subUrl) {
    return res.status(400).send('Parameter url subtitle diperlukan');
  }

  try {
    const response = await axios.get(subUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': '*/*'
      },
      responseType: 'text',
      timeout: 12000
    });

    let subtitleData = response.data;

    // Jika belum format WEBVTT, lakukan konversi
    if (!subtitleData.trim().startsWith('WEBVTT')) {
      subtitleData = srtToVtt(subtitleData);
    }

    res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(subtitleData);
  } catch (error) {
    console.error('Subtitle proxy error:', error.message);
    res.status(500).send('Gagal memuat subtitle: ' + error.message);
  }
}

/**
 * Metadata search (mencari IMDb ID & poster berdasarkan nama judul)
 */
async function searchMetadata(req, res) {
  const { title } = req.query;
  if (!title) {
    return res.status(400).json({ error: 'Parameter title diperlukan' });
  }

  try {
    // Gunakan free public TMDB/OMDB search atau IMDb suggestion API
    const imdbSuggestUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(title.toLowerCase().replace(/[^a-z0-9]/g, '_'))}.json`;
    const resp = await axios.get(imdbSuggestUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    const items = resp.data?.d || [];
    if (items.length > 0) {
      const top = items[0];
      return res.json({
        success: true,
        title: top.l || title,
        year: top.y || '',
        imdbId: top.id,
        poster: top.i?.imageUrl || ''
      });
    }

    res.json({
      success: false,
      title,
      imdbId: null
    });
  } catch (e) {
    res.json({
      success: false,
      title,
      imdbId: null,
      error: e.message
    });
  }
}

/**
 * Autocomplete search untuk film/series & subtitle availability
 */
async function searchShows(req, res) {
  const { q, lang } = req.query;
  if (!q || q.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const cleanQuery = q.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const imdbSuggestUrl = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(cleanQuery)}.json`;
    const resp = await axios.get(imdbSuggestUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 8000
    });

    const items = (resp.data?.d || []).slice(0, 6);
    const results = items.map((item) => ({
      title: item.l || q,
      year: item.y || 'N/A',
      type: item.q === 'feature' ? 'movie' : (item.q || 'movie'),
      imdbId: item.id,
      poster: item.i?.imageUrl || '',
      available: true,
      count: 1
    }));

    res.json({ results });
  } catch (err) {
    res.json({ results: [] });
  }
}

module.exports = {
  proxySubtitle,
  searchMetadata,
  searchShows
};
