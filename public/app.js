let resultUrl = null;
const API_BASE = window.API_BASE || "";

function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if (e) e.classList.remove("hidden"); }
function hide(id) { const e = el(id); if (e) e.classList.add("hidden"); }

function setStatus(msg, type = "") {
  const s = el("status");
  if (!s) return;
  s.textContent = msg;
  s.className = "status " + type;
  show("status");
}

function appendLog(msg) {
  const log = el("logSteps");
  if (!log) return;
  const d = document.createElement("div");
  d.className = "log-entry";
  d.innerHTML = '<span class="log-dot"></span><span class="log-msg">' + msg + '</span>';
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

function addStep(text, state = "active") {
  const c = el("progressSteps");
  if (!c) return;
  const d = document.createElement("div");
  d.className = "progress-step " + state;
  d.innerHTML = (state === "done" ? "&#10003;" : state === "err" ? "&#10007;" : "&#9679;") + " " + text;
  c.appendChild(d);
}

function setProgress(pct) {
  const bar = el("progressFill");
  if (bar) bar.style.width = pct + "%";
}

function showResult(url) {
  resultUrl = url;
  el("finalUrl").textContent = url;
  el("resultTags").innerHTML =
    '<span class="tag tag-service">' + (el("detectedName")?.textContent || "Direct") + '</span>' +
    '<span class="tag tag-speed">organic</span>' +
    '<span class="tag tag-steps">' + (el("progressSteps")?.children.length || 1) + ' steps</span>';
  show("result");
}

function copyResult() {
  if (!resultUrl) return;
  navigator.clipboard.writeText(resultUrl).then(() => {
    const b = el("copyResultBtn");
    const orig = b.innerHTML;
    b.textContent = "Copied!";
    setTimeout(() => { b.innerHTML = orig; }, 2000);
  });
}

function openResult() {
  if (resultUrl) {
    window.open(resultUrl, "_blank", "noopener,noreferrer");
  }
}

function normalizeUrl(raw) {
  let url = (raw || "").trim();
  if (url && !/^[a-zA-Z]+:\/\//.test(url)) url = "https://" + url;
  return url;
}

// ===== TAB SWITCHER =====
function switchTab(name) {
  const tabs = ["bypass", "stream"];
  const map = {
    bypass: { tab: "tabBypass", panel: "panelBypass" },
    stream: { tab: "tabStream", panel: "panelStream" },
  };
  tabs.forEach((t) => {
    const active = t === name;
    el(map[t].tab)?.classList.toggle("active", active);
    el(map[t].panel)?.classList.toggle("hidden", !active);
  });
}

// ===== RESOLVE BYPASS =====
async function resolve() {
  let url = normalizeUrl(el("urlInput").value);
  if (!url) { el("urlInput").focus(); return; }
  el("urlInput").value = url;

  const btn = el("resolveBtn");
  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "Bypassing...";
  hide("result"); hide("logs");
  show("progress");
  el("progressSteps").innerHTML = "";
  setProgress(0);

  setStatus("Menganalisis link...", "loading");
  addStep("Deteksi Service");
  setProgress(15);

  try {
    const r = await fetch(API_BASE + "/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const d = await r.json();
    if (!d.valid) throw new Error(d.error || "Format URL tidak valid");

    el("detectedName").textContent = d.service;
    show("detectedBadge");
    setProgress(35);
  } catch (e) {
    setStatus(e.message, "error");
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "Bypass";
    return;
  }

  show("logs");
  el("logSteps").innerHTML = "";
  const t0 = Date.now();

  appendLog("Menjalankan Organic Bypasser...");
  addStep("Bypass Redirects");
  setProgress(55);

  try {
    const res = await fetch(API_BASE + "/api/organic", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    el("logsTime").textContent = elapsed + "s";

    if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
      el("logSteps").innerHTML = "";
      data.logs.forEach(l => appendLog(l));
    } else if (data.hops && data.hops.length > 1) {
      data.hops.forEach((h, idx) => {
        appendLog(`Hop #${idx + 1}: ${h.substring(0, 60)}...`);
      });
    }

    if (data.success) {
      setProgress(100);
      addStep("Selesai", "done");
      setStatus("Bypass berhasil! (" + elapsed + "s)", "organic");
      showResult(data.resolved || data.url);
      el("statSpeed").textContent = elapsed + "s";
    } else {
      setProgress(70);
      addStep("Gagal", "err");
      setStatus(data.error || "Gagal membypass link ini", "error");
      appendLog(data.error || "Bypass gagal");
    }
  } catch (e) {
    setStatus("Koneksi ke server gagal: " + e.message, "error");
    appendLog(e.message);
    addStep("Error", "err");
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "Bypass";
  }
}

// Live link check saat mengetik
el("urlInput")?.addEventListener("input", async () => {
  const url = normalizeUrl(el("urlInput").value);
  if (url.length > 12) {
    try {
      const r = await fetch(API_BASE + "/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });
      const d = await r.json();
      if (d.valid) {
        el("detectedName").textContent = d.service;
        show("detectedBadge");
      } else {
        hide("detectedBadge");
      }
    } catch {}
  } else {
    hide("detectedBadge");
  }
});
el("urlInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") resolve(); });

// ===== VIDEO STREAMING LOGIC =====
const WYZIE_KEY = "wyzie-61f7quy31m8al8ll5m09l9lazhlvrd07";
let streamHistory = JSON.parse(localStorage.getItem("troboslink_history") || "[]");
let suggestDebounce = null;

function isArchiveLink(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return p.endsWith(".zip") || p.endsWith(".rar") || p.endsWith(".7z");
  } catch { return false; }
}

function showStreamError(msg) {
  const e = el("streamError");
  if (!e) return;
  e.textContent = msg;
  show("streamError");
}
function hideStreamError() { hide("streamError"); }

function showSubStatus(msg, type = "ok") {
  const s = el("streamSubStatus");
  if (!s) return;
  s.textContent = msg;
  s.className = "sub-status " + type;
  show("streamSubStatus");
}
function hideSubStatus() { hide("streamSubStatus"); }

function showSubSearchStatus(msg, type = "ok", loading = false) {
  const s = el("subSearchStatus");
  if (!s) return;
  s.innerHTML = (loading ? '<span class="spinner-anim">&#9696;</span> ' : '') + msg;
  s.className = "sub-status " + type;
  show("subSearchStatus");
}

function applySubtitleTrack(subUrl, isExplicit = false) {
  const video = el("streamVideo");
  if (!video) return;
  const existing = video.querySelectorAll("track");
  existing.forEach(t => t.remove());

  if (!subUrl) {
    el("subToggleBtn").textContent = "CC";
    return;
  }

  const track = document.createElement("track");
  track.src = subUrl;
  track.kind = "subtitles";
  track.srclang = "id";
  track.label = "Subtitle";
  track.default = true;

  track.onload = () => {
    showSubStatus("Subtitle aktif", "ok");
    el("subToggleBtn").textContent = "CC ON";
  };
  track.onerror = () => {
    if (isExplicit) {
      showSubStatus("Gagal memuat file subtitle", "error");
    } else {
      hideSubStatus();
    }
  };

  video.appendChild(track);
  if (video.textTracks && video.textTracks.length > 0) {
    video.textTracks[video.textTracks.length - 1].mode = "showing";
  }
  el("subToggleBtn").textContent = "CC ON";
}

async function loadSubtitle() {
  const subUrl = el("subUrlInput")?.value.trim();
  if (!subUrl) return;
  showSubStatus("Memuat subtitle...", "ok");
  try {
    applySubtitleTrack(`${API_BASE}/api/stream/subtitle?url=${encodeURIComponent(subUrl)}`, true);
  } catch (e) {
    showSubStatus("Gagal: " + e.message, "error");
  }
}

function toggleSubtitles() {
  const video = el("streamVideo");
  if (!video || !video.textTracks) return;
  let showing = false;
  for (let i = 0; i < video.textTracks.length; i++) {
    video.textTracks[i].mode = video.textTracks[i].mode === "showing" ? "hidden" : "showing";
    if (video.textTracks[i].mode === "showing") showing = true;
  }
  el("subToggleBtn").textContent = showing ? "CC ON" : "CC OFF";
}

function togglePip() {
  const video = el("streamVideo");
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  } else if (video && video.requestPictureInPicture) {
    video.requestPictureInPicture().catch(() => {});
  }
}

