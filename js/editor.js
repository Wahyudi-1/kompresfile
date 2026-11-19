// =========================================================================
// 8. JS/EDITOR.JS - VISUAL PDF EDITOR (WHITEOUT, TEKS, GAMBAR) & PARAGRAF
// =========================================================================

let editSourceFile = null;
let editPdfJsDoc = null;
let editTotalPages = 0;
let editCurrentPage = 1;
let editSubMode = 'visual'; // 'visual' | 'paragraph'

// Menyimpan daftar anotasi visual per halaman: { 1: [ { id, type, xPct, yPct, wPct, hPct, ... } ], ... }
let pageAnnotations = {};
let selectedAnnotationId = null;
let extractedParagraphsByPage = {};
let editedPdfOutputBlob = null;

window.addEventListener('DOMContentLoaded', () => {
  const editInput = document.getElementById('editPdfInput');
  if (!editInput) return;

  editInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await loadPdfIntoEditor(file);
    e.target.value = '';
  });

  // Upload gambar/logo/materai untuk disisipkan ke halaman PDF
  const insertImgInput = document.getElementById('editorInsertImgInput');
  if (insertImgInput) {
    insertImgInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file || !editPdfJsDoc) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          // Normalisasi ke PNG via canvas agar 100% kompatibel dengan pdf-lib embedPng
          const c = document.createElement('canvas');
          c.width = img.width;
          c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          const pngDataUrl = c.toDataURL('image/png');

          const aspect = img.height / img.width;
          const wPct = 0.22;
          const hPct = Math.min(0.45, wPct * aspect * 0.75);

          addVisualAnnotation({
            type: 'image',
            xPct: 0.38,
            yPct: 0.35,
            wPct: wPct,
            hPct: Math.max(0.08, hPct),
            dataUrl: pngDataUrl
          });
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }
});

// =========================================================================
// MUAT DOKUMEN PDF KE EDITOR
// =========================================================================
async function loadPdfIntoEditor(file) {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return alert('Harap pilih file berformat PDF.');
  }

  editSourceFile = file;
  pageAnnotations = {};
  extractedParagraphsByPage = {};
  selectedAnnotationId = null;
  editedPdfOutputBlob = null;

  document.getElementById('editResultBox').classList.add('hidden');
  document.getElementById('editWorkspacePanel').classList.remove('hidden');
  document.getElementById('editFileNameDisplay').textContent = file.name;
  document.getElementById('editExportFileName').value = file.name.replace(/\.pdf$/i, '') + '_Diedit';

  try {
    const buf = await file.arrayBuffer();
    editPdfJsDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    editTotalPages = editPdfJsDoc.numPages;
    editCurrentPage = 1;

    for (let p = 1; p <= editTotalPages; p++) {
      pageAnnotations[p] = [];
    }

    await renderEditorCurrentPage();
  } catch (err) {
    alert('Gagal memuat PDF ke editor: ' + err.message);
  }
}

// Peralihan Sub-Mode: Visual Overlay Editor vs Editor Teks Paragraf
window.switchPdfEditSubMode = async (subMode) => {
  editSubMode = subMode;
  const btnVis = document.getElementById('btnSubEdit_visual');
  const btnPar = document.getElementById('btnSubEdit_paragraph');
  const visContainer = document.getElementById('visualEditorContainer');
  const parContainer = document.getElementById('paragraphEditorContainer');

  if (subMode === 'visual') {
    btnVis.className = 'px-4 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 text-white shadow transition';
    btnPar.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition';
    visContainer.classList.remove('hidden');
    parContainer.classList.add('hidden');
    await renderEditorCurrentPage();
  } else {
    btnPar.className = 'px-4 py-2 rounded-xl text-xs font-extrabold bg-indigo-600 text-white shadow transition';
    btnVis.className = 'px-4 py-2 rounded-xl text-xs font-bold bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 transition';
    visContainer.classList.add('hidden');
    parContainer.classList.remove('hidden');
    await extractParagraphsForEditing();
  }
};

// Navigasi Halaman Editor
window.changeEditorPage = async (delta) => {
  if (!editPdfJsDoc) return;
  const target = editCurrentPage + delta;
  if (target < 1 || target > editTotalPages) return;

  // Simpan perubahan textarea paragraf jika sedang di mode paragraf
  if (editSubMode === 'paragraph') {
    extractedParagraphsByPage[editCurrentPage] = document.getElementById('pdfParagraphTextarea').value;
  }

  editCurrentPage = target;
  selectedAnnotationId = null;

  if (editSubMode === 'visual') {
    await renderEditorCurrentPage();
  } else {
    await extractParagraphsForEditing();
  }
};

