// =========================================================================
// APP.JS - SMARTDOC STUDIO V9.5 (PAPER RATIO A4, FOLIO/F4 & FREE 4-POINT)
// =========================================================================

const GAS_WEB_APP_URL = "PASTE_URL_WEB_APP_GOOGLE_APPS_SCRIPT_ANDA";

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// =========================================================================
// 0. AUTO-FULLSCREEN OTOMATIS DI HP & ONE-CLICK PWA INSTALLER
// =========================================================================
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
    if (outcome === 'accepted' && btnInstallApp) {
      btnInstallApp.classList.add('hidden');
    }
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

// =========================================================================
// 1. TEMA LAB FUTURISTIK (DARK MODE)
// =========================================================================
function applySavedTheme() {
  const saved = localStorage.getItem('smartdoc_theme');
  const btnText = document.getElementById('themeBtnText');
  const icon = document.getElementById('themeIcon');
  if (saved === 'futuristic') {
    document.body.classList.add('futuristic-lab');
    btnText.textContent = 'Mode Terang';
    icon.textContent = '☀️';
  } else {
    document.body.classList.remove('futuristic-lab');
    btnText.textContent = 'Mode Lab Futuristik';
    icon.textContent = '⚡';
  }
}

window.toggleFuturisticTheme = () => {
  const isDark = document.body.classList.contains('futuristic-lab');
  localStorage.setItem('smartdoc_theme', isDark ? 'light' : 'futuristic');
  applySavedTheme();
};
applySavedTheme();

// =========================================================================
// 2. DATABASE LOKAL INDEXEDDB UNTUK ANTREAN OFFLINE & AUTO-SYNC
// =========================================================================
const IDB_NAME = 'SmartDocOfflineDB';
const IDB_STORE = 'outbox_uploads';

function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function saveToIndexedDBOutbox(payloadRecord) {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add({
      ...payloadRecord,
      savedAt: new Date().toLocaleString('id-ID')
    });
    tx.oncomplete = () => { refreshOfflineQueueUI(); resolve(); };
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function getAllOfflineOutbox() {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

window.deleteOfflineOutboxItem = async (id) => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => { refreshOfflineQueueUI(); resolve(); };
    tx.onerror = (e) => reject(e.target.error);
  });
};

async function refreshOfflineQueueUI() {
  const items = await getAllOfflineOutbox();
  const wrap = document.getElementById('offlineQueueBadgeWrap');
  const countEl = document.getElementById('offlineQueueCount');
  const listContainer = document.getElementById('indexedDbListContainer');

  countEl.textContent = items.length;
  if (items.length > 0) wrap.classList.remove('hidden');
  else wrap.classList.add('hidden');

  if (items.length === 0) {
    listContainer.innerHTML = `<div class="p-3 rounded-xl bg-white border border-slate-200 text-slate-400 text-center">Tidak ada antrean dokumen yang tertunda. Semua berkas telah tersinkronisasi.</div>`;
  } else {
    listContainer.innerHTML = items.map(it => `
      <div class="p-3 rounded-xl bg-white border border-amber-300 flex items-center justify-between gap-3">
        <div>
          <span class="font-mono font-bold text-indigo-600">${it.kodeKompresi}</span> — <b>${it.nama}</b> (${it.files.length} berkas)
          <span class="text-[11px] text-slate-400 block">Disimpan saat Offline: ${it.savedAt}</span>
        </div>
        <button type="button" onclick="deleteOfflineOutboxItem(${it.id})" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded font-bold">Hapus</button>
      </div>
    `).join('');
  }
}

window.syncOfflineQueueNow = async () => {
  if (!navigator.onLine) return alert('Perangkat masih Offline. Antrean akan otomatis dikirim saat internet aktif.');
  const items = await getAllOfflineOutbox();
  if (items.length === 0) return;

  const alertBox = document.getElementById('statusAlert');
  alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-amber-50 text-amber-900 border border-amber-300';
  alertBox.textContent = `🔄 Menyinkronkan ${items.length} paket dokumen dari IndexedDB ke Google Drive...`;
  alertBox.classList.remove('hidden');

  for (const item of items) {
    try {
      const res = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: JSON.stringify({
          action: 'upload',
          nama: item.nama,
          keterangan: item.keterangan,
          kodeKompresi: item.kodeKompresi,
          files: item.files
        })
      });
      const json = await res.json();
      if (json.status === 'success') {
        await window.deleteOfflineOutboxItem(item.id);
        lastReceiptData = {
          nama: item.nama,
          keterangan: item.keterangan,
          kodeKompresi: json.kodeKompresi,
          tanggal: new Date().toLocaleString('id-ID'),
          files: json.uploadedFiles
        };
      }
    } catch (err) {
      console.error('Gagal sync item:', err);
    }
  }

  await refreshOfflineQueueUI();
  alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-900 border border-emerald-300';
  alertBox.innerHTML = `✅ <b>Sinkronisasi IndexedDB Selesai!</b> Seluruh antrean offline berhasil diunggah ke Google Drive. <button type="button" onclick="downloadUploadReceiptPdf()" class="ml-2 underline font-extrabold">Cetak Kartu Bukti PDF</button>`;
};

function updateNetworkIndicator() {
  const dot = document.getElementById('networkDot');
  const txt = document.getElementById('networkText');
  if (navigator.onLine) {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
    txt.textContent = 'Mode Online (Siap Sinkronisasi)';
    window.syncOfflineQueueNow();
  } else {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    txt.textContent = 'Mode Offline Aktif (Simpan Otomatis ke IndexedDB)';
  }
}
window.addEventListener('online', updateNetworkIndicator);
window.addEventListener('offline', updateNetworkIndicator);
window.addEventListener('load', () => { updateNetworkIndicator(); refreshOfflineQueueUI(); });

// =========================================================================
// 3. FITUR SCANNER 4-TITIK + RASIO A4/FOLIO/BEBAS + MAGNIFIER + MULTI-PAGE
// =========================================================================
let cameraStream = null;
let cameraFacing = 'environment';
let scannerTargetDestination = 'queue';
let scanColorMode = 'color';   // 'color' | 'magic' | 'bw'
let scanPaperRatio = 'free';   // 'free' (Bebas 4 Titik) | 'a4' (210x297mm) | 'folio' (215x330mm)
let currentScanRotation = 0;   // 0 | 90 | 180 | 270
let scannedPagesBatch = [];

let quadCorners = [
  { x: 0.10, y: 0.10 },
  { x: 0.90, y: 0.10 },
  { x: 0.90, y: 0.90 },
  { x: 0.10, y: 0.90 }
];
let activeCornerIndex = null;

window.openCameraScanner = async (destination = 'queue') => {
  scannerTargetDestination = destination;
  scannedPagesBatch = [];
  currentScanRotation = 0;
  updateBatchTrayUI();

  document.getElementById('cameraScannerModal').classList.remove('hidden');
  document.getElementById('cameraLiveStep').classList.remove('hidden');
  document.getElementById('cameraCropStep').classList.add('hidden');
  document.getElementById('cameraLiveControls').classList.remove('hidden');
  document.getElementById('cameraCropControls').classList.add('hidden');
  await startCameraStream();
};

async function startCameraStream() {
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    document.getElementById('cameraVideoEl').srcObject = cameraStream;
  } catch (err) {
    alert('Kamera tidak tersedia atau izin ditolak. Anda tetap bisa memilih foto dokumen dari Galeri.');
  }
}

window.switchCameraFacing = async () => {
  cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
  await startCameraStream();
};

window.closeCameraScanner = () => {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  document.getElementById('cameraScannerModal').classList.add('hidden');
};

window.captureCameraFrame = () => {
  const video = document.getElementById('cameraVideoEl');
  if (!video.videoWidth) return alert('Tunggu kamera siap atau pilih foto dari galeri.');

  const rawCanvas = document.getElementById('scannerRawCanvas');
  const ctx = rawCanvas.getContext('2d');
  rawCanvas.width = video.videoWidth;
  rawCanvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, rawCanvas.width, rawCanvas.height);

  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }

  currentScanRotation = 0;
  enterFourPointCropMode();
};

document.getElementById('scannerGalleryInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const rawCanvas = document.getElementById('scannerRawCanvas');
      rawCanvas.width = img.width;
      rawCanvas.height = img.height;
      rawCanvas.getContext('2d').drawImage(img, 0, 0);
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
        cameraStream = null;
      }
      currentScanRotation = 0;
      enterFourPointCropMode();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

function enterFourPointCropMode() {
  document.getElementById('cameraLiveStep').classList.add('hidden');
  document.getElementById('cameraCropStep').classList.remove('hidden');
  document.getElementById('cameraLiveControls').classList.add('hidden');
  document.getElementById('cameraCropControls').classList.remove('hidden');
  document.getElementById('scannerStepSubtitle').textContent =
    'Geser 4 titik sudut, pilih rasio kertas (Bebas / A4 / Folio), lalu simpan halaman atau jadikan 1 PDF.';
  updateRotationBadgeText();
  window.autoDetectFourCorners();
}

window.retakeCameraPhoto = async () => {
  document.getElementById('cameraLiveStep').classList.remove('hidden');
  document.getElementById('cameraCropStep').classList.add('hidden');
  document.getElementById('cameraLiveControls').classList.remove('hidden');
  document.getElementById('cameraCropControls').classList.add('hidden');
  await startCameraStream();
};

// PENGATURAN RASIO KERTAS HASIL SCAN: 'free' | 'a4' | 'folio'
window.setScanPaperRatio = (ratioType) => {
  scanPaperRatio = ratioType;
  ['free', 'a4', 'folio'].forEach(r => {
    const btn = document.getElementById('btnRatio_' + r);
    if (r === ratioType) {
      btn.className = 'px-2.5 py-1 rounded text-[11px] font-extrabold bg-cyan-400 text-slate-950 transition shadow';
    } else {
      btn.className = 'px-2.5 py-1 rounded text-[11px] font-bold text-slate-300 hover:text-white transition';
    }
  });
  window.updateWarpedPreview();
};

