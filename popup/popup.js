document.getElementById('btn-vocabulary').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/vocabulary.html') });
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings.html') });
});
