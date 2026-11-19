// =========================================================================
// 5. JS/PROCESSOR.JS - MULTI-FORMAT IMAGE (JPG, PNG, WEBP, GIF, HEIC, BMP, AVIF, SVG) & PDF
// =========================================================================

window.parsePageSelection = (rangeStr, maxPages) => {
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
};

window.markAllPending = () => {
  AppState.fileQueue.forEach(item => { item.status = 'pending'; item.compressedBlob = null; });
  window.renderQueueUI();
};

// Deteksi ekstensi dan kategori file secara cerdas
function detectFileCategory(file) {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime === 'image/gif' || name.endsWith('.gif')) return 'gif';
  if (mime === 'image/heic' || mime === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif')) return 'heic';
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|webp|bmp|avif|svg|ico)$/.test(name)) return 'image';
  return 'unsupported';
}

window.addFilesToQueue = async (filesArray) => {
  for (const file of filesArray) {
    const category = detectFileCategory(file);
    if (category === 'unsupported') continue;

    const id = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    let totalPages = 1;

    if (category === 'pdf') {
      try {
        const buf = await file.arrayBuffer();
        const pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
        totalPages = pdfDoc.numPages;
      } catch (err) { totalPages = 1; }
    } else if (category === 'gif' && window.GifReader) {
      try {
        const buf = await file.arrayBuffer();
        const reader = new GifReader(new Uint8Array(buf));
        totalPages = reader.numFrames() || 1;
      } catch (err) { totalPages = 1; }
    }

    // Pilihan rentang ukuran sesuai tipe file
    let options;
    if (category === 'pdf') {
      options = [
        { label: 'Ringan (< 500 KB)', targetKB: 450 },
        { label: 'Standar (500 KB - 1.2 MB)', targetKB: 1000 },
        { label: 'Detail Tinggi (1.2 - 2.5 MB)', targetKB: 2200 }
      ];
    } else if (category === 'gif') {
      options = [
        { label: 'GIF Ringan (< 300 KB)', targetKB: 280 },
        { label: 'GIF Standar (300 - 800 KB)', targetKB: 750 },
        { label: 'GIF Tajam (800 KB - 1.8 MB)', targetKB: 1700 }
      ];
    } else {
      options = [
        { label: 'Ekstra Kecil (< 150 KB)', targetKB: 140 },
        { label: 'Sedang (150 - 350 KB)', targetKB: 300 },
        { label: 'Tajam (350 - 700 KB)', targetKB: 600 }
      ];
    }

    AppState.fileQueue.push({
      id,
      file,
      type: category, // 'pdf' | 'gif' | 'heic' | 'image'
      totalPages,
      pageSelection: totalPages > 1 ? `1-${totalPages}` : '1',
      keptPagesCount: totalPages,
      options,
      selectedTargetKB: options[1].targetKB,
      compressedBlob: null,
      outputExt: category === 'pdf' ? '.pdf' : (category === 'gif' ? '.gif' : '.jpg'),
      status: 'pending',
      progress: 0
    });
  }
  AppState.mergedPdfBlob = null;
  document.getElementById('mergedResultCard').classList.add('hidden');
  window.renderQueueUI();
};

