# ⚡ TrobosLink - AI Shortlink Bypass & Cloud Video Streamer

Aplikasi web full-stack modern clone & alternatif dari **TrobosLink** yang memiliki 2 fungsi utama:
1. **AI Shortlink Bypasser**: Membuka link bertingkat, Safelink, Bitly, MediaFire, Realslink, form tokens, dan redirect tanpa captcha / countdown.
2. **Cloud Video Streamer & Subtitle Finder**: Memutar video langsung dari PixelDrain, Google Drive, MediaFire, GoFile, Catbox, hingga video di dalam file `.zip` tanpa perlu download dulu, dilengkapi subtitle otomatis (Wyzie Subtitle API).

---

## 🚀 Fitur Utama

- 🔗 **Smart Link Resolver**:
  - Deteksi jenis link otomatis (`/api/check`).
  - Mengikuti redirect HTTP 301/302.
  - Ekstraksi direct download link (MediaFire, PixelDrain, GDrive, dll).
  - Unpack token Base64, URL-encoded redirects, meta refresh, dan script window.location.
  - Step-by-step progress visualizer & execution logs.
- 🎬 **Video Streaming Engine**:
  - Proxy video stream dengan handling header `Range` (`206 Partial Content`) untuk seeking instan.
  - Bypass CORS langsung ke HTML5 Video Player.
  - Pembaca file archive remote (`.zip`) via byte-range parser.
- 💬 **Subtitle Sub-System**:
  - Pencarian subtitle film/series otomatis menggunakan IMDb suggestion + Wyzie API (`sub.wyzie.io`).
  - Subtitle format converter (SRT ke WebVTT) secara otomatis.
- 🎛️ **Modern Dark-Themed UI & Custom Player**:
  - Tema dark neon glassmorphism responsif di HP & Laptop.
  - Custom controls: Play/Pause, Seeker, Volume, Speed Controller (0.5x - 2x), Subtitle toggle & Subtitle Font Size adjuster (`Aa 50%-200%`), PiP, dan Fullscreen.
  - Dukungan streaming HLS (`.m3u8`) dengan library `hls.js`.

---

## 📂 Struktur Project

```
troboslink-app/
├── package.json            # Daftar dependencies & scripts
├── server.js               # Express Server & API Router
├── Dockerfile              # Container deployment
├── services/
│   ├── bypasser.js         # Engine bypass shortlink
│   ├── streamer.js         # Video stream proxy & range request
│   ├── archive.js          # Remote Zip archive inspector
│   └── subtitle.js         # Wyzie subtitle & metadata search
├── public/
│   ├── index.html          # Web UI layout
│   ├── style.css           # Styling modern dark cyber neon
│   ├── app.js              # Client state, controller & player
│   └── config.js           # API Base URL config
└── README.md
```

---

## 💻 Cara Menjalankan di Komputer Lokal

### 1. Masuk ke folder project
```bash
cd troboslink-app
```

### 2. Install dependencies
```bash
npm install
```

### 3. Jalankan server
```bash
npm start
```
Atau jika ingin auto-reload saat koding:
```bash
npm run dev
```

### 4. Buka di Browser
Akses: **[http://localhost:3000](http://localhost:3000)**

---

## 🌐 Cara Deploy Gratis ke Cloud

### Opsi A: Deploy ke Fly.io (Seperti TrobosLink aslinya)
1. Install [Fly CLI](https://fly.io/docs/hands-on/install-flyctl/).
2. Login: `fly auth login`.
3. Jalankan:
   ```bash
   cd troboslink-app
   fly launch
   fly deploy
   ```

### Opsi B: Deploy ke Render.com / Railway
1. Push folder `troboslink-app` ke repository GitHub Anda.
2. Buat **New Web Service** di Render atau Railway.
3. Set **Build Command**: `npm install`.
4. Set **Start Command**: `npm start`.

---

## 📜 Lisensi
MIT License - Bebas dikembangkan & dimodifikasi.
