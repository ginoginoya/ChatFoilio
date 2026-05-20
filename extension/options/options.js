/**
 * ChatFolio — Options Page Script
 */

'use strict';

// ─── 工具 ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];

function showToast(msg = '✓ 設定已儲存', duration = 1500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('visible'); }, duration);
}

// ─── 預設值 ──────────────────────────────────────────────────
const DEFAULTS = {
  chatWidth: 800, fontSize: 14, sidebarWidth: 256,
  expandInput: false, defaultModel: '',
  timelineEnabled: true,
  timelineScanEnabled: false,
  timelineScanRepeats: 3,
  timelineScanInterval: 800,
  // Experimental feature: auto-recover missing conversation titles from older history blocks.
  titleRepairEnabled: false,
  titleRepairMaxRetries: 3,
  foldersEnabled: true, folderFloatingEnabled: false, folderPinToBottom: false, promptVaultEnabled: true,
  syncDeleteEnabled: true,
  exportPanelEnabled: true,
  quoteReplyEnabled: true,
  formulaCopyEnabled: true,
  categorizedMarkEnabled: true
};

// ─── Storage helpers ──────────────────────────────────────────
const getSettings = () => new Promise(r => chrome.storage.sync.get('cf_settings', d => r(Object.assign({}, DEFAULTS, d.cf_settings || {}))));
const saveSettings = (s) => new Promise(r => chrome.storage.sync.set({ cf_settings: s }, r));
const getLocal = (k) => new Promise(r => chrome.storage.local.get(k, r));
const setLocal = (d) => new Promise(r => chrome.storage.local.set(d, r));

// ─── Shared Storage Utility (Matches content.js) ──────────────
const Storage = {
  // Now primarily used for Local storage wrappers if needed, 
  // Sync chunking logic was moved to libs/googleDrive.js for Drive integration.
};

// ─── 導覽分頁 ─────────────────────────────────────────────────
function initNav() {
  $$('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      $$('.nav-link').forEach(l => l.classList.remove('active'));
      $$('.tab').forEach(t => t.classList.remove('active'));
      link.classList.add('active');
      $(`tab-${tab}`)?.classList.add('active');
    });
  });
}

// ─── 載入設定到 UI ────────────────────────────────────────────
function applyToUI(s) {
  // Range sliders
  const ranges = [
    ['chatWidth', 'chatWidth-val'],
    ['fontSize', 'fontSize-val']
  ];
  ranges.forEach(([id, valId]) => {
    const el = $(id);
    if (el) {
      el.value = s[id] ?? DEFAULTS[id];
      $(valId).textContent = el.value;
      el.addEventListener('input', () => $(valId).textContent = el.value);
    }
  });

  // Checkboxes
  const checks = [
    'timelineEnabled',
    'timelineScanEnabled',
    'titleRepairEnabled',
    'foldersEnabled', 'folderFloatingEnabled', 'folderPinToBottom', 'promptVaultEnabled', 'syncDeleteEnabled',
    'exportPanelEnabled',
    'quoteReplyEnabled', 'formulaCopyEnabled',
    'categorizedMarkEnabled'
  ];
  checks.forEach(id => {
    const el = $(id);
    if (el) el.checked = !!s[id];
  });

  const retryEl = $('titleRepairMaxRetries');
  if (retryEl) retryEl.value = s.titleRepairMaxRetries ?? DEFAULTS.titleRepairMaxRetries;

  const scanRetryEl = $('timelineScanRepeats');
  if (scanRetryEl) scanRetryEl.value = s.timelineScanRepeats ?? DEFAULTS.timelineScanRepeats;

  const scanIntervalEl = $('timelineScanInterval');
  if (scanIntervalEl) scanIntervalEl.value = s.timelineScanInterval ?? DEFAULTS.timelineScanInterval;

}

/* Removed duplicate obsolete ensureTitleRepairSettingPlacement */

