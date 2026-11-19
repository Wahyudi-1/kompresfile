// =========================================================================
// 3. JS/SIGNATURE.JS - KANVAS TANDA TANGAN & DRAG-AND-DROP POSISI HALAMAN
// =========================================================================

window.addEventListener('DOMContentLoaded', () => {
  const sigCanvas = document.getElementById('signaturePad');
  if (!sigCanvas) return;
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
    isDrawingSig = true;
    AppState.hasSignatureDrawn = true;
    const pos = getSigPointerPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(pos.x, pos.y);
  });

  sigCanvas.addEventListener('pointermove', (e) => {
    if (!isDrawingSig) return;
    const pos = getSigPointerPos(e);
    sigCtx.lineTo(pos.x, pos.y);
    sigCtx.stroke();
  });

  window.addEventListener('pointerup', () => { isDrawingSig = false; });

  window.clearSignatureCanvas = () => {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    AppState.hasSignatureDrawn = false;
    if (window.markAllPending) window.markAllPending();
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
        AppState.hasSignatureDrawn = true;
        if (window.markAllPending) window.markAllPending();
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
    if (window.markAllPending) window.markAllPending();
  };

  window.openSignaturePositioner = async () => {
    if (!AppState.hasSignatureDrawn) return alert('Silakan gambar atau upload tanda tangan Anda terlebih dahulu.');

    const bgCanvas = document.getElementById('sigBgPageCanvas');
    const bgCtx = bgCanvas.getContext('2d');

    if (AppState.fileQueue.length > 0) {
      const firstItem = AppState.fileQueue[0];
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
        const keepPages = window.parsePageSelection(firstItem.pageSelection, pdf.numPages);
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
    dragBox.style.left = `${AppState.sigPosPercent.x * 100}%`;
    dragBox.style.top = `${AppState.sigPosPercent.y * 100}%`;

    document.getElementById('draggableSigImg').src = sigCanvas.toDataURL('image/png');
    document.getElementById('draggableSigName').textContent = document.getElementById('sigSignerName').value.trim();
    document.getElementById('sigDragModal').classList.remove('hidden');
  };

  window.closeSignaturePositioner = () => {
    document.getElementById('sigDragModal').classList.add('hidden');
    document.getElementById('sigCoordDisplay').textContent =
      `Kustom Drag & Drop (X: ${Math.round(AppState.sigPosPercent.x * 100)}%, Y: ${Math.round(AppState.sigPosPercent.y * 100)}%)`;
    if (window.markAllPending) window.markAllPending();
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

    AppState.sigPosPercent.x = newLeft / stageRect.width;
    AppState.sigPosPercent.y = newTop / stageRect.height;

    dragBox.style.left = `${AppState.sigPosPercent.x * 100}%`;
    dragBox.style.top = `${AppState.sigPosPercent.y * 100}%`;
  });

  dragBox.addEventListener('pointerup', () => { isDraggingBox = false; });

  window.stampSignatureOnCanvas = (targetCanvas) => {
    const enabled = document.getElementById('enableSignature').checked;
    if (!enabled || !AppState.hasSignatureDrawn) return;

    const ctx = targetCanvas.getContext('2d');
    const scaleRatio = parseFloat(document.getElementById('sigScaleSize').value) || 0.22;
    const signerName = document.getElementById('sigSignerName').value.trim();

    const sigW = targetCanvas.width * scaleRatio;
    const sigH = sigW * (sigCanvas.height / sigCanvas.width);
    const x = targetCanvas.width * AppState.sigPosPercent.x;
    const y = targetCanvas.height * AppState.sigPosPercent.y;

    ctx.drawImage(sigCanvas, x, y, sigW, sigH);

    if (signerName) {
      const fontSize = Math.max(11, Math.round(targetCanvas.width * 0.015));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText(signerName, x + sigW / 2, y + sigH + fontSize + 4);
    }
  };
});
