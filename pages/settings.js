const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model-select');
const btnSave = document.getElementById('btn-save');
const btnTest = document.getElementById('btn-test');
const statusMessage = document.getElementById('status-message');

// Valid model IDs
const VALID_MODELS = [...modelSelect.options].map(o => o.value);

// Load saved settings
chrome.storage.sync.get(['geminiApiKey', 'geminiModel'], (result) => {
  if (result.geminiApiKey) {
    apiKeyInput.value = result.geminiApiKey;
  }
  if (result.geminiModel && VALID_MODELS.includes(result.geminiModel)) {
    modelSelect.value = result.geminiModel;
  } else {
    // Old/invalid model stored — auto-update to default
    chrome.storage.sync.set({ geminiModel: modelSelect.value });
  }
});

// Save settings
btnSave.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus('請輸入 API Key', 'error');
    return;
  }
  chrome.storage.sync.set({
    geminiApiKey: key,
    geminiModel: modelSelect.value
  }, () => {
    showStatus('已儲存！', 'success');
  });
});

// Test API key
btnTest.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus('請先輸入 API Key', 'error');
    return;
  }

  const model = modelSelect.value;
  showStatus(`測試中（${model}）...`, '');
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello' }] }]
      })
    });

    if (response.ok) {
      showStatus('連線成功！API Key 有效。', 'success');
    } else {
      const data = await response.json();
      showStatus(`連線失敗：${data.error?.message || response.statusText}`, 'error');
    }
  } catch (err) {
    showStatus(`連線失敗：${err.message}`, 'error');
  }
});

function showStatus(text, type) {
  statusMessage.textContent = text;
  statusMessage.className = type;
}