// FITUR PUTAR 90 DERAJAT (ROTATE KIRI / KANAN)
window.rotateCurrentScan = (deltaDeg) => {
  currentScanRotation = (currentScanRotation + deltaDeg + 360) % 360;
  updateRotationBadgeText();
  window.updateWarpedPreview();
};

function updateRotationBadgeText() {
  const labels = {
    0: '0° (Tegak)',
    90: '90° (Kanan)',
    180: '180° (Terbalik)',
    270: '270° (Kiri)'
  };
  document.getElementById('scanRotationBadge').textContent = labels[currentScanRotation] || `${currentScanRotation}°`;
}

window.setScanColorMode = (mode) => {
  scanColorMode = mode;
  ['color', 'magic', 'bw'].forEach(m => {
    const btn = document.getElementById('btnScanMode_' + m);
    if (m === mode) {
      btn.className = 'px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold bg-cyan-400 text-slate-950 transition shadow';
    } else {
      btn.className = 'px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-300 hover:text-white transition';
    }
  });
  window.updateWarpedPreview();
};

// Deteksi 4 Sudut Ekstrem Otomatis
window.autoDetectFourCorners = () => {
  const canvas = document.getElementById('scannerRawCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h).data;

  const step = Math.max(4, Math.floor(Math.min(w, h) / 120));
  const brightPoints = [];

  for (let y = Math.floor(h * 0.04); y < Math.floor(h * 0.96); y += step) {
    for (let x = Math.floor(w * 0.04); x < Math.floor(w * 0.96); x += step) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
      if (lum > 158) brightPoints.push({ x: x / w, y: y / h });
    }
  }

  if (brightPoints.length > 80) {
    let tl = brightPoints[0], tr = brightPoints[0], br = brightPoints[0], bl = brightPoints[0];
    let minSum = 999, maxSum = -999, minDiff = 999, maxDiff = -999;

    for (const pt of brightPoints) {
      const sum = pt.x + pt.y;
      const diff = pt.x - pt.y;
      if (sum < minSum) { minSum = sum; tl = pt; }
      if (sum > maxSum) { maxSum = sum; br = pt; }
      if (diff > maxDiff) { maxDiff = diff; tr = pt; }
      if (diff < minDiff) { minDiff = diff; bl = pt; }
    }

    const polyWidth = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const polyHeight = Math.hypot(bl.x - tl.x, bl.y - tl.y);

    if (polyWidth > 0.22 && polyHeight > 0.22) {
      quadCorners = [
        { x: Math.max(0.02, tl.x), y: Math.max(0.02, tl.y) },
        { x: Math.min(0.98, tr.x), y: Math.max(0.02, tr.y) },
        { x: Math.min(0.98, br.x), y: Math.min(0.98, br.y) },
        { x: Math.max(0.02, bl.x), y: Math.min(0.98, bl.y) }
      ];
    } else {
      quadCorners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
    }
  } else {
    quadCorners = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];
  }

  renderFourCornerPins();
  window.updateWarpedPreview();
};

function renderFourCornerPins() {
  const polyPoints = quadCorners.map(pt => `${(pt.x * 100).toFixed(2)},${(pt.y * 100).toFixed(2)}`).join(' ');
  document.getElementById('cropPolygonShape').setAttribute('points', polyPoints);

  quadCorners.forEach((pt, idx) => {
    const pin = document.getElementById('cornerHandle_' + idx);
    pin.style.left = `${pt.x * 100}%`;
    pin.style.top = `${pt.y * 100}%`;
  });
}

// =========================================================================
// KACA PEMBESAR PRESISI (MAGNIFIER LOUPE) SAAT MENGGESER 4 TITIK SUDUT
// =========================================================================
function updateMagnifierLoupe(cornerIdx, ratioX, ratioY) {
  const loupe = document.getElementById('magnifierLoupe');
  const magCanvas = document.getElementById('magnifierCanvas');
  const rawCanvas = document.getElementById('scannerRawCanvas');
  const stageRect = document.getElementById('cropStageWrapper').getBoundingClientRect();

  if (!rawCanvas.width) return;
  loupe.classList.remove('hidden');

  const cornerNames = ['1: Kiri-Atas', '2: Kanan-Atas', '3: Kanan-Bawah', '4: Kiri-Bawah'];
  document.getElementById('magnifierCornerLabel').textContent = cornerNames[cornerIdx];

  const pinPxX = ratioX * stageRect.width;
  const pinPxY = ratioY * stageRect.height;
  const loupeSize = 116;

  let leftPos = pinPxX - loupeSize / 2;
  let topPos = pinPxY - loupeSize - 26;
  if (topPos < 4) topPos = pinPxY + 26;
  leftPos = Math.max(4, Math.min(leftPos, stageRect.width - loupeSize - 4));

  loupe.style.left = `${leftPos}px`;
  loupe.style.top = `${topPos}px`;

  const magCtx = magCanvas.getContext('2d');
  const zoomFactor = 2.6;
  const srcRadiusX = (magCanvas.width / zoomFactor) / 2;
  const srcRadiusY = (magCanvas.height / zoomFactor) / 2;
  const centerX = ratioX * rawCanvas.width;
  const centerY = ratioY * rawCanvas.height;

  magCtx.fillStyle = '#020617';
  magCtx.fillRect(0, 0, magCanvas.width, magCanvas.height);

  magCtx.drawImage(
    rawCanvas,
    centerX - srcRadiusX,
    centerY - srcRadiusY,
    srcRadiusX * 2,
    srcRadiusY * 2,
    0,
    0,
    magCanvas.width,
    magCanvas.height
  );
}

const cropStage = document.getElementById('cropStageWrapper');
[0, 1, 2, 3].forEach(idx => {
  const pinEl = document.getElementById('cornerHandle_' + idx);
  pinEl.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    activeCornerIndex = idx;
    pinEl.setPointerCapture(e.pointerId);
    updateMagnifierLoupe(idx, quadCorners[idx].x, quadCorners[idx].y);
  });
});

window.addEventListener('pointermove', (e) => {
  if (activeCornerIndex === null) return;
  const stageRect = cropStage.getBoundingClientRect();
  const nx = Math.max(0.01, Math.min(0.99, (e.clientX - stageRect.left) / stageRect.width));
  const ny = Math.max(0.01, Math.min(0.99, (e.clientY - stageRect.top) / stageRect.height));

  quadCorners[activeCornerIndex] = { x: nx, y: ny };
  renderFourCornerPins();
  updateMagnifierLoupe(activeCornerIndex, nx, ny);
});

window.addEventListener('pointerup', () => {
  if (activeCornerIndex !== null) {
    activeCornerIndex = null;
    document.getElementById('magnifierLoupe').classList.add('hidden');
    window.updateWarpedPreview();
  }
});

// =========================================================================
// MESIN TRANSFORMASI 4-TITIK + PENYESUAIAN RASIO KERTAS (A4, FOLIO, BEBAS)
// =========================================================================
function performPerspectiveWarp(srcCanvas, cornersRatio, colorMode, rotationDeg = 0, paperRatioMode = 'free', maxOutputDim = 1400) {
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const srcCtx = srcCanvas.getContext('2d');
  const srcData = srcCtx.getImageData(0, 0, sw, sh).data;

  const p0 = { x: cornersRatio[0].x * sw, y: cornersRatio[0].y * sh };
  const p1 = { x: cornersRatio[1].x * sw, y: cornersRatio[1].y * sh };
  const p2 = { x: cornersRatio[2].x * sw, y: cornersRatio[2].y * sh };
  const p3 = { x: cornersRatio[3].x * sw, y: cornersRatio[3].y * sh };

  // Hitung lebar & tinggi alami berdasarkan 4 titik sudut
  const topW = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const botW = Math.hypot(p2.x - p3.x, p2.y - p3.y);
  const leftH = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const rightH = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  let naturalW = Math.max(10, Math.round(Math.max(topW, botW)));
  let naturalH = Math.max(10, Math.round(Math.max(leftH, rightH)));

  let dstW = naturalW;
  let dstH = naturalH;

  // Sesuaikan ke rasio kertas A4 atau Folio (F4) jika dipilih pengguna
  if (paperRatioMode === 'a4' || paperRatioMode === 'folio') {
    // Rasio panjang:lebar standar -> A4 = 297/210 (1.4142), Folio/F4 = 330/215 (1.5349)
    const targetAspect = paperRatioMode === 'a4' ? (297 / 210) : (330 / 215);
    const isNaturalLandscape = naturalW > naturalH;

    if (isNaturalLandscape) {
      dstW = naturalW;
      dstH = Math.round(naturalW / targetAspect);
    } else {
      dstH = naturalH;
      dstW = Math.round(naturalH / targetAspect);
    }
  }

  // Batasi dimensi maksimum agar tetap ringan dan cepat
  if (Math.max(dstW, dstH) > maxOutputDim) {
    const scale = maxOutputDim / Math.max(dstW, dstH);
    dstW = Math.max(100, Math.round(dstW * scale));
    dstH = Math.max(100, Math.round(dstH * scale));
  }

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = dstW;
  baseCanvas.height = dstH;
  const baseCtx = baseCanvas.getContext('2d');
  const outImgData = baseCtx.createImageData(dstW, dstH);
  const dstData = outImgData.data;

  for (let y = 0; y < dstH; y++) {
    const v = y / (dstH - 1 || 1);
    const invV = 1 - v;

    for (let x = 0; x < dstW; x++) {
      const u = x / (dstW - 1 || 1);
      const invU = 1 - u;

      const srcX = invU * invV * p0.x + u * invV * p1.x + u * v * p2.x + invU * v * p3.x;
      const srcY = invU * invV * p0.y + u * invV * p1.y + u * v * p2.y + invU * v * p3.y;

      const ix = Math.min(sw - 1, Math.max(0, Math.round(srcX)));
      const iy = Math.min(sh - 1, Math.max(0, Math.round(srcY)));
      const srcIdx = (iy * sw + ix) * 4;
      const dstIdx = (y * dstW + x) * 4;

      let r = srcData[srcIdx];
      let g = srcData[srcIdx + 1];
      let b = srcData[srcIdx + 2];

      if (colorMode === 'bw') {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        let bwVal = ((gray - 128) * 1.45) + 140;
        bwVal = bwVal > 195 ? 255 : (bwVal < 65 ? 0 : bwVal);
        r = g = b = Math.max(0, Math.min(255, bwVal));
      } else if (colorMode === 'magic') {
        r = Math.min(255, Math.max(0, ((r - 128) * 1.25) + 142));
        g = Math.min(255, Math.max(0, ((g - 128) * 1.25) + 142));
        b = Math.min(255, Math.max(0, ((b - 128) * 1.25) + 142));
      }

      dstData[dstIdx] = r;
      dstData[dstIdx + 1] = g;
      dstData[dstIdx + 2] = b;
      dstData[dstIdx + 3] = 255;
    }
  }

  baseCtx.putImageData(outImgData, 0, 0);

  // Terapkan Rotasi 90 / 180 / 270 Derajat jika dipilih
  const normRot = ((rotationDeg % 360) + 360) % 360;
  if (normRot === 0) return baseCanvas;

  const rotCanvas = document.createElement('canvas');
  if (normRot === 90 || normRot === 270) {
    rotCanvas.width = dstH;
    rotCanvas.height = dstW;
  } else {
    rotCanvas.width = dstW;
    rotCanvas.height = dstH;
  }

  const rotCtx = rotCanvas.getContext('2d');
  rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
  rotCtx.rotate((normRot * Math.PI) / 180);
  rotCtx.drawImage(baseCanvas, -dstW / 2, -dstH / 2);
  return rotCanvas;
}