// ─── 從 UI 讀取設定 ───────────────────────────────────────────
function ensureTitleRepairSettingPlacement() {
  let input = $('titleRepairMaxRetries');
  let toggle = $('titleRepairEnabled');
  const advancedTab = $('tab-advanced');
  if (!advancedTab) return;

  const titleRepairCardHtml = `
      <h3>自動讀取標題 <span class="hint">測試性功能</span></h3>
      <div class="field toggle-field">
        <div>
          <label>啟用自動讀取標題</label>
          <p class="hint-text">當 Gemini 尚未正常帶回目前對話標題時，會嘗試從較早的歷史內容區塊補讀標題。</p>
        </div>
        <label class="switch"><input type="checkbox" id="titleRepairEnabled"><span class="track"></span></label>
      </div>
      <div class="field">
        <label>歷史標題最大讀取次數 <span class="hint">0 到 100，0 代表無限制 (預設 3)</span></label>
        <input type="number" id="titleRepairMaxRetries" min="0" max="100" step="1" placeholder="3">
        <p class="hint-text">當目前對話還拿不到標題時，從歷史對話重讀標題的最多嘗試次數。</p>
      </div>
    `;

  let card = (input || toggle)?.closest('.card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card';
    const dataCard = $('btn-export-all')?.closest('.card');
    advancedTab.insertBefore(card, dataCard || null);
  }

  card.innerHTML = titleRepairCardHtml;

  const dataCard = $('btn-export-all')?.closest('.card');
  if (!advancedTab.contains(card) || (dataCard && card.compareDocumentPosition(dataCard) & Node.DOCUMENT_POSITION_FOLLOWING)) {
    advancedTab.insertBefore(card, dataCard || null);
  }

  input = $('titleRepairMaxRetries');
  toggle = $('titleRepairEnabled');

  if (input && !input.dataset.boundRetryClamp) {
    input.dataset.boundRetryClamp = '1';
    // 移除舊有的即時 input 限制，交由全局 setupNumericValidation 處理
  }

  if (toggle && !toggle.dataset.boundRepairToggle) {
    toggle.dataset.boundRepairToggle = '1';
    // Removed syncDisabled logic that was locking the input based on toggle state.
  }
}

function readFromUI() {
  const val = id => {
    const el = $(id);
    return el ? (el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value) : DEFAULTS[id];
  };

  return {
    chatWidth: +$('chatWidth')?.value || 800,
    fontSize: +$('fontSize')?.value || 14,
    timelineEnabled:   val('timelineEnabled'),
    timelineScanEnabled: val('timelineScanEnabled'),
    timelineScanRepeats: (() => {
      const v = Number($('timelineScanRepeats')?.value);
      return (Number.isFinite(v) && v >= 0 && v <= 100) ? v : 3;
    })(),
    timelineScanInterval: (() => {
      const v = Number($('timelineScanInterval')?.value);
      return (Number.isFinite(v) && v >= 500 && v <= 10000) ? v : 800;
    })(),
    titleRepairEnabled: val('titleRepairEnabled'),
    titleRepairMaxRetries: (() => {
      const v = Number($('titleRepairMaxRetries')?.value);
      return (Number.isFinite(v) && v >= 0 && v <= 100) ? v : 3;
    })(),
    foldersEnabled:    val('foldersEnabled'),
    folderFloatingEnabled: val('folderFloatingEnabled'),
    folderPinToBottom: val('folderPinToBottom'),
    promptVaultEnabled:val('promptVaultEnabled'),
    syncDeleteEnabled: val('syncDeleteEnabled'),
    exportPanelEnabled:val('exportPanelEnabled'),
    quoteReplyEnabled: val('quoteReplyEnabled'),
    formulaCopyEnabled:val('formulaCopyEnabled'),
    categorizedMarkEnabled: val('categorizedMarkEnabled')
  };
}

// ─── 提示詞庫 UI ──────────────────────────────────────────────
let prompts = [];
let editingPromptId = null;

async function loadPrompts() {
  const { cf_prompts: p } = await getLocal('cf_prompts');
  prompts = p || [];
  renderPrompts();
}

