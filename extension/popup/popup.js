/**
 * ChatFolio — Popup Script
 */

'use strict';

const $ = id => document.getElementById(id);

async function applyTheme() {
  const { cf_settings } = await new Promise(r => chrome.storage.sync.get('cf_settings', r));
  const theme = cf_settings?.manualTheme || 'dark';
  document.documentElement.setAttribute('data-cf-theme', theme);
}

const defaults = {
  chatWidth: 800, fontSize: 14,
  formulaCopyEnabled: true, quoteReplyEnabled: true,
  timelineEnabled: true, promptVaultEnabled: true,
  foldersEnabled: true, exportPanelEnabled: true
};

async function loadSettings() {
  return new Promise(r => chrome.storage.sync.get('cf_settings', d => r(Object.assign({}, defaults, d.cf_settings || {}))));
}

async function saveSettings(patch) {
  const { cf_settings } = await new Promise(r => chrome.storage.sync.get('cf_settings', r));
  const updated = Object.assign({}, defaults, cf_settings || {}, patch);
  await new Promise(r => chrome.storage.sync.set({ cf_settings: updated }, r));
  // 廣播到當前 tab (僅限支援的網域)
  const tab = await getActiveTab();
  if (tab?.id && (tab.url?.includes('gemini.google.com') || tab.url?.includes('aistudio.google.com'))) {
    chrome.tabs.sendMessage(tab.id, { type: 'BROADCAST_SETTINGS', settings: updated }).catch(() => {});
  }
  return updated;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendToTab(tabId, message) {
  const tab = await new Promise(r => chrome.tabs.get(tabId, r));
  if (tab?.url?.includes('gemini.google.com') || tab?.url?.includes('aistudio.google.com')) {
    return chrome.tabs.sendMessage(tabId, message).catch(() => null);
  }
  return null;
}

// ─── 初始化 ──────────────────────────────────────────────────

async function init() {
  // 僅應用使用者選擇的主題 (預設深色)
  await applyTheme();

  // 版本
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;

  // 偵測平台 (不再需要設定介面文字，已移除該區塊)
  const tab = await getActiveTab();
  const url = tab?.url || '';

  // 載入設定
  const s = await loadSettings();

  // 填入 toggles
  $('toggle-timeline').checked   = s.timelineEnabled;
  $('toggle-folders').checked    = s.foldersEnabled;
  $('toggle-prompts').checked    = s.promptVaultEnabled;
  $('toggle-export-panel').checked = s.exportPanelEnabled;

  // 填入 sliders
  $('chat-width').value        = s.chatWidth;
  $('chat-width-val').textContent = s.chatWidth;
  $('font-size').value         = s.fontSize;
  $('font-size-val').textContent  = s.fontSize;

  // ─── 事件綁定 ──

  // 快速操作

  $('btn-prompt').addEventListener('click', async () => {
    const t = await getActiveTab();
    if (t?.id) sendToTab(t.id, { type: 'OPEN_PROMPT_VAULT' });
    window.close();
  });

  $('btn-export-md').addEventListener('click', async () => {
    const t = await getActiveTab();
    if (t?.id) sendToTab(t.id, { type: 'EXPORT', format: 'md' });
    window.close();
  });

  $('btn-export-json').addEventListener('click', async () => {
    const t = await getActiveTab();
    if (t?.id) sendToTab(t.id, { type: 'EXPORT', format: 'json' });
    window.close();
  });

  // Toggles
  const toggleMap = {
    'toggle-timeline':     'timelineEnabled',
    'toggle-folders':      'foldersEnabled',
    'toggle-prompts':      'promptVaultEnabled',
    'toggle-export-panel': 'exportPanelEnabled'
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    $(id).addEventListener('change', () => saveSettings({ [key]: $(id).checked }));
  });

  // Sliders
  $('chat-width').addEventListener('input', () => {
    const v = +$('chat-width').value;
    $('chat-width-val').textContent = v;
    saveSettings({ chatWidth: v });
  });
  $('font-size').addEventListener('input', () => {
    const v = +$('font-size').value;
    $('font-size-val').textContent = v;
    saveSettings({ fontSize: v });
  });

  // 完整設定
  $('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  // 手動切換主題 (安靜儲存，不廣播以避免分頁面板晃動)
  $('btn-theme-dark').addEventListener('click', async () => {
    document.documentElement.setAttribute('data-cf-theme', 'dark');
    const sync = await new Promise(r => chrome.storage.sync.get('cf_settings', r));
    const updated = Object.assign({}, sync.cf_settings || {}, { manualTheme: 'dark' });
    chrome.storage.sync.set({ cf_settings: updated });
  });
  $('btn-theme-light').addEventListener('click', async () => {
    document.documentElement.setAttribute('data-cf-theme', 'light');
    const sync = await new Promise(r => chrome.storage.sync.get('cf_settings', r));
    const updated = Object.assign({}, sync.cf_settings || {}, { manualTheme: 'light' });
    chrome.storage.sync.set({ cf_settings: updated });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => console.warn('[ChatFolio] Popup init suppressed error:', err));
});
