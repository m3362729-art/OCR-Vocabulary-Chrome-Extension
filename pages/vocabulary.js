const cardGrid = document.getElementById('card-grid');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const wordCount = document.getElementById('word-count');

let allWords = [];

// === Load and Render ===
async function loadVocabulary() {
  const result = await chrome.storage.local.get('vocabulary');
  allWords = result.vocabulary || [];
  renderCards(allWords);
}

function renderCards(words) {
  // Sort: pinned first, then by createdAt descending
  const sorted = [...words].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return b.createdAt - a.createdAt;
  });

  cardGrid.innerHTML = '';

  if (sorted.length === 0) {
    emptyState.style.display = 'block';
    wordCount.textContent = '';
    return;
  }

  emptyState.style.display = 'none';
  wordCount.textContent = `共 ${sorted.length} 個單字`;

  sorted.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'vocab-card' + (item.pinned ? ' pinned' : '');
    card.dataset.id = item.id;

    const date = new Date(item.createdAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

    card.innerHTML = `
      <div class="card-header">
        <span class="card-word">${escapeHtml(item.word)}</span>
        <span class="card-pos">${escapeHtml(item.partOfSpeech)}</span>
      </div>
      <div class="card-translation">${escapeHtml(item.translation)}</div>
      <div class="card-example">
        <div class="card-example-en">${escapeHtml(item.exampleEn)}</div>
        <div class="card-example-zh">${escapeHtml(item.exampleZh)}</div>
      </div>
      <div class="card-actions">
        <button class="btn-pin ${item.pinned ? 'active' : ''}" title="${item.pinned ? '取消置頂' : '置頂'}">📌</button>
        <button class="btn-delete" title="刪除">🗑️</button>
      </div>
      <div class="card-date">${dateStr}</div>
    `;

    // Pin toggle
    card.querySelector('.btn-pin').addEventListener('click', () => togglePin(item.id));

    // Delete
    card.querySelector('.btn-delete').addEventListener('click', () => deleteWord(item.id));

    cardGrid.appendChild(card);
  });
}

// === Toggle Pin ===
async function togglePin(id) {
  const idx = allWords.findIndex((w) => w.id === id);
  if (idx === -1) return;
  allWords[idx].pinned = !allWords[idx].pinned;
  await chrome.storage.local.set({ vocabulary: allWords });
  renderCards(filterWords());
}

// === Delete Word ===
async function deleteWord(id) {
  allWords = allWords.filter((w) => w.id !== id);
  await chrome.storage.local.set({ vocabulary: allWords });
  renderCards(filterWords());
}

// === Search Filter ===
function filterWords() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return allWords;
  return allWords.filter(
    (w) =>
      w.word.toLowerCase().includes(query) ||
      w.translation.includes(query)
  );
}

searchInput.addEventListener('input', () => {
  renderCards(filterWords());
});

// === Listen for storage changes (real-time updates) ===
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.vocabulary) {
    allWords = changes.vocabulary.newValue || [];
    renderCards(filterWords());
  }
});

// === HTML Escape ===
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

// === Init ===
loadVocabulary();
