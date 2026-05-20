/**
 * ChatFolio - AI Chat Enhancer
 * Background Service Worker
 */

'use strict';

importScripts('libs/googleDrive.js');

// ─── 安裝事件 ───────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  // 執行資料遷移 (Voyger -> ChatFolio)
  await MigrationService.run();

  if (details.reason === 'install') {
    // 初始化預設設定
    chrome.storage.sync.set({ cf_settings: getDefaultSettings() });
    chrome.storage.local.set({ cf_folders: [], cf_prompts: [], cf_starred: {} });
    // 開啟選項頁面引導
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  } else if (details.reason === 'update') {
    // 版本升級：合併新預設值
    chrome.storage.sync.get('cf_settings', (result) => {
      const merged = Object.assign({}, getDefaultSettings(), result.cf_settings || {});
      chrome.storage.sync.set({ cf_settings: merged });
    });
  }

  // 建立右鍵選單
  createContextMenus();
});

// ─── 右鍵選單 ────────────────────────────────────────────────────────────────
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'chatfolio-quote',
      title: '引用至 ChatFolio 輸入框',
      contexts: ['selection'],
      documentUrlPatterns: ['https://gemini.google.com/*', 'https://aistudio.google.com/*']
    });
    chrome.contextMenus.create({
      id: 'chatfolio-save-prompt',
      title: '儲存為 ChatFolio 提示詞',
      contexts: ['selection'],
      documentUrlPatterns: ['https://gemini.google.com/*', 'https://aistudio.google.com/*']
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === 'chatfolio-quote') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'QUOTE_SELECTION',
      text: info.selectionText
    });
  } else if (info.menuItemId === 'chatfolio-save-prompt') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'SAVE_PROMPT_FROM_SELECTION',
      text: info.selectionText
    });
  }
});