// =========================================================================
// BAGIAN A: VISUAL PDF EDITOR (WHITEOUT, TEKS, SIMBOL CENTANG & GAMBAR)
// =========================================================================
async function renderEditorCurrentPage() {
  if (!editPdfJsDoc) return;

  document.getElementById('editPageIndicator').textContent = `Halaman ${editCurrentPage} dari ${editTotalPages}`;
  document.getElementById('btnEditPrevPage').disabled = editCurrentPage <= 1;
  document.getElementById('btnEditNextPage').disabled = editCurrentPage >= editTotalPages;

  const page = await editPdfJsDoc.getPage(editCurrentPage);
  const vp = page.getViewport({ scale: 1.45 });
  const canvas = document.getElementById('pdfEditBaseCanvas');
  canvas.width = vp.width;
  canvas.height = vp.height;

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  renderVisualAnnotationsOverlay();
}

// Tambah Elemen Visual Baru ke Halaman Aktif
window.addVisualAnnotation = (config) => {
  if (!editPdfJsDoc) return alert('Pilih file PDF terlebih dahulu.');
  const id = 'ann_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

  const defaults = {
    id,
    type: 'text', // 'whiteout' | 'text' | 'checkmark' | 'image'
    xPct: 0.25,
    yPct: 0.25,
    wPct: 0.32,
    hPct: 0.06,
    text: 'Ketik teks baru di sini...',
    fontSize: 14,
    color: '#0f172a',
    bgColor: '#ffffff',
    bold: false,
    dataUrl: ''
  };

  const newItem = { ...defaults, ...config };
  if (!pageAnnotations[editCurrentPage]) pageAnnotations[editCurrentPage] = [];
  pageAnnotations[editCurrentPage].push(newItem);
  selectedAnnotationId = id;

  renderVisualAnnotationsOverlay();
  syncInspectorWithSelected();
};

window.addQuickWhiteout = () => {
  window.addVisualAnnotation({
    type: 'whiteout',
    xPct: 0.20,
    yPct: 0.30,
    wPct: 0.35,
    hPct: 0.045,
    bgColor: '#ffffff'
  });
};

window.addQuickText = () => {
  window.addVisualAnnotation({
    type: 'text',
    xPct: 0.22,
    yPct: 0.36,
    wPct: 0.38,
    hPct: 0.06,
    text: 'Teks Pengganti / Tambahan',
    fontSize: 13,
    color: '#0f172a',
    bold: false
  });
};

window.addQuickCheckmark = () => {
  window.addVisualAnnotation({
    type: 'checkmark',
    xPct: 0.45,
    yPct: 0.45,
    wPct: 0.045,
    hPct: 0.035,
    color: '#0f172a'
  });
};

window.deleteSelectedAnnotation = () => {
  if (!selectedAnnotationId || !pageAnnotations[editCurrentPage]) return;
  pageAnnotations[editCurrentPage] = pageAnnotations[editCurrentPage].filter(a => a.id !== selectedAnnotationId);
  selectedAnnotationId = null;
  renderVisualAnnotationsOverlay();
  syncInspectorWithSelected();
};

window.clearCurrentPageAnnotations = () => {
  if (!pageAnnotations[editCurrentPage]) return;
  pageAnnotations[editCurrentPage] = [];
  selectedAnnotationId = null;
  renderVisualAnnotationsOverlay();
  syncInspectorWithSelected();
};

// Update properti elemen yang sedang dipilih dari toolbar
window.updateSelectedAnnotationProp = (prop, value) => {
  const list = pageAnnotations[editCurrentPage] || [];
  const item = list.find(a => a.id === selectedAnnotationId);
  if (!item) return;

  item[prop] = value;
  renderVisualAnnotationsOverlay();
};

