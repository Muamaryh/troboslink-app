// Konfigurasi API Base URL
// - Jika di Railway, Render, Fly.io, atau Localhost: otomatis memakai backend server sendiri ("")
// - Jika di static host (Netlify / GitHub Pages): otomatis memakai backend API fallback
window.API_BASE = (
  location.protocol === "file:" || 
  location.hostname === "localhost" || 
  location.hostname === "127.0.0.1" ||
  location.hostname.includes("railway.app") ||
  location.hostname.includes("onrender.com") ||
  location.hostname.includes("fly.dev")
)
  ? ""
  : "https://linkspide.fly.dev";


