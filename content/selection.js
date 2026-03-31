// Rectangle selection overlay for OCR
// Exposes window.startOCRSelection() which returns a Promise<{x, y, width, height}>

window.startOCRSelection = function () {
  return new Promise((resolve, reject) => {
    // Prevent multiple overlays
    if (document.getElementById('ocr-vocab-overlay')) {
      reject(new Error('選取模式已啟動'));
      return;
    }

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'ocr-vocab-overlay';
    overlay.className = 'ocr-vocab-overlay';
    document.body.appendChild(overlay);

    // Create selection rectangle
    const selRect = document.createElement('div');
    selRect.className = 'ocr-vocab-selection-rect';
    overlay.appendChild(selRect);

    // Create hint text
    const hint = document.createElement('div');
    hint.className = 'ocr-vocab-hint';
    hint.textContent = '拖曳選取要辨識的區域（按 Esc 取消）';
    overlay.appendChild(hint);

    let startX = 0;
    let startY = 0;
    let isDragging = false;

    function onMouseDown(e) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      selRect.style.left = startX + 'px';
      selRect.style.top = startY + 'px';
      selRect.style.width = '0px';
      selRect.style.height = '0px';
      selRect.style.display = 'block';
      hint.style.display = 'none';
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);
      selRect.style.left = x + 'px';
      selRect.style.top = y + 'px';
      selRect.style.width = w + 'px';
      selRect.style.height = h + 'px';
      e.preventDefault();
    }

    function onMouseUp(e) {
      if (!isDragging) return;
      isDragging = false;

      const currentX = e.clientX;
      const currentY = e.clientY;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      cleanup();

      // Ignore tiny selections (likely accidental clicks)
      if (w < 10 || h < 10) {
        reject(new Error('選取區域太小'));
        return;
      }

      resolve({ x, y, width: w, height: h });
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        cleanup();
        reject(new Error('已取消選取'));
      }
    }

    function cleanup() {
      overlay.removeEventListener('mousedown', onMouseDown);
      overlay.removeEventListener('mousemove', onMouseMove);
      overlay.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
    }

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  });
};