window.updateWarpedPreview = () => {
  const rawCanvas = document.getElementById('scannerRawCanvas');
  if (!rawCanvas.width) return;

  const previewCanvas = performPerspectiveWarp(
    rawCanvas,
    quadCorners,
    scanColorMode,
    currentScanRotation,
    scanPaperRatio,
    520
  );

  const targetPreview = document.getElementById('scannerWarpedPreviewCanvas');
  targetPreview.width = previewCanvas.width;
  targetPreview.height = previewCanvas.height;
  targetPreview.getContext('2d').drawImage(previewCanvas, 0, 0);

  const ratioLabels = {
    free: 'Bebas (Sesuai Pengaturan 4 Titik Sudut)',
    a4: 'Standar Kertas A4 (210 × 297 mm)',
    folio: 'Standar Kertas Folio / F4 (215 × 330 mm)'
  };
  const infoEl = document.getElementById('scanDimensionInfo');
  if (infoEl) {
    infoEl.textContent = `Rasio Aktif: ${ratioLabels[scanPaperRatio]} — Pratinjau: ${previewCanvas.width}×${previewCanvas.height} px`;
  }
};

// =========================================================================
// FITUR SCAN MULTI-HALAMAN BERUNTUN LANGSUNG JADI 1 FILE PDF
// =========================================================================
function captureCurrentWarpedPageData() {
  const rawCanvas = document.getElementById('scannerRawCanvas');
  const finalCanvas = performPerspectiveWarp(
    rawCanvas,
    quadCorners,
    scanColorMode,
    currentScanRotation,
    scanPaperRatio,
    1650
  );
  return {
    dataUrl: finalCanvas.toDataURL('image/jpeg', 0.88),
    width: finalCanvas.width,
    height: finalCanvas.height,
    paperRatio: scanPaperRatio
  };
}

window.addCurrentScanAndContinue = async () => {
  const pageData = captureCurrentWarpedPageData();
  scannedPagesBatch.push(pageData);
  updateBatchTrayUI();
  await window.retakeCameraPhoto();
};

window.removeBatchPage = (idx) => {
  scannedPagesBatch.splice(idx, 1);
  updateBatchTrayUI();
};

function updateBatchTrayUI() {
  const count = scannedPagesBatch.length;
  document.getElementById('batchScanCountBadge').textContent = `${count} Halaman Tersimpan`;
  document.getElementById('trayPageCounter').textContent = count;

  const tray = document.getElementById('multiPageScanTray');
  const list = document.getElementById('trayThumbnailsList');
  const btnFinishLive = document.getElementById('btnFinishBatchFromLive');
  const btnFinishLabel = document.getElementById('btnFinishScanLabel');

  if (count > 0) {
    tray.classList.remove('hidden');
    btnFinishLive.classList.remove('hidden');
    btnFinishLive.textContent = `📑 Selesai & Jadikan 1 PDF (${count} Hal)`;
    btnFinishLabel.textContent = `Selesai & Gabung Jadi 1 PDF (${count + 1} Hal)`;
  } else {
    tray.classList.add('hidden');
    btnFinishLive.classList.add('hidden');
    btnFinishLabel.textContent = 'Selesai & Jadikan 1 PDF';
  }

  list.innerHTML = scannedPagesBatch.map((p, i) => `
    <div class="relative group shrink-0 w-14 h-18 rounded-lg overflow-hidden border border-cyan-400 bg-slate-950">
      <img src="${p.dataUrl}" class="w-full h-16 object-cover" alt="Hal ${i + 1}">
      <span class="absolute bottom-0 inset-x-0 bg-slate-950/85 text-[9px] font-bold text-center text-cyan-300 uppercase">Hal ${i + 1} (${p.paperRatio})</span>
      <button type="button" onclick="removeBatchPage(${i})" class="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[9px] font-bold flex items-center justify-center">✕</button>
    </div>
  `).join('');
}

// Rakit seluruh halaman menjadi 1 file PDF sesuai dimensi kertas masing-masing (A4 / Folio / Bebas)
window.finishBatchScanAsSinglePdf = async (includeCurrentCropStep = false) => {
  if (includeCurrentCropStep) {
    const currentData = captureCurrentWarpedPageData();
    scannedPagesBatch.push(currentData);
  }

  if (scannedPagesBatch.length === 0) {
    return alert('Belum ada halaman yang dipindai.');
  }

  const { jsPDF } = window.jspdf;
  let pdfDoc = null;

  scannedPagesBatch.forEach((p, idx) => {
    const isLandscape = p.width > p.height;
    const orient = isLandscape ? 'l' : 'p';

    // Tentukan ukuran halaman PDF dalam satuan point (pt)
    let pageWPt, pageHPt;
    if (p.paperRatio === 'a4') {
      // Standar A4 dalam pt: 595.28 x 841.89 pt
      pageWPt = isLandscape ? 841.89 : 595.28;
      pageHPt = isLandscape ? 595.28 : 841.89;
    } else if (p.paperRatio === 'folio') {
      // Standar Folio / F4 (215 x 330 mm) dalam pt: 609.45 x 935.43 pt
      pageWPt = isLandscape ? 935.43 : 609.45;
      pageHPt = isLandscape ? 609.45 : 935.43;
    } else {
      // Mode Bebas mengikuti ukuran piksel hasil pelurusan 4 titik
      pageWPt = p.width * 0.75;
      pageHPt = p.height * 0.75;
    }

    if (idx === 0) {
      pdfDoc = new jsPDF({ orientation: orient, unit: 'pt', format: [pageWPt, pageHPt], compress: true });
    } else {
      pdfDoc.addPage([pageWPt, pageHPt], orient);
    }
    pdfDoc.addImage(p.dataUrl, 'JPEG', 0, 0, pageWPt, pageHPt, undefined, 'FAST');
  });

  const pdfBlob = pdfDoc.output('blob');
  const totalPagesCount = scannedPagesBatch.length;
  const ratioTag = scanPaperRatio.toUpperCase();
  const scannedPdfFile = new File(
    [pdfBlob],
    `Scan_${ratioTag}_${totalPagesCount}Hal_${Date.now()}.pdf`,
    { type: 'application/pdf' }
  );

  scannedPagesBatch = [];
  updateBatchTrayUI();
  window.closeCameraScanner();

  if (scannerTargetDestination === 'ocr') {
    window.switchMode('ocr');
    const dt = new DataTransfer();
    dt.items.add(scannedPdfFile);
    document.getElementById('ocrFileInput').files = dt.files;
    document.getElementById('btnStartOcr').click();
  } else {
    await addFilesToQueue([scannedPdfFile]);
  }
};

// =========================================================================
// 4. STATE UTAMA APLIKASI, TANDA TANGAN, OCR WORD & KOMPRESI
// =========================================================================
let currentMode = 'local';
let fileQueue = [];
let mergedPdfBlob = null;
let mergedTotalPages = 0;
let hasSignatureDrawn = false;
let sigPosPercent = { x: 0.72, y: 0.78 };
let lastReceiptData = null;
let ocrPagesCache = [];
let pdfPreviewState = { mode: 'compare', origDoc: null, compDoc: null, pageNum: 1, totalPages: 1, keptPagesMap: [] };

const fileInput = document.getElementById('fileInput');
const fileListContainer = document.getElementById('fileListContainer');
const batchActionBar = document.getElementById('batchActionBar');

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  else return (bytes / 1048576).toFixed(2) + " MB";
}

window.generateNewAccessCode = () => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'DOC-';
  for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  document.getElementById('kodeKompresi').value = code;
};
window.generateNewAccessCode();