window.renderQueueUI = () => {
  const fileListContainer = document.getElementById('fileListContainer');
  const batchActionBar = document.getElementById('batchActionBar');
  if (!fileListContainer) return;

  fileListContainer.innerHTML = '';
  if (AppState.fileQueue.length === 0) {
    batchActionBar.classList.add('hidden');
    updateSummaryBadges();
    return;
  }
  batchActionBar.classList.remove('hidden');

  AppState.fileQueue.forEach((item, index) => {
    const isDone = item.status === 'done' && item.compressedBlob;
    const savingsPct = isDone ? Math.max(0, Math.round((1 - item.compressedBlob.size / item.file.size) * 100)) : 0;

    let badgeColor = 'bg-blue-100 text-blue-700';
    let badgeText = 'GAMBAR';
    if (item.type === 'pdf') {
      badgeColor = 'bg-amber-100 text-amber-700';
      badgeText = `PDF (${item.totalPages} Hal)`;
    } else if (item.type === 'gif') {
      badgeColor = 'bg-purple-100 text-purple-700';
      badgeText = item.totalPages > 1 ? `GIF ANIMASI (${item.totalPages} Frame)` : 'GIF STATIS';
    } else if (item.type === 'heic') {
      badgeColor = 'bg-pink-100 text-pink-700';
      badgeText = 'APPLE HEIC';
    } else {
      const extLabel = item.file.name.split('.').pop().toUpperCase();
      badgeText = `GAMBAR (${extLabel})`;
    }

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
            <button type="button" onclick="moveItem(${index}, 1)" ${index === AppState.fileQueue.length - 1 ? 'disabled' : ''} class="px-1.5 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 disabled:opacity-30 rounded font-bold">▼</button>
          </div>
          <div class="space-y-1 flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-extrabold text-indigo-600">#${index + 1}</span>
              <span class="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-full ${badgeColor}">
                ${badgeText}
              </span>
              <h4 class="font-bold text-sm text-slate-800 truncate">${item.file.name}</h4>
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
              <span>Asli: <b>${window.formatBytes(item.file.size)}</b></span>
              ${isDone ? `<span>➔</span><span class="text-emerald-600 font-bold">Hasil: ${window.formatBytes(item.compressedBlob.size)} (Hemat ${savingsPct}%)</span>` : ''}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 shrink-0">
          ${AppState.currentMode !== 'merge' ? `
            <select onchange="changeTargetSize('${item.id}', this.value)" class="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-2 bg-white outline-none">${optionsHtml}</select>
            <button type="button" onclick="compressSingleItem('${item.id}')" ${item.status === 'compressing' ? 'disabled' : ''} class="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition">
              ${item.status === 'compressing' ? `Proses (${item.progress}%)...` : (isDone ? 'Proses Ulang' : 'Proses & Kompres')}
            </button>
          ` : ''}
          ${isDone && AppState.currentMode !== 'merge' ? `
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
};

function updateSummaryBadges() {
  const total = AppState.fileQueue.length;
  const readyItems = AppState.fileQueue.filter(i => i.status === 'done' && i.compressedBlob);
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

window.updatePageSelection = (id, val) => {
  const item = AppState.fileQueue.find(i => i.id === id);
  if (item) { item.pageSelection = val; item.status = 'pending'; item.compressedBlob = null; window.renderQueueUI(); }
};

window.moveItem = (index, direction) => {
  const targetIdx = index + direction;
  if (targetIdx < 0 || targetIdx >= AppState.fileQueue.length) return;
  const temp = AppState.fileQueue[index];
  AppState.fileQueue[index] = AppState.fileQueue[targetIdx];
  AppState.fileQueue[targetIdx] = temp;
  AppState.mergedPdfBlob = null;
  document.getElementById('mergedResultCard').classList.add('hidden');
  window.renderQueueUI();
};

window.changeTargetSize = (id, val) => {
  const item = AppState.fileQueue.find(i => i.id === id);
  if (item) { item.selectedTargetKB = parseInt(val, 10); item.status = 'pending'; item.compressedBlob = null; window.renderQueueUI(); }
};

window.removeItem = (id) => {
  AppState.fileQueue = AppState.fileQueue.filter(i => i.id !== id);
  window.renderQueueUI();
};

window.compressSingleItem = async (id) => {
  const item = AppState.fileQueue.find(i => i.id === id);
  if (!item) return;
  item.status = 'compressing'; item.progress = 10; window.renderQueueUI();
  try {
    if (item.type === 'pdf') {
      const res = await compressPdfToTarget(item, (pct) => { item.progress = pct; window.renderQueueUI(); });
      item.compressedBlob = res.blob;
      item.keptPagesCount = res.keptCount;
      item.outputExt = '.pdf';
    } else if (item.type === 'gif' && item.totalPages > 1 && window.GifReader && window.GifWriter) {
      // Kompresi GIF Animasi tanpa menghilangkan gerak animasi
      item.compressedBlob = await compressAnimatedGifToTarget(item.file, item.selectedTargetKB, (pct) => {
        item.progress = pct;
        window.renderQueueUI();
      });
      item.outputExt = '.gif';
    } else {
      // Gambar statis (JPG, PNG, WebP, BMP, AVIF, SVG, ICO, HEIC, atau GIF 1-frame)
      let sourceFile = item.file;
      if (item.type === 'heic' && window.heic2any) {
        const converted = await window.heic2any({ blob: item.file, toType: 'image/jpeg', quality: 0.92 });
        sourceFile = Array.isArray(converted) ? converted[0] : converted;
      }
      item.compressedBlob = await compressImageToTarget(sourceFile, item.selectedTargetKB);
      item.keptPagesCount = 1;
      item.outputExt = '.jpg';
    }
    item.status = 'done';
  } catch (err) {
    item.status = 'error';
    alert(`Gagal memproses ${item.file.name}: ` + err.message);
  }
  window.renderQueueUI();
};

// =========================================================================
// MESIN KOMPRESI GIF ANIMASI (OMGGIF FRAME RESIZER & COLOR QUANTIZER)
// =========================================================================
async function compressAnimatedGifToTarget(file, targetKB, onProgress) {
  const targetBytes = targetKB * 1024;
  if (file.size <= targetBytes) return file;

  const arrayBuffer = await file.arrayBuffer();
  const reader = new GifReader(new Uint8Array(arrayBuffer));
  const origW = reader.width;
  const origH = reader.height;
  const numFrames = reader.numFrames();

  // Render semua frame asli ke dalam kanvas penuh agar disposal method terjaga sempurna
  const fullFrames = [];
  const compCanvas = document.createElement('canvas');
  compCanvas.width = origW;
  compCanvas.height = origH;
  const compCtx = compCanvas.getContext('2d');
  const frameBuffer = new Uint8ClampedArray(origW * origH * 4);

  for (let i = 0; i < numFrames; i++) {
    const info = reader.frameInfo(i);
    const prevImageData = info.disposal === 3 ? compCtx.getImageData(0, 0, origW, origH) : null;

    frameBuffer.fill(0);
    reader.decodeAndBlitFrameRGBA(i, frameBuffer);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = origW;
    tempCanvas.height = origH;
    tempCanvas.getContext('2d').putImageData(new ImageData(frameBuffer, origW, origH), 0, 0);

    compCtx.drawImage(tempCanvas, 0, 0);
    if (window.stampSignatureOnCanvas) window.stampSignatureOnCanvas(compCanvas);

    fullFrames.push({
      imageData: compCtx.getImageData(0, 0, origW, origH),
      delay: Math.max(2, info.delay || 8)
    });

    if (info.disposal === 2) {
      compCtx.clearRect(info.x, info.y, info.width, info.height);
    } else if (info.disposal === 3 && prevImageData) {
      compCtx.putImageData(prevImageData, 0, 0);
    }
  }

  // Palet warna 216 Web-Safe + 40 Grayscale (Total 256 warna standar GIF89a)
  const palette = buildStandard256Palette();

  let scale = 0.85;
  let frameStep = 1;
  let bestBlob = null;

  for (let attempt = 0; attempt < 5; attempt++) {
    if (onProgress) onProgress(20 + attempt * 18);

    const dstW = Math.max(48, Math.round(origW * scale));
    const dstH = Math.max(48, Math.round(origH * scale));
    const outBuffer = new Uint8Array(dstW * dstH * Math.ceil(numFrames / frameStep) + 1024 * 64);
    const writer = new GifWriter(outBuffer, dstW, dstH, { loop: 0, palette });

    const resizeCanvas = document.createElement('canvas');
    resizeCanvas.width = dstW;
    resizeCanvas.height = dstH;
    const resizeCtx = resizeCanvas.getContext('2d');

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = origW;
    srcCanvas.height = origH;
    const srcCtx = srcCanvas.getContext('2d');

    for (let f = 0; f < fullFrames.length; f += frameStep) {
      srcCtx.putImageData(fullFrames[f].imageData, 0, 0);
      resizeCtx.clearRect(0, 0, dstW, dstH);
      resizeCtx.drawImage(srcCanvas, 0, 0, dstW, dstH);

      const rgba = resizeCtx.getImageData(0, 0, dstW, dstH).data;
      const indexedPixels = mapRgbaToPaletteIndices(rgba, dstW * dstH);

      let combinedDelay = fullFrames[f].delay;
      if (frameStep > 1 && f + 1 < fullFrames.length) combinedDelay += fullFrames[f + 1].delay;

      writer.addFrame(0, 0, dstW, dstH, indexedPixels, {
        delay: combinedDelay,
        disposal: 1
      });
    }

    const gifBytes = outBuffer.subarray(0, writer.end());
    bestBlob = new Blob([gifBytes], { type: 'image/gif' });

    if (bestBlob.size <= targetBytes) break;

    scale *= 0.75;
    if (attempt >= 2 && numFrames > 10) frameStep = 2; // Lewati 1 frame jika masih melebihi target
  }

  return bestBlob;
}

function buildStandard256Palette() {
  const palette = [];
  const levels = [0, 51, 102, 153, 204, 255];
  for (let r of levels) {
    for (let g of levels) {
      for (let b of levels) {
        palette.push((r << 16) | (g << 8) | b);
      }
    }
  }
  // Lengkapi hingga 256 warna dengan gradasi abu-abu halus
  for (let i = 0; palette.length < 256; i++) {
    const v = Math.min(255, Math.round((i / 39) * 255));
    palette.push((v << 16) | (v << 8) | v);
  }
  return palette;
}

function mapRgbaToPaletteIndices(rgba, pixelCount) {
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * 4;
    const r = Math.round(rgba[offset] / 51);
    const g = Math.round(rgba[offset + 1] / 51);
    const b = Math.round(rgba[offset + 2] / 51);
    indices[i] = r * 36 + g * 6 + b;
  }
  return indices;
}

// =========================================================================
// MESIN KOMPRESI GAMBAR STATIS (JPG, PNG, WEBP, BMP, AVIF, SVG, ICO, HEIC)
// =========================================================================
async function compressImageToTarget(file, targetKB) {
  const targetBytes = targetKB * 1024;
  const sigEnabled = document.getElementById('enableSignature').checked && AppState.hasSignatureDrawn;

  const img = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Format gambar tidak dapat didekode oleh browser ini.'));
      i.src = e.target.result;
    };
    r.readAsDataURL(file);
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let scale = 1.0;
  const maxDim = Math.max(img.width || 1200, img.height || 1200);
  if (maxDim > 2000) scale = 2000 / maxDim;

  let bestBlob = null;
  while (scale >= 0.3) {
    canvas.width = Math.max(16, Math.round((img.width || 800) * scale));
    canvas.height = Math.max(16, Math.round((img.height || 800) * scale));

    // Isi latar putih agar gambar transparan (PNG/SVG/ICO/WebP) tidak menghitam saat menjadi JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (sigEnabled && window.stampSignatureOnCanvas) window.stampSignatureOnCanvas(canvas);

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
  const pagesToKeep = window.parsePageSelection(item.pageSelection, pdf.numPages);

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
    if (shouldSign && window.stampSignatureOnCanvas) window.stampSignatureOnCanvas(canvas);

    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);
    const origViewport = page.getViewport({ scale: 1.0 });
    const orientation = origViewport.width > origViewport.height ? 'l' : 'p';

    if (idx === 0) newPdf = new jsPDF({ orientation, unit: 'pt', format: [origViewport.width, origViewport.height], compress: true });
    else newPdf.addPage([origViewport.width, origViewport.height], orientation);
    newPdf.addImage(imgData, 'JPEG', 0, 0, origViewport.width, origViewport.height, undefined, 'FAST');
  }
  return { blob: newPdf.output('blob'), keptCount: pagesToKeep.length };
}

window.downloadSingleFile = (id) => {
  const item = AppState.fileQueue.find(i => i.id === id);
  if (!item || !item.compressedBlob) return;
  const ext = item.outputExt || (item.type === 'pdf' ? '.pdf' : '.jpg');
  const cleanName = item.file.name.replace(/\.[^/.]+$/, "") + "_compressed" + ext;
  window.triggerBrowserDownload(item.compressedBlob, cleanName);
};

window.downloadMergedPdf = () => {
  if (!AppState.mergedPdfBlob) return;
  const baseName = (document.getElementById('mergedFileName').value || 'Dokumen_Gabungan').replace(/\.pdf$/i, '');
  window.triggerBrowserDownload(AppState.mergedPdfBlob, `${baseName}.pdf`);
};

window.uploadMergedToCloud = async () => {
  if (!AppState.mergedPdfBlob) return;
  const nama = prompt("Masukkan Nama Lengkap Anda:", "");
  if (!nama) return;
  const defaultCode = document.getElementById('kodeKompresi').value || 'DOC-8899A';
  const kodeKompresi = prompt("Catat Kode Kompresi Anda:", defaultCode);
  if (!kodeKompresi) return;

  const base64Data = await new Promise((res) => {
    const r = new FileReader();
    r.onloadend = () => res(r.result.split(',')[1]);
    r.readAsDataURL(AppState.mergedPdfBlob);
  });
  const baseName = (document.getElementById('mergedFileName').value || 'Dokumen_Gabungan').replace(/\.pdf$/i, '') + '.pdf';
  const totalOrigBytes = AppState.fileQueue.reduce((acc, i) => acc + i.file.size, 0);

  await window.sendFilesToGas([{
    fileName: baseName,
    mimeType: 'application/pdf',
    originalSize: window.formatBytes(totalOrigBytes),
    compressedSize: window.formatBytes(AppState.mergedPdfBlob.size),
    fileBase64: base64Data
  }], nama, "Gabungan PDF", kodeKompresi);
};

// Modal Preview Berdampingan (Before vs After - Mendukung Animasi GIF!)
window.openPreviewModal = async (id) => {
  const item = AppState.fileQueue.find(i => i.id === id);
  if (!item || !item.compressedBlob) return;

  document.getElementById('beforeColumn').classList.remove('hidden');
  document.getElementById('previewGridContainer').className = 'p-4 sm:p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 flex-1';
  document.getElementById('afterColumnLabel').textContent = 'AFTER (Hasil Kompresi)';
  document.getElementById('previewModalTitle').textContent = `Preview: ${item.file.name}`;
  document.getElementById('beforeMetaBadge').textContent = window.formatBytes(item.file.size);
  const pct = Math.max(0, Math.round((1 - item.compressedBlob.size / item.file.size) * 100));
  document.getElementById('afterMetaBadge').textContent = `${window.formatBytes(item.compressedBlob.size)} (Hemat ${pct}%)`;

  const beforeImg = document.getElementById('beforeImgPreview'), afterImg = document.getElementById('afterImgPreview');
  const beforeCanvas = document.getElementById('beforePdfCanvas'), afterCanvas = document.getElementById('afterPdfCanvas');
  const pdfToolbar = document.getElementById('pdfNavToolbar');
  document.getElementById('previewModal').classList.remove('hidden');

  if (item.type !== 'pdf') {
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
    AppState.pdfPreviewState.mode = 'compare';
    AppState.pdfPreviewState.origDoc = await pdfjsLib.getDocument({ data: origBuf }).promise;
    AppState.pdfPreviewState.compDoc = await pdfjsLib.getDocument({ data: compBuf }).promise;
    AppState.pdfPreviewState.keptPagesMap = window.parsePageSelection(item.pageSelection, AppState.pdfPreviewState.origDoc.numPages);
    AppState.pdfPreviewState.pageNum = 1;
    AppState.pdfPreviewState.totalPages = AppState.pdfPreviewState.compDoc.numPages;
    await renderPdfComparisonPage(1);
  }
};

window.openMergedPreview = async () => {
  if (!AppState.mergedPdfBlob) return;
  document.getElementById('previewModalTitle').textContent = 'Preview Hasil Penggabungan PDF';
  document.getElementById('beforeColumn').classList.add('hidden');
  document.getElementById('previewGridContainer').className = 'p-4 sm:p-6 overflow-y-auto grid grid-cols-1 gap-6 bg-slate-50 flex-1';
  document.getElementById('afterColumnLabel').textContent = `DOKUMEN GABUNGAN (${AppState.mergedTotalPages} HALAMAN)`;
  document.getElementById('afterMetaBadge').textContent = window.formatBytes(AppState.mergedPdfBlob.size);
  document.getElementById('afterImgPreview').classList.add('hidden');
  document.getElementById('afterPdfCanvas').classList.remove('hidden');
  document.getElementById('pdfNavToolbar').classList.remove('hidden');
  document.getElementById('previewModal').classList.remove('hidden');

  const compBuf = await AppState.mergedPdfBlob.arrayBuffer();
  AppState.pdfPreviewState.mode = 'single';
  AppState.pdfPreviewState.compDoc = await pdfjsLib.getDocument({ data: compBuf }).promise;
  AppState.pdfPreviewState.pageNum = 1;
  AppState.pdfPreviewState.totalPages = AppState.pdfPreviewState.compDoc.numPages;
  await renderPdfComparisonPage(1);
};

async function renderPdfComparisonPage(pageNumber) {
  const { mode, origDoc, compDoc, totalPages, keptPagesMap } = AppState.pdfPreviewState;
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

window.closePreviewModal = () => { document.getElementById('previewModal').classList.add('hidden'); };

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('fileInput').addEventListener('change', async (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (!selectedFiles.length) return;
    await window.addFilesToQueue(selectedFiles);
    e.target.value = '';
  });

  document.getElementById('btnClearAll').addEventListener('click', () => {
    AppState.fileQueue = []; AppState.mergedPdfBlob = null;
    document.getElementById('mergedResultCard').classList.add('hidden');
    window.renderQueueUI();
  });

  document.getElementById('btnCompressAll').addEventListener('click', async () => {
    for (const item of AppState.fileQueue) await window.compressSingleItem(item.id);
  });

  document.getElementById('btnDownloadAllLocal').addEventListener('click', () => {
    AppState.fileQueue.forEach((item, idx) => {
      if (item.compressedBlob) setTimeout(() => window.downloadSingleFile(item.id), idx * 350);
    });
  });

  document.getElementById('btnMergeNow').addEventListener('click', async () => {
    if (AppState.fileQueue.length === 0) return alert('Tambahkan file terlebih dahulu.');
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

      for (const item of AppState.fileQueue) {
        if (item.type === 'pdf') {
          const buf = await item.file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
          const pagesToKeep = window.parsePageSelection(item.pageSelection, pdf.numPages);
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
          if (shouldSign && window.stampSignatureOnCanvas) window.stampSignatureOnCanvas(canvas);

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
          if (shouldSign && window.stampSignatureOnCanvas) window.stampSignatureOnCanvas(canvas);

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

      AppState.mergedPdfBlob = mergedDoc.output('blob');
      AppState.mergedTotalPages = totalPageCounter;
      const baseName = (document.getElementById('mergedFileName').value || 'Dokumen_Gabungan').replace(/\.pdf$/i, '');
      document.getElementById('mergedResultTitle').textContent = `${baseName}.pdf`;
      document.getElementById('mergedResultMeta').textContent = `Total: ${totalPageCounter} Halaman | Ukuran Akhir: ${window.formatBytes(AppState.mergedPdfBlob.size)}`;
      document.getElementById('mergedResultCard').classList.remove('hidden');
    } catch (err) {
      alert('Gagal menggabungkan PDF: ' + err.message);
    } finally {
      btnMerge.disabled = false;
      btnMerge.textContent = '📑 Gabung Halaman Terpilih Jadi 1 PDF';
    }
  });

  document.getElementById('btnPrevPage').addEventListener('click', () => {
    if (AppState.pdfPreviewState.pageNum > 1) {
      AppState.pdfPreviewState.pageNum--;
      renderPdfComparisonPage(AppState.pdfPreviewState.pageNum);
    }
  });

  document.getElementById('btnNextPage').addEventListener('click', () => {
    if (AppState.pdfPreviewState.pageNum < AppState.pdfPreviewState.totalPages) {
      AppState.pdfPreviewState.pageNum++;
      renderPdfComparisonPage(AppState.pdfPreviewState.pageNum);
    }
  });
});
