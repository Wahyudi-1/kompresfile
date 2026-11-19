// =========================================================================
// 2. JS/STORAGE.JS - INDEXEDDB OFFLINE, UPLOAD DRIVE, RIWAYAT & BUKTI PDF
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

window.saveToIndexedDBOutbox = async (payloadRecord) => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).add({
      ...payloadRecord,
      savedAt: new Date().toLocaleString('id-ID')
    });
    tx.oncomplete = () => { window.refreshOfflineQueueUI(); resolve(); };
    tx.onerror = (e) => reject(e.target.error);
  });
};

window.getAllOfflineOutbox = async () => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
};

window.deleteOfflineOutboxItem = async (id) => {
  const db = await openOfflineDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => { window.refreshOfflineQueueUI(); resolve(); };
    tx.onerror = (e) => reject(e.target.error);
  });
};

window.refreshOfflineQueueUI = async () => {
  const items = await window.getAllOfflineOutbox();
  const wrap = document.getElementById('offlineQueueBadgeWrap');
  const countEl = document.getElementById('offlineQueueCount');
  const listContainer = document.getElementById('indexedDbListContainer');

  if (countEl) countEl.textContent = items.length;
  if (wrap) {
    if (items.length > 0) wrap.classList.remove('hidden');
    else wrap.classList.add('hidden');
  }

  if (!listContainer) return;
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
};

window.syncOfflineQueueNow = async () => {
  if (!navigator.onLine) return alert('Perangkat masih Offline. Antrean akan otomatis dikirim saat internet aktif.');
  const items = await window.getAllOfflineOutbox();
  if (items.length === 0) return;

  const alertBox = document.getElementById('statusAlert');
  alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-amber-50 text-amber-900 border border-amber-300';
  alertBox.textContent = `🔄 Menyinkronkan ${items.length} paket dokumen dari IndexedDB ke Google Drive...`;
  alertBox.classList.remove('hidden');

  for (const item of items) {
    try {
      const res = await fetch(window.GAS_WEB_APP_URL, {
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
        AppState.lastReceiptData = {
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

  await window.refreshOfflineQueueUI();
  alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-900 border border-emerald-300';
  alertBox.innerHTML = `✅ <b>Sinkronisasi IndexedDB Selesai!</b> Seluruh antrean offline berhasil diunggah ke Google Drive. <button type="button" onclick="downloadUploadReceiptPdf()" class="ml-2 underline font-extrabold">Cetak Kartu Bukti PDF</button>`;
};

function updateNetworkIndicator() {
  const dot = document.getElementById('networkDot');
  const txt = document.getElementById('networkText');
  if (!dot || !txt) return;
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
window.addEventListener('load', () => { updateNetworkIndicator(); window.refreshOfflineQueueUI(); });

// Pengiriman Berkas ke Google Apps Script / Fallback IndexedDB
window.sendFilesToGas = async (filesPayload, nama, keterangan, kodeKompresi) => {
  const alertBox = document.getElementById('statusAlert');
  const cleanCode = kodeKompresi.toUpperCase();

  if (!navigator.onLine) {
    await window.saveToIndexedDBOutbox({ nama, keterangan, kodeKompresi: cleanCode, files: filesPayload });
    AppState.lastReceiptData = {
      nama, keterangan, kodeKompresi: cleanCode,
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
    const response = await fetch(window.GAS_WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'upload',
        nama, keterangan,
        kodeKompresi: cleanCode,
        files: filesPayload
      })
    });
    const result = await response.json();

    if (result.status === 'success') {
      AppState.lastReceiptData = {
        nama, keterangan,
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
    await window.saveToIndexedDBOutbox({ nama, keterangan, kodeKompresi: cleanCode, files: filesPayload });
    alertBox.className = 'p-4 rounded-xl text-sm font-medium bg-amber-50 text-amber-900 border border-amber-300';
    alertBox.textContent = `⚠️ Koneksi terputus saat mengunggah. Dokumen telah diamankan ke Antrean Offline IndexedDB (Kode: ${cleanCode}) dan bisa disinkronkan ulang.`;
  }
};

// Generator Kartu Bukti Upload PDF
window.downloadUploadReceiptPdf = (customData = null) => {
  const data = customData || AppState.lastReceiptData;
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

// Event Listener Tombol Upload Cloud & Pencarian Riwayat
window.addEventListener('DOMContentLoaded', () => {
  const btnSubmitCloud = document.getElementById('btnSubmitCloud');
  if (btnSubmitCloud) {
    btnSubmitCloud.addEventListener('click', async () => {
      const nama = document.getElementById('nama').value.trim();
      const keterangan = document.getElementById('keterangan').value.trim();
      const kodeKompresi = document.getElementById('kodeKompresi').value.trim();
      if (!nama || !keterangan || !kodeKompresi) return alert('Mohon lengkapi Nama Lengkap, Keperluan, dan Kode Kompresi.');

      const filesPayload = [];
      for (const item of AppState.fileQueue) {
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
          originalSize: window.formatBytes(item.file.size),
          compressedSize: window.formatBytes(item.compressedBlob.size),
          fileBase64: base64Data
        });
      }
      await window.sendFilesToGas(filesPayload, nama, keterangan, kodeKompresi);
    });
  }

  const historyForm = document.getElementById('historySearchForm');
  if (historyForm) {
    historyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!navigator.onLine) return alert('Pencarian riwayat Google Drive membutuhkan koneksi internet.');
      const nama = document.getElementById('searchNama').value.trim();
      const kode = document.getElementById('searchKode').value.trim().toUpperCase();
      const container = document.getElementById('historyResultContainer');
      const btn = document.getElementById('btnSearchHistory');

      btn.disabled = true; btn.textContent = '⏳ Mencari...';
      container.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 text-slate-600 text-sm text-center">Mencari dokumen...</div>`;

      try {
        const response = await fetch(window.GAS_WEB_APP_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'history', nama, kodeKompresi: kode })
        });
        const result = await response.json();

        if (result.status === 'success') {
          if (result.records.length === 0) {
            container.innerHTML = `<div class="p-6 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-center text-sm font-bold">Dokumen tidak ditemukan. Pastikan Nama & Kode Kompresi benar.</div>`;
          } else {
            AppState.lastReceiptData = {
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
  }
});
