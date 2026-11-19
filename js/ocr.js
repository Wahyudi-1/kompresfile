// =========================================================================
// 6. JS/OCR.JS - KONVERSI OCR TESSERACT KE MICROSOFT WORD (.DOCX) & PDF
// =========================================================================

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
    window.triggerBrowserDownload(blob, `${baseName}.docx`);
  } else {
    const htmlContent = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'></head><body>${text.split('\n').map(l => `<p>${l}</p>`).join('')}</body></html>`;
    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    window.triggerBrowserDownload(blob, `${baseName}.doc`);
  }
};

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
  if (AppState.ocrPagesCache.length === 0) return alert('Silakan jalankan proses OCR terlebih dahulu.');
  const baseName = (document.getElementById('ocrExportFileName').value || 'Hasil_OCR').replace(/\.(docx|pdf)$/i, '');
  const { jsPDF } = window.jspdf;
  let doc = null;
  AppState.ocrPagesCache.forEach((p, idx) => {
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

window.addEventListener('DOMContentLoaded', () => {
  const btnStartOcr = document.getElementById('btnStartOcr');
  if (!btnStartOcr) return;

  btnStartOcr.addEventListener('click', async () => {
    const file = document.getElementById('ocrFileInput').files[0];
    if (!file) return alert('Pilih file atau gunakan tombol Scan Kamera untuk OCR terlebih dahulu.');

    const lang = document.getElementById('ocrLang').value;
    const rangeStr = document.getElementById('ocrPageRange').value;
    const statusText = document.getElementById('ocrProgressStatus');
    const progWrap = document.getElementById('ocrProgressWrap');
    const progBar = document.getElementById('ocrProgressBar');
    const resultBox = document.getElementById('ocrResultBox');
    const textOutput = document.getElementById('ocrTextOutput');

    btnStartOcr.disabled = true;
    progWrap.classList.remove('hidden');
    resultBox.classList.add('hidden');
    AppState.ocrPagesCache = [];

    document.getElementById('ocrExportFileName').value = file.name.replace(/\.[^/.]+$/, "") + "_OCR";

    try {
      const canvasesToRead = [];
      if (file.type === 'application/pdf') {
        statusText.textContent = 'Membaca halaman PDF...';
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const pages = window.parsePageSelection(rangeStr, pdf.numPages);
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
        AppState.ocrPagesCache.push({ pageNum: item.pageNum, canvas: item.canvas, text: cleanPageText, words: data.words || [] });
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
      btnStartOcr.disabled = false;
    }
  });
});
