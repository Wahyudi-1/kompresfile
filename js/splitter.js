// =========================================================================
// 7. JS/SPLITTER.JS - PEMOTONG HALAMAN PDF (VISUAL THUMBNAIL & LOSSLESS PDF-LIB)
// =========================================================================

let splitSourceFile = null;
let splitPdfJsDoc = null;
let splitTotalPages = 0;
let splitSelectedPages = new Set();
let splitOutputBlob = null;

window.addEventListener('DOMContentLoaded', () => {
  const splitInput = document.getElementById('splitPdfInput');
  if (!splitInput) return;

  splitInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await loadPdfForSplitting(file);
    e.target.value = '';
  });

  document.getElementById('btnExecuteSplit').addEventListener('click', executePdfSplit);
});

async function loadPdfForSplitting(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return alert('Harap pilih file berformat PDF.');
  }

  splitSourceFile = file;
  splitSelectedPages.clear();
  splitOutputBlob = null;

  document.getElementById('splitResultBox').classList.add('hidden');
  document.getElementById('splitWorkspacePanel').classList.remove('hidden');
  document.getElementById('splitFileNameDisplay').textContent = file.name;
  document.getElementById('splitFileSizeDisplay').textContent = window.formatBytes(file.size);
  document.getElementById('splitExportFileName').value = file.name.replace(/\.pdf$/i, '') + '_Potongan';

  const grid = document.getElementById('splitThumbnailsGrid');
  grid.innerHTML = `<div class="col-span-full py-8 text-center text-xs font-bold text-indigo-600">⏳ Memuat pratinjau halaman PDF...</div>`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    splitPdfJsDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    splitTotalPages = splitPdfJsDoc.numPages;

    document.getElementById('splitTotalPagesBadge').textContent = `${splitTotalPages} Halaman`;

    // Default: pilih semua halaman terlebih dahulu agar pengguna tinggal klik halaman yang ingin dibuang
    for (let i = 1; i <= splitTotalPages; i++) {
      splitSelectedPages.add(i);
    }
    syncRangeInputFromSet();
    await renderSplitThumbnails();
  } catch (err) {
    alert('Gagal membaca file PDF: ' + err.message);
  }
}

async function renderSplitThumbnails() {
  const grid = document.getElementById('splitThumbnailsGrid');
  grid.innerHTML = '';

  // Batasi render thumbnail maksimal 60 halaman pertama agar tetap ringan di HP, sisanya tetap bisa dipilih lewat input teks
  const maxVisualRender = Math.min(splitTotalPages, 60);

  for (let pageNum = 1; pageNum <= maxVisualRender; pageNum++) {
    const isSelected = splitSelectedPages.has(pageNum);

    const card = document.createElement('div');
    card.id = `split_card_${pageNum}`;
    card.onclick = () => toggleSplitPageSelection(pageNum);
    card.className = `cursor-pointer rounded-xl p-2 border-2 transition flex flex-col items-center justify-between select-none ${
      isSelected
        ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
        : 'border-slate-200 bg-white opacity-50 grayscale'
    }`;

    card.innerHTML = `
      <div class="w-full flex items-center justify-between mb-1.5">
        <span class="text-[11px] font-extrabold ${isSelected ? 'text-indigo-700' : 'text-slate-500'}">Hal ${pageNum}</span>
        <span id="split_check_${pageNum}" class="w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
        }">${isSelected ? '✓' : '✕'}</span>
      </div>
      <div class="w-full bg-white border border-slate-200 rounded overflow-hidden flex items-center justify-center min-h-[110px]">
        <canvas id="split_thumb_canvas_${pageNum}" class="max-w-full max-h-[130px] object-contain"></canvas>
      </div>
      <span class="text-[10px] font-bold mt-1.5 ${isSelected ? 'text-emerald-700' : 'text-red-500'}" id="split_status_${pageNum}">
        ${isSelected ? 'Diambil' : 'Dihapus'}
      </span>
    `;
    grid.appendChild(card);

    // Render thumbnail resolusi ringan secara asinkron
    renderSingleThumbCanvas(pageNum);
  }

  if (splitTotalPages > 60) {
    const infoNote = document.createElement('div');
    infoNote.className = 'col-span-full p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs text-center';
    infoNote.textContent = `Menampilkan 60 pratinjau pertama dari total ${splitTotalPages} halaman. Untuk halaman 61–${splitTotalPages}, gunakan kolom ketik nomor halaman di atas.`;
    grid.appendChild(infoNote);
  }

  updateSplitSelectionCounter();
}