function renderPrompts() {
  const list = $('prompt-list');
  if (!list) return;
  if (!prompts.length) {
    list.innerHTML = '<p class="empty-hint">尚無提示詞。點擊「＋ 新增提示詞」開始建立！</p>';
    return;
  }
  list.innerHTML = '';
  prompts.forEach(p => {
    const div = document.createElement('div');
    div.className = 'prompt-item';
    div.innerHTML = `
      <div class="prompt-item-content">
        <div class="prompt-item-title">${escHtml(p.title)}</div>
        <div class="prompt-item-preview">${escHtml(p.content.slice(0, 100))}</div>
        <div class="prompt-item-tags">
          ${(p.tags || []).map(t => `<span class="prompt-tag">${escHtml(t)}</span>`).join('')}
        </div>
      </div>
      <div class="prompt-item-actions">
        <button data-id="${p.id}" data-action="edit">✏ 編輯</button>
        <button data-id="${p.id}" data-action="delete">✕</button>
      </div>
    `;
    div.querySelector('[data-action="edit"]').addEventListener('click', () => openEditor(p));
    div.querySelector('[data-action="delete"]').addEventListener('click', () => deletePrompt(p.id));
    list.appendChild(div);
  });
}

function openEditor(prompt = null) {
  const editor = $('prompt-editor');
  editor.hidden = false;
  $('prompt-editor-title').textContent = prompt ? '編輯提示詞' : '新增提示詞';
  $('prompt-title').value   = prompt?.title   || '';
  $('prompt-content').value = prompt?.content || '';
  $('prompt-tags').value    = (prompt?.tags || []).join(', ');
  editingPromptId = prompt?.id || null;
  editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('prompt-title').focus();
}

async function savePrompt() {
  const title   = $('prompt-title').value.trim();
  const content = $('prompt-content').value.trim();
  const tags    = $('prompt-tags').value.split(',').map(t => t.trim()).filter(Boolean);

  if (!title || !content) { showToast('⚠ 請填寫標題和內容', 2000); return; }

  if (editingPromptId) {
    const p = prompts.find(x => x.id === editingPromptId);
    if (p) { p.title = title; p.content = content; p.tags = tags; }
  } else {
    prompts.unshift({ id: crypto.randomUUID(), title, content, tags, usageCount: 0, platforms: ['gemini', 'aistudio'], createdAt: Date.now() });
  }

  await setLocal({ cf_prompts: prompts });
  renderPrompts();
  $('prompt-editor').hidden = true;
  editingPromptId = null;
  showToast('✓ 提示詞已儲存');
}

async function deletePrompt(id) {
  if (!confirm('確定刪除此提示詞？')) return;
  prompts = prompts.filter(p => p.id !== id);
  await setLocal({ cf_prompts: prompts });
  renderPrompts();
  showToast('✓ 已刪除');
}

// ─── 資料夾預覽（含層級與對話列表）──────────────────────────────
async function loadFolderPreview() {
  const { cf_folders: folders } = await getLocal('cf_folders');
  const list = $('folder-list-preview');
  if (!list) return;
  list.innerHTML = '';
  if (!folders?.length) {
    list.innerHTML = '<p class="empty-hint" id="folder-empty">尚無資料夾</p>';
    return;
  }

  function renderFolder(folder, depth) {
    const children = folders.filter(f => f.parentId === folder.id);
    const convIds  = folder.conversationIds || [];

    // 資料夾列
    const div = document.createElement('div');
    div.className = 'folder-preview-item';
    div.style.paddingLeft = (8 + depth * 18) + 'px';
    div.innerHTML = `
      <span class="folder-dot" style="background:${escHtml(folder.color || '#1A56DB')}"></span>
      <span class="folder-preview-name">${escHtml(folder.name)}</span>
      ${convIds.length ? `<span class="folder-preview-count">${convIds.length}</span>` : ''}
    `;
    list.appendChild(div);

    // 對話列
    convIds.forEach(convId => {
      const name = folder._convNames?.[convId] || convId.slice(0, 28) + '…';
      const cDiv = document.createElement('div');
      cDiv.className = 'folder-preview-conv';
      cDiv.style.paddingLeft = (8 + (depth + 1) * 18) + 'px';
      cDiv.innerHTML = `<span class="folder-preview-conv-dot"></span><span class="folder-preview-conv-name">${escHtml(name)}</span>`;
      list.appendChild(cDiv);
    });

    // 子資料夾（遞迴）
    children.forEach(child => renderFolder(child, depth + 1));
  }

  // 先渲染頂層資料夾
  folders.filter(f => !f.parentId).forEach(f => renderFolder(f, 0));
}

