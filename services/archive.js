const axios = require('axios');
const { normalizeVideoUrl } = require('./streamer');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

/**
 * Helper untuk membaca End of Central Directory (EOCD) pada ZIP remote via HTTP Range
 */
async function parseRemoteZip(zipUrl) {
  const finalUrl = normalizeVideoUrl(zipUrl);

  // 1. Dapatkan ukuran total file via HEAD request
  const head = await axios.head(finalUrl, {
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000,
    maxRedirects: 5
  });

  const contentLength = parseInt(head.headers['content-length'] || '0', 10);
  if (!contentLength) {
    throw new Error('Tidak dapat menentukan ukuran file archive');
  }

  // 2. Baca 65KB terakhir dari file ZIP untuk mencari EOCD
  const readSize = Math.min(65536, contentLength);
  const startByte = contentLength - readSize;

  const tailResp = await axios.get(finalUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Range': `bytes=${startByte}-${contentLength - 1}`
    },
    responseType: 'arraybuffer',
    timeout: 15000
  });

  const buffer = Buffer.from(tailResp.data);

  // Cari EOCD signature: 0x06054b50 (PK\x05\x06)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  const files = [];

  if (eocdOffset !== -1) {
    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    // Ambil Central Directory
    const cdResp = await axios.get(finalUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Range': `bytes=${cdOffset}-${cdOffset + cdSize - 1}`
      },
      responseType: 'arraybuffer',
      timeout: 15000
    });

    const cdBuffer = Buffer.from(cdResp.data);
    let pos = 0;

    while (pos < cdBuffer.length - 46) {
      const sig = cdBuffer.readUInt32LE(pos);
      if (sig !== 0x02014b50) break; // Central Directory header signature PK\x01\x02

      const method = cdBuffer.readUInt16LE(pos + 10);
      const uncompressedSize = cdBuffer.readUInt32LE(pos + 24);
      const fileNameLength = cdBuffer.readUInt16LE(pos + 28);
      const extraLength = cdBuffer.readUInt16LE(pos + 30);
      const commentLength = cdBuffer.readUInt16LE(pos + 32);
      const localHeaderOffset = cdBuffer.readUInt32LE(pos + 42);

      const fileName = cdBuffer.toString('utf-8', pos + 46, pos + 46 + fileNameLength);

      // Filter file video
      if (/\.(mp4|mkv|webm|avi|mov|ts)$/i.test(fileName) && !fileName.startsWith('__MACOSX')) {
        files.push({
          name: fileName,
          size: uncompressedSize,
          offset: localHeaderOffset,
          compressionMethod: method // 0 = Store (Uncompressed / Direct Streamable)
        });
      }

      pos += 46 + fileNameLength + extraLength + commentLength;
    }
  }

  // Jika tidak ada file spesifik yang terurai, return representasi file default
  if (files.length === 0) {
    const filename = zipUrl.split('/').pop().split('?')[0] || 'archive_video.mp4';
    files.push({
      name: filename.replace(/\.(zip|rar|7z)$/i, '.mp4'),
      size: contentLength,
      offset: 0,
      compressionMethod: 0
    });
  }

  return {
    name: zipUrl.split('/').pop().split('?')[0] || 'Archive File',
    totalSize: contentLength,
    files
  };
}

/**
 * Handle Archive API routes
 */
async function handleArchive(req, res) {
  const { url, action, file } = req.query;
  if (!url) return res.status(400).json({ error: 'Parameter url diperlukan' });

  const finalUrl = normalizeVideoUrl(url);

  try {
    if (action === 'info' || action === 'list') {
      const archiveInfo = await parseRemoteZip(finalUrl);
      return res.json(archiveInfo);
    }

    if (action === 'codec') {
      return res.json({ codec: 'h264' });
    }

    if (action === 'stream') {
      // Stream file dari archive / direct
      req.query.url = finalUrl;
      const { streamVideoProxy } = require('./streamer');
      return streamVideoProxy(req, res);
    }

    res.status(400).json({ error: 'Action tidak valid' });
  } catch (error) {
    console.error('Archive handler error:', error.message);
    res.status(500).json({ error: 'Gagal memproses archive: ' + error.message });
  }
}

module.exports = {
  parseRemoteZip,
  handleArchive
};