async function renderSingleThumbCanvas(pageNum) {
  try {
    const page = await splitPdfJsDoc.getPage(pageNum);
    const vp = page.getViewport({ scale: 0.35 });
    const canvas = document.getElementById(`split_thumb_canvas_${pageNum}`);
    if (!canvas) return;
    canvas.width = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  } catch (e) {}
}

window.toggleSplitPageSelection = (pageNum) => {
  if (splitSelectedPages.has(pageNum)) {
    splitSelectedPages.delete(pageNum);
  } else {
    splitSelectedPages.add(pageNum);
  }
  updateSingleCardVisual(pageNum);
  syncRangeInputFromSet();
  updateSplitSelectionCounter();
};

function updateSingleCardVisual(pageNum) {
  const card = document.getElementById(`split_card_${pageNum}`);
  if (!card) return;
  const isSelected = splitSelectedPages.has(pageNum);

  card.className = `cursor-pointer rounded-xl p-2 border-2 transition flex flex-col items-center justify-between select-none ${
    isSelected
      ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
      : 'border-slate-200 bg-white opacity-50 grayscale'
  }`;

  const check = document.getElementById(`split_check_${pageNum}`);
  if (check) {
    check.className = `w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${
      isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
    }`;
    check.textContent = isSelected ? '✓' : '✕';
  }

  const status = document.getElementById(`split_status_${pageNum}`);
  if (status) {
    status.className = `text-[10px] font-bold mt-1.5 ${isSelected ? 'text-emerald-700' : 'text-red-500'}`;
    status.textContent = isSelected ? 'Diambil' : 'Dihapus';
  }
}

// Preset Pilihan Cepat: 'all' | 'none' | 'odd' | 'even'
window.applySplitPreset = (preset) => {
  if (!splitTotalPages) return;
  splitSelectedPages.clear();

  for (let i = 1; i <= splitTotalPages; i++) {
    if (preset === 'all') splitSelectedPages.add(i);
    else if (preset === 'odd' && i % 2 === 1) splitSelectedPages.add(i);
    else if (preset === 'even' && i % 2 === 0) splitSelectedPages.add(i);
  }

  for (let i = 1; i <= Math.min(splitTotalPages, 60); i++) {
    updateSingleCardVisual(i);
  }
  syncRangeInputFromSet();
  updateSplitSelectionCounter();
};

// Sinkronisasi dari ketikan teks (misal: "1, 3, 5-10") ke visual kartu
window.applySplitRangeFromText = (val) => {
  if (!splitTotalPages) return;
  const parsed = window.parsePageSelection(val, splitTotalPages);
  splitSelectedPages = new Set(parsed);

  for (let i = 1; i <= Math.min(splitTotalPages, 60); i++) {
    updateSingleCardVisual(i);
  }
  updateSplitSelectionCounter();
};

// Ubah Set halaman terpilih menjadi format ringkas (misal: 1-3, 5, 8-10)
function syncRangeInputFromSet() {
  const sorted = Array.from(splitSelectedPages).sort((a, b) => a - b);
  const inputEl = document.getElementById('splitRangeInput');
  if (!inputEl) return;

  if (sorted.length === 0) {
    inputEl.value = '';
    return;
  }

  const ranges = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  inputEl.value = ranges.join(', ');
}

function updateSplitSelectionCounter() {
  const count = splitSelectedPages.size;
  document.getElementById('splitSelectedCountText').textContent = `${count} dari ${splitTotalPages} halaman dipilih`;
  document.getElementById('btnExecuteSplit').disabled = count === 0;
}