window.markAllPending = () => {
  fileQueue.forEach(item => { item.status = 'pending'; item.compressedBlob = null; });
  renderQueueUI();
};

// Kanvas Tanda Tangan
const sigCanvas = document.getElementById('signaturePad');
const sigCtx = sigCanvas.getContext('2d');
let isDrawingSig = false;

sigCtx.strokeStyle = '#0f172a';
sigCtx.lineWidth = 2.6;
sigCtx.lineCap = 'round';
sigCtx.lineJoin = 'round';

function getSigPointerPos(e) {
  const rect = sigCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (sigCanvas.width / rect.width),
    y: (clientY - rect.top) * (sigCanvas.height / rect.height)
  };
}

sigCanvas.addEventListener('pointerdown', (e) => {
  isDrawingSig = true; hasSignatureDrawn = true;
  const pos = getSigPointerPos(e);
  sigCtx.beginPath(); sigCtx.moveTo(pos.x, pos.y);
});

sigCanvas.addEventListener('pointermove', (e) => {
  if (!isDrawingSig) return;
  const pos = getSigPointerPos(e);
  sigCtx.lineTo(pos.x, pos.y); sigCtx.stroke();
});

window.addEventListener('pointerup', () => { isDrawingSig = false; });

window.clearSignatureCanvas = () => {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  hasSignatureDrawn = false; window.markAllPending();
};

