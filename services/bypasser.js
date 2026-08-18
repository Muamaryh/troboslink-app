const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// List domain shortlink terproteksi yang membutuhkan solver lanjutan
const PROTECTED_SERVICES = [
  'shrinkme', 'shrinke', 'linkvertise', 'link-to.net', 'up-to-down.net', 'direct-link.net', 'link-target.net',
  'ouo.io', 'ouo.press', 'oii.la', 'oii.io',
  'droplink', 'adfly', 'adf.ly', 'adshrink', 'tinyurl.is', 
  'exe.io', 'gplinks', 'cuty.io', 'traffic1s', 'realslink', 'safelink',
  'shorturl', 'sfl.gl', 'sh.st', 'bit.ly', 'cutt.ly', 'is.gd', 'v.gd', 'gdflix'
];

/**
 * Deteksi nama service / tipe link
 */
function detectService(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    if (host.includes('shrinkme') || host.includes('shrinke.me')) return 'ShrinkMe';
    if (host.includes('ouo.io') || host.includes('ouo.press') || host.includes('oii.la') || host.includes('oii.io')) return 'Ouo.io';
    if (host.includes('linkvertise') || host.includes('link-to.net') || host.includes('direct-link.net')) return 'Linkvertise';
    if (host.includes('pixeldrain.com')) return 'PixelDrain';
    if (host.includes('mediafire.com')) return 'MediaFire';
    if (host.includes('drive.google.com') || host.includes('docs.google.com')) return 'Google Drive';
    if (host.includes('gofile.io')) return 'GoFile';
    if (host.includes('mega.nz') || host.includes('mega.co.nz')) return 'Mega';
    if (host.includes('catbox.moe') || host.includes('files.catbox.moe')) return 'Catbox';
    if (host.includes('droplink')) return 'DropLink';
    if (host.includes('adfly') || host.includes('adf.ly')) return 'Adfly';
    if (host.includes('gplinks')) return 'GPLinks';
    if (host.includes('exe.io')) return 'Exe.io';
    if (host.includes('cuty.io')) return 'Cuty.io';
    if (host.includes('traffic1s')) return 'Traffic1s';
    if (host.includes('bit.ly')) return 'Bitly';
    if (host.includes('tinyurl')) return 'TinyURL';
    if (host.includes('cutt.ly')) return 'Cuttly';
    if (host.includes('is.gd') || host.includes('v.gd')) return 'Is.gd';
    if (host.includes('safelink') || host.includes('realslink') || host.includes('duit')) return 'Safelink';

    return 'Generic Shortlink / URL';
  } catch {
    return 'Unknown Service';
  }
}

/**
 * Cek apakah URL merupakan domain shortlink terproteksi
 */
function isProtectedDomain(urlStr) {
  const lower = (urlStr || '').toLowerCase();
  return PROTECTED_SERVICES.some(domain => lower.includes(domain));
}

/**
 * Ekstraksi link tersembunyi dari query parameter (Base64 / URL encoded)
 */
