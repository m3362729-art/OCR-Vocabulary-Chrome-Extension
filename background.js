// === Context Menu Setup ===
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'trigger-ocr',
      title: 'OCR 擷取單字',
      contexts: ['page', 'image']
    });
  });
});

// === Ensure content scripts are injected, then send startOCR ===
async function sendStartOCR(tab) {
  try {
    let tabId = tab?.id;
    if (!tabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id;
    }
    if (!tabId) return;

    // Try sending message first; if content script isn't loaded, inject it
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch {
      // Content script not loaded — inject it now
      await chrome.scripting.insertCSS({
        target: { tabId },
        files: ['content/content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/selection.js', 'content/content.js']
      });
    }

    await chrome.tabs.sendMessage(tabId, { action: 'startOCR' });
  } catch (err) {
    console.error('OCR 啟動失敗:', err);
  }
}

// === Context Menu Click Handler ===
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'trigger-ocr') {
    sendStartOCR(tab);
  }
});

// === Keyboard Shortcut Handler ===
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'trigger-ocr') {
    sendStartOCR(tab);
  }
});

// === Message Handler ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (message.action === 'processOCR') {
    handleOCR(message.imageBase64).then(sendResponse);
    return true;
  }
});

// === Gemini API ===
const PROMPT = `You are an English-Chinese dictionary assistant. Look at this image and:
1. Identify the English word or phrase shown in the image (OCR).
2. Provide the Chinese translation (Traditional Chinese).
3. Identify the part of speech.
4. Create a natural English example sentence using this word.
5. Translate that example sentence into Traditional Chinese.

Respond ONLY in this exact JSON format, no markdown fencing:
{"word":"the English word","translation":"中文翻譯","partOfSpeech":"noun/verb/adjective/etc.","exampleEn":"English example sentence.","exampleZh":"中文例句翻譯。"}`;

async function handleOCR(base64Image) {
  const { geminiApiKey, geminiModel } = await chrome.storage.sync.get(['geminiApiKey', 'geminiModel']);
  if (!geminiApiKey) {
    return { error: 'API Key 尚未設定，請先至設定頁面輸入。' };
  }
  try {
    const model = geminiModel || 'gemini-2.5-flash';
    const result = await callGeminiAPI(base64Image, geminiApiKey, model);
    return { success: true, data: result };
  } catch (err) {
    return { error: err.message || 'API 呼叫失敗' };
  }
}

async function callGeminiAPI(base64Image, apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: 'image/png',
            data: base64Image
          }
        },
        {
          text: PROMPT
        }
      ]
    }]
  };

  const maxAttempts = 3;
  let response;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.ok) break;

    // Retry on 429 (rate limit), 503 (overloaded), 500 (server error)
    const retriable = [429, 500, 503].includes(response.status);
    if (!retriable || attempt === maxAttempts) {
      const errData = await response.json().catch(() => ({}));
      const baseMsg = errData.error?.message || `API 錯誤 (${response.status})`;
      if (response.status === 503) {
        throw new Error('模型目前負載過高，請稍後再試，或到設定頁切換其他模型。');
      }
      throw new Error(baseMsg);
    }

    // Exponential backoff: 1s, 2s
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('無法從 API 回應中取得結果');
  }

  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('無法解析 API 回應，請重試');
  }
}