document.getElementById('sigUploadInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      window.clearSignatureCanvas();
      const ratio = Math.min(sigCanvas.width / img.width, sigCanvas.height / img.height) * 0.85;
      const w = img.width * ratio, h = img.height * ratio;
      sigCtx.drawImage(img, (sigCanvas.width - w) / 2, (sigCanvas.height - h) / 2, w, h);
      hasSignatureDrawn = true; window.markAllPending();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

window.toggleSignaturePanel = (fromCheckbox = false) => {
  const cb = document.getElementById('enableSignature');
  if (!fromCheckbox) cb.checked = !cb.checked;
  const body = document.getElementById('signatureConfigBody');
  const badge = document.getElementById('sigStatusBadge');

  if (cb.checked) {
    body.classList.remove('hidden');
    badge.textContent = 'Aktif';
    badge.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700';
  } else {
    body.classList.add('hidden');
    badge.textContent = 'Nonaktif';
    badge.className = 'text-xs font-bold px-2.5 py-1 rounded-full bg-slate-200 text-slate-600';
  }
  window.markAllPending();
};

window.openSignaturePositioner = async () => {
  if (!hasSignatureDrawn) return alert('Silakan gambar atau upload tanda tangan Anda terlebih dahulu.');

  const bgCanvas = document.getElementById('sigBgPageCanvas');
  const bgCtx = bgCanvas.getContext('2d');

  if (fileQueue.length > 0) {
    const firstItem = fileQueue[0];
    if (firstItem.type === 'image') {
      const img = await new Promise((res) => {
        const r = new FileReader();
        r.onload = e => { const im = new Image(); im.onload = () => res(im); im.src = e.target.result; };
        r.readAsDataURL(firstItem.file);
      });
      const ratio = Math.min(1, 650 / img.width);
      bgCanvas.width = Math.round(img.width * ratio);
      bgCanvas.height = Math.round(img.height * ratio);
      bgCtx.drawImage(img, 0, 0, bgCanvas.width, bgCanvas.height);
    } else {
      const buf = await firstItem.file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const keepPages = parsePageSelection(firstItem.pageSelection, pdf.numPages);
      const targetPageSetting = document.getElementById('sigTargetPage').value;
      const previewPageNum = targetPageSetting === 'first' ? keepPages[0] : keepPages[keepPages.length - 1];
      const page = await pdf.getPage(previewPageNum || 1);
      const vp = page.getViewport({ scale: 1.0 });
      bgCanvas.width = vp.width; bgCanvas.height = vp.height;
      await page.render({ canvasContext: bgCtx, viewport: vp }).promise;
    }
  } else {
    bgCanvas.width = 595; bgCanvas.height = 842;
    bgCtx.fillStyle = '#ffffff'; bgCtx.fillRect(0, 0, 595, 842);
    bgCtx.fillStyle = '#cbd5e1';
    for (let y = 80; y < 700; y += 28) bgCtx.fillRect(50, y, y % 56 === 0 ? 420 : 495, 10);
  }

  const scaleRatio = parseFloat(document.getElementById('sigScaleSize').value) || 0.22;
  const dragBox = document.getElementById('draggableSigBox');
  dragBox.style.width = `${scaleRatio * 100}%`;
  dragBox.style.left = `${sigPosPercent.x * 100}%`;
  dragBox.style.top = `${sigPosPercent.y * 100}%`;

  document.getElementById('draggableSigImg').src = sigCanvas.toDataURL('image/png');
  document.getElementById('draggableSigName').textContent = document.getElementById('sigSignerName').value.trim();
  document.getElementById('sigDragModal').classList.remove('hidden');
};

window.closeSignaturePositioner = () => {
  document.getElementById('sigDragModal').classList.add('hidden');
  document.getElementById('sigCoordDisplay').textContent =
    `Kustom Drag & Drop (X: ${Math.round(sigPosPercent.x * 100)}%, Y: ${Math.round(sigPosPercent.y * 100)}%)`;
  window.markAllPending();
};

const dragBox = document.getElementById('draggableSigBox');
const stageWrapper = document.getElementById('sigStageWrapper');
let isDraggingBox = false;
let dragOffset = { x: 0, y: 0 };

dragBox.addEventListener('pointerdown', (e) => {
  isDraggingBox = true;
  const boxRect = dragBox.getBoundingClientRect();
  dragOffset.x = e.clientX - boxRect.left;
  dragOffset.y = e.clientY - boxRect.top;
  dragBox.setPointerCapture(e.pointerId);
});

dragBox.addEventListener('pointermove', (e) => {
  if (!isDraggingBox) return;
  const stageRect = stageWrapper.getBoundingClientRect();
  const boxRect = dragBox.getBoundingClientRect();

  let newLeft = e.clientX - stageRect.left - dragOffset.x;
  let newTop = e.clientY - stageRect.top - dragOffset.y;

  newLeft = Math.max(0, Math.min(newLeft, stageRect.width - boxRect.width));
  newTop = Math.max(0, Math.min(newTop, stageRect.height - boxRect.height));

  sigPosPercent.x = newLeft / stageRect.width;
  sigPosPercent.y = newTop / stageRect.height;

  dragBox.style.left = `${sigPosPercent.x * 100}%`;
  dragBox.style.top = `${sigPosPercent.y * 100}%`;
});

dragBox.addEventListener('pointerup', () => { isDraggingBox = false; });

function stampSignatureOnCanvas(targetCanvas) {
  const enabled = document.getElementById('enableSignature').checked;
  if (!enabled || !hasSignatureDrawn) return;

  const ctx = targetCanvas.getContext('2d');
  const scaleRatio = parseFloat(document.getElementById('sigScaleSize').value) || 0.22;
  const signerName = document.getElementById('sigSignerName').value.trim();

  const sigW = targetCanvas.width * scaleRatio;
  const sigH = sigW * (sigCanvas.height / sigCanvas.width);
  const x = targetCanvas.width * sigPosPercent.x;
  const y = targetCanvas.height * sigPosPercent.y;

  ctx.drawImage(sigCanvas, x, y, sigW, sigH);

  if (signerName) {
    const fontSize = Math.max(11, Math.round(targetCanvas.width * 0.015));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.fillText(signerName, x + sigW / 2, y + sigH + fontSize + 4);
  }
}

// Ekspor OCR ke Word (.docx)
window.exportOcrToDocx = async () => {
  const text = document.getElementById('ocrTextOutput').value;
  if (!text.trim()) return alert('Tidak ada teks OCR untuk diekspor.');
  const baseName = (document.getElementById('ocrExportFileName').value || 'Hasil_Konversi_OCR').replace(/\.(docx|doc|pdf)$/i, '');

  if (window.docx) {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = window.docx;
    const lines = text.split('\n');
    const docChildren = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('=== HALAMAN')) {
        docChildren.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({ text: trimmed.replace(/===/g, '').trim(), bold: true, size: 26, font: 'Calibri' })]
        }));
      } else {
        docChildren.push(new Paragraph({
          spacing: { after: 120, line: 276 },
          children: [new TextRun({ text: line, size: 22, font: 'Calibri' })]
        }));
      }
    });

    const doc = new Document({ sections: [{ properties: {}, children: docChildren }] });
    const blob = await Packer.toBlob(doc);
    triggerBrowserDownload(blob, `${baseName}.docx`);
  } else {
    const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>${text.split('\n').map(l => `<p>${l}</p>`).join('')}</body></html>`;
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    triggerBrowserDownload(blob, `${baseName}.doc`);
  }
};

document.getElementById('btnStartOcr').addEventListener('click', async () => {
  const file = document.getElementById('ocrFileInput').files[0];
  if (!file) return alert('Pilih file atau gunakan tombol Scan Kamera untuk OCR terlebih dahulu.');

  const lang = document.getElementById('ocrLang').value;
  const rangeStr = document.getElementById('ocrPageRange').value;
  const btn = document.getElementById('btnStartOcr');
  const statusText = document.getElementById('ocrProgressStatus');
  const progWrap = document.getElementById('ocrProgressWrap');
  const progBar = document.getElementById('ocrProgressBar');
  const resultBox = document.getElementById('ocrResultBox');
  const textOutput = document.getElementById('ocrTextOutput');

  btn.disabled = true;
  progWrap.classList.remove('hidden');
  resultBox.classList.add('hidden');
  ocrPagesCache = [];

  document.getElementById('ocrExportFileName').value = file.name.replace(/\.[^/.]+$/, "") + "_OCR";

  try {
    const canvasesToRead = [];
    if (file.type === 'application/pdf') {
      statusText.textContent = 'Membaca halaman PDF...';
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pages = parsePageSelection(rangeStr, pdf.numPages);
      for (let i = 0; i < pages.length; i++) {
        const pNum = pages[i];
        const page = await pdf.getPage(pNum);
        const vp = page.getViewport({ scale: 1.8 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        canvasesToRead.push({ pageNum: pNum, canvas: c });
      }
    } else {
      const img = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = e.target.result; };
        r.readAsDataURL(file);
      });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      canvasesToRead.push({ pageNum: 1, canvas: c });
    }

    statusText.textContent = 'Memuat mesin AI OCR Tesseract...';
    const worker = await Tesseract.createWorker(lang, 1, {
      logger: m => {
        if (m.status === 'recognizing text') progBar.style.width = `${Math.round(m.progress * 100)}%`;
      }
    });

    let fullCombinedText = '';
    for (let i = 0; i < canvasesToRead.length; i++) {
      const item = canvasesToRead[i];
      statusText.textContent = `Mengekstrak teks halaman ${i + 1} dari ${canvasesToRead.length}...`;
      progBar.style.width = '10%';
      const { data } = await worker.recognize(item.canvas);
      const cleanPageText = data.text.trim();
      ocrPagesCache.push({ pageNum: item.pageNum, canvas: item.canvas, text: cleanPageText, words: data.words || [] });
      fullCombinedText += `=== HALAMAN ${item.pageNum} ===\n${cleanPageText}\n\n`;
    }

    await worker.terminate();
    textOutput.value = fullCombinedText.trim();
    resultBox.classList.remove('hidden');
    statusText.textContent = '✅ Selesai! Siap diekspor ke Word (.docx) atau PDF.';
    progBar.style.width = '100%';
  } catch (err) {
    alert('Gagal menjalankan OCR: ' + err.message);
    statusText.textContent = '❌ Gagal memproses OCR.';
  } finally {
    btn.disabled = false;
  }
});

window.copyOcrText = () => {
  const txt = document.getElementById('ocrTextOutput');
  txt.select();
  document.execCommand('copy');
  alert('Teks berhasil disalin ke clipboard!');
};

window.downloadCleanTextPdf = () => {
  const text = document.getElementById('ocrTextOutput').value;
  if (!text.trim()) return alert('Tidak ada teks untuk dibuat PDF.');
  const baseName = (document.getElementById('ocrExportFileName').value || 'Hasil_OCR').replace(/\.(docx|pdf)$/i, '');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  const lines = doc.splitTextToSize(text, 180);
  let y = 20;
  lines.forEach(line => {
    if (y > 280) { doc.addPage(); y = 20; }
    doc.text(line, 15, y); y += 6;
  });
  doc.save(`${baseName}_Teks.pdf`);
};

window.downloadSearchableHybridPdf = () => {
  if (ocrPagesCache.length === 0) return alert('Silakan jalankan proses OCR terlebih dahulu.');
  const baseName = (document.getElementById('ocrExportFileName').value || 'Hasil_OCR').replace(/\.(docx|pdf)$/i, '');
  const { jsPDF } = window.jspdf;
  let doc = null;
  ocrPagesCache.forEach((p, idx) => {
    const wPt = p.canvas.width * 0.75, hPt = p.canvas.height * 0.75;
    const orient = wPt > hPt ? 'l' : 'p';
    if (idx === 0) doc = new jsPDF({ orientation: orient, unit: 'pt', format: [wPt, hPt], compress: true });
    else doc.addPage([wPt, hPt], orient);
    doc.addImage(p.canvas.toDataURL('image/jpeg', 0.72), 'JPEG', 0, 0, wPt, hPt, undefined, 'FAST');
    p.words.forEach(w => {
      if (!w.text || !w.bbox) return;
      doc.setFontSize(Math.max(8, (w.bbox.y1 - w.bbox.y0) * 0.75));
      doc.text(w.text, w.bbox.x0 * 0.75, w.bbox.y1 * 0.75, { renderingMode: 'invisible' });
    });
  });
  doc.save(`${baseName}_Searchable.pdf`);
};

// Cetak Kartu Bukti Upload PDF
window.downloadUploadReceiptPdf = (customData = null) => {
  const data = customData || lastReceiptData;
  if (!data) return alert('Belum ada data bukti pengumpulan.');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

  doc.setFillColor(79, 70, 229); doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text('KARTU BUKTI PENGUMPULAN DOKUMEN DIGITAL', 15, 18);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text('SmartDoc Studio v9.5 - Tanda Terima Resmi Penyimpanan Cloud & Riwayat', 15, 27);

  doc.setFillColor(238, 242, 255); doc.setDrawColor(165, 180, 252);
  doc.roundedRect(15, 46, 180, 24, 3, 3, 'FD');
  doc.setTextColor(55, 48, 163); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('KODE AKSES RIWAYAT KOMPRESI (SIMPAN KODE INI):', 20, 54);
  doc.setFontSize(18); doc.text(data.kodeKompresi, 20, 64);

  doc.setTextColor(30, 41, 59); doc.setFontSize(10);
  doc.text('Nama Pengirim', 15, 82); doc.text(': ' + data.nama, 60, 82);
  doc.text('Keperluan / Kategori', 15, 90); doc.text(': ' + data.keterangan, 60, 90);
  doc.text('Waktu Pengumpulan', 15, 98); doc.text(': ' + data.tanggal, 60, 98);
  doc.text('Jumlah Berkas', 15, 106); doc.text(': ' + data.files.length + ' Dokumen Terkompresi', 60, 106);

  let y = 118;
  doc.setFillColor(241, 245, 249); doc.rect(15, y, 180, 9, 'F');
  doc.setFontSize(9);
  doc.text('No', 18, y + 6); doc.text('Nama Dokumen Terkompresi', 28, y + 6);
  doc.text('Ukuran Akhir', 125, y + 6); doc.text('Status', 158, y + 6);

  y += 15; doc.setFont('helvetica', 'normal');
  data.files.forEach((f, idx) => {
    if (y > 265) { doc.addPage(); y = 25; }
    doc.setTextColor(15, 23, 42);
    doc.text(String(idx + 1), 18, y);
    doc.text(f.fileName.length > 48 ? f.fileName.substring(0, 45) + '...' : f.fileName, 28, y);
    doc.text(String(f.compressedSize || '-'), 125, y);
    doc.setTextColor(5, 150, 105); doc.setFont('helvetica', 'bold');
    doc.text('Tersimpan', 158, y); doc.setFont('helvetica', 'normal');
    y += 8;
  });
  doc.save(`Bukti_Upload_${data.kodeKompresi}.pdf`);
};

function parsePageSelection(rangeStr, maxPages) {
  if (!rangeStr || !rangeStr.trim()) return Array.from({ length: maxPages }, (_, i) => i + 1);
  const pages = new Set();
  for (let part of rangeStr.split(',')) {
    part = part.trim();
    if (!part) continue;
    if (part.includes('-')) {
      const [sRaw, eRaw] = part.split('-').map(n => parseInt(n.trim(), 10));
      if (!isNaN(sRaw) && !isNaN(eRaw)) {
        for (let i = Math.max(1, Math.min(sRaw, eRaw)); i <= Math.min(maxPages, Math.max(sRaw, eRaw)); i++) pages.add(i);
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= maxPages) pages.add(num);
    }
  }
  const res = Array.from(pages).sort((a, b) => a - b);
  return res.length > 0 ? res : Array.from({ length: maxPages }, (_, i) => i + 1);
}

window.switchMode = (mode) => {
  currentMode = mode;
  ['local', 'merge', 'ocr', 'cloud', 'history'].forEach(m => {
    const btn = document.getElementById('tab_' + m);
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
  if (mode === 'history') { historyArea.classList.remove('hidden'); refreshOfflineQueueUI(); return; }

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
    if (mergedPdfBlob) mergedResultCard.classList.remove('hidden');
  } else if (mode === 'cloud') {
    cloudIdentity.classList.remove('hidden'); mergeSettings.classList.add('hidden'); mergedResultCard.classList.add('hidden');
    btnCompressAll.classList.remove('hidden'); btnMergeNow.classList.add('hidden');
    btnDownloadAllLocal.classList.add('hidden'); btnSubmitCloud.classList.remove('hidden');
  }
  renderQueueUI();
};

async function addFilesToQueue(filesArray) {
  for (const file of filesArray) {
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImg && !isPdf) continue;

    const id = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const type = isImg ? 'image' : 'pdf';
    let totalPages = 1;

    if (isPdf) {
      try {
        const buf = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
        totalPages = pdfDoc.numPages;
      } catch (err) { totalPages = 1; }
    }

    const options = isImg ? [
      { label: 'Ekstra Kecil (< 150 KB)', targetKB: 140 },
      { label: 'Sedang (150 - 350 KB)', targetKB: 300 },
      { label: 'Tajam (350 - 700 KB)', targetKB: 600 }
    ] : [
      { label: 'Ringan (< 500 KB)', targetKB: 450 },
      { label: 'Standar (500 KB - 1.2 MB)', targetKB: 1000 },
      { label: 'Detail Tinggi (1.2 - 2.5 MB)', targetKB: 2200 }
    ];

    fileQueue.push({
      id, file, type, totalPages,
      pageSelection: totalPages > 1 ? `1-${totalPages}` : '1',
      keptPagesCount: totalPages,
      options,
      selectedTargetKB: options[1].targetKB,
      compressedBlob: null,
      status: 'pending',
      progress: 0
    });
  }
  mergedPdfBlob = null;
  document.getElementById('mergedResultCard').classList.add('hidden');
  renderQueueUI();
}

fileInput.addEventListener('change', async (e) => {
  const selectedFiles = Array.from(e.target.files);
  if (!selectedFiles.length) return;
  await addFilesToQueue(selectedFiles);
  fileInput.value = '';
});

function renderQueueUI() {
  fileListContainer.innerHTML = '';
  if (fileQueue.length === 0) {
    batchActionBar.classList.add('hidden');
    updateSummaryBadges();
    return;
  }
  batchActionBar.classList.remove('hidden');

  fileQueue.forEach((item, index) => {
    const isDone = item.status === 'done' && item.compressedBlob;
    const savingsPct = isDone ? Math.max(0, Math.round((1 - item.compressedBlob.size / item.file.size) * 100)) : 0;
    const badgeColor = item.type === 'image' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700';

    const optionsHtml = item.options.map(opt => `
      <option value="${opt.targetKB}" ${Number(item.selectedTargetKB) === opt.targetKB ? 'selected' : ''}>${opt.label}</option>
    `).join('');

    const card = document.createElement('div');
    card.className = `p-4 rounded-xl border transition ${isDone ? 'bg-emerald-50/30 border-emerald-300' : 'bg-white border-slate-200'} shadow-sm space-y-3`;
    card.innerHTML = `
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-start gap-3 flex-1 min-w-0">
          <div class="flex flex-col gap-1 shrink-0">
            <button type="button" onclick="moveItem(${index}, -1)" ${index === 0 ? 'disabled' : ''} class="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded font-bold">▲</button>
            <button type="button" onclick="moveItem(${index}, 1)" ${index === fileQueue.length - 1 ? 'disabled' : ''} class="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded font-bold">▼</button>
          </div>
          <div class="space-y-1 flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-extrabold text-indigo-600">#${index + 1}</span>
              <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full ${badgeColor}">
                ${item.type === 'image' ? 'GAMBAR' : `PDF (${item.totalPages} Hal)`}
              </span>
              <h4 class="font-bold text-sm text-slate-800 truncate">${item.file.name}</h4>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
              <span>Asli: <b>${formatBytes(item.file.size)}</b></span>
              ${isDone ? `<span>➔</span><span class="text-emerald-600 font-bold">Hasil: ${formatBytes(item.compressedBlob.size)} (Hemat ${savingsPct}%)</span>` : ''}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          ${currentMode !== 'merge' ? `
            <select onchange="changeTargetSize('${item.id}', this.value)" class="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-2 bg-white outline-none">${optionsHtml}</select>
            <button type="button" onclick="compressSingleItem('${item.id}')" ${item.status === 'compressing' ? 'disabled' : ''} class="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition">
              ${item.status === 'compressing' ? `Proses (${item.progress}%)...` : (isDone ? 'Proses Ulang' : 'Proses & Kompres')}
            </button>
          ` : ''}
          ${isDone && currentMode !== 'merge' ? `
            <button type="button" onclick="openPreviewModal('${item.id}')" class="px-3 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-xs font-bold rounded-lg transition">👁️ Preview</button>
            <button type="button" onclick="downloadSingleFile('${item.id}')" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition">⬇️ Unduh</button>
          ` : ''}
          <button type="button" onclick="removeItem('${item.id}')" class="p-2 text-slate-400 hover:text-red-600 rounded-lg transition">✕</button>
        </div>
      </div>
      ${item.type === 'pdf' ? `
        <div class="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/80 px-3 py-2 rounded-lg">
          <div class="text-xs text-slate-700">
            <span class="font-bold text-indigo-900">✂️ Pilih / Hapus Halaman PDF:</span>
            <span class="text-slate-500 ml-1">Contoh: <b>1, 3, 5-${item.totalPages}</b></span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <input type="text" value="${item.pageSelection}" onchange="updatePageSelection('${item.id}', this.value)" class="px-2.5 py-1 text-xs font-mono font-bold border border-slate-300 rounded bg-white w-36 outline-none">
            <span class="text-[11px] font-semibold text-slate-500">dari ${item.totalPages} hal</span>
          </div>
        </div>
      ` : ''}
    `;
    fileListContainer.appendChild(card);
  });
  updateSummaryBadges();
}

window.updatePageSelection = (id, val) => {
  const item = fileQueue.find(i => i.id === id);
  if (item) { item.pageSelection = val; item.status = 'pending'; item.compressedBlob = null; renderQueueUI(); }
};

window.moveItem = (index, direction) => {
  const targetIdx = index + direction;
  if (targetIdx < 0 || targetIdx >= fileQueue.length) return;
  const temp = fileQueue[index];
  fileQueue[index] = fileQueue[targetIdx];
  fileQueue[targetIdx] = temp;
  mergedPdfBlob = null;
  document.getElementById('mergedResultCard').classList.add('hidden');
  renderQueueUI();
};

function updateSummaryBadges() {
  const total = fileQueue.length;
  const readyItems = fileQueue.filter(i => i.status === 'done' && i.compressedBlob);
  const readyCount = readyItems.length;

  document.getElementById('readyCountBadge').textContent = `${readyCount} / ${total}`;
  document.getElementById('totalFilesText').textContent = `${total} File`;

  const allReady = total > 0 && readyCount === total;
  const btnDownloadAllLocal = document.getElementById('btnDownloadAllLocal');
  const btnSubmitCloud = document.getElementById('btnSubmitCloud');

  btnDownloadAllLocal.disabled = !allReady;
  btnDownloadAllLocal.textContent = allReady
    ? `⬇️ Unduh Semua File Terkompresi ke Perangkat (${readyCount} File)`
    : `Proses Semua File Terlebih Dahulu (${readyCount}/${total} Siap)`;

  btnSubmitCloud.disabled = !allReady;
  btnSubmitCloud.textContent = allReady
    ? `☁️ Kirim ke Google Drive / Simpan ke IndexedDB Offline (${readyCount} File)`
    : `Proses Semua File Terlebih Dahulu (${readyCount}/${total} Siap)`;
}

window.changeTargetSize = (id, val) => {
  const item = fileQueue.find(i => i.id === id);
  if (item) { item.selectedTargetKB = parseInt(val, 10); item.status = 'pending'; item.compressedBlob = null; renderQueueUI(); }
};

window.removeItem = (id) => { fileQueue = fileQueue.filter(i => i.id !== id); renderQueueUI(); };

document.getElementById('btnClearAll').addEventListener('click', () => {
  fileQueue = []; mergedPdfBlob = null;
  document.getElementById('mergedResultCard').classList.add('hidden');
  renderQueueUI();
});

window.compressSingleItem = async (id) => {
  const item = fileQueue.find(i => i.id === id);
  if (!item) return;
  item.status = 'compressing'; item.progress = 10; renderQueueUI();
  try {
    if (item.type === 'image') {
      item.compressedBlob = await compressImageToTarget(item.file, item.selectedTargetKB);
      item.keptPagesCount = 1;
    } else {
      const res = await compressPdfToTarget(item, (pct) => { item.progress = pct; renderQueueUI(); });
      item.compressedBlob = res.blob;
      item.keptPagesCount = res.keptCount;
    }
    item.status = 'done';
  } catch (err) {
    item.status = 'error';
    alert(`Gagal memproses ${item.file.name}: ` + err.message);
  }
  renderQueueUI();
};

document.getElementById('btnCompressAll').addEventListener('click', async () => {
  for (const item of fileQueue) await window.compressSingleItem(item.id);
});

async function compressImageToTarget(file, targetKB) {
  const targetBytes = targetKB * 1024;
  const sigEnabled = document.getElementById('enableSignature').checked && hasSignatureDrawn;
  if (file.size <= targetBytes && !sigEnabled) return file;

  const img = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = e.target.result; };
    r.readAsDataURL(file);
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let scale = 1.0;
  const maxDim = Math.max(img.width, img.height);
  if (maxDim > 2000) scale = 2000 / maxDim;

  let bestBlob = null;
  while (scale >= 0.3) {
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    stampSignatureOnCanvas(canvas);

    let low = 0.15, high = 0.92;
    for (let i = 0; i < 6; i++) {
      const mid = (low + high) / 2;
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', mid));
      bestBlob = blob;
      if (blob.size > targetBytes) high = mid; else low = mid;
    }
    if (bestBlob && bestBlob.size <= targetBytes) break;
    scale -= 0.2;
  }
  return bestBlob;
}

async function compressPdfToTarget(item, onProgress) {
  const arrayBuffer = await item.file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pagesToKeep = parsePageSelection(item.pageSelection, pdf.numPages);

  const budgetPerPageKB = item.selectedTargetKB / pagesToKeep.length;
  let renderScale = 1.5, jpegQuality = 0.75;
  if (budgetPerPageKB < 80) { renderScale = 1.0; jpegQuality = 0.5; }
  else if (budgetPerPageKB < 180) { renderScale = 1.25; jpegQuality = 0.65; }
  else { renderScale = 1.6; jpegQuality = 0.80; }

  const sigTarget = document.getElementById('sigTargetPage').value;
  const { jsPDF } = window.jspdf;
  let newPdf = null;

  for (let idx = 0; idx < pagesToKeep.length; idx++) {
    const pageNum = pagesToKeep[idx];
    if (onProgress) onProgress(Math.round(((idx + 1) / pagesToKeep.length) * 100));

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    const shouldSign = sigTarget === 'all' || (sigTarget === 'first' && idx === 0) || (sigTarget === 'last' && idx === pagesToKeep.length - 1);
    if (shouldSign) stampSignatureOnCanvas(canvas);

    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
    const origViewport = page.getViewport({ scale: 1.0 });
    const orientation = origViewport.width > origViewport.height ? 'l' : 'p';

    if (idx === 0) newPdf = new jsPDF({ orientation, unit: 'pt', format: [origViewport.width, origViewport.height], compress: true });
    else newPdf.addPage([origViewport.width, origViewport.height], orientation);
    newPdf.addImage(imgData, 'JPEG', 0, 0, origViewport.width, origViewport.height, undefined, 'FAST');
  }
  return { blob: newPdf.output('blob'), keptCount: pagesToKeep.length };
}

document.getElementById('btnMergeNow').addEventListener('click', async () => {
  if (fileQueue.length === 0) return alert('Tambahkan file terlebih dahulu.');
  const btnMerge = document.getElementById('btnMergeNow');
  const qualityPreset = document.getElementById('mergedTargetQuality').value;
  let renderScale = 1.35, jpegQuality = 0.72;
  if (qualityPreset === 'low') { renderScale = 1.0; jpegQuality = 0.52; }
  else if (qualityPreset === 'high') { renderScale = 1.7; jpegQuality = 0.85; }

  btnMerge.disabled = true; btnMerge.textContent = '⏳ Menggabungkan Halaman...';

  try {
    const { jsPDF } = window.jspdf;
    let mergedDoc = null, totalPageCounter = 0;
    const sigTarget = document.getElementById('sigTargetPage').value;
    const renderTasks = [];

    for (const item of fileQueue) {
      if (item.type === 'pdf') {
        const buf = await item.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const pagesToKeep = parsePageSelection(item.pageSelection, pdf.numPages);
        pagesToKeep.forEach(pNum => renderTasks.push({ type: 'pdf', pdf, pNum }));
      } else {
        renderTasks.push({ type: 'image', file: item.file });
      }
    }

    for (let tIdx = 0; tIdx < renderTasks.length; tIdx++) {
      const task = renderTasks[tIdx];
      const shouldSign = sigTarget === 'all' || (sigTarget === 'first' && tIdx === 0) || (sigTarget === 'last' && tIdx === renderTasks.length - 1);

      if (task.type === 'pdf') {
        const page = await task.pdf.getPage(task.pNum);
        const vp = page.getViewport({ scale: renderScale });
        const origVp = page.getViewport({ scale: 1.0 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        if (shouldSign) stampSignatureOnCanvas(canvas);

        const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
        const orientation = origVp.width > origVp.height ? 'l' : 'p';
        if (!mergedDoc) mergedDoc = new jsPDF({ orientation, unit: 'pt', format: [origVp.width, origVp.height], compress: true });
        else mergedDoc.addPage([origVp.width, origVp.height], orientation);
        mergedDoc.addImage(imgData, 'JPEG', 0, 0, origVp.width, origVp.height, undefined, 'FAST');
        totalPageCounter++;
      } else {
        const img = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = e => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = e.target.result; };
          r.readAsDataURL(task.file);
        });
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (Math.max(w, h) > 1600) { const r = 1600 / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        if (shouldSign) stampSignatureOnCanvas(canvas);

        const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
        const isLandscape = w > h;
        const pageW = isLandscape ? 841.89 : 595.28, pageH = isLandscape ? 595.28 : 841.89;
        if (!mergedDoc) mergedDoc = new jsPDF({ orientation: isLandscape ? 'l' : 'p', unit: 'pt', format: 'a4', compress: true });
        else mergedDoc.addPage('a4', isLandscape ? 'l' : 'p');

        const margin = 20;
        const ratio = Math.min((pageW - margin * 2) / w, (pageH - margin * 2) / h);
        const drawW = w * ratio, drawH = h * ratio;
        mergedDoc.addImage(imgData, 'JPEG', (pageW - drawW) / 2, (pageH - drawH) / 2, drawW, drawH, undefined, 'FAST');
        totalPageCounter++;
      }
    }

    mergedPdfBlob = mergedDoc.output('blob');
    mergedTotalPages = totalPageCounter;
    const baseName = (document.getElementById('mergedFileName').value || 'Dokumen_Gabungan').replace(/\.pdf$/i, '');
    document.getElementById('mergedResultTitle').textContent = `${baseName}.pdf`;
    document.getElementById('mergedResultMeta').textContent = `Total: ${totalPageCounter} Halaman | Ukuran Akhir: ${formatBytes(mergedPdfBlob.size)}`;
    document.getElementById('mergedResultCard').classList.remove('hidden');
  } catch (err) {
    alert('Gagal menggabungkan PDF: ' + err.message);
  } finally {
    btnMerge.disabled = false;
    btnMerge.textContent = '📑 Gabung Halaman Terpilih Jadi 1 PDF';
  }
});

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

window.downloadSingleFile = (id) => {
  const item = fileQueue.find(i => i.id === id);
  if (!item || !item.compressedBlob) return;
  const ext = item.type === 'image' ? '.jpg' : '.pdf';
  const cleanName = item.file.name.replace(/\.[^/.]+$/, "") + "_compressed" + ext;
  triggerBrowserDownload(item.compressedBlob, cleanName);
};

document.getElementById('btnDownloadAllLocal').addEventListener('click', () => {
  fileQueue.forEach((item, idx) => {
    if (item.compressedBlob) setTimeout(() => window.downloadSingleFile(item.id), idx * 350);
  });
});

window.downloadMergedPdf = () => {
  if (!mergedPdfBlob) return;
  const baseName = (document.getElementById('mergedFileName').value || 'Dokumen_Gabungan').replace(/\.pdf$/i, '');
  triggerBrowserDownload(mergedPdfBlob, `${baseName}.pdf`);
};

window.openPreviewModal = async (id) => {
  const item = fileQueue.find(i => i.id === id);
  if (!item || !item.compressedBlob) return;

  document.getElementById('beforeColumn').classList.remove('hidden');
  document.getElementById('previewGridContainer').className = 'p-4 sm:p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 flex-1';
  document.getElementById('afterColumnLabel').textContent = 'AFTER (Hasil Kompresi + TTD)';
  document.getElementById('previewModalTitle').textContent = `Preview: ${item.file.name}`;
  document.getElementById('beforeMetaBadge').textContent = formatBytes(item.file.size);
  const pct = Math.max(0, Math.round((1 - item.compressedBlob.size / item.file.size) * 100));
  document.getElementById('afterMetaBadge').textContent = `${formatBytes(item.compressedBlob.size)} (Hemat ${pct}%)`;

  const beforeImg = document.getElementById('beforeImgPreview'), afterImg = document.getElementById('afterImgPreview');
  const beforeCanvas = document.getElementById('beforePdfCanvas'), afterCanvas = document.getElementById('afterPdfCanvas');
  const pdfToolbar = document.getElementById('pdfNavToolbar');
  document.getElementById('previewModal').classList.remove('hidden');

  if (item.type === 'image') {
    pdfToolbar.classList.add('hidden');
    beforeCanvas.classList.add('hidden'); afterCanvas.classList.add('hidden');
    beforeImg.classList.remove('hidden'); afterImg.classList.remove('hidden');
    beforeImg.src = URL.createObjectURL(item.file);
    afterImg.src = URL.createObjectURL(item.compressedBlob);
  } else {
    beforeImg.classList.add('hidden'); afterImg.classList.add('hidden');
    beforeCanvas.classList.remove('hidden'); afterCanvas.classList.remove('hidden');
    pdfToolbar.classList.remove('hidden');

    const origBuf = await item.file.arrayBuffer();
    const compBuf = await item.compressedBlob.arrayBuffer();
    pdfPreviewState.mode = 'compare';
    pdfPreviewState.origDoc = await pdfjsLib.getDocument({ data: origBuf }).promise;
    pdfPreviewState.compDoc = await pdfjsLib.getDocument({ data: compBuf }).promise;
    pdfPreviewState.keptPagesMap = parsePageSelection(item.pageSelection, pdfPreviewState.origDoc.numPages);
    pdfPreviewState.pageNum = 1;
    pdfPreviewState.totalPages = pdfPreviewState.compDoc.numPages;
    await renderPdfComparisonPage(1);
  }
};

window.openMergedPreview = async () => {
  if (!mergedPdfBlob) return;
  document.getElementById('previewModalTitle').textContent = 'Preview Hasil Penggabungan PDF';
  document.getElementById('beforeColumn').classList.add('hidden');
  document.getElementById('previewGridContainer').className = 'p-4 sm:p-6 overflow-y-auto grid grid-cols-1 gap-6 bg-slate-50 flex-1';
  document.getElementById('afterColumnLabel').textContent = `DOKUMEN GABUNGAN (${mergedTotalPages} HALAMAN)`;
  document.getElementById('afterMetaBadge').textContent = formatBytes(mergedPdfBlob.size);
  document.getElementById('afterImgPreview').classList.add('hidden');
  document.getElementById('afterPdfCanvas').classList.remove('hidden');
  document.getElementById('pdfNavToolbar').classList.remove('hidden');
  document.getElementById('previewModal').classList.remove('hidden');

  const compBuf = await mergedPdfBlob.arrayBuffer();
  pdfPreviewState.mode = 'single';
  pdfPreviewState.compDoc = await pdfjsLib.getDocument({ data: compBuf }).promise;
  pdfPreviewState.pageNum = 1;
  pdfPreviewState.totalPages = pdfPreviewState.compDoc.numPages;
  await renderPdfComparisonPage(1);
};

async function renderPdfComparisonPage(pageNumber) {
  const { mode, origDoc, compDoc, totalPages, keptPagesMap } = pdfPreviewState;
  document.getElementById('pdfPageIndicator').textContent = `Halaman Hasil ${pageNumber} dari ${totalPages}`;
  document.getElementById('btnPrevPage').disabled = pageNumber <= 1;
  document.getElementById('btnNextPage').disabled = pageNumber >= totalPages;

  if (mode === 'compare' && origDoc) {
    const origPageNum = keptPagesMap[pageNumber - 1] || pageNumber;
    const origPage = await origDoc.getPage(origPageNum);
    const origVp = origPage.getViewport({ scale: 1.2 });
    const bCanvas = document.getElementById('beforePdfCanvas');
    bCanvas.width = origVp.width; bCanvas.height = origVp.height;
    await origPage.render({ canvasContext: bCanvas.getContext('2d'), viewport: origVp }).promise;
  }

  const compPage = await compDoc.getPage(pageNumber);
  const compVp = compPage.getViewport({ scale: 1.2 });
  const aCanvas = document.getElementById('afterPdfCanvas');
  aCanvas.width = compVp.width; aCanvas.height = compVp.height;
  await compPage.render({ canvasContext: aCanvas.getContext('2d'), viewport: compVp }).promise;
}

document.getElementById('btnPrevPage').addEventListener('click', () => {
  if (pdfPreviewState.pageNum > 1) { pdfPreviewState.pageNum--; renderPdfComparisonPage(pdfPreviewState.pageNum); }
});
document.getElementById('btnNextPage').addEventListener('click', () => {
  if (pdfPreviewState.pageNum < pdfPreviewState.totalPages) { pdfPreviewState.pageNum++; renderPdfComparisonPage(pdfPreviewState.pageNum); }
});
window.closePreviewModal = () => { document.getElementById('previewModal').classList.add('hidden'); };

// =========================================================================
// 5. PENGIRIMAN KE GOOGLE DRIVE DENGAN FALLBACK KE INDEXEDDB OFFLINE
// =========================================================================
async function sendFilesToGas(filesPayload, nama, keterangan, kodeKompresi) {
  const alertBox = document.getElementById('statusAlert');
  const cleanCode = kodeKompresi.toUpperCase();

  if (!navigator.onLine) {
    await saveToIndexedDBOutbox({ nama, keterangan, kodeKompresi: cleanCode, files: filesPayload });

    lastReceiptData = {
      nama,
      keterangan,
      kodeKompresi: cleanCode,
      tanggal: new Date().toLocaleString('id-ID') + ' (Antrean Offline IndexedDB)',
      files: filesPayload
    };

    alertBox.className = 'p-5 rounded-xl text-sm font-medium bg-amber-50 text-amber-900 border-2 border-amber-400 space-y-3';
    alertBox.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span class="text-base font-extrabold block">📦 Disimpan ke Brankas Offline (IndexedDB)!</span>
          <span class="text-xs">Karena Anda sedang Offline, ${filesPayload.length} dokumen disimpan aman di perangkat dengan Kode <b class="font-mono">${cleanCode}</b> dan akan otomatis diunggah begitu internet aktif kembali.</span>
        </div>
        <button type="button" onclick="downloadUploadReceiptPdf()" class="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold rounded-xl shadow transition shrink-0">
          🖨️ Cetak Kartu Bukti Sementara (PDF)
        </button>
      </div>
    `;
    alertBox.classList.remove('hidden');
    return;
  }

  alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-blue-50 text-blue-800 border border-blue-200';
  alertBox.textContent = `Mengunggah ${filesPayload.length} dokumen ke Google Drive & membuat Kartu Bukti...`;
  alertBox.classList.remove('hidden');

  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'upload',
        nama,
        keterangan,
        kodeKompresi: cleanCode,
        files: filesPayload
      })
    });
    const result = await response.json();

    if (result.status === 'success') {
      lastReceiptData = {
        nama,
        keterangan,
        kodeKompresi: result.kodeKompresi,
        tanggal: new Date().toLocaleString('id-ID'),
        files: result.uploadedFiles
      };

      const linksHtml = result.uploadedFiles.map((f, idx) =>
        `<li><a href="${f.fileUrl}" target="_blank" class="underline font-bold text-emerald-900">${idx + 1}. ${f.fileName} (${f.compressedSize})</a></li>`
      ).join('');

      alertBox.className = 'p-5 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-900 border-2 border-emerald-400 space-y-3';
      alertBox.innerHTML = `
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200 pb-3">
          <div>
            <span class="text-base font-extrabold block">✅ Dokumen Berhasil Tersimpan di Google Drive!</span>
            <span class="text-xs text-emerald-700">Kode Kompresi: <b class="font-mono text-indigo-700">${result.kodeKompresi}</b></span>
          </div>
          <button type="button" onclick="downloadUploadReceiptPdf()" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold rounded-xl shadow-md transition shrink-0">
            🖨️ Cetak Kartu Bukti Upload (PDF)
          </button>
        </div>
        <ul class="list-disc pl-5 text-xs space-y-1">${linksHtml}</ul>
      `;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    await saveToIndexedDBOutbox({ nama, keterangan, kodeKompresi: cleanCode, files: filesPayload });
    alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-amber-50 text-amber-900 border border-amber-300';
    alertBox.textContent = `⚠️ Koneksi terputus saat mengunggah. Dokumen telah diamankan ke Antrean Offline IndexedDB (Kode: ${cleanCode}) dan bisa disinkronkan ulang.`;
  }
}