function extractFromQueryParams(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const candidateKeys = ['url', 'link', 'dest', 'destination', 'target', 'go', 'download', 'r', 'to', 'u', 'redirect', 'file'];

    for (const key of candidateKeys) {
      const val = parsed.searchParams.get(key);
      if (!val) continue;

      if (/^https?:\/\//i.test(val)) {
        return val;
      }

      try {
        const decoded = Buffer.from(val, 'base64').toString('utf-8');
        if (/^https?:\/\//i.test(decoded)) {
          return decoded;
        }
      } catch {}

      try {
        const decodedUri = decodeURIComponent(val);
        if (/^https?:\/\//i.test(decodedUri)) {
          return decodedUri;
        }
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * Ekstraksi dari Script & Meta HTML
 */
function extractFromHtml(html, currentUrl) {
  try {
    const $ = cheerio.load(html);

    // 1. Meta refresh redirect
    const metaRefresh = $('meta[http-equiv="refresh" i]').attr('content');
    if (metaRefresh) {
      const match = metaRefresh.match(/url=(.*)/i);
      if (match && match[1]) {
        let refreshUrl = match[1].replace(/['"]/g, '').trim();
        if (refreshUrl.startsWith('//')) refreshUrl = 'https:' + refreshUrl;
        else if (refreshUrl.startsWith('/')) refreshUrl = new URL(refreshUrl, currentUrl).href;
        return refreshUrl;
      }
    }

    // 2. MediaFire download button
    if (currentUrl.includes('mediafire.com')) {
      const mediafireBtn = $('#downloadButton').attr('href') || $('a[aria-label="Download file"]').attr('href') || $('.input[aria-label="Download file"]').attr('href');
      if (mediafireBtn) return mediafireBtn;
    }

    // 3. Cari Script window.location redirect / atob / safe link pattern
    const scripts = $('script').map((i, el) => $(el).html() || '').get().join('\n');

    const locMatch = scripts.match(/(?:window\.location(?:\.href)?|location\.replace)\s*=\s*['"`](https?:\/\/[^'"`]+)['"`]/i);
    if (locMatch && locMatch[1]) {
      return locMatch[1];
    }

    const atobMatches = scripts.matchAll(/atob\(['"`]([A-Za-z0-9+/=]+)['"`]\)/g);
    for (const m of atobMatches) {
      try {
        const decoded = Buffer.from(m[1], 'base64').toString('utf-8');
        if (/^https?:\/\//i.test(decoded)) {
          return decoded;
        }
      } catch {}
    }

    const urlVarMatch = scripts.match(/(?:download_url|final_url|target_url|redirect_url|direct_link)\s*=\s*['"`](https?:\/\/[^'"`]+)['"`]/i);
    if (urlVarMatch && urlVarMatch[1]) {
      return urlVarMatch[1];
    }
  } catch {}
  return null;
}

/**
 * Resolver lanjutan untuk shortlink kompleks / ber-proteksi (AdLinkFly, ShrinkMe, Turnstile, dll)
 */
async function resolveViaAdvancedEngine(targetUrl, logs) {
  logs.push('Calling advanced bypass engine...');
  try {
    const resp = await axios.post('https://linkspide.fly.dev/api/organic', {
      url: targetUrl
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT
      },
      timeout: 25000
    });

    if (resp.data && resp.data.success && resp.data.resolved) {
      if (Array.isArray(resp.data.logs)) {
        resp.data.logs.forEach(l => logs.push(l));
      } else {
        logs.push(`Advanced engine OK -> ${resp.data.resolved}`);
      }
      return resp.data.resolved;
    }
  } catch (err) {
    logs.push(`Advanced engine fallback error: ${err.message}`);
  }
  return null;
}

/**
 * Scrape direct download link dari MediaFire
 */
async function extractMediaFireDirect(mediafireUrl, logs) {
  try {
    logs.push('Scraping MediaFire direct download link...');
    const res = await axios.get(mediafireUrl, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const directLink = $('#downloadButton').attr('href') || $('a[aria-label="Download file"]').attr('href');
    if (directLink && directLink.startsWith('http')) {
      logs.push(`MediaFire direct link found: ${directLink}`);
      return directLink;
    }
  } catch {}
  return mediafireUrl;
}

/**
 * Resolver Utama Shortlink Multi-Tier
 */
async function resolveBypass(targetUrl) {
  const startTime = Date.now();
  let currentUrl = targetUrl.trim();
  if (!/^https?:\/\//i.test(currentUrl)) {
    currentUrl = 'https://' + currentUrl;
  }

  const logs = [];
  const hops = [currentUrl];
  const serviceName = detectService(currentUrl);

  logs.push(`Service Detected: ${serviceName}`);
  logs.push(`Initial URL: ${currentUrl}`);

  // Handler instan: PixelDrain
  const pdMatch = currentUrl.match(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i);
  if (pdMatch) {
    const directPd = `https://pixeldrain.com/api/file/${pdMatch[1]}`;
    logs.push(`PixelDrain direct converted: ${directPd}`);
    return {
      success: true,
      originalUrl: targetUrl,
      resolved: directPd,
      service: 'PixelDrain',
      hops: [currentUrl, directPd],
      logs,
      elapsedMs: Date.now() - startTime
    };
  }

  // Handler instan: Google Drive
  const gdMatch = currentUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i);
  if (gdMatch) {
    const directGd = `https://drive.google.com/uc?export=download&id=${gdMatch[1]}`;
    logs.push(`Google Drive direct converted: ${directGd}`);
    return {
      success: true,
      originalUrl: targetUrl,
      resolved: directGd,
      service: 'Google Drive',
      hops: [currentUrl, directGd],
      logs,
      elapsedMs: Date.now() - startTime
    };
  }

  // Handler instan: MediaFire direct file
  if (currentUrl.includes('mediafire.com/file/')) {
    logs.push('MediaFire file page detected, extracting direct download link...');
    const directMf = await extractMediaFireDirect(currentUrl, logs);
    if (directMf && directMf !== currentUrl) {
      hops.push(directMf);
      return {
        success: true,
        originalUrl: targetUrl,
        resolved: directMf,
        service: 'MediaFire',
        hops: [...new Set(hops)],
        logs,
        elapsedMs: Date.now() - startTime
      };
    }
  }

  // Jika terdeteksi shortlink berproteksi khusus (ShrinkMe, Linkvertise, Droplink, dll), langsung gunakan solver engine
  if (isProtectedDomain(currentUrl)) {
    logs.push(`Protected service detected (${serviceName}), using multi-strategy solver...`);
    const advancedResolved = await resolveViaAdvancedEngine(currentUrl, logs);
    if (advancedResolved && advancedResolved !== currentUrl) {
      currentUrl = advancedResolved;
      hops.push(currentUrl);

      // Jika hasilnya adalah MediaFire, coba ambil direct download link-nya juga
      if (currentUrl.includes('mediafire.com/file/')) {
        const directMf = await extractMediaFireDirect(currentUrl, logs);
        if (directMf && directMf !== currentUrl) {
          currentUrl = directMf;
          hops.push(currentUrl);
        }
      }

      return {
        success: true,
        originalUrl: targetUrl,
        resolved: currentUrl,
        service: serviceName,
        hops: [...new Set(hops)],
        logs,
        elapsedMs: Date.now() - startTime
      };
    }
  }

  // Tahap Standar: Tracking Redirect HTTP & Parsing HTML
  let maxHops = 8;
  logs.push('Executing HTTP redirect tracer...');

  while (maxHops > 0) {
    // 1. Cek parameter query
    const queryExtract = extractFromQueryParams(currentUrl);
    if (queryExtract && queryExtract !== currentUrl) {
      logs.push(`Extracted from query param -> ${queryExtract}`);
      currentUrl = queryExtract;
      hops.push(currentUrl);
      continue;
    }

    try {
      const resp = await axios.get(currentUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': 'https://www.google.com/'
        },
        maxRedirects: 5,
        timeout: 12000,
        maxContentLength: 2 * 1024 * 1024,
        validateStatus: (status) => status < 400 || (status >= 300 && status < 400)
      });

      const nextUrl = resp.request?.res?.responseUrl || resp.headers?.location || currentUrl;

      // 2. Ekstraksi dari HTML body
      if (typeof resp.data === 'string') {
        const htmlExtract = extractFromHtml(resp.data, nextUrl);
        if (htmlExtract && htmlExtract !== nextUrl && htmlExtract !== currentUrl) {
          logs.push(`Extracted from HTML content -> ${htmlExtract}`);
          currentUrl = htmlExtract;
          hops.push(currentUrl);
          maxHops--;
          continue;
        }
      }

      if (nextUrl && nextUrl !== currentUrl) {
        logs.push(`Redirected -> ${nextUrl}`);
        currentUrl = nextUrl;
        hops.push(currentUrl);
        maxHops--;
        continue;
      }

      break;
    } catch (err) {
      logs.push(`Tracer note: ${err.message}`);
      if (err.request?.res?.responseUrl) {
        currentUrl = err.request.res.responseUrl;
        hops.push(currentUrl);
      }
      break;
    }
  }

  // Jika setelah redirect URL masih sama dengan input awal dan merupakan domain shortlink
  if (currentUrl === targetUrl && (isProtectedDomain(currentUrl) || serviceName !== 'Generic Shortlink / URL')) {
    logs.push('Basic tracer did not reach destination. Triggering advanced bypass engine fallback...');
    const advancedResolved = await resolveViaAdvancedEngine(targetUrl, logs);
    if (advancedResolved && advancedResolved !== targetUrl) {
      currentUrl = advancedResolved;
      hops.push(currentUrl);
    }
  }

  // Final check: MediaFire direct link
  if (currentUrl.includes('mediafire.com/file/')) {
    const directMf = await extractMediaFireDirect(currentUrl, logs);
    if (directMf && directMf !== currentUrl) {
      currentUrl = directMf;
      hops.push(currentUrl);
    }
  }

  const isSuccess = currentUrl !== targetUrl || (!isProtectedDomain(currentUrl) && !currentUrl.includes('shrinkme'));

  if (!isSuccess) {
    logs.push('Bypass unresolvable for this link or blocked by anti-bot captcha.');
  } else {
    logs.push(`DONE in ${(Date.now() - startTime)}ms -> ${currentUrl}`);
  }

  return {
    success: isSuccess,
    originalUrl: targetUrl,
    resolved: currentUrl,
    service: serviceName,
    hops: [...new Set(hops)],
    logs,
    elapsedMs: Date.now() - startTime,
    error: isSuccess ? null : 'Gagal membypass link ini (Anti-bot Captcha aktif atau link sudah kedaluwarsa)'
  };
}

module.exports = {
  detectService,
  resolveBypass
};