function toggleFullscreen() {
  const box = el("playerBox");
  if (!document.fullscreenElement) {
    box.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function setStreamUrl(url, isHls = false) {
  const video = el("streamVideo");
  if (!video) return;

  if (window._hls) {
    try { window._hls.destroy(); } catch {}
    window._hls = null;
  }

  show("playerWrapper");
  el("centerOverlay")?.classList.remove("hidden-overlay");
  el("curTime").textContent = "0:00";
  el("durTime").textContent = "0:00";
  el("seekBar").value = 0;

  if (isHls && window.Hls && Hls.isSupported()) {
    const hls = new Hls({ maxBufferLength: 30 });
    window._hls = hls;
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
    return;
  }

  hideStreamError();
  video.onerror = () => {
    showStreamError("Tidak dapat memuat video dari link ini. Pastikan link adalah link file video langsung (seperti PixelDrain, Google Drive, Catbox, atau Direct .MP4).");
  };
  video.onloadeddata = () => {
    hideStreamError();
  };

  video.src = url;
  video.load();
}

// Handle Zip Archive File List
async function loadArchiveContents(archiveUrl) {
  show("archiveLoading");
  el("archiveList").innerHTML = "";
  hide("archiveFiles");

  try {
    const res = await fetch(`${API_BASE}/api/stream/archive?url=${encodeURIComponent(archiveUrl)}&action=list`);
    if (!res.ok) throw new Error("Gagal membaca isi archive");
    const data = await res.json();
    hide("archiveLoading");

    const list = el("archiveList");
    list.innerHTML = "";
    show("archiveFiles");

    (data.files || []).forEach((file) => {
      const btn = document.createElement("button");
      btn.className = "archive-item";
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        <span class="archive-name">${file.name}</span>
        <span class="archive-size">${sizeMB} MB</span>
      `;
      btn.onclick = () => {
        const streamUrl = `${API_BASE}/api/stream/archive?url=${encodeURIComponent(archiveUrl)}&action=stream&file=${encodeURIComponent(file.name)}`;
        setStreamUrl(streamUrl);
        document.querySelectorAll(".archive-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      };
      list.appendChild(btn);
    });

    if (data.files && data.files.length > 0) {
      list.children[0]?.click();
    }
  } catch (e) {
    hide("archiveLoading");
    showStreamError("Error archive: " + e.message);
  }
}

// Stream Action Handler
async function handleStream() {
  const urlInput = el("streamUrlInput");
  let url = normalizeUrl(urlInput.value);
  if (!url) { urlInput.focus(); return; }
  urlInput.value = url;

  hideStreamError();
  hide("subResults");
  hide("archiveFiles");

  const btn = el("streamBtn");
  btn.disabled = true;
  btn.querySelector(".btn-text").textContent = "Loading...";

  try {
    if (isArchiveLink(url)) {
      await loadArchiveContents(url);
      btn.disabled = false;
      btn.querySelector(".btn-text").textContent = "Stream";
      return;
    }

    const proxyStreamUrl = `${API_BASE}/api/stream/stream?url=${encodeURIComponent(url)}`;
    const isHls = url.includes(".m3u8");
    setStreamUrl(proxyStreamUrl, isHls);

    // Simpan ke riwayat
    streamHistory = [{ url, time: new Date().toLocaleTimeString() }, ...streamHistory.filter(h => h.url !== url)].slice(0, 10);
    localStorage.setItem("troboslink_history", JSON.stringify(streamHistory));
    renderHistory();

    // Auto load subtitle jika disediakan
    const customSub = el("subUrlInput")?.value.trim();
    if (customSub) {
      loadSubtitle();
    } else if (url.includes("pixeldrain.com")) {
      const pdId = url.match(/\/u\/([a-zA-Z0-9_-]+)/);
      if (pdId) {
        applySubtitleTrack(`${API_BASE}/api/stream/subtitle?url=${encodeURIComponent(`https://pixeldrain.com/api/file/${pdId[1]}.srt`)}`);
      }
    }
  } catch (e) {
    showStreamError(e.message || "Gagal memutar video");
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-text").textContent = "Stream";
  }
}

function renderHistory() {
  if (!streamHistory || streamHistory.length === 0) { hide("streamHistory"); return; }
  const ul = el("historyList");
  if (!ul) return;
  ul.innerHTML = "";
  show("streamHistory");
  streamHistory.forEach((h) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="history-url">${h.url}</span><span class="history-time">${h.time}</span>`;
    li.onclick = () => {
      el("streamUrlInput").value = h.url;
      handleStream();
    };
    ul.appendChild(li);
  });
}

// ===== SUBTITLE SEARCH & AUTOCOMPLETE =====
async function searchByTitle() {
  const t = el("titleInput")?.value.trim();
  if (!t) return;
  const lang = el("subLangSelect")?.value || "id";
  showSubSearchStatus("Mencari metadata & subtitle...", "ok", true);
  el("subResults").innerHTML = "";

  try {
    const metaRes = await fetch(`${API_BASE}/api/stream/metadata?title=${encodeURIComponent(t)}`);
    const meta = await metaRes.json();

    if (meta.imdbId) {
      el("imdbBadge").textContent = meta.imdbId;
      show("imdbBadge");
      el("movieTitle").textContent = meta.title || t;
      show("movieInfo");

      // Cari di Wyzie API
      const params = new URLSearchParams({ id: meta.imdbId, key: WYZIE_KEY, source: "all" });
      if (lang) params.set("language", lang);

      const subRes = await fetch(`https://sub.wyzie.io/search?${params}`);
      const subs = await subRes.json();

      if (Array.isArray(subs) && subs.length > 0) {
        renderSubResults(subs);
        showSubSearchStatus(`Ditemukan ${subs.length} subtitle untuk "${meta.title}"`, "ok", false);

        // Auto pasang subtitle pertama
        const first = subs[0];
        if (first.url) {
          applySubtitleTrack(`${API_BASE}/api/stream/subtitle?url=${encodeURIComponent(first.url)}`, true);
        }
      } else {
        showSubSearchStatus("Tidak ditemukan subtitle untuk bahasa ini", "error", false);
      }
    } else {
      showSubSearchStatus("Tidak dapat menemukan IMDb ID untuk judul tersebut", "error", false);
    }
  } catch (e) {
    showSubSearchStatus("Pencarian subtitle gagal: " + e.message, "error", false);
  }
}

function renderSubResults(subs) {
  const container = el("subResults");
  container.innerHTML = "";
  show("subResults");

  subs.forEach((sub, idx) => {
    const btn = document.createElement("button");
    btn.className = "sub-result-chip" + (idx === 0 ? " auto-loaded" : "");
    btn.innerHTML = `
      <span>${sub.display || sub.fileName || "Subtitle"}</span>
      <span class="tag">${sub.format || "SRT"}</span>
      ${idx === 0 ? '<span class="auto-tag">AUTO</span>' : ''}
    `;
    btn.onclick = () => {
      document.querySelectorAll(".sub-result-chip").forEach(b => b.classList.remove("auto-loaded"));
      btn.classList.add("auto-loaded");
      applySubtitleTrack(`${API_BASE}/api/stream/subtitle?url=${encodeURIComponent(sub.url)}`);
    };
    container.appendChild(btn);
  });
}

// Autocomplete input debouncing
el("titleInput")?.addEventListener("input", () => {
  const val = el("titleInput").value.trim();
  if (suggestDebounce) clearTimeout(suggestDebounce);
  if (!val || val.length < 2) { hide("suggestDropdown"); return; }

  suggestDebounce = setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stream/search?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      const dd = el("suggestDropdown");
      dd.innerHTML = "";

      if (data.results && data.results.length > 0) {
        data.results.forEach((item) => {
          const itemBtn = document.createElement("button");
          itemBtn.className = "suggest-item";
          itemBtn.innerHTML = `
            ${item.poster ? `<img src="${item.poster}" class="suggest-poster">` : ''}
            <div class="suggest-info">
              <span class="suggest-title">${item.title}</span>
              <span class="suggest-meta">${item.year} &bull; ${item.type}</span>
            </div>
          `;
          itemBtn.onclick = () => {
            el("titleInput").value = item.title;
            hide("suggestDropdown");
            searchByTitle();
          };
          dd.appendChild(itemBtn);
        });
        show("suggestDropdown");
      } else {
        hide("suggestDropdown");
      }
    } catch {
      hide("suggestDropdown");
    }
  }, 350);
});