document.getElementById('btnSubmitCloud').addEventListener('click', async () => {
  const nama = document.getElementById('nama').value.trim();
  const keterangan = document.getElementById('keterangan').value.trim();
  const kodeKompresi = document.getElementById('kodeKompresi').value.trim();
  if (!nama || !keterangan || !kodeKompresi) return alert('Mohon lengkapi Nama Lengkap, Keperluan, dan Kode Kompresi.');

  const filesPayload = [];
  for (const item of fileQueue) {
    const base64Data = await new Promise((res) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result.split(',')[1]);
      r.readAsDataURL(item.compressedBlob);
    });
    const ext = item.type === 'image' ? '.jpg' : '.pdf';
    const cleanName = item.file.name.replace(/\.[^/.]+$/, "") + "_compressed" + ext;
    filesPayload.push({
      fileName: cleanName,
      mimeType: item.compressedBlob.type,
      originalSize: formatBytes(item.file.size),
      compressedSize: formatBytes(item.compressedBlob.size),
      fileBase64: base64Data
    });
  }
  await sendFilesToGas(filesPayload, nama, keterangan, kodeKompresi);
});

window.uploadMergedToCloud = async () => {
  if (!mergedPdfBlob) return;
  const nama = prompt("Masukkan Nama Lengkap Anda:", "");
  if (!nama) return;
  const defaultCode = document.getElementById('kodeKompresi').value || 'DOC-8899A';
  const kodeKompresi = prompt("Catat Kode Kompresi Anda:", defaultCode);
  if (!kodeKompresi) return;

  const base64Data = await new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(',')[1]);
    r.readAsDataURL(mergedPdfBlob);
  });
  const baseName = (document.getElementById('mergedFileName').value || 'Dokumen_Gabungan').replace(/\.pdf$/i, '') + '.pdf';
  const totalOrigBytes = fileQueue.reduce((acc, i) => acc + i.file.size, 0);

  await sendFilesToGas([{
    fileName: baseName,
    mimeType: 'application/pdf',
    originalSize: formatBytes(totalOrigBytes),
    compressedSize: formatBytes(mergedPdfBlob.size),
    fileBase64: base64Data
  }], nama, "Gabungan PDF", kodeKompresi);
};