// ─── 資料夾備份與同步（移植自 content.js，已根據需求整合提示詞） ─────────────────────
async function exportFolders() {
  const { cf_folders: folders } = await getLocal('cf_folders');
  const { cf_prompts: prompts } = await getLocal('cf_prompts');
  const data = { 
    exportedAt: new Date().toISOString(), 
    folders: folders || [],
    prompts: prompts || [] // 配合需求，匯出時一併包含提示詞
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chatfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function importFolders() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const importedF = Array.isArray(data) ? [] : (data.folders || []);
      const importedP = Array.isArray(data) ? (data || []) : (data.prompts || []);
      
      if (!importedF.length && !importedP.length) { 
        showToast('⚠ 沒有找到有效的資料夾或提示詞資料'); 
        return; 
      }
      
      const confirmMsg = `確定匯入備份資料嗎？\n- 資料夾：${importedF.length} 個\n- 提示詞：${importedP.length} 個`;
      if (!confirm(confirmMsg)) return;

      const { cf_folders: existingF } = await getLocal('cf_folders');
      const { cf_prompts: existingP } = await getLocal('cf_prompts');
      
      const mergedF = [...importedF, ...(existingF || [])].filter((f, i, a) => a.findIndex(x => x.id === f.id) === i);
      const mergedP = [...importedP, ...(existingP || [])].filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);
      
      await setLocal({ cf_folders: mergedF, cf_prompts: mergedP });
      
      await loadFolderPreview();
      await loadPrompts();
      
      showToast(`✓ 已匯入 ${importedF.length} 個資料夾與 ${importedP.length} 個提示詞`);
    } catch {
      showToast('⚠ JSON 格式錯誤');
    }
  });
  input.click();
}

async function syncFoldersUp() {
  const { cf_folders: folders } = await getLocal('cf_folders');
  const { cf_prompts: prompts } = await getLocal('cf_prompts');
  const settings = await getSettings();

  const data = {
    exportedAt: new Date().toISOString(),
    folders: folders || [],
    prompts: prompts || [],
    settings: settings
  };

  const ok = confirm(`確定將本機資料（${folders?.length ?? 0} 個資料夾、${(prompts || []).length} 個提示詞）備份至 Google Drive？\n這將覆蓋雲端上的舊區域備份。`);
  if (!ok) return;

  try {
    showToast('🚀 正在連接 Google Drive...', 3000);
    const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'DRIVE_SYNC_UP', data }, r));
    
    if (resp && resp.ok) {
      showToast('✓ 已成功備份至 Google Drive');
    } else {
      throw new Error(resp?.error || '未知錯誤');
    }
  } catch (err) {
    showToast('⚠ 備份失敗：' + err.message, 3000);
  }
}

async function syncFoldersDown() {
  try {
    showToast('🔍 正在從 Google Drive 取得資料...', 3000);
    const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'DRIVE_SYNC_DOWN' }, r));
    
    if (resp && resp.ok && resp.data) {
      const { folders, prompts, settings } = resp.data;
      
      if (!confirm(`確定從 Google Drive 下載備份並覆蓋本機資料？\n（${folders?.length ?? 0} 個資料夾，${prompts?.length ?? 0} 個提示詞）`)) return;
      
      if (folders) await setLocal({ cf_folders: folders });
      if (prompts) await setLocal({ cf_prompts: prompts });
      if (settings) await saveSettings(settings);
      
      await loadFolderPreview();
      await loadPrompts();
      const newSettings = await getSettings();
      applyToUI(newSettings);

      showToast('✓ 已從 Google Drive 還原資料');
    } else if (resp && resp.ok && !resp.data) {
      showToast('⚠ Google Drive 中沒有找到任何備份檔案');
    } else {
      throw new Error(resp?.error || '數據解析錯誤');
    }
  } catch (err) {
    showToast('⚠ 下載失敗：' + err.message, 3000);
  }
}