// ─── 跨分頁訊息通訊 ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // 廣播星號變更至所有 Gemini 分頁
    case 'BROADCAST_STAR': {
      broadcastToGeminiTabs(message, sender.tab?.id);
      sendResponse({ ok: true });
      break;
    }

    // 廣播設定變更
    case 'BROADCAST_SETTINGS': {
      broadcastToGeminiTabs(message, sender.tab?.id);
      sendResponse({ ok: true });
      break;
    }

    // 取得版本資訊
    case 'GET_VERSION': {
      sendResponse({ version: chrome.runtime.getManifest().version });
      break;
    }

    // 開啟選項頁面
    case 'OPEN_OPTIONS': {
      chrome.runtime.openOptionsPage();
      sendResponse({ ok: true });
      break;
    }

    // Google Drive: 上傳同步
    case 'DRIVE_SYNC_UP': {
      DriveService.upload(message.data)
        .then(result => sendResponse({ ok: true, result }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // 異步回傳
    }

    // Google Drive: 下載同步
    case 'DRIVE_SYNC_DOWN': {
      DriveService.download()
        .then(data => sendResponse({ ok: true, data }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true; // 異步回傳
    }

    default:
      sendResponse({ ok: false, error: 'Unknown message type' });
  }
  return true; // 保持 sendResponse 通道開啟
});

// ─── 廣播至所有 Gemini / AI Studio 分頁 ─────────────────────────────────────
async function broadcastToGeminiTabs(message, excludeTabId) {
  const tabs = await chrome.tabs.query({
    url: ['https://gemini.google.com/*', 'https://aistudio.google.com/*']
  });
  for (const tab of tabs) {
    if (tab.id && tab.id !== excludeTabId) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  }
}


// ─── 資料遷移 ────────────────────────────────────────────────────────────────
const MigrationService = {
  async run() {
    const versionKey = 'cf_version';
    const currentVersion = '1.0.0';
    
    const { cf_version } = await chrome.storage.local.get(versionKey);
    if (cf_version === currentVersion) return;

    console.log('[ChatFolio] Starting data migration...');

    // 1. Local 遷移清單
    const localMap = {
      'folders': 'cf_folders',
      'prompts': 'cf_prompts',
      'starredMessages': 'cf_starred',
      'voyger_prompt_pos': 'cf_prompt_pos',
      'voyger_export_pos': 'cf_export_pos'
    };

    // 2. Sync 遷移清單 (注意：這裡不處理 Chunked 遷移，因為 Chunked 金鑰由模組自行管理，
    // 但為了徹底清理，我們在這裡對簡單的 settings 進行搬移)
    const syncMap = {
      'settings': 'cf_settings'
    };

    try {
      // 處理 Local
      const localData = await chrome.storage.local.get(Object.keys(localMap));
      const newLocal = { [versionKey]: currentVersion };
      const toRemoveLocal = [];

      for (const [oldKey, newKey] of Object.entries(localMap)) {
        if (localData[oldKey] !== undefined) {
          newLocal[newKey] = localData[oldKey];
          toRemoveLocal.push(oldKey);
        }
      }
      
      await chrome.storage.local.set(newLocal);
      if (toRemoveLocal.length > 0) await chrome.storage.local.remove(toRemoveLocal);

      // 處理 Sync (簡單 Key)
      const syncData = await chrome.storage.sync.get(Object.keys(syncMap));
      const newSync = {};
      const toRemoveSync = [];

      for (const [oldKey, newKey] of Object.entries(syncMap)) {
        if (syncData[oldKey] !== undefined) {
          newSync[newKey] = syncData[oldKey];
          toRemoveSync.push(oldKey);
        }
      }

      if (Object.keys(newSync).length > 0) {
        await chrome.storage.sync.set(newSync);
        await chrome.storage.sync.remove(toRemoveSync);
      }

      // 處理 Chunked 資料 (vg_folders, vg_prompts)
      // 由於 Chunked 資料較為特殊，我們保留舊資料在雲端，或者在此呼叫一次性搬移
      await this.migrateChunked('vg_folders', 'cf_sync_folders');
      await this.migrateChunked('vg_prompts', 'cf_sync_prompts');

      console.log('[ChatFolio] Migration completed successfully.');
    } catch (err) {
      console.error('[ChatFolio] Migration failed:', err);
    }
  },

  async migrateChunked(oldBase, newBase) {
    // 簡單檢查 meta
    const metaKey = `${oldBase}__meta`;
    const meta = await chrome.storage.sync.get(metaKey);
    const count = meta[metaKey];
    if (count === undefined) return;

    const chunkKeys = [];
    for (let i = 0; i < count; i++) chunkKeys.push(`${oldBase}__${i}`);
    
    const chunks = await chrome.storage.sync.get(chunkKeys);
    
    // 寫入新位置 (這裡簡化處理，直接搬移 meta 與 chunks)
    const newData = { [`${newBase}__meta`]: count };
    for (let i = 0; i < count; i++) {
        newData[`${newBase}__${i}`] = chunks[`${oldBase}__${i}`];
    }
    
    await chrome.storage.sync.set(newData);
    // 刪除舊的
    await chrome.storage.sync.remove([metaKey, ...chunkKeys]);
  }
};

// ─── 預設設定 ────────────────────────────────────────────────────────────────
function getDefaultSettings() {
  return {
    // UI 客製化
    chatWidth: 800,
    fontSize: 14,
    sidebarWidth: 256,
    expandInput: false,
    defaultModel: '',

    // 功能開關
    timelineEnabled: true,
    autoScanOnLoad: false,
    // Experimental feature: auto-recover missing conversation titles from older history blocks.
    titleRepairEnabled: false,
    titleRepairMaxRetries: 5,
    foldersEnabled: true,
    folderFloatingEnabled: false,
    folderPinToBottom: false,
    promptVaultEnabled: true,
    timestampsEnabled: true,
    quoteReplyEnabled: true,
    formulaCopyEnabled: true,

    // 時間軸設定

    // 版本
    settingsVersion: '1.0.0'
  };
}
