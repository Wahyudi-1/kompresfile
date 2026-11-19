// =========================================================================
// 4. JS/SCANNER.JS - 4-POINT PERSPECTIVE, MAGNIFIER, A4/FOLIO & MULTI-PAGE
// =========================================================================

let cameraStream = null;
let cameraFacing = 'environment';
let scannerTargetDestination = 'queue';
let scanColorMode = 'color';   // 'color' | 'magic' | 'bw'
let scanPaperRatio = 'free';   // 'free' | 'a4' | 'folio'
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

window.rotateCurrentScan = (deltaDeg) => {
  currentScanRotation = (currentScanRotation + deltaDeg + 360) % 360;
  updateRotationBadgeText();
  window.updateWarpedPreview();
};

function updateRotationBadgeText() {
  const labels = { 0: '0° (Tegak)', 90: '90° (Kanan)', 180: '180° (Terbalik)', 270: '270° (Kiri)' };
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
    centerX - srcRadiusX, centerY - srcRadiusY,
    srcRadiusX * 2, srcRadiusY * 2,
    0, 0, magCanvas.width, magCanvas.height
  );
}

function performPerspectiveWarp(srcCanvas, cornersRatio, colorMode, rotationDeg = 0, paperRatioMode = 'free', maxOutputDim = 1400) {
  const sw = srcCanvas.width, sh = srcCanvas.height;
  const srcData = srcCanvas.getContext('2d').getImageData(0, 0, sw, sh).data;

  const p0 = { x: cornersRatio[0].x * sw, y: cornersRatio[0].y * sh };
  const p1 = { x: cornersRatio[1].x * sw, y: cornersRatio[1].y * sh };
  const p2 = { x: cornersRatio[2].x * sw, y: cornersRatio[2].y * sh };
  const p3 = { x: cornersRatio[3].x * sw, y: cornersRatio[3].y * sh };

  const topW = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const botW = Math.hypot(p2.x - p3.x, p2.y - p3.y);
  const leftH = Math.hypot(p3.x - p0.x, p3.y - p0.y);
  const rightH = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  let naturalW = Math.max(10, Math.round(Math.max(topW, botW)));
  let naturalH = Math.max(10, Math.round(Math.max(leftH, rightH)));
  let dstW = naturalW, dstH = naturalH;

  if (paperRatioMode === 'a4' || paperRatioMode === 'folio') {
    const targetAspect = paperRatioMode === 'a4' ? (297 / 210) : (330 / 215);
    if (naturalW > naturalH) {
      dstW = naturalW; dstH = Math.round(naturalW / targetAspect);
    } else {
      dstH = naturalH; dstW = Math.round(naturalH / targetAspect);
    }
  }

  if (Math.max(dstW, dstH) > maxOutputDim) {
    const scale = maxOutputDim / Math.max(dstW, dstH);
    dstW = Math.max(100, Math.round(dstW * scale));
    dstH = Math.max(100, Math.round(dstH * scale));
  }

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = dstW; baseCanvas.height = dstH;
  const baseCtx = baseCanvas.getContext('2d');
  const outImgData = baseCtx.createImageData(dstW, dstH);
  const dstData = outImgData.data;

  for (let y = 0; y < dstH; y++) {
    const v = y / (dstH - 1 || 1), invV = 1 - v;
    for (let x = 0; x < dstW; x++) {
      const u = x / (dstW - 1 || 1), invU = 1 - u;
      const srcX = invU * invV * p0.x + u * invV * p1.x + u * v * p2.x + invU * v * p3.x;
      const srcY = invU * invV * p0.y + u * invV * p1.y + u * v * p2.y + invU * v * p3.y;

      const ix = Math.min(sw - 1, Math.max(0, Math.round(srcX)));
      const iy = Math.min(sh - 1, Math.max(0, Math.round(srcY)));
      const srcIdx = (iy * sw + ix) * 4;
      const dstIdx = (y * dstW + x) * 4;

      let r = srcData[srcIdx], g = srcData[srcIdx + 1], b = srcData[srcIdx + 2];
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

      dstData[dstIdx] = r; dstData[dstIdx + 1] = g; dstData[dstIdx + 2] = b; dstData[dstIdx + 3] = 255;
    }
  }

  baseCtx.putImageData(outImgData, 0, 0);

  const normRot = ((rotationDeg % 360) + 360) % 360;
  if (normRot === 0) return baseCanvas;

  const rotCanvas = document.createElement('canvas');
  if (normRot === 90 || normRot === 270) {
    rotCanvas.width = dstH; rotCanvas.height = dstW;
  } else {
    rotCanvas.width = dstW; rotCanvas.height = dstH;
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

  const previewCanvas = performPerspectiveWarp(rawCanvas, quadCorners, scanColorMode, currentScanRotation, scanPaperRatio, 520);
  const targetPreview = document.getElementById('scannerWarpedPreviewCanvas');
  targetPreview.width = previewCanvas.width;
  targetPreview.height = previewCanvas.height;
  targetPreview.getContext('2d').drawImage(previewCanvas, 0, 0);

  const ratioLabels = {
    free: 'Bebas (Sesuai 4 Titik Sudut)',
    a4: 'Standar Kertas A4 (210 × 297 mm)',
    folio: 'Standar Kertas Folio / F4 (215 × 330 mm)'
  };
  const infoEl = document.getElementById('scanDimensionInfo');
  if (infoEl) infoEl.textContent = `Rasio Aktif: ${ratioLabels[scanPaperRatio]} — Pratinjau: ${previewCanvas.width}×${previewCanvas.height} px`;
};

function captureCurrentWarpedPageData() {
  const rawCanvas = document.getElementById('scannerRawCanvas');
  const finalCanvas = performPerspectiveWarp(rawCanvas, quadCorners, scanColorMode, currentScanRotation, scanPaperRatio, 1650);
  return {
    dataUrl: finalCanvas.toDataURL('image/jpeg', 0.88),
    width: finalCanvas.width,
    height: finalCanvas.height,
    paperRatio: scanPaperRatio
  };
}

window.addCurrentScanAndContinue = async () => {
  scannedPagesBatch.push(captureCurrentWarpedPageData());
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

window.finishBatchScanAsSinglePdf = async (includeCurrentCropStep = false) => {
  if (includeCurrentCropStep) scannedPagesBatch.push(captureCurrentWarpedPageData());
  if (scannedPagesBatch.length === 0) return alert('Belum ada halaman yang dipindai.');

  const { jsPDF } = window.jspdf;
  let pdfDoc = null;

  scannedPagesBatch.forEach((p, idx) => {
    const isLandscape = p.width > p.height;
    const orient = isLandscape ? 'l' : 'p';
    let pageWPt, pageHPt;

    if (p.paperRatio === 'a4') {
      pageWPt = isLandscape ? 841.89 : 595.28;
      pageHPt = isLandscape ? 595.28 : 841.89;
    } else if (p.paperRatio === 'folio') {
      pageWPt = isLandscape ? 935.43 : 609.45;
      pageHPt = isLandscape ? 609.45 : 935.43;
    } else {
      pageWPt = p.width * 0.75;
      pageHPt = p.height * 0.75;
    }

    if (idx === 0) pdfDoc = new jsPDF({ orientation: orient, unit: 'pt', format: [pageWPt, pageHPt], compress: true });
    else pdfDoc.addPage([pageWPt, pageHPt], orient);
    pdfDoc.addImage(p.dataUrl, 'JPEG', 0, 0, pageWPt, pageHPt, undefined, 'FAST');
  });

  const pdfBlob = pdfDoc.output('blob');
  const totalPagesCount = scannedPagesBatch.length;
  const ratioTag = scanPaperRatio.toUpperCase();
  const scannedPdfFile = new File([pdfBlob], `Scan_${ratioTag}_${totalPagesCount}Hal_${Date.now()}.pdf`, { type: 'application/pdf' });

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
    await window.addFilesToQueue([scannedPdfFile]);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  const galleryInput = document.getElementById('scannerGalleryInput');
  if (galleryInput) {
    galleryInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const rawCanvas = document.getElementById('scannerRawCanvas');
          rawCanvas.width = img.width; rawCanvas.height = img.height;
          rawCanvas.getContext('2d').drawImage(img, 0, 0);
          if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); cameraStream = null; }
          currentScanRotation = 0;
          enterFourPointCropMode();
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  const cropStage = document.getElementById('cropStageWrapper');
  [0, 1, 2, 3].forEach(idx => {
    const pinEl = document.getElementById('cornerHandle_' + idx);
    if (!pinEl) return;
    pinEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      activeCornerIndex = idx;
      pinEl.setPointerCapture(e.pointerId);
      updateMagnifierLoupe(idx, quadCorners[idx].x, quadCorners[idx].y);
    });
  });

  window.addEventListener('pointermove', (e) => {
    if (activeCornerIndex === null || !cropStage) return;
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
});