document.getElementById('historySearchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!navigator.onLine) return alert('Pencarian riwayat Google Drive membutuhkan koneksi internet.');
  const nama = document.getElementById('searchNama').value.trim();
  const kode = document.getElementById('searchKode').value.trim().toUpperCase();
  const container = document.getElementById('historyResultContainer');
  const btn = document.getElementById('btnSearchHistory');

  btn.disabled = true; btn.textContent = '⏳ Mencari...';
  container.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 text-slate-600 text-sm text-center">Mencari dokumen...</div>`;

  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'history', nama, kodeKompresi: kode })
    });
    const result = await response.json();

    if (result.status === 'success') {
      if (result.records.length === 0) {
        container.innerHTML = `<div class="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-center text-sm font-bold">Dokumen tidak ditemukan. Pastikan Nama & Kode Kompresi benar.</div>`;
      } else {
        lastReceiptData = {
          nama: result.records[0].nama,
          keterangan: result.records[0].keterangan,
          kodeKompresi: kode,
          tanggal: result.records[0].tanggal,
          files: result.records
        };

        const cardsHtml = result.records.map((rec) => `
          <div class="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="space-y-1">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 text-[11px] font-mono font-extrabold rounded bg-indigo-100 text-indigo-800">${rec.kodeKompresi}</span>
                <span class="text-xs text-slate-400">${rec.tanggal}</span>
              </div>
              <h4 class="font-bold text-sm text-slate-900">${rec.fileName}</h4>
              <p class="text-xs text-slate-600">Pengirim: <b>${rec.nama}</b> | Ukuran: ${rec.originalSize} ➔ <b class="text-emerald-600">${rec.compressedSize}</b></p>
            </div>
            <a href="${rec.fileUrl}" target="_blank" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition text-center shrink-0">
              📂 Buka File di Drive
            </a>
          </div>
        `).join('');

        container.innerHTML = `
          <div class="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl">
            <span class="text-xs font-bold text-emerald-900">Ditemukan ${result.records.length} dokumen milik <b>${result.records[0].nama}</b>:</span>
            <button type="button" onclick="downloadUploadReceiptPdf()" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow transition">
              🖨️ Cetak Ulang Kartu Bukti (PDF)
            </button>
          </div>
          ${cardsHtml}
        `;
      }
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    container.innerHTML = `<div class="p-4 rounded-xl bg-red-50 text-red-700 text-sm">❌ Gagal mengambil riwayat: ${err.message}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = '🔎 Cari Dokumen Saya';
  }
});