// Close dropdown saat klik di luar
document.addEventListener("click", (e) => {
  const dd = el("suggestDropdown");
  const ti = el("titleInput");
  if (dd && ti && !dd.contains(e.target) && !ti.contains(e.target)) {
    hide("suggestDropdown");
  }
});

// ===== CUSTOM HTML5 VIDEO PLAYER CONTROLS =====
function fmtTime(s) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ":" + String(sec).padStart(2, "0");
}

function initPlayer() {
  const video = el("streamVideo");
  const playBtn = el("playBtn");
  const bigPlayBtn = el("bigPlayBtn");
  const seekBar = el("seekBar");
  const curTime = el("curTime");
  const durTime = el("durTime");
  const volSlider = el("volSlider");
  const muteBtn = el("muteBtn");
  const speedSelect = el("speedSelect");
  const subSizeSlider = el("subSizeSlider");
  const subSizeValue = el("subSizeValue");
  const centerOverlay = el("centerOverlay");

  if (!video) return;

  function togglePlay() {
    if (video.paused || video.ended) {
      video.play().then(() => {
        centerOverlay?.classList.add("hidden-overlay");
      }).catch(() => {});
    } else {
      video.pause();
      centerOverlay?.classList.remove("hidden-overlay");
    }
  }

  function updatePlayIcons() {
    const isPaused = video.paused;
    const playSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
    const pauseSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

    if (playBtn) playBtn.innerHTML = isPaused ? playSvg : pauseSvg;
    if (bigPlayBtn) bigPlayBtn.innerHTML = isPaused ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' : pauseSvg;
  }

  playBtn?.addEventListener("click", togglePlay);
  bigPlayBtn?.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);

  video.addEventListener("play", updatePlayIcons);
  video.addEventListener("pause", updatePlayIcons);

  video.addEventListener("timeupdate", () => {
    if (!seekBar.hasAttribute("data-dragging")) {
      seekBar.value = (video.currentTime / (video.duration || 1)) * 1000;
    }
    curTime.textContent = fmtTime(video.currentTime);
    durTime.textContent = fmtTime(video.duration);
  });

  seekBar?.addEventListener("input", () => {
    seekBar.setAttribute("data-dragging", "true");
    if (video.duration) {
      video.currentTime = (seekBar.value / 1000) * video.duration;
    }
  });

  seekBar?.addEventListener("change", () => {
    seekBar.removeAttribute("data-dragging");
  });

  volSlider?.addEventListener("input", () => {
    video.volume = volSlider.value / 100;
    video.muted = (video.volume === 0);
  });

  muteBtn?.addEventListener("click", () => {
    video.muted = !video.muted;
    volSlider.value = video.muted ? 0 : (video.volume * 100);
  });

  speedSelect?.addEventListener("change", () => {
    video.playbackRate = parseFloat(speedSelect.value);
  });

  subSizeSlider?.addEventListener("input", () => {
    const scale = subSizeSlider.value;
    subSizeValue.textContent = scale + "%";
    video.style.setProperty("--sub-scale", scale / 100);
  });
}

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  initPlayer();
  renderHistory();
});
