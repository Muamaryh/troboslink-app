const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const rootDir = path.resolve(__dirname, '..');
const srcBackupDir = path.join(rootDir, '.src_backup');

// Obfuscator Configuration (High Security + Serverless / Node.js Safe)
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false, // Nonaktifkan agar performa cepat & tidak merusak AST bundler
  ignoreRequireImports: true, // Penting! Menjaga require('...') tetap utuh untuk Netlify / Vercel bundler
  numbersToExpressions: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  stringArray: true,
  stringArrayEncoding: ['base64', 'rc4'],
  stringArrayThreshold: 0.8,
  transformObjectKeys: true,
  selfDefending: false,
  renameGlobals: false,
  reservedNames: ['require', 'module', 'exports', 'process', 'global', '__dirname', '__filename'],
  reservedStrings: ['axios', 'cheerio', 'express', 'cors', 'dotenv', 'path', 'fs', 'http', 'https', 'stream', 'url', 'crypto', 'zlib']
};

// Target Files to Obfuscate
const targetFiles = [
  'public/app.js',
  'public/security.js',
  'services/bypasser.js',
  'services/anichin.js',
  'services/streamer.js',
  'services/archive.js',
  'services/subtitle.js'
];

function backupCleanSources() {
  console.log('📦 Membuat cadangan source code bersih ke .src_backup/ ...');
  if (!fs.existsSync(srcBackupDir)) {
    fs.mkdirSync(srcBackupDir, { recursive: true });
  }

  targetFiles.forEach(file => {
    const fullPath = path.join(rootDir, file);
    const backupPath = path.join(srcBackupDir, file);
    const backupDirPath = path.dirname(backupPath);

    if (fs.existsSync(fullPath)) {
      if (!fs.existsSync(backupDirPath)) {
        fs.mkdirSync(backupDirPath, { recursive: true });
      }
      // Backup hanya jika belum ada cadangan atau file belum ter-obfuscate
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!content.includes('_0x') && !content.includes('JavaScriptObfuscator')) {
        fs.writeFileSync(backupPath, content, 'utf8');
        console.log(`  [Backup] ${file}`);
      }
    }
  });
}

function obfuscateFiles() {
  console.log('\n🔒 Meng-obfuscate source code JavaScript...');

  targetFiles.forEach(file => {
    const backupPath = path.join(srcBackupDir, file);
    const targetPath = path.join(rootDir, file);

    // Ambil dari source bersih di backup jika ada, atau file saat ini
    const sourceCode = fs.existsSync(backupPath)
      ? fs.readFileSync(backupPath, 'utf8')
      : fs.readFileSync(targetPath, 'utf8');

    try {
      const obfuscated = JavaScriptObfuscator.obfuscate(sourceCode, obfuscatorOptions);
      fs.writeFileSync(targetPath, obfuscated.getObfuscatedCode(), 'utf8');
      console.log(`  ✅ [Obfuscated] ${file}`);
    } catch (err) {
      console.error(`  ❌ [Error] Gagal meng-obfuscate ${file}:`, err.message);
    }
  });

  console.log('\n✨ Semua file JavaScript berhasil diobfuscate!');
  console.log('💡 Source code bersih kamu tersimpan aman di folder .src_backup/ (tidak akan ter-upload ke GitHub).');
}

function restoreCleanFiles() {
  console.log('🔄 Mengembalikan source code bersih dari .src_backup/ ...');
  targetFiles.forEach(file => {
    const backupPath = path.join(srcBackupDir, file);
    const targetPath = path.join(rootDir, file);

    if (fs.existsSync(backupPath)) {
      const content = fs.readFileSync(backupPath, 'utf8');
      fs.writeFileSync(targetPath, content, 'utf8');
      console.log(`  [Restored] ${file}`);
    }
  });
  console.log('✅ Source code kembali bersih untuk development!');
}

const action = process.argv[2] || 'obfuscate';
if (action === 'restore') {
  restoreCleanFiles();
} else {
  backupCleanSources();
  obfuscateFiles();
}