function syncInspectorWithSelected() {
  const inspector = document.getElementById('editorElementInspector');
  const list = pageAnnotations[editCurrentPage] || [];
  const item = list.find(a => a.id === selectedAnnotationId);

  if (!item) {
    inspector.classList.add('hidden');
    return;
  }

  inspector.classList.remove('hidden');
  const textControls = document.getElementById('inspectorTextControls');
  const colorControls = document.getElementById('inspectorWhiteoutControls');

  textControls.classList.add('hidden');
  colorControls.classList.add('hidden');

  if (item.type === 'text') {
    textControls.classList.remove('hidden');
    document.getElementById('editTextContentInput').value = item.text;
    document.getElementById('editTextSizeInput').value = item.fontSize;
    document.getElementById('editTextColorInput').value = item.color;
    document.getElementById('editTextBoldInput').checked = item.bold;
  } else if (item.type === 'whiteout') {
    colorControls.classList.remove('hidden');
    document.getElementById('editWhiteoutColorInput').value = item.bgColor;
  } else if (item.type === 'checkmark') {
    colorControls.classList.remove('hidden');
    document.getElementById('editWhiteoutColorInput').value = item.color;
  }
}

// Render seluruh elemen overlay interaktif di atas kanvas halaman PDF
function renderVisualAnnotationsOverlay() {
  const layer = document.getElementById('pdfEditOverlayLayer');
  if (!layer) return;
  layer.innerHTML = '';

  const list = pageAnnotations[editCurrentPage] || [];

  list.forEach((ann) => {
    const isSelected = ann.id === selectedAnnotationId;
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.left = `${ann.xPct * 100}%`;
    el.style.top = `${ann.yPct * 100}%`;
    el.style.width = `${ann.wPct * 100}%`;
    el.style.height = `${ann.hPct * 100}%`;
    el.style.cursor = 'move';
    el.style.touchAction = 'none';
    el.className = `group select-none ${isSelected ? 'ring-2 ring-indigo-600 z-30' : 'hover:ring-1 hover:ring-cyan-400 z-20'}`;

    if (ann.type === 'whiteout') {
      el.style.backgroundColor = ann.bgColor || '#ffffff';
      el.style.border = isSelected ? '1px dashed #4f46e5' : '1px solid rgba(203,213,225,0.5)';
    } else if (ann.type === 'text') {
      el.style.color = ann.color;
      el.style.fontWeight = ann.bold ? 'bold' : 'normal';
      el.style.fontFamily = 'Helvetica, Arial, sans-serif';
      // Skalakan ukuran font preview agar proporsional terhadap lebar kanvas layar
      const stageW = layer.getBoundingClientRect().width || 600;
      const previewFontPx = Math.max(9, Math.round(ann.fontSize * (stageW / 595)));
      el.style.fontSize = `${previewFontPx}px`;
      el.style.lineHeight = '1.2';
      el.style.whiteSpace = 'pre-wrap';
      el.style.overflow = 'hidden';
      el.style.backgroundColor = isSelected ? 'rgba(238, 242, 255, 0.45)' : 'transparent';
      el.textContent = ann.text;
    } else if (ann.type === 'checkmark') {
      el.innerHTML = `
        <svg viewBox="0 0 24 24" class="w-full h-full pointer-events-none" fill="none" stroke="${ann.color || '#0f172a'}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
    } else if (ann.type === 'image') {
      el.innerHTML = `<img src="${ann.dataUrl}" class="w-full h-full object-fill pointer-events-none" alt="Sisipan">`;
    }

    // Handle Sudut Kanan-Bawah untuk Resize Bebas
    if (isSelected) {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'w-4 h-4 bg-indigo-600 border-2 border-white rounded-full absolute -right-2 -bottom-2 cursor-se-resize shadow';
      resizeHandle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startDragOrResizeAnnotation(e, ann, 'resize');
      });
      el.appendChild(resizeHandle);
    }

    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      selectedAnnotationId = ann.id;
      renderVisualAnnotationsOverlay();
      syncInspectorWithSelected();
      startDragOrResizeAnnotation(e, ann, 'move');
    });

    layer.appendChild(el);
  });
}

function startDragOrResizeAnnotation(startEvent, ann, actionType) {
  const layer = document.getElementById('pdfEditOverlayLayer');
  const stageRect = layer.getBoundingClientRect();
  const startX = startEvent.clientX;
  const startY = startEvent.clientY;
  const origXPct = ann.xPct;
  const origYPct = ann.yPct;
  const origWPct = ann.wPct;
  const origHPct = ann.hPct;

  function onPointerMove(e) {
    const dxPct = (e.clientX - startX) / stageRect.width;
    const dyPct = (e.clientY - startY) / stageRect.height;

    if (actionType === 'move') {
      ann.xPct = Math.max(0, Math.min(1 - ann.wPct, origXPct + dxPct));
      ann.yPct = Math.max(0, Math.min(1 - ann.hPct, origYPct + dyPct));
    } else if (actionType === 'resize') {
      ann.wPct = Math.max(0.025, Math.min(1 - ann.xPct, origWPct + dxPct));
      ann.hPct = Math.max(0.02, Math.min(1 - ann.yPct, origHPct + dyPct));
    }
    renderVisualAnnotationsOverlay();
  }

  function onPointerUp() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  }

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

// Konversi Kode Warna Hex (#ffffff) ke RGB Pdf-Lib (0.0 - 1.0)
function hexToPdfLibRgb(hex) {
  const { rgb } = window.PDFLib;
  const clean = (hex || '#000000').replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255 || 0;
  const g = parseInt(clean.substring(2, 4), 16) / 255 || 0;
  const b = parseInt(clean.substring(4, 6), 16) / 255 || 0;
  return rgb(r, g, b);
}

// =========================================================================
// BAGIAN B: EKSTRAK & EDIT TEKS PARAGRAF (TEXT REFLOW EDITOR)
// =========================================================================
async function extractParagraphsForEditing() {
  if (!editPdfJsDoc) return;

  document.getElementById('editParaPageIndicator').textContent = `Halaman ${editCurrentPage} dari ${editTotalPages}`;
  document.getElementById('btnParaPrevPage').disabled = editCurrentPage <= 1;
  document.getElementById('btnParaNextPage').disabled = editCurrentPage >= editTotalPages;

  const textarea = document.getElementById('pdfParagraphTextarea');

  // Jika halaman ini sudah pernah diekstrak/diedit, tampilkan dari cache
  if (extractedParagraphsByPage[editCurrentPage] !== undefined) {
    textarea.value = extractedParagraphsByPage[editCurrentPage];
    return;
  }

  textarea.value = '⏳ Mengekstrak struktur teks halaman...';
  const page = await editPdfJsDoc.getPage(editCurrentPage);
  const textContent = await page.getTextContent();

  // Susun item teks berdasarkan koordinat Y (baris atas ke bawah) dan X (kiri ke kanan)
  const items = textContent.items.map(it => ({
    str: it.str,
    x: it.transform[4],
    y: it.transform[5]
  }));

  items.sort((a, b) => {
    if (Math.abs(b.y - a.y) > 6) return b.y - a.y;
    return a.x - b.x;
  });

  let assembledText = '';
  let lastY = null;

  items.forEach(it => {
    if (lastY !== null) {
      const diffY = Math.abs(lastY - it.y);
      if (diffY > 18) assembledText += '\n\n'; // Paragraf baru
      else if (diffY > 6) assembledText += '\n'; // Baris baru
      else assembledText += ' ';
    }
    assembledText += it.str;
    lastY = it.y;
  });

  const cleanResult = assembledText.trim() || '(Halaman ini berupa gambar/scan. Gunakan tab OCR Word untuk membaca teks dari gambar).';
  extractedParagraphsByPage[editCurrentPage] = cleanResult;
  textarea.value = cleanResult;
}

// =========================================================================
// SIMPAN HASIL EDIT PDF (LOSSLESS PDF-LIB UNTUK VISUAL / REFLOW UNTUK PARAGRAF)
// =========================================================================
window.saveEditedPdfDocument = async () => {
  if (!editSourceFile) return alert('Pilih file PDF terlebih dahulu.');
  const btn = document.getElementById('btnSaveEditedPdf');
  btn.disabled = true;
  btn.textContent = '⏳ Menyimpan Perubahan PDF...';

  try {
    if (editSubMode === 'visual') {
      // SUNTIKKAN PERUBAHAN VISUAL LANGSUNG KE PDF ASLI (LOSSLESS)
      const { PDFDocument, StandardFonts } = window.PDFLib;
      const srcBytes = await editSourceFile.arrayBuffer();
      const pdfDoc = await PDFDocument.load(srcBytes);

      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      for (let pNum = 1; pNum <= pages.length; pNum++) {
        const anns = pageAnnotations[pNum] || [];
        if (anns.length === 0) continue;

        const page = pages[pNum - 1];
        const { width, height } = page.getSize();

        for (const ann of anns) {
          const boxX = ann.xPct * width;
          const boxW = ann.wPct * width;
          const boxH = ann.hPct * height;
          const boxY = height - ((ann.yPct + ann.hPct) * height);

          if (ann.type === 'whiteout') {
            page.drawRectangle({
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH,
              color: hexToPdfLibRgb(ann.bgColor || '#ffffff')
            });
          } else if (ann.type === 'checkmark') {
            const cRgb = hexToPdfLibRgb(ann.color || '#0f172a');
            page.drawLine({
              start: { x: boxX + boxW * 0.15, y: boxY + boxH * 0.5 },
              end: { x: boxX + boxW * 0.42, y: boxY + boxH * 0.2 },
              thickness: 2.2,
              color: cRgb
            });
            page.drawLine({
              start: { x: boxX + boxW * 0.42, y: boxY + boxH * 0.2 },
              end: { x: boxX + boxW * 0.88, y: boxY + boxH * 0.85 },
              thickness: 2.2,
              color: cRgb
            });
          } else if (ann.type === 'image' && ann.dataUrl) {
            const pngBytes = await fetch(ann.dataUrl).then(r => r.arrayBuffer());
            const embeddedImg = await pdfDoc.embedPng(pngBytes);
            page.drawImage(embeddedImg, {
              x: boxX,
              y: boxY,
              width: boxW,
              height: boxH
            });
          } else if (ann.type === 'text' && ann.text) {
            const scaledFontSize = Math.max(7, ann.fontSize * (width / 595));
            const activeFont = ann.bold ? fontBold : fontRegular;
            const textColor = hexToPdfLibRgb(ann.color || '#0f172a');
            const lines = ann.text.split('\n');

            lines.forEach((lineStr, lineIdx) => {
              // Bersihkan karakter non-WinAnsi agar tidak error saat drawText
              const safeText = lineStr.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
              const lineY = height - (ann.yPct * height) - scaledFontSize - (lineIdx * scaledFontSize * 1.2);
              if (lineY > 5) {
                page.drawText(safeText, {
                  x: boxX,
                  y: lineY,
                  size: scaledFontSize,
                  font: activeFont,
                  color: textColor
                });
              }
            });
          }
        }
      }

      const finalBytes = await pdfDoc.save();
      editedPdfOutputBlob = new Blob([finalBytes], { type: 'application/pdf' });
    } else {
      // KOMPILASI ULANG DARI EDITOR TEKS PARAGRAF (TEXT REFLOW PDF)
      extractedParagraphsByPage[editCurrentPage] = document.getElementById('pdfParagraphTextarea').value;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);

      for (let p = 1; p <= editTotalPages; p++) {
        if (p > 1) doc.addPage();
        if (extractedParagraphsByPage[p] === undefined) {
          editCurrentPage = p;
          await extractParagraphsForEditing();
        }
        const pageText = extractedParagraphsByPage[p] || '';
        const lines = doc.splitTextToSize(pageText, 180);
        let y = 20;
        lines.forEach(line => {
          if (y > 280) { doc.addPage(); y = 20; }
          doc.text(line, 15, y);
          y += 6;
        });
      }
      editedPdfOutputBlob = doc.output('blob');
    }

    const baseName = (document.getElementById('editExportFileName').value || 'Dokumen_Diedit').replace(/\.pdf$/i, '');
    document.getElementById('editResultTitle').textContent = `${baseName}.pdf`;
    document.getElementById('editResultMeta').textContent =
      `Mode: ${editSubMode === 'visual' ? 'Visual Lossless Edit' : 'Edit Paragraf'} | Ukuran Akhir: ${window.formatBytes(editedPdfOutputBlob.size)}`;
    document.getElementById('editResultBox').classList.remove('hidden');

  } catch (err) {
    alert('Gagal menyimpan hasil edit PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Simpan & Buat PDF Hasil Edit';
  }
};

window.downloadEditedPdfResult = () => {
  if (!editedPdfOutputBlob) return;
  const baseName = (document.getElementById('editExportFileName').value || 'Dokumen_Diedit').replace(/\.pdf$/i, '');
  window.triggerBrowserDownload(editedPdfOutputBlob, `${baseName}.pdf`);
};

window.sendEditedPdfToCompressor = async () => {
  if (!editedPdfOutputBlob) return;
  const baseName = (document.getElementById('editExportFileName').value || 'Dokumen_Diedit').replace(/\.pdf$/i, '') + '.pdf';
  const newFile = new File([editedPdfOutputBlob], baseName, { type: 'application/pdf' });
  window.switchMode('local');
  await window.addFilesToQueue([newFile]);
};
