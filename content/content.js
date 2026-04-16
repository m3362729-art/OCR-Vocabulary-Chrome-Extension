// === Message Listener from Background ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ ok: true });
    return;
  }
  if (message.action === 'startOCR') {
    startOCRFlow();
  }
});

// === Main OCR Flow ===
async function startOCRFlow() {
  let rect;
  try {
    rect = await window.startOCRSelection();
  } catch {
    // User cancelled or selection too small — silently ignore
    return;
  }

  // Show loading spinner near the selection
  const loading = showLoading(rect);

  try {
    // Step 1: Request full-page screenshot from background
    const { dataUrl } = await chrome.runtime.sendMessage({ action: 'captureTab' });
    if (!dataUrl) {
      throw new Error('無法截取頁面');
    }

    // Step 2: Crop the selected region
    const croppedBase64 = await cropScreenshot(dataUrl, rect);

    // Step 3: Send to Gemini API via background
    const result = await chrome.runtime.sendMessage({
      action: 'processOCR',
      imageBase64: croppedBase64
    });

    loading.remove();

    if (result.error) {
      showError(result.error, rect);
      return;
    }

    // Step 4: Show result popup
    showResultPopup(result.data, rect);

  } catch (err) {
    loading.remove();
    showError(err.message || '發生未知錯誤', rect);
  }
}

// === Crop Screenshot using Canvas ===
function cropScreenshot(dataUrl, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const dpr = window.devicePixelRatio || 1;
      const canvas = document.createElement('canvas');
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(
        img,
        rect.x * dpr, rect.y * dpr,
        rect.width * dpr, rect.height * dpr,
        0, 0,
        rect.width * dpr, rect.height * dpr
      );
      const base64 = canvas.toDataURL('image/png').split(',')[1];
      resolve(base64);
    };
    img.onerror = () => reject(new Error('無法載入截圖'));
    img.src = dataUrl;
  });
}

// === Show Loading Spinner ===
function showLoading(rect) {
  const el = document.createElement('div');
  el.className = 'ocr-vocab-loading';
  el.textContent = '辨識中...';
  positionElement(el, rect);
  document.body.appendChild(el);
  return el;
}

// === Show Error ===
function showError(message, rect) {
  const el = document.createElement('div');
  el.className = 'ocr-vocab-error';
  el.textContent = message;
  positionElement(el, rect);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// === Show Result Popup ===
function showResultPopup(data, rect) {
  // Remove any existing popup
  const existing = document.querySelector('.ocr-vocab-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'ocr-vocab-popup';
  popup.style.position = 'fixed';
  popup.innerHTML = `
    <button class="ocr-vocab-popup-close">&times;</button>
    <div class="ocr-vocab-popup-header">
      <span class="ocr-vocab-popup-word">${escapeHtml(data.word)}</span>
      <button class="ocr-vocab-btn-speak" title="發音">🔊</button>
      <span class="ocr-vocab-popup-pos">${escapeHtml(data.partOfSpeech)}</span>
    </div>
    <div class="ocr-vocab-popup-translation">${escapeHtml(data.translation)}</div>
    <div class="ocr-vocab-popup-example">
      <div class="ocr-vocab-popup-example-en">${escapeHtml(data.exampleEn)}</div>
      <div class="ocr-vocab-popup-example-zh">${escapeHtml(data.exampleZh)}</div>
    </div>
    <div class="ocr-vocab-popup-actions">
      <button class="ocr-vocab-btn-save">儲存到單字本</button>
      <button class="ocr-vocab-btn-close">關閉</button>
    </div>
  `;

  positionElement(popup, rect);
  document.body.appendChild(popup);

  // Speak button
  popup.querySelector('.ocr-vocab-btn-speak').addEventListener('click', () => speakWord(data.word));

  // Close button
  popup.querySelector('.ocr-vocab-popup-close').addEventListener('click', () => popup.remove());
  popup.querySelector('.ocr-vocab-btn-close').addEventListener('click', () => popup.remove());

  // Save button
  popup.querySelector('.ocr-vocab-btn-save').addEventListener('click', async (e) => {
    const btn = e.target;
    await saveWord(data);
    btn.textContent = '已儲存 ✓';
    btn.classList.add('saved');
  });
}

// === Speak Word ===
function speakWord(word) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(word);
  utter.lang = /[\u4e00-\u9fa5]/.test(word) ? 'zh-TW' : 'en-US';
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}

// === Save Word to Storage ===
async function saveWord(data) {
  const result = await chrome.storage.local.get('vocabulary');
  const vocabulary = result.vocabulary || [];

  const entry = {
    id: Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    word: data.word,
    translation: data.translation,
    partOfSpeech: data.partOfSpeech,
    exampleEn: data.exampleEn,
    exampleZh: data.exampleZh,
    pinned: false,
    createdAt: Date.now()
  };

  vocabulary.unshift(entry);
  await chrome.storage.local.set({ vocabulary });
}

// === Position Element Below Selection Rect ===
function positionElement(el, rect) {
  const margin = 8;
  let top = rect.y + rect.height + margin;
  let left = rect.x;

  // Ensure it stays within viewport
  if (top + 200 > window.innerHeight) {
    top = rect.y - 200 - margin;
  }
  if (left + 320 > window.innerWidth) {
    left = window.innerWidth - 330;
  }
  if (left < 10) left = 10;
  if (top < 10) top = 10;

  el.style.top = top + 'px';
  el.style.left = left + 'px';
}

// === HTML Escape ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