// =========================================================================
// EKSEKUSI PEMOTONGAN PDF MENGGUNAKAN PDF-LIB (TANPA MENURUNKAN KUALITAS)
// =========================================================================
async function executePdfSplit() {
  if (!splitSourceFile || splitSelectedPages.size === 0) {
    return alert('Pilih minimal 1 halaman yang ingin diambil.');
  }

  const btn = document.getElementById('btnExecuteSplit');
  const compressAfterSplit = document.getElementById('splitAlsoCompress').checked;
  const pagesArray = Array.from(splitSelectedPages).sort((a, b) => a - b);

  btn.disabled = true;
  btn.textContent = '⏳ Memotong Halaman PDF...';

  try {
    if (!compressAfterSplit && window.PDFLib) {
      // MODE LOSSLESS: Potong langsung struktur PDF asli tanpa ubah teks/vektor
      const { PDFDocument } = window.PDFLib;
      const srcBytes = await splitSourceFile.arrayBuffer();
      const srcDoc = await PDFDocument.load(srcBytes);
      const newDoc = await PDFDocument.create();

      // Indeks halaman di pdf-lib dimulai dari 0
      const zeroBasedIndices = pagesArray.map(p => p - 1);
      const copiedPages = await newDoc.copyPages(srcDoc, zeroBasedIndices);
      copiedPages.forEach(page => newDoc.addPage(page));

      const pdfBytes = await newDoc.save();
      splitOutputBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    } else {
      // MODE KOMPRESI: Render halaman terpilih dengan skala ringan
      const { jsPDF } = window.jspdf;
      let newPdf = null;

      for (let i = 0; i < pagesArray.length; i++) {
        const pNum = pagesArray[i];
        const page = await splitPdfJsDoc.getPage(pNum);
        const vp = page.getViewport({ scale: 1.35 });
        const origVp = page.getViewport({ scale: 1.0 });

        const canvas = document.createElement('canvas');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

        const imgData = canvas.toDataURL('image/jpeg', 0.68);
        const orient = origVp.width > origVp.height ? 'l' : 'p';

        if (i === 0) {
          newPdf = new jsPDF({ orientation: orient, unit: 'pt', format: [origVp.width, origVp.height], compress: true });
        } else {
          newPdf.addPage([origVp.width, origVp.height], orient);
        }
        newPdf.addImage(imgData, 'JPEG', 0, 0, origVp.width, origVp.height, undefined, 'FAST');
      }
      splitOutputBlob = newPdf.output('blob');
    }

    const baseName = (document.getElementById('splitExportFileName').value || 'Hasil_Potong_PDF').replace(/\.pdf$/i, '');
    document.getElementById('splitResultTitle').textContent = `${baseName}.pdf`;
    document.getElementById('splitResultMeta').textContent =
      `Berhasil memotong menjadi ${pagesArray.length} halaman | Ukuran: ${window.formatBytes(splitSourceFile.size)} ➔ ${window.formatBytes(splitOutputBlob.size)}`;
    document.getElementById('splitResultBox').classList.remove('hidden');

  } catch (err) {
    alert('Gagal memotong PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '✂️ Potong & Buat PDF Baru Sekarang';
  }
}

window.downloadSplitPdfResult = () => {
  if (!splitOutputBlob) return;
  const baseName = (document.getElementById('splitExportFileName').value || 'Hasil_Potong_PDF').replace(/\.pdf$/i, '');
  window.triggerBrowserDownload(splitOutputBlob, `${baseName}.pdf`);
};

window.sendSplitResultToCompressor = async () => {
  if (!splitOutputBlob) return;
  const baseName = (document.getElementById('splitExportFileName').value || 'Hasil_Potong_PDF').replace(/\.pdf$/i, '') + '.pdf';
  const newFile = new File([splitOutputBlob], baseName, { type: 'application/pdf' });
  window.switchMode('local');
  await window.addFilesToQueue([newFile]);
};