// ─── 匯出 / 匯入 ──────────────────────────────────────────────
async function exportAllData() {
  const settings = await getSettings();
  const dataMap = await getLocal(['cf_folders', 'cf_prompts', 'cf_starred', 'cf_timestamps']);
  const folders = dataMap.cf_folders || [];
  const prompts = dataMap.cf_prompts || [];
  const starredMessages = dataMap.cf_starred || {};
  const msgTimestamps = dataMap.cf_timestamps || {};
  
  const data = { exportedAt: new Date().toISOString(), settings, folders, prompts, starredMessages, msgTimestamps };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chatfolio-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function exportPrompts() {
  const { cf_prompts: prompts } = await getLocal('cf_prompts');
  const blob = new Blob([JSON.stringify(prompts || [], null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chatfolio-prompts-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importPrompts() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      const imported = Array.isArray(data) ? data : data.prompts || [];
      const { cf_prompts: existing } = await getLocal('cf_prompts');
      const merged = [...imported, ...(existing || [])].filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);
      await setLocal({ cf_prompts: merged });
      prompts = merged;
      renderPrompts();
      showToast(`✓ 匯入 ${imported.length} 個提示詞`);
    } catch {
      showToast('⚠ JSON 格式錯誤', 2500);
    }
  });
  input.click();
}

// ─── 工具 ────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── 主初始化 ─────────────────────────────────────────────────
async function init() {
  // 版本
  const version = chrome.runtime.getManifest().version;
  ['about-version', 'info-version'].forEach(id => { const el = $(id); if (el) el.textContent = `版本 ${version}`; });
  const infoVer = $('info-version'); if (infoVer) infoVer.textContent = version;

  // 導覽
  initNav();

  // 載入設定
  const settings = await getSettings();
  ensureTitleRepairSettingPlacement();
  applyToUI(settings);

  // 提示詞
  await loadPrompts();
  await loadFolderPreview();

  // ─── 儲存 ──
  $('btn-save')?.addEventListener('click', async () => {
    const s = readFromUI();
    await saveSettings(s);
    // 廣播給所有 Gemini 分頁
    chrome.runtime.sendMessage({ type: 'BROADCAST_SETTINGS', settings: s }).catch(() => {});
    showToast();
  });

  // 重設
  $('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('確定重設所有設定為預設值？')) return;
    await saveSettings(DEFAULTS);
    applyToUI(DEFAULTS);
    showToast('✓ 已重設為預設值');
  });

  // 提示詞
  $('btn-add-prompt')?.addEventListener('click', () => openEditor(null));
  $('btn-save-prompt')?.addEventListener('click', savePrompt);
  $('btn-cancel-prompt')?.addEventListener('click', () => { $('prompt-editor').hidden = true; });
  $('btn-export-prompts')?.addEventListener('click', exportPrompts);
  $('btn-import-prompts')?.addEventListener('click', importPrompts);

  // 資料夾
  $('btn-clear-folders')?.addEventListener('click', async () => {
    if (!confirm('【危險操作】確定清除所有資料夾？\n此動作將刪除所有已分類的對話連結且無法撤銷。若沒有備份，資料將永久消失！')) return;
    
    // 正確清除資料夾的核心 key (cf_folders)
    await setLocal({ cf_folders: [] });
    $('folder-list-preview').innerHTML = '<p class="empty-hint" id="folder-empty">尚無資料夾</p>';
    showToast('✓ 資料夾已完全清除', 2500);
  });

  $('btn-import-folders')?.addEventListener('click', importFolders);
  $('btn-export-folders')?.addEventListener('click', exportFolders);
  $('btn-upload-folders')?.addEventListener('click', syncFoldersUp);
  $('btn-download-folders')?.addEventListener('click', syncFoldersDown);

  // 進階
  $('btn-export-all')?.addEventListener('click', exportAllData);
  $('btn-clear-all')?.addEventListener('click', async () => {
    if (!confirm('確定清除所有插件資料？此操作無法復原！')) return;
    await new Promise(r => chrome.storage.local.clear(r));
    await saveSettings(DEFAULTS);
    showToast('✓ 所有資料已清除', 3000);
    applyToUI(DEFAULTS);
  });

  // ─── 即時數值驗證 ──
  const setupNumericValidation = (id, min, max, def) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('blur', () => {
      const v = Number(el.value);
      if (!Number.isFinite(v) || v < min || v > max) {
        el.value = def;
        showToast(`⚠ 數值需在 ${min} ~ ${max} 之間，已恢復預設值`, 2000);
      }
    });
  };

  setupNumericValidation('timelineScanRepeats',   0,  100, 3);
  setupNumericValidation('timelineScanInterval', 500, 10000, 800);
  setupNumericValidation('titleRepairMaxRetries', 0,  100, 3);
}

document.addEventListener('DOMContentLoaded', init);
