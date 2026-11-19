// =========================================================================
// 1. JS/STATE.JS - KONFIGURASI, VARIABEL GLOBAL, TEMA & AUTO-FULLSCREEN HP
// =========================================================================

window.GAS_WEB_APP_URL = "PASTE_URL_WEB_APP_GOOGLE_APPS_SCRIPT_ANDA";

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// State Global Lintas Modul
window.AppState = {
  currentMode: 'local', // 'local' | 'merge' | 'ocr' | 'cloud' | 'history'
  fileQueue: [],
  mergedPdfBlob: null,
  mergedTotalPages: 0,
  hasSignatureDrawn: false,
  sigPosPercent: { x: 0.72, y: 0.78 },
  lastReceiptData: null,
  ocrPagesCache: [],
  pdfPreviewState: { mode: 'compare', origDoc: null, compDoc: null, pageNum: 1, totalPages: 1, keptPagesMap: [] }
};

// Fungsi Utilitas Global
window.formatBytes = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / 1048576).toFixed(2) + " MB";
};

window.triggerBrowserDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

window.generateNewAccessCode = () => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'DOC-';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  const el = document.getElementById('kodeKompresi');
  if (el) el.value = code;
};

// Auto-Fullscreen Otomatis di HP
const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) ||
  ('ontouchstart' in window);

function lockMobileFullScreen() {
  if (!isMobileDevice) return;
  const docEl = document.documentElement;
  const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.msRequestFullscreen;
  if (requestFs && !document.fullscreenElement && !document.webkitFullscreenElement) {
    requestFs.call(docEl).catch(() => {});
  }
}

if (isMobileDevice) {
  ['pointerdown', 'touchstart', 'touchend', 'click'].forEach(evt => {
    document.addEventListener(evt, lockMobileFullScreen, { passive: true });
  });
  window.addEventListener('orientationchange', () => setTimeout(lockMobileFullScreen, 300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') setTimeout(lockMobileFullScreen, 200);
  });
}

// Registrasi Service Worker & One-Click PWA Installer
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

let deferredInstallPrompt = null;
const btnInstallApp = document.getElementById('btnInstallApp');

if (window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
  if (btnInstallApp) btnInstallApp.classList.add('hidden');
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (btnInstallApp) btnInstallApp.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  if (btnInstallApp) btnInstallApp.classList.add('hidden');
});

window.triggerDirectAppInstall = async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted' && btnInstallApp) btnInstallApp.classList.add('hidden');
    deferredInstallPrompt = null;
  } else {
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isIOS) {
      alert('📲 Cara Install di iPhone/iPad:\n1. Ketuk ikon "Share / Bagikan" di bagian bawah Safari.\n2. Pilih "Add to Home Screen / Tambahkan ke Layar Utama".');
    } else {
      alert('📲 Memasang Aplikasi:\nKetuk menu titik tiga (⋮) di pojok kanan atas browser HP Anda, lalu pilih "Install Aplikasi" atau "Tambahkan ke Layar Utama".');
    }
  }
};

// Tema Lab Futuristik (Dark Mode)
function applySavedTheme() {
  const saved = localStorage.getItem('smartdoc_theme');
  const btnText = document.getElementById('themeBtnText');
  const icon = document.getElementById('themeIcon');
  if (saved === 'futuristic') {
    document.body.classList.add('futuristic-lab');
    if (btnText) btnText.textContent = 'Mode Terang';
    if (icon) icon.textContent = '☀️';
  } else {
    document.body.classList.remove('futuristic-lab');
    if (btnText) btnText.textContent = 'Mode Lab Futuristik';
    if (icon) icon.textContent = '⚡';
  }
}

window.toggleFuturisticTheme = () => {
  const isDark = document.body.classList.contains('futuristic-lab');
  localStorage.setItem('smartdoc_theme', isDark ? 'light' : 'futuristic');
  applySavedTheme();
};

// Navigasi 5 Tab Menu Utama
window.switchMode = (mode) => {
  AppState.currentMode = mode;
  ['local', 'merge', 'ocr', 'cloud', 'history'].forEach(m => {
    const btn = document.getElementById('tab_' + m);
    if (!btn) return;
    btn.className = m === mode
      ? "py-3 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 bg-white text-indigo-700 shadow-sm"
      : "py-3 px-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 text-slate-600 hover:bg-white/60";
  });

  const workspaceArea = document.getElementById('workspaceArea');
  const ocrArea = document.getElementById('ocrArea');
  const historyArea = document.getElementById('historyArea');

  workspaceArea.classList.add('hidden');
  ocrArea.classList.add('hidden');
  historyArea.classList.add('hidden');

  if (mode === 'ocr') { ocrArea.classList.remove('hidden'); return; }
  if (mode === 'history') {
    historyArea.classList.remove('hidden');
    if (window.refreshOfflineQueueUI) window.refreshOfflineQueueUI();
    return;
  }

  workspaceArea.classList.remove('hidden');

  const cloudIdentity = document.getElementById('cloudIdentitySection');
  const mergeSettings = document.getElementById('mergeSettingsSection');
  const btnCompressAll = document.getElementById('btnCompressAll');
  const btnMergeNow = document.getElementById('btnMergeNow');
  const btnDownloadAllLocal = document.getElementById('btnDownloadAllLocal');
  const btnSubmitCloud = document.getElementById('btnSubmitCloud');
  const mergedResultCard = document.getElementById('mergedResultCard');

  if (mode === 'local') {
    cloudIdentity.classList.add('hidden'); mergeSettings.classList.add('hidden'); mergedResultCard.classList.add('hidden');
    btnCompressAll.classList.remove('hidden'); btnMergeNow.classList.add('hidden');
    btnDownloadAllLocal.classList.remove('hidden'); btnSubmitCloud.classList.add('hidden');
  } else if (mode === 'merge') {
    cloudIdentity.classList.add('hidden'); mergeSettings.classList.remove('hidden');
    btnCompressAll.classList.add('hidden'); btnMergeNow.classList.remove('hidden');
    btnDownloadAllLocal.classList.add('hidden'); btnSubmitCloud.classList.add('hidden');
    if (AppState.mergedPdfBlob) mergedResultCard.classList.remove('hidden');
  } else if (mode === 'cloud') {
    cloudIdentity.classList.remove('hidden'); mergeSettings.classList.add('hidden'); mergedResultCard.classList.add('hidden');
    btnCompressAll.classList.remove('hidden'); btnMergeNow.classList.add('hidden');
    btnDownloadAllLocal.classList.add('hidden'); btnSubmitCloud.classList.remove('hidden');
  }
  if (window.renderQueueUI) window.renderQueueUI();
};

window.addEventListener('DOMContentLoaded', () => {
  applySavedTheme();
  window.generateNewAccessCode();
});
