/**
 * ChatFolio - AI Chat Enhancer
 * Content Script — 主要注入腳本
 * 在 Gemini / AI Studio 頁面執行
 */

(function () {
  'use strict';

  if (window.__chatfolioLoaded) return;
  window.__chatfolioLoaded = true;

  // ═══════════════════════════════════════════════════════════════
  //  工具函式
  // ═══════════════════════════════════════════════════════════════

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  function uuid() {
    return crypto.randomUUID ? crypto.randomUUID()
      : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  }

  function debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizeConversationTitle(raw, maxLength = 60) {
    return String(raw || '')
      .replace(/\s*[-–|·]\s*(Google\s+)?(Gemini|AI Studio).*$/i, '')
      .trim()
      .slice(0, maxLength);
  }

  /**
   * 輔助函式：讓 HTML 元素具備「拖曳移動」與「位置持久化」功能
   * @param {HTMLElement} el 要拖曳的元素
   * @param {string} storageKey 儲存位置的 Key
   * @param {Object} options handle: 指定拖曳把手, onDragEnd: 回調, threshold: 像素閥值
   */
  function _makeDraggable(el, storageKey, options = {}) {
    let isDragging = false;
    let startX, startY, initialX, initialY;
    const threshold = options.threshold || 5;
    let hasMoved = false;
    const handle = options.handle ? el.querySelector(options.handle) : el;
    if (!handle) return;

    // 1. 載入持久化位置
    Storage.getLocal(storageKey).then(res => {
      const pos = res[storageKey];
      if (pos) {
        if (options.relativeTo === 'bottom-right' && pos.right !== undefined) {
          el.style.right = pos.right + 'px';
          el.style.bottom = pos.bottom + 'px';
          el.style.left = 'auto';
          el.style.top = 'auto';
        } else if (pos.left !== undefined) {
          el.style.left = pos.left + 'px';
          el.style.top = pos.top + 'px';
          el.style.right = 'auto';
          el.style.bottom = 'auto';
        }
        _enforceBoundaries(el);
      }
    });

    // 2. 邊界檢查 (確保不跑出螢幕，並加入 20px 磁力吸附)
    function _enforceBoundaries(target) {
      const rect = target.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      let l = rect.left;
      let t = rect.top;
      const snap = 20;

      // 磁力吸附：接近邊緣時自動貼齊
      if (l < snap) l = 0;
      if (t < snap) t = 0;
      if (l + rect.width > winW - snap) l = winW - rect.width;
      if (t + rect.height > winH - snap) t = winH - rect.height;

      // 再次確保絕對不超出視窗
      if (t < 0) t = 0;
      if (l < 0) l = 0;
      if (l + rect.width > winW) l = Math.max(0, winW - rect.width);
      if (t + rect.height > winH) t = Math.max(0, winH - rect.height);

      if (options.relativeTo === 'bottom-right') {
        el.style.right = (winW - (l + rect.width)) + 'px';
        el.style.bottom = (winH - (t + rect.height)) + 'px';
        el.style.left = 'auto';
        el.style.top = 'auto';
      } else {
        target.style.left = l + 'px';
        target.style.top = t + 'px';
        target.style.right = 'auto';
        target.style.bottom = 'auto';
      }
      
      const newRect = target.getBoundingClientRect();
      return { 
        left: newRect.left, 
        top: newRect.top,
        right: winW - newRect.right,
        bottom: winH - newRect.bottom
      };
    }

    // 3. 事件綁定
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      // 如果點擊的是按鈕內部的其他互動控制，則不觸發拖曳 (除非是 handle 本身)
      if (options.handle && !e.target.closest(options.handle)) return;
      
      isDragging = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      el.classList.add('cf-dragging');
      document.body.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!hasMoved && Math.sqrt(dx*dx + dy*dy) > threshold) {
        hasMoved = true;
      }
      if (hasMoved) {
        let newLeft = initialX + dx;
        let newTop = initialY + dy;
        const rect = el.getBoundingClientRect();
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const snap = 20;

        // 即時磁力吸附
        if (newLeft < snap) newLeft = 0;
        else if (newLeft + rect.width > winW - snap) newLeft = winW - rect.width;
        
        if (newTop < snap) newTop = 0;
        else if (newTop + rect.height > winH - snap) newTop = winH - rect.height;

        el.style.left = newLeft + 'px';
        el.style.top = newTop + 'px';
        el.style.bottom = 'auto';
        el.style.right = 'auto';
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        el.classList.remove('cf-dragging');
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (hasMoved) {
          const finalPos = _enforceBoundaries(el);
          Storage.setLocal({ [storageKey]: finalPos });
          // 防止拖曳結束後的 click 事件觸發按鈕功能
          const stopClick = (e) => { e.stopPropagation(); e.preventDefault(); };
          el.addEventListener('click', stopClick, { capture: true, once: true });
          if (options.onDragEnd) options.onDragEnd(finalPos);
        }
      }
    };

    handle.style.cursor = 'pointer';
    handle.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', () => _enforceBoundaries(el));
  }


  // ═══════════════════════════════════════════════════════════════
  //  EventBus — 模組間通訊
  // ═══════════════════════════════════════════════════════════════

  function isGenericConversationTitle(title) {
    if (!title) return true;
    const t = title.trim();
    return /^(Google\s+)?(Gemini|AI\s+Studio)$/i.test(t) || 
           /^(新對話|新聊天|新对话|New\s+chat|New\s+conversation)$/i.test(t) ||
           t === '對話' || t === 'Conversation';
  }

  function getConversationIdFromUrl(urlLike) {
    if (!urlLike) return '';
    try {
      const url = new URL(urlLike, location.origin);
      const path = url.pathname;
      // 排除明確的非對話路徑 (注意 /gems/ 有 s 是管理介面)
      if (path.includes('/gems/') || path.includes('/notebooks/') || path.includes('/custom-bot/')) return '';
      
      const segments = path.split('/').filter(s => s && /^[a-zA-Z0-9_-]+$/.test(s));
      if (!segments.length) return '';
      
      const last = segments[segments.length - 1];
      // 排除路徑中的保留字或導覽字串
      if (['app', 'gem', 'gems', 'notebooks', 'u', 'home', 'cf_prompts', 'library'].includes(last.toLowerCase())) return '';
      
      // 額外檢查：如果父層級是 gem 或 app，則更可信
      return last;
    } catch {
      return '';
    }
  }

  function getConversationPathFromUrl(urlLike) {
    if (!urlLike) return '';
    try {
      return new URL(urlLike, location.origin).pathname.replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  function shouldSkipConversationNameUpdate(title) {
    return false;
  }

  const EventBus = (() => {
    const handlers = {};
    return {
      on(event, fn) {
        (handlers[event] = handlers[event] || []).push(fn);
        return () => this.off(event, fn);
      },
      off(event, fn) {
        handlers[event] = (handlers[event] || []).filter(h => h !== fn);
      },
      emit(event, data) {
        (handlers[event] || []).forEach(fn => fn(data));
      }
    };
  })();

  // ═══════════════════════════════════════════════════════════════
  //  Storage — 儲存抽象層
  // ═══════════════════════════════════════════════════════════════

  const Storage = {
    async getSync(keys) {
      return new Promise((resolve, reject) => chrome.storage.sync.get(keys, (result) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(result);
      }));
    },
    async setSync(data) {
      return new Promise((resolve, reject) => chrome.storage.sync.set(data, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      }));
    },
    async getLocal(keys) {
      return new Promise((resolve, reject) => chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(result);
      }));
    },
    async setLocal(data) {
      return new Promise((resolve, reject) => chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      }));
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  SettingsManager — 設定管理
  // ═══════════════════════════════════════════════════════════════

  const SettingsManager = {
    _settings: null,

      defaults: {
        chatWidth: 800, fontSize: 14, sidebarWidth: 256,
        expandInput: false, defaultModel: '',
        timelineEnabled: true, foldersEnabled: true,
        folderFloatingEnabled: false,
        promptVaultEnabled: true,
        exportPanelEnabled: true,
        quoteReplyEnabled: true, formulaCopyEnabled: true,
        timelineScanEnabled: false,
        timelineScanRepeats: 3,
        timelineScanInterval: 800,
        // Experimental feature: auto-recover missing conversation titles from older history blocks.
        titleRepairEnabled: false,
        titleRepairMaxRetries: 3,
        gemMaxItems: 10,
        categorizedMarkEnabled: true,
      },

    async load() {
      const { cf_settings } = await Storage.getSync('cf_settings');
      this._settings = Object.assign({}, this.defaults, cf_settings || {});
      return this._settings;
    },

    get(key) {
      return this._settings?.[key] ?? this.defaults[key];
    },

    async set(key, value) {
      this._settings[key] = value;
      await Storage.setSync({ cf_settings: this._settings });
      EventBus.emit('settings:changed', { key, value, settings: this._settings });
    },

    getAll() { return { ...this._settings }; }
  };

  // ═══════════════════════════════════════════════════════════════
  //  DOM Selectors — Gemini / AI Studio DOM 定位
  // ═══════════════════════════════════════════════════════════════

  const PLATFORM = location.hostname.includes('aistudio') ? 'aistudio' : 'gemini';

  const Selectors = {
    // 訊息容器（多重選擇器，依優先順序）
    messageContainers: [
      '[data-message-author-role]',
      'model-response',
      'user-query',
      '.conversation-turn',
      '.message-container',
      '[class*="message"]',
      '[class*="response"]',
      '[class*="query"]'
    ],

    // 輸入框
    inputBox: [
      'div[contenteditable="true"]',
      'rich-textarea div[contenteditable]',
      'textarea[aria-label]',
      '.ql-editor',
      '[data-testid="text-input"]'
    ],

    // 主要捲動容器
    scrollContainer: [
      'main',
      '.conversation-container',
      '[class*="scroll"]',
      'chat-window',
      '.chat-history'
    ],

    findMessages() {
      // 只抓 Gemini 的原生對話元素，不使用可能誤判的廣泛選擇器
      const userMsgs  = $$('user-query');
      const modelMsgs = $$('model-response');
      if (userMsgs.length || modelMsgs.length) {
        return [...userMsgs, ...modelMsgs].sort((a, b) =>
          a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
        );
      }
      return [];
    },

    findInput() {
      for (const sel of this.inputBox) {
        const el = $(sel);
        if (el) return el;
      }
      return null;
    },

    findScrollContainer() {
      for (const sel of this.scrollContainer) {
        const el = $(sel);
        if (el && el.scrollHeight > el.clientHeight) return el;
      }
      return document.documentElement;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  MessageScanner — 完整對話掃描（突破虛擬捲動限制）
  // ═══════════════════════════════════════════════════════════════

  const MessageScanner = {
    _scanning: false,

    // 試圖找出對話區域真正的捲動容器
    _findScroller() {
      // 1. 優先從目前的對話訊息向上搜尋 (最準確)
      const sampleMsg = document.querySelector('model-response, user-query');
      if (sampleMsg) {
        let curr = sampleMsg.parentElement;
        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          const overflowX = style.overflowY;
          if ((overflowX === 'auto' || overflowX === 'scroll') && curr.scrollHeight > curr.clientHeight) {
            return curr;
          }
          curr = curr.parentElement;
        }
      }

      // 2. 備援：使用預設的選擇器列表
      const el = Selectors.findScrollContainer();
      if (el && el !== document.documentElement && el.scrollHeight > el.clientHeight + 20) {
        return el;
      }

      // 3. 最後備援：documentElement
      return document.documentElement;
    },

    /**
     * 掃描全部對話（逐步捲動，強制 Gemini 渲染所有訊息）
     * @param {function} onProgress - 進度回調 (count) => void
     * @returns {Promise<number>} 最終收集到的訊息數量
     */
    async scanAll(onProgress) {
      if (this._scanning) return 0;
      
      const useRepeatedTop = SettingsManager.get('timelineScanEnabled');
      if (useRepeatedTop) {
        return this._scanViaRepeatedTop(onProgress);
      }

      this._scanning = true;

      const scroller = this._findScroller();
      const savedTop = scroller.scrollTop;
      const collectedIds = new Set();

      try {
        // 先跳到最頂部
        this._scrollTo(scroller, 0);
        await this._wait(300);

        let prevTop = -1;
        let safetyCounter = 0;
        const MAX_STEPS = 250; 

        while (safetyCounter++ < MAX_STEPS) {
          if (DOMObserver._cancelTitleRepairRequested) break;

          // 收集目前已渲染的訊息 ID
          const currentCount = collectedIds.size;
          Selectors.findMessages().forEach((el, i) => {
            const id = el.dataset.msgId || `msg-scan-${i}`;
            el.dataset.msgId = id;
            collectedIds.add(id);
          });

          if (onProgress && collectedIds.size !== currentCount) {
            onProgress(collectedIds.size);
          }

          // 判斷是否已到達底部
          const currTop = scroller === document.documentElement ? window.scrollY : scroller.scrollTop;
          const atBottom =
            currTop + scroller.clientHeight >= scroller.scrollHeight - 50;
          if (atBottom && currTop === prevTop) break;

          prevTop = currTop;
          this._scrollTo(scroller, currTop + Math.max(scroller.clientHeight * 0.9, 400));
          await this._wait(200);
        }
      } finally {
        this._scanning = false;
        // 完成掃描後，將對話捲軸移動到最下面
        await this._wait(100);
        this._scrollTo(scroller, scroller.scrollHeight || 999999);
      }

      return collectedIds.size;
    },

    _scrollTo(scroller, top) {
      if (scroller === document.documentElement) {
        window.scrollTo(0, top);
      } else {
        scroller.scrollTop = top;
      }
    },

    _cancelScanRequested: false,

    async _scanViaRepeatedTop(onProgress) {
      this._scanning = true;
      this._cancelScanRequested = false;
      const scroller = this._findScroller();
      const savedTop = scroller.scrollTop;
      
      const rawLimit = Number(SettingsManager.get('timelineScanRepeats'));
      const retryLimit = Number.isFinite(rawLimit) ? Math.max(0, Math.min(100, rawLimit)) : 3;
      const finalLimit = retryLimit === 0 ? Number.POSITIVE_INFINITY : retryLimit;

      try {
        let pass = 0;
        while (pass < finalLimit) {
          if (this._cancelScanRequested) break;

          const text = pass === 0 
            ? '正在讀取較舊的對話紀錄...' 
            : `正在讀取較舊的對話紀錄...第 ${pass + 1} 次`;
          
          this._setScanIndicator(true, text, true);
          
          // 捲動到頂部
          this._scrollTo(scroller, 0);
          
          // 收集訊息 (Gemini 可能會因為置頂而載入更多)
          const currentSize = Selectors.findMessages().length;
          if (onProgress) onProgress(currentSize);

          const interval = Number(SettingsManager.get('timelineScanInterval')) || 800;
          await this._wait(interval);
          pass++;
        }
      } finally {
        this._scanning = false;
        this._setScanIndicator(false);
        // 完成掃描後，將對話捲軸移動到最下面
        await this._wait(100);
        this._scrollTo(scroller, scroller.scrollHeight || 999999);
      }
      return Selectors.findMessages().length;
    },

    _ensureScanIndicator() {
      // 樣式借用自 DOMObserver 的 title-repair
      let styleEl = document.getElementById('cf-scan-indicator-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'cf-scan-indicator-style';
        styleEl.textContent = `
          #cf-scan-indicator {
            position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
            z-index: 2147483000; display: none; align-items: center; gap: 8px;
            padding: 8px 14px; border-radius: 999px;
            font: 500 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
            color: #e8edf7; background: rgba(35,42,58,.92);
            border: 1px solid rgba(255,255,255,.12);
            box-shadow: 0 10px 30px rgba(0,0,0,.24);
            backdrop-filter: blur(10px); white-space: nowrap;
          }
          #cf-scan-indicator.cf-visible { display: inline-flex; }
          #cf-scan-indicator .cfscan-dot {
            width: 8px; height: 8px; border-radius: 50%; background: #7ab7ff;
            box-shadow: 0 0 0 0 rgba(122,183,255,.7);
            animation: cfscan-pulse 1.2s ease-out infinite; flex: 0 0 auto;
          }
          #cf-scan-indicator .cfscan-stop {
            display: none; border: 0; border-radius: 999px; padding: 5px 10px;
            font: 600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
            color: #f7fbff; background: rgba(255,255,255,.14); cursor: pointer;
          }
          #cf-scan-indicator .cfscan-stop:hover { background: rgba(255,255,255,.22); }
          #cf-scan-indicator.cf-running .cfscan-stop {
            display: inline-flex; align-items: center; justify-content: center;
          }
          @keyframes cfscan-pulse {
            0% { transform: scale(.9); box-shadow: 0 0 0 0 rgba(122,183,255,.65) }
            70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(122,183,255,0) }
            100% { transform: scale(.9); box-shadow: 0 0 0 0 rgba(122,183,255,0) }
          }
        `;
        document.head.appendChild(styleEl);
      }

      let indicator = document.getElementById('cf-scan-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'cf-scan-indicator';
        indicator.innerHTML = `
          <span class="cfscan-dot"></span>
          <span class="cfscan-text">正在讀取較舊的對話紀錄...</span>
          <button type="button" class="cfscan-stop">停止</button>
        `;
        const stopBtn = indicator.querySelector('.cfscan-stop');
        stopBtn?.addEventListener('click', () => {
          this._cancelScanRequested = true;
          stopBtn.disabled = true;
          indicator.querySelector('.cfscan-text').textContent = '正在停止讀取...';
        });
        document.body.appendChild(indicator);
      }
      return indicator;
    },

    _setScanIndicator(visible, text, showStop) {
      const indicator = this._ensureScanIndicator();
      if (text) indicator.querySelector('.cfscan-text').textContent = text;
      const stopBtn = indicator.querySelector('.cfscan-stop');
      if (stopBtn) stopBtn.disabled = false;
      indicator.classList.toggle('cf-visible', !!visible);
      indicator.classList.toggle('cf-running', !!visible && !!showStop);
    },

    _wait(ms) { return new Promise(r => setTimeout(r, ms)); }
  };

  // ═══════════════════════════════════════════════════════════════
  //  ToastModule — 輕量化通知系統
  // ═══════════════════════════════════════════════════════════════
  const ToastModule = {
    _container: null,
    _activeToast: null,

    _ensureContainer() {
      if (this._container) return;
      this._container = document.createElement('div');
      this._container.id = 'cf-toast-container';
      document.body.appendChild(this._container);
    },

    /**
     * 顯示通知
     * @param {string} text 內容
     * @param {number} duration 持續時間 (ms), 0 表示不自動關閉
     */
    show(text, duration = 3000) {
      this._ensureContainer();
      
      // 如果已經有常駐的 toast 且這次也是常駐請求，則更新導向內容
      if (this._activeToast && duration === 0) {
        this._activeToast.querySelector('.vtoast-text').textContent = text;
        return this._activeToast;
      }

      // 否則，如果存在常駐 toast，先將其移除
      if (this._activeToast) {
        this.hide();
      }

      const toast = document.createElement('div');
      toast.className = 'vtoast';
      // 加入與自動讀取標題相同的藍色小點
      toast.innerHTML = `
        <span class="vtoast-dot"></span>
        <span class="vtoast-text">${escapeHtml(text)}</span>
      `;
      this._container.appendChild(toast);

      if (duration === 0) {
        this._activeToast = toast;
      } else {
        setTimeout(() => {
          toast.classList.add('vtoast-out');
          setTimeout(() => toast.remove(), 400);
        }, duration);
      }
      return toast;
    },

    hide() {
      if (this._activeToast) {
        const t = this._activeToast;
        t.classList.add('vtoast-out');
        setTimeout(() => t.remove(), 400);
        this._activeToast = null;
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  CustomizerModule — UI 客製化
  // ═══════════════════════════════════════════════════════════════

  const CustomizerModule = {
    styleEl: null,

    init(settings) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'cf-custom-styles';
      document.head.appendChild(this.styleEl);
      this.apply(settings);
    },

    apply(settings) {
      if (!this.styleEl) return;
      const w = settings.chatWidth || 800;
      const fs = settings.fontSize || 14;
      const sw = settings.sidebarWidth || 256;

      this.styleEl.textContent = `
        /* ChatFolio — Chat Width */
        chat-window .chat-history {
          max-width: ${w}px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        /* ChatFolio — Font Size */
        user-query .query-text-container,
        model-response .markdown,
        model-response .response-container,
        .response-content .markdown {
          font-size: ${fs}px !important;
          line-height: 1.6 !important;
        }
        /* ChatFolio — Timeline space
           時間軸面板 position:fixed，不佔文件流，
           不需要推移 chat-window，避免觸發 chat-app 的 ResizeObserver → mobile 模式 */
      `;
    }
  };

  // [Phase 3-1] Removed obsolete TimestampsModule

  // ═══════════════════════════════════════════════════════════════
  //  TimelineModule — 時間軸導覽
  // ═══════════════════════════════════════════════════════════════

  const TimelineModule = {
    panel: null,
    nodeList: null,
    nodes: [],         // { el, msgEl, type, id, starred }
    isExpanded: true,
    _longPressTimer: null,
    _starredSet: new Set(),

    async init() {
      const { cf_starred } = await Storage.getLocal('cf_starred');
      this._starredSet = new Set(Object.keys(cf_starred || {})
        .filter(k => (cf_starred || {})[k]));

      this._buildPanel();
      
      const { timelineWidth } = await Storage.getLocal('timelineWidth');
      if (timelineWidth) {
        this.panel.style.width = timelineWidth;
        this._savedWidth = timelineWidth;
      } else {
        this._savedWidth = '220px';
      }

      this.panel.hidden = true;   // 預設隱藏，等待 _processAll 確認有訊息才顯示
      this._processAll();
      EventBus.on('messages:updated', () => this._processAll());
    },

    _buildPanel() {
      this.panel = document.createElement('div');
      this.panel.id = 'cf-timeline';
      this.panel.innerHTML = `
        <div class="cftl-resize-handle"></div>
        <div class="cftl-header">
          <span class="cftl-title">時間軸</span>
          <button class="cftl-scan-btn" title="讀取全部對話">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="13" height="13">
              <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2.5 10A7.5 7.5 0 0 1 17.5 10"/>
                <polyline points="16,8 17.5,10 19,8"/>
                <path d="M17.5 10A7.5 7.5 0 0 1 2.5 10"/>
                <polyline points="1,12 2.5,10 4,12"/>
              </g>
              <path fill-rule="evenodd" fill="currentColor" d="M8.5 6.5H11.5a1 1 0 011 1v5a1 1 0 01-1 1H8.5a1 1 0 01-1-1v-5a1 1 0 011-1zM8.5 8H11.5V8.8H8.5zM8.5 9.6H11.5V10.4H8.5zM8.5 11.2H11.5V12H8.5z"/>
            </svg>
          </button>
          <button class="cftl-toggle" title="收合/展開">◀</button>
        </div>
        <div class="cftl-body">
          <ul class="cftl-list"></ul>
        </div>
      `;
      document.body.appendChild(this.panel);
      this.nodeList = this.panel.querySelector('.cftl-list');

      this.panel.querySelector('.cftl-toggle').addEventListener('click', () => this.toggleExpand());
      this.panel.querySelector('.cftl-scan-btn').addEventListener('click', () => this._scanAll());

      const resizer = this.panel.querySelector('.cftl-resize-handle');
      let isResizing = false;
      resizer.addEventListener('mousedown', (e) => {
        if (!this.isExpanded) return; // 收合時禁止調整
        isResizing = true;
        this.panel.classList.add('cftl-resizing');
        document.body.style.userSelect = 'none'; // 避免拖曳時意外選取文字
        
        const mouseMoveHandler = (eMove) => {
          if (!isResizing) return;
          eMove.preventDefault();
          let newWidth = window.innerWidth - eMove.clientX;
          newWidth = Math.max(160, Math.min(newWidth, 600)); 
          this.panel.style.width = newWidth + 'px';
        };

        const mouseUpHandler = () => {
          if (!isResizing) return;
          isResizing = false;
          this.panel.classList.remove('cftl-resizing');
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
          if (this.isExpanded) {
            this._savedWidth = this.panel.style.width;
            Storage.setLocal({ timelineWidth: this._savedWidth });
          }
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      });

      this._expand();
    },

    async _scanAll() {
      if (MessageScanner._scanning) return;
      const btn = this.panel?.querySelector('.cftl-scan-btn');
      if (btn) {
        btn.disabled = true;
        btn.classList.add('cftl-scanning');
        btn.title = '讀取中…';
      }

      const useNewStrategy = SettingsManager.get('timelineScanEnabled');
      if (!useNewStrategy) {
        ToastModule.show('正在讀取對話歷史…', 0);
      }

      await MessageScanner.scanAll((n) => {
        if (!useNewStrategy) {
          if (btn) btn.title = `讀取中… ${n} 則`;
          ToastModule.show(`正在讀取對話歷史… (已讀取 ${n} 則)`, 0);
        }
      });

      if (!useNewStrategy) {
        ToastModule.hide();
      }

      this._processAll();

      if (btn) {
        btn.disabled = false;
        btn.classList.remove('cftl-scanning');
        btn.classList.add('cftl-scan-done');
        btn.title = `✓ 共 ${this.nodes.length} 則`;
        setTimeout(() => {
          btn.classList.remove('cftl-scan-done');
          btn.title = '讀取全部對話';
        }, 2000);
      }
    },

    _isConversationPage() {
      // 一般對話：/app/{hex id}
      if (/^\/app\/[a-f0-9]{8,}/i.test(location.pathname)) return true;
      // Gem 對話：/gem/{id}/... 或 /gems/... 且頁面已有對話元素
      if (/^\/(gem(s)?)\//i.test(location.pathname)) {
        return !!document.querySelector('model-response, user-query');
      }
      return false;
    },

    _processAll() {
      // 檢查開關
      if (!SettingsManager.get('timelineEnabled')) {
        this._setVisible(false);
        return;
      }

      // 非對話頁面（首頁、Gem 首頁等）不顯示時間軸
      if (!this._isConversationPage()) {
        this._setVisible(false);
        return;
      }

      const messages = Selectors.findMessages();
      this.nodes = [];
      this.nodeList.innerHTML = '';

      // 實驗性功能：若未啟用則隱藏讀取按鈕
      const scanBtn = this.panel?.querySelector('.cftl-scan-btn');
      if (scanBtn) {
        scanBtn.style.display = SettingsManager.get('timelineScanEnabled') ? '' : 'none';
      }

      // 有訊息才顯示
      if (!messages.length) {
        this._setVisible(false);
        return;
      }
      this._setVisible(true);

      messages.forEach((msgEl, i) => {
        const id = msgEl.dataset.msgId || `msg-${i}`;
        msgEl.dataset.msgId = id;

        const role = this._resolveRole(msgEl);

        const starred = this._starredSet.has(id);
        const preview = this._getPreview(msgEl);

        const node = { el: null, msgEl, id, role, starred, preview };
        this.nodes.push(node);
        node.el = this._createNode(node, i);
        this.nodeList.appendChild(node.el);
      });

      // 同步 DOMObserver 的計數，避免重複觸發
      DOMObserver._msgCount = messages.length;

      this._scrollToActive();
    },

    _setVisible(visible) {
      if (!this.panel) return;
      this.panel.style.display = visible ? 'flex' : 'none';
      if (!visible) document.body.classList.remove('cf-timeline-open');
      else if (this.isExpanded) document.body.classList.add('cf-timeline-open');
    },

    _resolveRole(msgEl) {
      if (msgEl.dataset.messageAuthorRole) return msgEl.dataset.messageAuthorRole;
      const tag = msgEl.tagName.toLowerCase();
      if (tag === 'user-query') return 'user';
      if (tag === 'model-response') return 'model';
      return tag.includes('user') ? 'user' : 'model';
    },

    _createNode(node, index) {
      const li = document.createElement('li');
      li.className = `cftl-node ${node.role === 'user' ? 'cftl-user' : 'cftl-model'} ${node.starred ? 'cftl-starred' : ''}`;
      li.dataset.nodeId = node.id;

      const roleLabel = node.role === 'user' ? '你' : 'Gemini';

      li.innerHTML = `
        <div class="cftl-dot-wrap"><div class="cftl-dot"></div></div>
        <div class="cftl-content">
          <div class="cftl-meta">
            <span class="cftl-role">${roleLabel}</span>
          </div>
          <div class="cftl-preview">${escapeHtml(node.preview)}</div>
        </div>
        <span class="cftl-star" title="長按標記星號">${node.starred ? '★' : '☆'}</span>
      `;

      // 點擊跳轉
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('cftl-star')) return;
        node.msgEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        li.classList.add('cftl-active');
        setTimeout(() => li.classList.remove('cftl-active'), 1500);
      });

      // 長按標星
      li.addEventListener('pointerdown', () => {
        this._longPressTimer = setTimeout(() => this._toggleStar(node, li), 500);
      });
      li.addEventListener('pointerup', () => clearTimeout(this._longPressTimer));
      li.addEventListener('pointerleave', () => clearTimeout(this._longPressTimer));

      return li;
    },

    async _toggleStar(node, li) {
      node.starred = !node.starred;
      if (node.starred) {
        this._starredSet.add(node.id);
        li.classList.add('cftl-starred');
        li.querySelector('.cftl-star').textContent = '★';
      } else {
        this._starredSet.delete(node.id);
        li.classList.remove('cftl-starred');
        li.querySelector('.cftl-star').textContent = '☆';
      }

      const starredMessages = {};
      this._starredSet.forEach(id => { starredMessages[id] = true; });
      await Storage.setLocal({ starredMessages });

      // 廣播至其他分頁
      chrome.runtime.sendMessage({ type: 'BROADCAST_STAR', starredMessages });
    },

    _getPreview(el) {
      // 建立 el 的複製，移除 accessibility-only 元素，再取文字
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.cdk-visually-hidden, [aria-hidden="true"], .visually-hidden').forEach(n => n.remove());

      const tag = el.tagName.toLowerCase();
      let src = clone;
      if (tag === 'model-response') {
        src = clone.querySelector('.markdown, .response-content, [class*="response"], [class*="content"]') || clone;
      } else if (tag === 'user-query') {
        src = clone.querySelector('[class*="query-text"], [class*="user-query-text"], textarea, p') || clone;
      }
      const text = (src.innerText || src.textContent || '').replace(/\s+/g, ' ').trim();
      return text.slice(0, 80) || '(無內容)';
    },

    toggleExpand() {
      this.isExpanded = !this.isExpanded;
      if (this.isExpanded) this._expand(); else this._collapse();
    },

    _expand() {
      this.panel.classList.remove('cftl-collapsed');
      document.body.classList.add('cf-timeline-open');
      this.panel.querySelector('.cftl-toggle').textContent = '▶';
      if (this._savedWidth) {
        this.panel.style.width = this._savedWidth;
      }
    },

    _collapse() {
      // 收合前先記住寬度
      if (this.panel.style.width && this.panel.style.width !== '40px') {
        this._savedWidth = this.panel.style.width;
      }
      
      this.panel.classList.add('cftl-collapsed');
      this.panel.style.width = '40px';
      document.body.classList.remove('cf-timeline-open');
      this.panel.querySelector('.cftl-toggle').textContent = '◀';
    },

    _scrollToActive() {
      // 找到最接近視窗中心的訊息節點
      const messages = Selectors.findMessages();
      if (!messages.length) return;
      const mid = window.innerHeight / 2;
      let closest = null, minDist = Infinity;
      messages.forEach((msg, i) => {
        const rect = msg.getBoundingClientRect();
        const dist = Math.abs(rect.top - mid);
        if (dist < minDist) { minDist = dist; closest = i; }
      });
      if (closest !== null && this.nodeList.children[closest]) {
        this.nodeList.children[closest].scrollIntoView({ block: 'nearest' });
      }
    },

    addNode(msgEl, index) {
      const id = msgEl.dataset.msgId || `msg-${index}`;
      const role = this._resolveRole(msgEl);
      const node = { el: null, msgEl, id, role, starred: false, preview: this._getPreview(msgEl) };
      this.nodes.push(node);
      node.el = this._createNode(node, index);
      this.nodeList.appendChild(node.el);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  FolderModule — 資料夾管理（樹枝狀、嵌入側邊欄）
  // ═══════════════════════════════════════════════════════════════

  const FolderModule = {
    folders: [],
    panel: null,
    _expanded: {},   // folderId → boolean
    _injected: false,

    async init() {
      const { cf_folders } = await Storage.getLocal('cf_folders');
      this.folders = this._normalizeFolders(cf_folders || []);
      
      // 確保所有資料夾都有 isExpanded 屬性，若無則預設為展開
      this.folders.forEach(f => {
        if (f.isExpanded === undefined) f.isExpanded = true;
      });

      this._buildPanel();
      
      // 更新已分類標記索引
      if (typeof CategorizedMarkModule !== 'undefined') CategorizedMarkModule.updateIndex();

      await this._applyFloatingState();
      window.addEventListener('resize', () => {
        if (this.panel && this.panel.classList.contains('cf-folders-floating')) {
          this._applyFloatingState();
        }
      });
    },

    async _applyFloatingState() {
      if (!this.panel) return;
      const isFloating = SettingsManager.get('folderFloatingEnabled');
      if (isFloating) {
        this.panel.classList.add('cf-folders-floating');
        this.panel.classList.remove('cffld-panel-collapsed'); // 強制展開
        this._injected = false; // 浮動模式不計入側邊欄注入
        
        const folderPos = SettingsManager.get('folderPosition') || {};
        
        // 邊界檢查與限制 (依據使用者最新規則)
        let left = folderPos.left !== undefined ? parseFloat(folderPos.left) : 100;
        let top = folderPos.top !== undefined ? parseFloat(folderPos.top) : 100;
        const width = folderPos.width ? parseFloat(folderPos.width) : 300;
        const height = folderPos.height ? parseFloat(folderPos.height) : 450;
        
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        
        // Rule 1: Left 永遠要 >= 0
        if (left < 0) left = 0;
        // Rule 2 & 3: Top >= 0 且 <= 視窗高度 - 面板高度。若衝突則直等於 0。
        const maxTop = winH - height;
        if (top < 0) {
          top = 0;
        } else if (top > maxTop) {
          // 如果 maxTop < 0 (衝突)，Math.max(0, maxTop) 會得到 0
          top = Math.max(0, maxTop);
        }

        // 再次確保 Left 也不會超出右側太遠
        const maxLeft = winW - width;
        if (left > maxLeft) left = Math.max(0, maxLeft);

        this.panel.style.top = top + 'px';
        this.panel.style.left = left + 'px';
        this.panel.style.bottom = 'auto';
        this.panel.style.right = 'auto';
        this.panel.style.width = width + 'px';
        this.panel.style.height = height + 'px';
        this.panel.style.maxHeight = '90vh';
        
        // 確保注入成功（浮動模式需 append 到 body）
        if (this.panel.parentElement !== document.body) {
          document.body.appendChild(this.panel);
        }
      } else {
        this.panel.classList.remove('cf-folders-floating');
        this.panel.classList.remove('cffld-embedded'); // 重置嵌入狀態
        this._injected = false; // 允許重新嘗試注入
        this.panel.style.top = '';
        this.panel.style.left = '';
        this.panel.style.bottom = '';
        this.panel.style.right = '';
        this.panel.style.width = '';
        this.panel.style.height = '';
        this.panel.style.maxHeight = '';
        this._tryInjectRetry();
      }
    },

    _normalizeFolders(folders) {
      return (Array.isArray(folders) ? folders : []).map(folder => ({
        ...folder,
        conversationIds: Array.isArray(folder?.conversationIds) ? [...new Set(folder.conversationIds.filter(Boolean))] : [],
        _convNames: folder?._convNames && typeof folder._convNames === 'object' ? { ...folder._convNames } : {},
        _convUrls: folder?._convUrls && typeof folder._convUrls === 'object' ? { ...folder._convUrls } : {}
      }));
    },

    _getRecursiveConvCount(folderId) {
      const uniqueIds = new Set();
      const traverse = (fid) => {
        const f = this.folders.find(x => x.id === fid);
        if (!f) return;
        (f.conversationIds || []).forEach(id => uniqueIds.add(id));
        this.folders.filter(x => x.parentId === fid).forEach(c => traverse(c.id));
      };
      traverse(folderId);
      return uniqueIds.size;
    },

    _getCurrentConversationInfo() {
      const convUrl = location.href;
      const convId = getConversationIdFromUrl(convUrl);
      if (!convId) return null;
      const convName = normalizeConversationTitle(document.title) || normalizeConversationTitle(
        document.querySelector('.center-section')?.textContent || ''
      ) || convId;
      return { convId, convName, convUrl };
    },

    _toggleFolderConversation(folder, convId, convName, convUrl) {
      if (!folder || !convId) return false;
      if (!folder.conversationIds) folder.conversationIds = [];
      if (!folder._convNames) folder._convNames = {};
      if (!folder._convUrls) folder._convUrls = {};

      if (folder.conversationIds.includes(convId)) {
        folder.conversationIds = folder.conversationIds.filter(id => id !== convId);
        delete folder._convNames[convId];
        delete folder._convUrls[convId];
      } else {
        folder.conversationIds.push(convId);
        folder._convNames[convId] = normalizeConversationTitle(convName || convId, 60) || convId;
        folder._convUrls[convId] = convUrl || `${location.origin}/app/${convId}`;
      }

      folder.updatedAt = Date.now();
      return true;
    },

    _navigateToConversation(convId, convUrl) {
      const targetUrl = convUrl || `${location.origin}/app/${convId}`;
      const targetPath = getConversationPathFromUrl(targetUrl);
      if (!targetPath) {
        window.location.href = targetUrl;
        return;
      }

      const nativeLink = [...document.querySelectorAll('a[href]')].find(a => {
        if (a.closest('#cf-folders') || a.closest('#cf-timeline') || a.closest('#cffld-selector')) return false;
        return getConversationPathFromUrl(a.href || a.getAttribute('href')) === targetPath;
      });

      if (nativeLink) {
        nativeLink.click();
        return;
      }

      window.location.href = targetUrl;
    },

    _buildPanel() {
      this.panel = document.createElement('div');
      this.panel.id = 'cf-folders';
      this.panel.setAttribute('data-cf-ignore', 'true');
      // SVG 圖示常數
      const iconChevron = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
      const iconFolder  = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z"/></svg>`;
      const iconImport  = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-7l-2-2H6a2 2 0 0 0-2 2z"/><path d="M9 15v-4"/><path d="M7 13l2-2 2 2"/><path d="M15 10v4"/><path d="M13 12l2 2 2-2"/></svg>`;
      const iconUp      = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>`;
      const iconDown    = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM10 15v-4h4v4h3l-5 5-5-5h3z"/></svg>`;
      const iconPin     = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`;
      const iconSyncCloud = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z M5 12h3v5h2v-5h3l-4-4-4 4z M11 12l4 4 4-4h-3V7h-2v5h-3z"/></svg>`;
      
      const iconSearch  = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
      const iconPlus = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="4" x2="8" y2="12"></line><line x1="4" y1="8" x2="12" y2="8"></line></svg>`;
      const iconMinus = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="8" x2="12" y2="8"></line></svg>`;

      this.panel.innerHTML = `
        <div class="cffld-resize-r"></div>
        <div class="cffld-resize-b"></div>
        <div class="cffld-resize-l"></div>
        <div class="cffld-resize-t"></div>
        <div class="cffld-header">
          <div class="cffld-header-left">
            <button class="cffld-collapse-btn" title="摺疊資料夾面板">${iconChevron}</button>
            <button class="cffld-pin-btn" title="將資料夾切換為浮動/內坎">${iconPin}</button>
            <span class="cffld-folder-icon">${iconFolder}</span>
            <span class="cffld-title">資料夾</span>
          </div>
          <div class="cffld-header-btns">
            <button class="cffld-hbtn cffld-expand-all-btn" title="展開所有資料夾">${iconPlus}</button>
            <button class="cffld-hbtn cffld-collapse-all-btn" title="收縮所有資料夾">${iconMinus}</button>
            <button class="cffld-hbtn cffld-search-toggle" title="搜尋">${iconSearch}</button>
            <div class="cffld-io-wrap">
              <button class="cffld-hbtn" data-action="io-toggle" title="本機匯入／匯出">${iconImport}</button>
              <div class="cffld-io-menu" hidden>
                <button data-action="import-local">⬆ 匯入資料夾</button>
                <button data-action="export-local">⬇ 匯出資料夾</button>
              </div>
            </div>
            <div class="cffld-sync-wrap">
              <button class="cffld-hbtn" data-action="sync-toggle" title="Google 帳號雲端同步">${iconSyncCloud}</button>
              <div class="cffld-sync-menu" hidden>
                <button data-action="m-sync-up">${iconUp} 上傳到 Google 帳號</button>
                <button data-action="m-sync-down">${iconDown} 從 Google 帳號下載</button>
              </div>
            </div>
          </div>
        </div>
        <div class="cffld-search-bar" hidden>
          <input type="text" placeholder="輸入想尋找的資料或對話名稱..." class="cffld-search-input">
          <button class="cffld-search-clear" title="清除搜尋">✕</button>
        </div>
        <ul class="cffld-list"></ul>
        <div class="cffld-list-footer">
          <button class="cffld-new-folder-btn" title="新增資料夾">＋ 新增資料夾</button>
        </div>
      `;

      // 摺疊按鈕
      const collapseBtn = this.panel.querySelector('.cffld-collapse-btn');
      collapseBtn.addEventListener('click', () => {
        const collapsed = this.panel.classList.toggle('cffld-panel-collapsed');
        collapseBtn.title = collapsed ? '展開資料夾面板' : '摺疊資料夾面板';
      });

      // ＋ 展開所有資料夾
      this.panel.querySelector('.cffld-expand-all-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        this.folders.forEach(f => { f.isExpanded = true; });
        await this._save();
        this._render();
        ToastModule.show('已展開所有資料夾', 1500);
      });

      // － 收縮所有資料夾
      this.panel.querySelector('.cffld-collapse-all-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        this.folders.forEach(f => { f.isExpanded = false; });
        await this._save();
        this._render();
        ToastModule.show('已收縮所有資料夾', 1500);
      });

      // ＋ 新增資料夾 (Footer 常駐)
      this.panel.querySelector('.cffld-new-folder-btn').addEventListener('click', () => this._promptCreate(null));

      // 搜尋機制
      this._searchQuery = '';
      const searchToggle = this.panel.querySelector('.cffld-search-toggle');
      const searchBar = this.panel.querySelector('.cffld-search-bar');
      const searchInput = this.panel.querySelector('.cffld-search-input');
      const searchClear = this.panel.querySelector('.cffld-search-clear');
      
      const updateSearch = () => {
        this._searchQuery = searchInput.value.trim().toLowerCase();
        this._render();
      };
      
      searchToggle.addEventListener('click', () => {
        const isHidden = searchBar.hidden;
        searchBar.hidden = !isHidden;
        if (!isHidden) {
          searchInput.focus();
        } else {
          searchInput.value = '';
          updateSearch();
        }
      });
      
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchInput.focus();
        updateSearch();
      });
      
      searchInput.addEventListener('input', debounce(updateSearch, 200));

      // 大頭針(浮動開關)
      this.panel.querySelector('.cffld-pin-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const isFloating = SettingsManager.get('folderFloatingEnabled');
        SettingsManager.set('folderFloatingEnabled', !isFloating).then(() => {
          chrome.runtime.sendMessage({ type: 'SETTINGS_CHANGED', settings: SettingsManager.getAll() });
          this._applyFloatingState(); // trigger local switch instantly
        });
      });

      // 本機匯入／匯出下拉選單
      const ioBtn  = this.panel.querySelector('[data-action="io-toggle"]');
      const ioMenu = this.panel.querySelector('.cffld-io-menu');
      ioBtn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = ioMenu.hidden;
        ioMenu.hidden = !opening;
        if (opening) {
          // position:fixed — 計算按鈕的 viewport 座標，將選單對齊按鈕右下角
          const rect = ioBtn.getBoundingClientRect();
          ioMenu.style.top  = (rect.bottom + 4) + 'px';
          // 若選單超出右邊界，靠右對齊
          const menuW = 134; // min-width
          const left  = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
          ioMenu.style.left = Math.max(left, 8) + 'px';
        }
      });
      // 點到選單外部時關閉
      document.addEventListener('mousedown', e => {
        if (!ioMenu.hidden && !ioBtn.contains(e.target) && !ioMenu.contains(e.target)) {
          ioMenu.hidden = true;
        }
      });

      this.panel.querySelector('[data-action="import-local"]').addEventListener('click', () => {
        ioMenu.hidden = true;
        this._importLocal();
      });
      this.panel.querySelector('[data-action="export-local"]').addEventListener('click', () => {
        ioMenu.hidden = true;
        this._exportLocal();
      });

      // Google 帳號雲端同步下拉選單
      const syncBtn  = this.panel.querySelector('[data-action="sync-toggle"]');
      const syncMenu = this.panel.querySelector('.cffld-sync-menu');
      syncBtn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = syncMenu.hidden;
        syncMenu.hidden = !opening;
        if (opening) {
          const rect = syncBtn.getBoundingClientRect();
          syncMenu.style.top = (rect.bottom + 4) + 'px';
          const menuW = 160; 
          const left = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
          syncMenu.style.left = Math.max(left, 8) + 'px';
        }
      });
      document.addEventListener('mousedown', e => {
        if (!syncMenu.hidden && !syncBtn.contains(e.target) && !syncMenu.contains(e.target)) {
          syncMenu.hidden = true;
        }
      });

      this.panel.querySelector('[data-action="m-sync-up"]').addEventListener('click', () => {
        syncMenu.hidden = true;
        this._syncUp();
      });
      this.panel.querySelector('[data-action="m-sync-down"]').addEventListener('click', () => {
        syncMenu.hidden = true;
        this._syncDown();
      });

      // 邊緣拖曳縮放 (四邊)
      const resizerL = this.panel.querySelector('.cffld-resize-l');
      let isResizingL = false;
      resizerL.addEventListener('mousedown', (e) => {
        if (!SettingsManager.get('folderFloatingEnabled')) return;
        isResizingL = true;
        document.body.style.userSelect = 'none';
        const startX = e.clientX;
        const rect = this.panel.getBoundingClientRect();
        const startWidth = rect.width;
        const startLeft = rect.left;
        e.stopPropagation();

        const mouseMoveHandler = (moveE) => {
          if (!isResizingL) return;
          const rawDiff = startX - moveE.clientX;
          const newWidth = Math.max(200, startWidth + rawDiff);
          const effectiveDiff = newWidth - startWidth;
          this.panel.style.width = newWidth + 'px';
          this.panel.style.left = (startLeft - effectiveDiff) + 'px';
          this.panel.style.right = 'auto'; // 防彈
        };
        const mouseUpHandler = () => {
          isResizingL = false;
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      });

      const resizerT = this.panel.querySelector('.cffld-resize-t');
      let isResizingT = false;
      resizerT.addEventListener('mousedown', (e) => {
        if (!SettingsManager.get('folderFloatingEnabled')) return;
        isResizingT = true;
        document.body.style.userSelect = 'none';
        const startY = e.clientY;
        const rect = this.panel.getBoundingClientRect();
        const startHeight = rect.height;
        const startTop = rect.top;
        e.stopPropagation();

        const mouseMoveHandler = (moveE) => {
          if (!isResizingT) return;
          const rawDiff = startY - moveE.clientY;
          const newHeight = Math.max(200, startHeight + rawDiff);
          const effectiveDiff = newHeight - startHeight;
          this.panel.style.height = newHeight + 'px';
          this.panel.style.top = (startTop - effectiveDiff) + 'px';
          this.panel.style.bottom = 'auto'; // 防彈
        };
        const mouseUpHandler = () => {
          isResizingT = false;
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      });

      const resizerR = this.panel.querySelector('.cffld-resize-r');
      let isResizingR = false;
      resizerR.addEventListener('mousedown', (e) => {
        if (!SettingsManager.get('folderFloatingEnabled')) return;
        isResizingR = true;
        document.body.style.userSelect = 'none';
        const startX = e.clientX;
        const startWidth = this.panel.getBoundingClientRect().width;
        e.stopPropagation();

        const mouseMoveHandler = (moveE) => {
          if (!isResizingR) return;
          this.panel.style.width = Math.max(200, startWidth + (moveE.clientX - startX)) + 'px';
        };
        const mouseUpHandler = () => {
          isResizingR = false;
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      });

      const resizerB = this.panel.querySelector('.cffld-resize-b');
      let isResizingB = false;
      resizerB.addEventListener('mousedown', (e) => {
        if (!SettingsManager.get('folderFloatingEnabled')) return;
        isResizingB = true;
        document.body.style.userSelect = 'none';
        const startY = e.clientY;
        const startHeight = this.panel.getBoundingClientRect().height;
        e.stopPropagation();

        const mouseMoveHandler = (moveE) => {
          if (!isResizingB) return;
          this.panel.style.height = Math.max(200, startHeight + (moveE.clientY - startY)) + 'px';
        };
        const mouseUpHandler = () => {
          isResizingB = false;
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      });

      // 拖曳邏輯 (Floating Panel)
      const header = this.panel.querySelector('.cffld-header');
      let isDragging = false;
      let startX, startY, initialTop, initialLeft;

      header.addEventListener('mousedown', (e) => {
        if (!SettingsManager.get('folderFloatingEnabled')) return;
        if (e.target.closest('button')) return; // 點擊按鈕不觸發拖曳

        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = this.panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;

        this.panel.style.transition = 'none';

        const mouseMoveHandler = (eMove) => {
          if (!isDragging) return;
          eMove.preventDefault();

          let newLeft = initialLeft + (eMove.clientX - startX);
          let newTop = initialTop + (eMove.clientY - startY);

          // 邊界碰撞防護與 20px 磁力吸附
          const threshold = 20;
          const maxLeft = window.innerWidth - this.panel.offsetWidth;
          const maxTop = window.innerHeight - this.panel.offsetHeight;
          
          if (newLeft < threshold) newLeft = 0;
          else if (newLeft > maxLeft - threshold) newLeft = maxLeft;
          else newLeft = Math.max(0, Math.min(newLeft, maxLeft));

          if (newTop < threshold) newTop = 0;
          else if (newTop > maxTop - threshold) newTop = maxTop;
          else newTop = Math.max(0, Math.min(newTop, maxTop));

          this.panel.style.left = `${newLeft}px`;
          this.panel.style.top = `${newTop}px`;
          this.panel.style.bottom = 'auto';
          this.panel.style.right = 'auto';
        };

        const mouseUpHandler = () => {
          if (!isDragging) return;
          isDragging = false;
          this.panel.style.transition = '';
          document.removeEventListener('mousemove', mouseMoveHandler);
          document.removeEventListener('mouseup', mouseUpHandler);

          // 記憶最後座標，同時保留原有的寬高（如果有的話）
          const w = this.panel.style.width;
          const h = this.panel.style.height;
          SettingsManager.set('folderPosition', { top: this.panel.style.top, left: this.panel.style.left, width: w, height: h });
        };

        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      });

      // 寬高尺寸變更觀測器 (ResizeObserver)
      const resizeObserver = new ResizeObserver((entries) => {
        if (!SettingsManager.get('folderFloatingEnabled')) return;
        for (let entry of entries) {
           if (entry.target === this.panel) {
             const w = this.panel.style.width;
             const h = this.panel.style.height;
             if (w || h) {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(async () => {
                   const folderPos = SettingsManager.get('folderPosition') || {};
                   const newPos = Object.assign({}, folderPos, { width: w, height: h });
                   SettingsManager.set('folderPosition', newPos);
                }, 300);
             }
           }
        }
      });
      resizeObserver.observe(this.panel);

      this._render();
    },

    // ── 本機匯出：下載 JSON 檔案（包含資料夾與提示詞） ─────────────────────
    async _exportLocal() {
      const { cf_prompts } = await Storage.getLocal('cf_prompts');
      const data = { 
        exportedAt: new Date().toISOString(), 
        folders: this.folders,
        prompts: cf_prompts || []
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `chatfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },

    // ── 本機匯入：讀取 JSON 檔案並合併（資料夾與提示詞） ─────────────────────
    _importLocal() {
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
            alert('⚠ 沒有找到有效的資料夾或提示詞資料'); 
            return; 
          }

          const confirmMsg = `確定匯入備份資料嗎？\n- 資料夾：${importedF.length} 個\n- 提示詞：${importedP.length} 個`;
          if (!confirm(confirmMsg)) return;

          const { cf_prompts: existingP } = await Storage.getLocal('cf_prompts');
          
          // 合併（以 ID 去重，匯入的優先）
          const mergedF = [...this._normalizeFolders(importedF), ...this.folders]
            .filter((f, i, a) => a.findIndex(x => x.id === f.id) === i);
          const mergedP = [...importedP, ...(existingP || [])]
            .filter((p, i, a) => a.findIndex(x => x.id === p.id) === i);

          this.folders = this._normalizeFolders(mergedF);
          await Storage.setLocal({ cf_folders: this.folders, cf_prompts: mergedP });
          
          this._render();
          if (PromptVaultModule) await PromptVaultModule._reloadPrompts();

          alert(`✓ 已匯入 ${importedF.length} 個資料夾與 ${importedP.length} 個提示詞`);
        } catch (err) {
          alert('⚠ 匯入失敗：' + (err?.message || 'JSON 格式錯誤'));
        }
      });
      input.click();
    },

    // ── 上傳到 Google Drive（透過 Background） ────────────────
    async _syncUp() {
      const { cf_prompts } = await Storage.getLocal('cf_prompts');
      const { cf_settings } = await Storage.getSync('cf_settings');
      
      const folderCount = this.folders.length;
      const promptCount = (cf_prompts || []).length;

      const ok = confirm(
        `確定將本機資料備份至 Google Drive？\n\n內容：\n   ${folderCount} 個資料夾、${promptCount} 個提示詞與設定值\n\n※ 這將覆蓋雲端上的舊備份。`
      );
      if (!ok) return;

      const data = {
        exportedAt: new Date().toISOString(),
        folders: this.folders,
        prompts: cf_prompts || [],
        settings: cf_settings || {}
      };

      try {
        this._showToast('🚀 正在連接 Google Drive...', 3000);
        const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'DRIVE_SYNC_UP', data }, r));
        
        if (resp && resp.ok) {
          this._showToast('✓ 已成功備份至 Google Drive', 3000);
        } else {
          throw new Error(resp?.error || '未知錯誤');
        }
      } catch (err) {
        alert('⚠ 備份失敗：' + err.message);
      }
    },

    // ── 從 Google Drive 下載（透過 Background） ────────────────
    async _syncDown() {
      const ok = confirm('確定從 Google Drive 下載備份並覆蓋目前的所有資料與設定？');
      if (!ok) return;

      try {
        this._showToast('🔍 正在從 Google Drive 取得資料...', 3000);
        const resp = await new Promise(r => chrome.runtime.sendMessage({ type: 'DRIVE_SYNC_DOWN' }, r));

        if (resp && resp.ok && resp.data) {
          const { folders, prompts, settings } = resp.data;
          
          if (folders) {
            this.folders = this._normalizeFolders(folders);
            await Storage.setLocal({ cf_folders: this.folders });
          }
          if (prompts) {
            await Storage.setLocal({ cf_prompts: prompts });
          }
          if (settings) {
            await Storage.setSync({ cf_settings: settings });
          }

          this._render();
          this._showToast('✓ 已完成還原，請重新整理頁面以套用最新設定', 5000);
        } else if (resp && resp.ok && !resp.data) {
          alert('⚠ Google Drive 中沒有找到任何備份檔案。');
        } else {
          throw new Error(resp?.error || '無法取得數據');
        }
      } catch (err) {
        alert('⚠ 還原失敗：' + err.message);
      }
    },

    _showToast(msg, duration = 3000) {
      if (typeof ToastModule !== 'undefined') {
        ToastModule.show(msg, duration);
      } else {
        // 簡易備援
        const div = document.createElement('div');
        div.style = 'position:fixed; bottom:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:8px; z-index:10000;';
        div.textContent = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), duration);
      }
    },

    // 依序重試，將面板插入 Gemini 側邊欄的「Gem」與「對話」之間
    _tryInjectRetry() {
      [500, 1500, 3000, 5500, 9000].forEach(delay =>
        setTimeout(() => { if (!this._injected) this._tryInjectInSidebar(); }, delay)
      );
    },

    _tryInjectInSidebar() {
      if (!SettingsManager.get('foldersEnabled')) return false;
      if (SettingsManager.get('folderFloatingEnabled')) return false;

      const sidebarCandidates = [
        'nav', 'mat-sidenav', '[class*="sidenav"]', '[class*="side-nav"]',
        '[class*="sidebar"]', '[role="navigation"]'
      ];
      let sidebar = null;
      for (const sel of sidebarCandidates) {
        const el = document.querySelector(sel);
        if (el && el.scrollHeight > 100) { sidebar = el; break; }
      }
      if (!sidebar) {
        if (!document.body.contains(this.panel)) document.body.appendChild(this.panel);
        return false;
      }

      // ── LCA 算法：找到 「Gem」與「對話」的最近公共祖先，
      //    在公共祖先層級把面板插在「對話分支」之前 ──────────────
      const getPath = (el) => {
        const path = [];
        let cur = el;
        while (cur && cur !== sidebar) { path.unshift(cur); cur = cur.parentElement; }
        return path;
      };

      let gemTextEl = null, convTextEl = null;
      for (const el of sidebar.querySelectorAll('*')) {
        if (el.children.length === 0) {
          const t = el.textContent.trim();
          if (t === 'Gem'  && !gemTextEl)  gemTextEl  = el;
          if (t === '對話' && !convTextEl) convTextEl = el;
        }
        if (gemTextEl && convTextEl) break;
      }

      if (gemTextEl && convTextEl) {
        const gemPath  = getPath(gemTextEl);
        const convPath = getPath(convTextEl);

        // 找路徑分歧點（即 LCA 的下一層）
        let i = 0;
        while (i < gemPath.length && i < convPath.length && gemPath[i] === convPath[i]) i++;

        // convPath[i] 是包含「對話」的分支，直接插在它之前
        const convBranch = convPath[i];
        if (convBranch?.parentElement && sidebar.contains(convBranch)) {
          convBranch.parentElement.insertBefore(this.panel, convBranch);
          this.panel.style.cssText = '';  // 清除 fixed 備援的 inline 樣式
          this.panel.classList.add('cffld-embedded');
          this._injected = true;
          return true;
        }
      }

      // ── 備援 A：找到「對話」後，向上找到兄弟節點數 ≥ 2 的層級 ──
      if (convTextEl) {
        let candidate = convTextEl.parentElement;
        while (candidate && candidate !== sidebar) {
          if ((candidate.parentElement?.children?.length ?? 0) >= 2) {
            candidate.parentElement.insertBefore(this.panel, candidate);
            this.panel.style.cssText = '';  // 清除 fixed 備援的 inline 樣式
            this.panel.classList.add('cffld-embedded');
            this._injected = true;
            return true;
          }
          candidate = candidate.parentElement;
        }
      }

      // ── 備援 B：fixed 定位掛在 body（不破壞 sidebar 結構） ──
      if (!document.body.contains(this.panel)) {
        document.body.appendChild(this.panel);
      }
      // fixed 備援：放在左側
      this.panel.style.cssText = 'position:fixed;left:0;bottom:80px;z-index:8900;';
      return false;
    },

    _render() {
      const list = this.panel.querySelector('.cffld-list');
      list.innerHTML = '';
      
      const totalConvs = this.folders.reduce((acc, f) => acc + (f.conversationIds?.length || 0), 0);

      this.folders.filter(f => !f.parentId).forEach(f => this._renderFolder(f, list, 0));

      if (this.folders.length === 0 || totalConvs === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'cffld-empty-state';
        emptyState.textContent = this.folders.length === 0 ? '將對話拖曳至此處' : '將對話拖曳至此處或資料夾上';
        // 允許拖曳進入空狀態
        emptyState.addEventListener('dragover', e => {
          e.preventDefault();
          emptyState.classList.add('cffld-drag-over');
        });
        emptyState.addEventListener('dragleave', () => emptyState.classList.remove('cffld-drag-over'));
        emptyState.addEventListener('drop', e => {
          e.preventDefault();
          emptyState.classList.remove('cffld-drag-over');
          this._handleDrop(e, null);
        });
        list.appendChild(emptyState);
      }
    },

    _renderFolder(folder, container, depth) {
      const q = this._searchQuery || '';
      
      const checkMatch = (f) => {
        if (!q) return true;
        if (f.name.toLowerCase().includes(q)) return true;
        const cIds = f.conversationIds || [];
        if (cIds.some(id => (f._convNames?.[id] || '').toLowerCase().includes(q))) return true;
        const ch = this.folders.filter(sub => sub.parentId === f.id);
        return ch.some(sub => checkMatch(sub));
      };

      if (!checkMatch(folder)) return;

      const isExpanded = q ? true : (folder.isExpanded !== false);
      const children   = this.folders.filter(f => f.parentId === folder.id);
      const convIds    = folder.conversationIds || [];
      const hasContent = children.length > 0 || convIds.length > 0;
      const color      = folder.color || '#1A56DB';
      const indent     = depth * 14;

      const li = document.createElement('li');
      li.className = 'cffld-item';
      li.dataset.id = folder.id;

      // Chevron SVG：有內容時可展開，無內容時顯示空心點
      const arrowSvg = hasContent
        ? `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>`
        : `<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="2" opacity=".35"/></svg>`;

      const totalCount = this._getRecursiveConvCount(folder.id);

      li.innerHTML = `
        <div class="cffld-row" style="padding-left:${6 + indent}px">
          <button class="cffld-toggle${hasContent ? '' : ' cffld-toggle-empty'}" data-expanded="${isExpanded}">${arrowSvg}</button>
          <span class="cffld-dot" style="background:${escapeHtml(color)}"></span>
          <span class="cffld-name">${escapeHtml(folder.name)}</span>
          ${totalCount > 0 ? `<span class="cffld-count">${totalCount}</span>` : ''}
          <div class="cffld-actions">
            <button class="cffld-btn" data-action="add-sub" title="新增子資料夾">＋</button>
            <button class="cffld-btn" data-action="rename"  title="重新命名">✏</button>
            <button class="cffld-btn" data-action="delete"  title="刪除">✕</button>
          </div>
        </div>
      `;

      // ── DnD 綁定：資料夾 ──
      const row = li.querySelector('.cffld-row');
      row.setAttribute('draggable', 'true');
      row.addEventListener('dragstart', e => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', folder.id);
        FolderModule._dragData = { type: 'folder', id: folder.id };
      });
      row.addEventListener('dragend', () => { FolderModule._dragData = null; });
      row.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        
        const rect = row.getBoundingClientRect();
        const threshold = rect.height / 3;
        if (e.clientY - rect.top < threshold) {
          row.classList.add('cffld-drag-above');
          row.classList.remove('cffld-drag-over', 'cffld-drag-below');
          FolderModule._dragTargetPos = 'above';
        } else if (e.clientY - rect.top > rect.height - threshold) {
          row.classList.add('cffld-drag-below');
          row.classList.remove('cffld-drag-over', 'cffld-drag-above');
          FolderModule._dragTargetPos = 'below';
        } else {
          row.classList.remove('cffld-drag-above', 'cffld-drag-below');
          row.classList.add('cffld-drag-over');
          FolderModule._dragTargetPos = 'into';
        }
      });
      row.addEventListener('dragleave', () => {
        row.classList.remove('cffld-drag-over', 'cffld-drag-above', 'cffld-drag-below');
      });
      row.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('cffld-drag-over', 'cffld-drag-above', 'cffld-drag-below');
        this._handleDrop(e, folder.id, FolderModule._dragTargetPos);
      });

      if (hasContent) {
        li.querySelector('.cffld-toggle').addEventListener('click', async e => {
          e.stopPropagation();
          folder.isExpanded = !isExpanded;
          await this._save();
          this._render();
        });
      }
      li.querySelector('[data-action="add-sub"]').addEventListener('click', e => { e.stopPropagation(); this._promptCreate(folder.id); });
      li.querySelector('[data-action="rename"]').addEventListener('click',  e => { e.stopPropagation(); this._promptRename(folder); });
      li.querySelector('[data-action="delete"]').addEventListener('click',  e => { e.stopPropagation(); this._confirmDelete(folder); });
      
      // 點選名稱直接重新命名
      li.querySelector('.cffld-name').addEventListener('click', e => {
        e.stopPropagation();
        this._promptRename(folder);
      });

      container.appendChild(li);

      // 展開子項目
      if (isExpanded && hasContent) {
        const childUl = document.createElement('ul');
        childUl.className = 'cffld-children';

        // 子資料夾（遞迴）
        children.forEach(c => this._renderFolder(c, childUl, depth + 1));

        let matchConvIds = convIds;
        if (q && !folder.name.toLowerCase().includes(q)) {
          matchConvIds = convIds.filter(id => (folder._convNames?.[id] || '').toLowerCase().includes(q));
        }

        // 對話列表
        matchConvIds.forEach(convId => {
          const cLi = document.createElement('li');
          cLi.className = 'cffld-conv-item';
          cLi.style.paddingLeft = `${6 + indent + 28}px`;
          const name = folder._convNames?.[convId] || (convId.slice(0, 22) + '…');
          cLi.innerHTML = `
            <span class="cffld-conv-icon">💬</span>
            <span class="cffld-conv-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <button class="cffld-conv-remove" title="移除">✕</button>
          `;
          
          cLi.setAttribute('draggable', 'true');
          cLi.addEventListener('dragstart', e => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', convId);
            FolderModule._dragData = { type: 'conv', id: convId, sourceFolderId: folder.id };
          });
          cLi.addEventListener('dragend', () => { FolderModule._dragData = null; });

          cLi.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            const rect = cLi.getBoundingClientRect();
            if (e.clientY - rect.top < rect.height / 2) {
              cLi.classList.add('cffld-drag-above');
              cLi.classList.remove('cffld-drag-below');
              FolderModule._dragTargetPos = 'above';
            } else {
              cLi.classList.remove('cffld-drag-above');
              cLi.classList.add('cffld-drag-below');
              FolderModule._dragTargetPos = 'below';
            }
          });
          cLi.addEventListener('dragleave', () => {
            cLi.classList.remove('cffld-drag-above', 'cffld-drag-below');
          });
          cLi.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            cLi.classList.remove('cffld-drag-above', 'cffld-drag-below');
            this._handleDropOnConversation(e, folder.id, convId, FolderModule._dragTargetPos);
          });

          // 點擊對話名稱→跳轉到對話（直接用儲存的完整 URL，避免模擬 click 觸發 Angular 副作用）
          cLi.querySelector('.cffld-conv-name').style.cursor = 'pointer';
          cLi.querySelector('.cffld-conv-name').addEventListener('click', e => {
            e.preventDefault(); e.stopPropagation();
            const url = folder._convUrls?.[convId] || (location.origin + '/app/' + convId);
            this._navigateToConversation(convId, url);
          });
          cLi.querySelector('.cffld-conv-remove').addEventListener('click', e => {
            e.stopPropagation(); this._removeConversation(folder.id, convId);
          });
          childUl.appendChild(cLi);
        });

        li.appendChild(childUl);
      }
    },

    _promptCreate(parentId) {
      const name = prompt('資料夾名稱：');
      if (!name?.trim()) return;
      const f = { id: uuid(), name: name.trim(), color: '#1A56DB',
        parentId: parentId || null, conversationIds: [], _convNames: {},
        createdAt: Date.now(), updatedAt: Date.now() };
      this._expanded[f.id] = true;
      this.folders.push(f);
      this._save();
    },

    _promptRename(folder) {
      const row = document.querySelector(`.cffld-item[data-id="${folder.id}"] .cffld-row`);
      const nameSpan = row?.querySelector('.cffld-name');
      if (!nameSpan) return;

      // 暫時關閉該行的拖曳功能，避免選取文字時觸發拖曳
      row.setAttribute('draggable', 'false');

      const oldName = folder.name;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cffld-inline-input';
      input.value = oldName;

      // 防止點擊與拖曳事件冒泡到父層
      input.addEventListener('click', e => e.stopPropagation());
      input.addEventListener('mousedown', e => e.stopPropagation());
      input.addEventListener('dragstart', e => e.stopPropagation());

      const finishEdit = (save) => {
        if (input.dataset.finished) return;
        input.dataset.finished = '1';
        
        // 還原該行的拖曳功能
        row.setAttribute('draggable', 'true');

        const newName = input.value.trim();
        if (save && newName && newName !== oldName) {
          folder.name = newName;
          folder.updatedAt = Date.now();
          this._save();
          this._render();
        } else {
          nameSpan.style.display = '';
          input.remove();
        }
      };

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finishEdit(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finishEdit(false);
        }
      });
      input.addEventListener('blur', () => finishEdit(true));

      nameSpan.style.display = 'none';
      nameSpan.parentNode.insertBefore(input, nameSpan.nextSibling);
      input.focus();
      input.select();
    },

    _confirmDelete(folder) {
      if (!confirm(`確定刪除「${folder.name}」？子資料夾也會一同刪除。`)) return;
      const toDelete = new Set([folder.id]);
      let changed = true;
      while (changed) {
        changed = false;
        this.folders.forEach(f => { if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) { toDelete.add(f.id); changed = true; } });
      }
      this.folders = this.folders.filter(f => !toDelete.has(f.id));
      this._save();
    },

    _removeConversation(folderId, convId) {
      const f = this.folders.find(x => x.id === folderId);
      if (!f) return;
      f.conversationIds = f.conversationIds.filter(id => id !== convId);
      if (f._convNames) delete f._convNames[convId];
      if (f._convUrls)  delete f._convUrls[convId];
      f.updatedAt = Date.now();
      this._save();
    },

    async _handleDrop(e, targetFolderId, position) {
      const data = FolderModule._dragData;
      
      // 1. 放在空狀態 (.cffld-empty-state) 或期望建立新資料夾 (targetFolderId == null)
      if (!targetFolderId) {
        if (data && data.type === 'folder') {
          const movedFolder = this.folders.find(f => f.id === data.id);
          if (movedFolder) {
            movedFolder.parentId = null;
            movedFolder.updatedAt = Date.now();
            this.folders = this._normalizeFolders(this.folders);
            await this._save();
            this._render();
          }
          FolderModule._dragData = null;
          return;
        }
        
        // 如果是對話，自動建一個新資料夾來放
        const newFolderId = uuid();
        const newF = {
          id: newFolderId, name: '新資料夾', color: '#1A56DB',
          parentId: null, conversationIds: [], _convNames: {}, _convUrls: {},
          createdAt: Date.now(), updatedAt: Date.now()
        };
        this.folders.push(newF);
        this._expanded[newF.id] = true;
        targetFolderId = newFolderId;
      }

      // 2. 內部拖曳邏輯
      if (data) {
        if (data.type === 'folder') {
          if (data.id === targetFolderId) return;
          const movedFolder = this.folders.find(f => f.id === data.id);
          if (!movedFolder) return;

          if (position === 'above') {
            const tgtFolder = this.folders.find(f => f.id === targetFolderId);
            movedFolder.parentId = tgtFolder ? tgtFolder.parentId : null;
            const oldIdx = this.folders.findIndex(f => f.id === data.id);
            this.folders.splice(oldIdx, 1);
            const newIdx = this.folders.findIndex(f => f.id === targetFolderId);
            this.folders.splice(newIdx, 0, movedFolder);
          } else {
            let curr = this.folders.find(f => f.id === targetFolderId);
            while (curr) {
              if (curr.id === data.id) {
                 alert('⚠ 循環嵌套：無法將資料夾移動到自己的子層級中。');
                 return;
              }
              curr = this.folders.find(f => f.id === curr.parentId);
            }
            movedFolder.parentId = targetFolderId;
          }
          movedFolder.updatedAt = Date.now();
          await this._save();
        } else if (data.type === 'conv') {
          const srcFolder = this.folders.find(f => f.id === data.sourceFolderId);
          const tgtFolder = this.folders.find(f => f.id === targetFolderId);
          if (srcFolder && tgtFolder) {
            srcFolder.conversationIds = srcFolder.conversationIds.filter(id => id !== data.id);
            const name = srcFolder._convNames?.[data.id];
            const url = srcFolder._convUrls?.[data.id];
            if (srcFolder._convNames) delete srcFolder._convNames[data.id];
            if (srcFolder._convUrls) delete srcFolder._convUrls[data.id];
            tgtFolder.conversationIds = tgtFolder.conversationIds || [];
            if (position === 'above') {
              if (!tgtFolder.conversationIds.includes(data.id)) tgtFolder.conversationIds.unshift(data.id);
            } else {
              if (!tgtFolder.conversationIds.includes(data.id)) tgtFolder.conversationIds.push(data.id);
            }
            if (!tgtFolder._convNames) tgtFolder._convNames = {};
            if (!tgtFolder._convUrls) tgtFolder._convUrls = {};
            if (name) tgtFolder._convNames[data.id] = name;
            if (url) tgtFolder._convUrls[data.id] = url;
            srcFolder.updatedAt = Date.now();
            tgtFolder.updatedAt = Date.now();
            this._expanded[targetFolderId] = true;
            await this._save();
          }
        }
        FolderModule._dragData = null;
        return;
      }
      
      // 3. 外部拖曳邏輯
      const { convId, convName, convUrl } = this._getDragInfo(e);
      if (!convId) return;

      const tgtFolder = this.folders.find(f => f.id === targetFolderId);
      if (tgtFolder) {
         tgtFolder.conversationIds = tgtFolder.conversationIds || [];
         if (!tgtFolder.conversationIds.includes(convId)) {
            if (position === 'above') tgtFolder.conversationIds.unshift(convId);
            else tgtFolder.conversationIds.push(convId);

            tgtFolder._convNames = tgtFolder._convNames || {};
            tgtFolder._convUrls = tgtFolder._convUrls || {};
            tgtFolder._convNames[convId] = convName;
            tgtFolder._convUrls[convId] = convUrl;
            
            this._expanded[targetFolderId] = true;
            await this._save();
            // 拖曳結束後立即嘗試一次同步更新名稱 (考量到部分新對話標題生成較慢，設定 800ms 延遲)
            setTimeout(() => DOMObserver._syncTabTitle(), 800);
         }
      }
    },

    _getDragInfo(e) {
      const uriList = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
      let convId = '', convName = '新對話', convUrl = '';
      if (uriList && uriList.includes('/app/')) {
         const lines = uriList.split('\n').filter(l => l.trim().startsWith('http'));
         if (lines.length > 0) {
            convUrl = lines[0].trim();
            const match = convUrl.match(/\/app\/([a-zA-Z0-9_-]+)/);
            if (match) convId = match[1];
         }
      }
      if (convId) {
         const nativeAnchor = document.querySelector(`a[href*="/app/${convId}"]`);
         if (nativeAnchor) {
            const text = nativeAnchor.textContent.trim();
            // 如果抓到的是通用名稱，則不使用，讓後續同步機制來補齊
            if (text && !isGenericConversationTitle(text)) convName = text;
         }
      }
      return { convId, convName, convUrl };
    },

    async _handleDropOnConversation(e, folderId, targetConvId, position) {
      const data = FolderModule._dragData;
      const tgtFolder = this.folders.find(f => f.id === folderId);
      if (!tgtFolder) return;

      if (data) {
        if (data.type === 'conv') {
          const srcFolder = this.folders.find(f => f.id === data.sourceFolderId);
          if (!srcFolder) return;
          const name = srcFolder._convNames?.[data.id];
          const url = srcFolder._convUrls?.[data.id];

          srcFolder.conversationIds = srcFolder.conversationIds.filter(id => id !== data.id);
          if (srcFolder._convNames) delete srcFolder._convNames[data.id];
          if (srcFolder._convUrls) delete srcFolder._convUrls[data.id];

          tgtFolder.conversationIds = tgtFolder.conversationIds || [];
          const idx = tgtFolder.conversationIds.indexOf(targetConvId);
          if (idx !== -1) {
            let insertIdx;
            if (position === 'above') {
              insertIdx = idx;
            } else {
              // position is 'below' or 'into'
              insertIdx = idx + 1;
            }
            tgtFolder.conversationIds.splice(insertIdx, 0, data.id);
          } else {
            tgtFolder.conversationIds.push(data.id);
          }

          tgtFolder._convNames = tgtFolder._convNames || {};
          tgtFolder._convUrls = tgtFolder._convUrls || {};
          if (name) tgtFolder._convNames[data.id] = name;
          if (url) tgtFolder._convUrls[data.id] = url;

          srcFolder.updatedAt = Date.now();
          tgtFolder.updatedAt = Date.now();
          await this._save();
        } else if (data.type === 'folder') {
          await this._handleDrop(e, folderId, 'above');
        }
        FolderModule._dragData = null;
      } else {
        const { convId, convName, convUrl } = this._getDragInfo(e);
        if (!convId) return;

        tgtFolder.conversationIds = tgtFolder.conversationIds || [];
        if (!tgtFolder.conversationIds.includes(convId)) {
          const idx = tgtFolder.conversationIds.indexOf(targetConvId);
          const insertIdx = (idx !== -1 && position === 'above') ? idx : (idx !== -1 ? idx + 1 : tgtFolder.conversationIds.length);
          tgtFolder.conversationIds.splice(insertIdx, 0, convId);

          tgtFolder._convNames = tgtFolder._convNames || {};
          tgtFolder._convUrls = tgtFolder._convUrls || {};
          tgtFolder._convNames[convId] = convName;
          tgtFolder._convUrls[convId] = convUrl;
          await this._save();
        }
      }
    },

    // 從對話右鍵選單呼叫
    showFolderSelector(convId, convName, convUrl) {
      document.getElementById('cffld-selector')?.remove();
      const overlay = document.createElement('div');
      overlay.id = 'cffld-selector';
      overlay.className = 'cffld-selector-overlay';

      const buildOpts = (parentId = null, depth = 0) =>
        this.folders.filter(f => (f.parentId || null) === parentId).map(f => {
          const active = f.conversationIds?.includes(convId);
          return `
            <div class="cffld-sel-item${active ? ' cffld-sel-active' : ''}"
                 data-fid="${escapeHtml(f.id)}" style="padding-left:${12 + depth * 16}px">
              <span class="cffld-dot" style="background:${escapeHtml(f.color || '#1A56DB')}"></span>
              <span>${escapeHtml(f.name)}</span>
              ${active ? '<span class="cffld-sel-check">✓</span>' : ''}
            </div>${buildOpts(f.id, depth + 1)}`;
        }).join('');

      const html = buildOpts();
      overlay.innerHTML = `
        <div class="cffld-sel-modal">
          <div class="cffld-sel-header"><span>📁 加入資料夾</span><button class="cffld-sel-close">✕</button></div>
          <div class="cffld-sel-body">${html || '<p class="cffld-sel-empty">尚無資料夾</p>'}</div>
          <div class="cffld-sel-footer"><button class="cffld-sel-new">＋ 新增資料夾</button></div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('.cffld-sel-close').addEventListener('click', () => overlay.remove());
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      overlay.querySelector('.cffld-sel-new').addEventListener('click', () => {
        overlay.remove(); this._promptCreate(null);
        setTimeout(() => this.showFolderSelector(convId, convName, convUrl), 400);
      });
      overlay.querySelectorAll('.cffld-sel-item').forEach(item => {
        item.addEventListener('click', () => {
          const f = this.folders.find(x => x.id === item.dataset.fid);
          if (!f) return;
          this._toggleFolderConversation(f, convId, convName, convUrl || location.href);
          this._save();
          overlay.remove();
        });
      });
    },

    async _save() {
      this.folders = this._normalizeFolders(this.folders);
      await Storage.setLocal({ cf_folders: this.folders });
      this._render();

      // 同步更新側邊欄標記
      if (typeof CategorizedMarkModule !== 'undefined') CategorizedMarkModule.updateIndex();

      EventBus.emit('folders:updated', this.folders);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  FolderPathModule — 頂部路徑顯示
  // ═══════════════════════════════════════════════════════════════

  const FolderPathModule = {
    _elem: null,

    init() {
      // 監聽相關事件進行同步更新
      EventBus.on('route:changed', () => this.update());
      EventBus.on('messages:updated', () => this.update());
      EventBus.on('folders:updated', () => this.update());
      EventBus.on('settings:changed', (d) => { 
        if (d.key === 'foldersEnabled') this.update(); 
      });
      // 初次載入延遲一下，等待 Gemini Header 就緒
      setTimeout(() => this.update(), 1200);
      setTimeout(() => this.update(), 3000);
    },

    _getConversationId() {
       return getConversationIdFromUrl(location.href);
    },

    update() {
      if (!SettingsManager.get('foldersEnabled')) {
        this._hide();
        return;
      }

      const convId = this._getConversationId();
      if (!convId) {
        this._hide();
        return;
      }

      const folders = FolderModule?.folders || [];
      const pathNodes = this._findPath(folders, convId);

      // 如果此對話不在任何資料夾中，就不顯示路徑
      if (pathNodes.length === 0) {
        this._hide();
        return;
      }

      this._show(pathNodes);
    },

    _findPath(folders, convId) {
      let leafFolder = folders.find(f => f.conversationIds?.includes(convId));
      if (!leafFolder) return [];

      const path = [leafFolder];
      let curr = leafFolder;
      
      // 深度限制 10 層避免無限迴圈
      let safetyCounter = 0;
      while (curr.parentId && safetyCounter < 10) {
        safetyCounter++;
        // 支援 parentId 為 null, undefined 或 "null" 字串的情況
        if (curr.parentId === 'null') break;
        
        const parent = folders.find(f => f.id === curr.parentId);
        if (!parent) break;
        path.unshift(parent);
        curr = parent;
      }
      return path;
    },

    _ensureElem() {
      // 確保元素存在且在 body 中
      if (this._elem && document.body.contains(this._elem)) return this._elem;
      
      this._elem = document.getElementById('cf-header-breadcrumb');
      if (this._elem) return this._elem;

      this._elem = document.createElement('div');
      this._elem.id = 'cf-header-breadcrumb';
      document.body.appendChild(this._elem);
      return this._elem;
    },

    _show(pathNodes) {
      // 仍找 Host 主要是為了確定頁面已載入且能隱藏原生標題
      const host = DOMObserver._getHeaderTitleHost();
      if (!host) {
        setTimeout(() => this.update(), 1200);
        return;
      }

      // 改用 fixed positioning，不在乎 host 的 position
      const container = this._ensureElem();
      
      const convId = this._getConversationId();
      const leaf = pathNodes[pathNodes.length - 1];
      const storedName = leaf?._convNames?.[convId];
      
      // 獲取目前對話名稱 (優先從資料夾儲存的名稱開始找，但如果是通用名稱如「新對話」則跳過)
      let titleText = (storedName && !isGenericConversationTitle(storedName)) ? storedName : '';
      if (!titleText) {
        titleText = DOMObserver._getStableSidebarConversationTitle() || document.title.split(' - ')[0] || '對話';
      }

      const foldersHtml = pathNodes.map(f => `<span class="cf-breadcrumb-folder">${escapeHtml(f.name)}</span>`).join('<span class="cf-breadcrumb-sep">\\</span>');
      container.innerHTML = `
        <div class="cf-breadcrumb-folders">${foldersHtml}</div>
        <span class="cf-breadcrumb-sep">\\</span>
        <span class="cf-breadcrumb-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</span>
      `;
      
      container.classList.add('cf-active');
      
      // 確保 host 具有必要的標記
      if (host) host.classList.add('cf-has-breadcrumb');
    },

    _hide() {
      const host = DOMObserver._getHeaderTitleHost();
      if (host) host.classList.remove('cf-has-breadcrumb');
      if (this._elem) {
        this._elem.classList.remove('cf-active');
        this._elem.remove();
        this._elem = null;
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  PromptVaultModule — 提示詞庫
  // ═══════════════════════════════════════════════════════════════

  const PromptVaultModule = {
    prompts: [],
    overlay: null,
    triggerBtn: null,
    _searchQuery: '',
    _editingId: null,   // null = 新增, string = 編輯中的 prompt id

    async init() {
      await this._reloadPrompts();
      this._buildTrigger();
      this._buildOverlay();
    },

    async _reloadPrompts() {
      const { cf_prompts } = await Storage.getLocal('cf_prompts');
      this.prompts = cf_prompts || [];
    },

    // ── SVG icons ──────────────────────────────────────────────
    _icons: {
      vault: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 1L2 4l6 3 6-3-6-3z"/><path d="M2 8l6 3 6-3"/><path d="M2 11.5l6 3 6-3"/>
      </svg>`,
      search: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="6.5" cy="6.5" r="4"/><path d="M11 11l2.5 2.5"/>
      </svg>`,
      plus: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M8 3v10M3 8h10"/>
      </svg>`,
      close: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M3 3l10 10M13 3L3 13"/>
      </svg>`,
      insert: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 8h8M8 5l3 3-3 3"/><path d="M13 3v10"/>
      </svg>`,
      edit: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z"/>
      </svg>`,
      trash: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.5 4h11M6 4V2.5h4V4M6.5 7v5M9.5 7v5M3.5 4l.8 9.5h7.4l.8-9.5"/>
      </svg>`,
      empty: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="8" y="14" width="32" height="26" rx="3"/><path d="M16 14V10a2 2 0 012-2h12a2 2 0 012 2v4"/>
        <path d="M18 26h12M18 32h8"/>
      </svg>`,
    },

    _buildTrigger() {
      this.triggerBtn = document.createElement('button');
      this.triggerBtn.id = 'cf-prompt-trigger';
      this.triggerBtn.title = '提示詞庫 (Ctrl+Shift+P)';
      this.triggerBtn.innerHTML = this._icons.vault;
      this.triggerBtn.addEventListener('click', () => this.toggle());
      document.body.appendChild(this.triggerBtn);

      _makeDraggable(this.triggerBtn, 'cf_prompt_pos', { relativeTo: 'bottom-right' });
    },

    _buildOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.id = 'cf-prompt-overlay';
      this.overlay.innerHTML = `
        <div class="cfpm-modal">
          <!-- 主畫面 -->
          <div class="cfpm-main">
            <div class="cfpm-header">
              <div class="cfpm-header-left">
                <div class="cfpm-header-icon">${this._icons.vault}</div>
                <span class="cfpm-title">提示詞庫</span>
                <span class="cfpm-count-badge">0</span>
              </div>
              <div class="cfpm-header-right">
                <button class="cfpm-btn-new">${this._icons.plus}<span>新增提示詞</span></button>
                <button class="cfpm-close" title="關閉">${this._icons.close}</button>
              </div>
            </div>
            <div class="cfpm-search-bar">
              <div class="cfpm-search-wrap">
                <span class="cfpm-search-icon">${this._icons.search}</span>
                <input class="cfpm-search" placeholder="搜尋提示詞標題或內容…" type="search" autocomplete="off">
              </div>
            </div>
            <ul class="cfpm-list"></ul>
          </div>
          <!-- 編輯面板（覆蓋在主畫面上） -->
          <div class="cfpm-edit-panel cfpm-edit-hidden">
            <div class="cfpm-edit-header">
              <span class="cfpm-edit-title-bar">新增提示詞</span>
              <div class="cfpm-edit-header-btns">
                <button class="cfpm-edit-cancel">取消</button>
                <button class="cfpm-edit-save">儲存</button>
              </div>
            </div>
            <div class="cfpm-edit-body">
              <div class="cfpm-field">
                <label>標題</label>
                <input class="cfpm-edit-name" type="text" placeholder="為這個提示詞起個名字…" autocomplete="off">
              </div>
              <div class="cfpm-field">
                <label>內容</label>
                <textarea class="cfpm-edit-content" placeholder="在這裡輸入提示詞內容…"></textarea>
              </div>
              <div class="cfpm-field">
                <label>標籤 <span class="cfpm-field-hint">（逗號分隔，可留空）</span></label>
                <input class="cfpm-edit-tags" type="text" placeholder="例：寫作, 程式, 翻譯">
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(this.overlay);

      // 主畫面事件
      this.overlay.querySelector('.cfpm-close').addEventListener('click', () => this.close());
      this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
      this.overlay.querySelector('.cfpm-search').addEventListener('input', (e) => {
        this._searchQuery = e.target.value;
        this._renderList();
      });
      this.overlay.querySelector('.cfpm-btn-new').addEventListener('click', () => this._showEditPanel(null));

      // 編輯面板事件
      this.overlay.querySelector('.cfpm-edit-cancel').addEventListener('click', () => this._hideEditPanel());
      this.overlay.querySelector('.cfpm-edit-save').addEventListener('click', () => this._saveEditPanel());
    },

    _renderList() {
      const list = this.overlay.querySelector('.cfpm-list');
      const badge = this.overlay.querySelector('.cfpm-count-badge');
      const q = this._searchQuery.toLowerCase();
      const filtered = q
        ? this.prompts.filter(p =>
            p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) ||
            (p.tags || []).some(t => t.toLowerCase().includes(q)))
        : this.prompts;

      badge.textContent = this.prompts.length;
      list.innerHTML = '';

      if (!filtered.length) {
        const li = document.createElement('li');
        li.className = 'cfpm-empty';
        li.innerHTML = `${this._icons.empty}<span>${q ? '找不到符合的提示詞' : '尚無提示詞，點擊「新增提示詞」開始建立！'}</span>`;
        list.appendChild(li);
        return;
      }

      filtered.forEach(p => {
        const li = document.createElement('li');
        li.className = 'cfpm-item';
        const tagsHtml = (p.tags || []).map(t => `<span class="cfpm-tag">${escapeHtml(t)}</span>`).join('');
        const usage = p.usageCount > 0 ? `<span class="cfpm-usage">已使用 ${p.usageCount} 次</span>` : '';
        li.innerHTML = `
          <div class="cfpm-item-body">
            <div class="cfpm-item-title">${escapeHtml(p.title)}</div>
            <div class="cfpm-item-preview">${escapeHtml(p.content)}</div>
            ${tagsHtml || usage ? `<div class="cfpm-item-footer">${tagsHtml}${usage}</div>` : ''}
          </div>
          <div class="cfpm-item-actions">
            <button class="cfpm-btn-use" title="插入到輸入框">${this._icons.insert}<span>插入</span></button>
            <button class="cfpm-btn-edit" title="編輯">${this._icons.edit}</button>
            <button class="cfpm-btn-del" title="刪除">${this._icons.trash}</button>
          </div>
        `;
        li.querySelector('.cfpm-btn-use').addEventListener('click', () => this._insertPrompt(p));
        li.querySelector('.cfpm-btn-edit').addEventListener('click', () => this._showEditPanel(p));
        li.querySelector('.cfpm-btn-del').addEventListener('click', () => this._deletePrompt(p.id, li));
        list.appendChild(li);
      });
    },

    _showEditPanel(p) {
      const panel = this.overlay.querySelector('.cfpm-edit-panel');
      const titleBar = panel.querySelector('.cfpm-edit-title-bar');
      const nameInput = panel.querySelector('.cfpm-edit-name');
      const contentArea = panel.querySelector('.cfpm-edit-content');
      const tagsInput = panel.querySelector('.cfpm-edit-tags');

      this._editingId = p ? p.id : null;
      titleBar.textContent = p ? '編輯提示詞' : '新增提示詞';
      nameInput.value = p ? p.title : '';
      contentArea.value = p ? p.content : '';
      tagsInput.value = p ? (p.tags || []).join(', ') : '';

      panel.classList.remove('cfpm-edit-hidden');
      setTimeout(() => nameInput.focus(), 50);
    },

    _hideEditPanel() {
      this.overlay.querySelector('.cfpm-edit-panel').classList.add('cfpm-edit-hidden');
      this._editingId = null;
    },

    async _saveEditPanel() {
      const panel = this.overlay.querySelector('.cfpm-edit-panel');
      const title = panel.querySelector('.cfpm-edit-name').value.trim();
      const content = panel.querySelector('.cfpm-edit-content').value.trim();
      const tagsRaw = panel.querySelector('.cfpm-edit-tags').value.trim();

      if (!title) { panel.querySelector('.cfpm-edit-name').focus(); return; }
      if (!content) { panel.querySelector('.cfpm-edit-content').focus(); return; }

      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

      if (this._editingId) {
        const p = this.prompts.find(x => x.id === this._editingId);
        if (p) { p.title = title; p.content = content; p.tags = tags; }
      } else {
        this.prompts.unshift({ id: uuid(), title, content, tags, usageCount: 0, createdAt: Date.now() });
      }

      await Storage.setLocal({ cf_prompts: this.prompts });
      this._hideEditPanel();
      this._renderList();
    },

    _insertPrompt(p) {
      const input = Selectors.findInput();
      if (!input) return;

      if (input.tagName === 'DIV') {
        input.focus();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, p.content);
      } else {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement?.prototype || {}, 'value')?.set;
        if (setter) setter.call(input, p.content);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      p.usageCount = (p.usageCount || 0) + 1;
      Storage.setLocal({ cf_prompts: this.prompts });
      this.close();
    },

    _deletePrompt(id, li) {
      // 輕量動畫後刪除
      li.style.cssText = 'opacity:0;transform:translateX(12px);transition:opacity .2s,transform .2s;pointer-events:none;';
      setTimeout(async () => {
        this.prompts = this.prompts.filter(p => p.id !== id);
        await Storage.setLocal({ cf_prompts: this.prompts });
        this._renderList();
      }, 200);
    },

    toggle() {
      if (this.overlay.classList.contains('cfpm-open')) {
        this.close();
      } else {
        this._reloadAndOpen();
      }
    },

    async _reloadAndOpen() {
      await this._reloadPrompts();
      this._searchQuery = '';
      this.overlay.querySelector('.cfpm-search').value = '';
      this._hideEditPanel();
      this.overlay.classList.add('cfpm-open');
      this._renderList();
      setTimeout(() => this.overlay.querySelector('.cfpm-search')?.focus(), 60);
    },

    close() {
      this.overlay.classList.remove('cfpm-open');
      this._hideEditPanel();
    },

    open() { this._reloadAndOpen(); }
  };

  // ═══════════════════════════════════════════════════════════════
  //  ExportModule — 對話匯出
  // ═══════════════════════════════════════════════════════════════

  const ExportModule = {
    _exportBtn: null,

    init() {
      if (SettingsManager.get('exportPanelEnabled')) {
        this._buildBtn();
      }
      EventBus.on('settings:changed', (data) => {
        if (data.key === 'exportPanelEnabled') {
          if (data.value) this._buildBtn();
          else if (this._exportBtn) this._exportBtn.remove();
        }
      });
    },

    _buildBtn() {
      this._exportBtn = document.createElement('div');
      this._exportBtn.id = 'cf-export-bar';
      this._exportBtn.innerHTML = `
        <button class="vex-btn" data-fmt="json" title="匯出 JSON">JSON</button>
        <button class="vex-btn" data-fmt="md"   title="匯出 Markdown">MD</button>
      `;
      document.body.appendChild(this._exportBtn);
      _makeDraggable(this._exportBtn, 'cf_export_pos', { relativeTo: 'bottom-right' });
      this._exportBtn.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-fmt]');
        if (btn) this.export(btn.dataset.fmt);
      });
    },

    _collectMessages() {
      const messages = Selectors.findMessages();
      return messages.map((el, i) => ({
        id: el.dataset.msgId || `msg-${i}`,
        role: TimelineModule._resolveRole(el),
        content: el.innerText || el.textContent || ''
      }));
    },

    async export(format) {
      const btns = [...(this._exportBtn?.querySelectorAll('.vex-btn') || [])];
      const origTexts = btns.map(b => b.textContent);

      // 先掃描確保全部訊息已渲染
      btns.forEach(b => { b.disabled = true; b.textContent = '讀取…'; });
      ToastModule.show('正在準備對話內容，請稍候…', 0);
      
      await MessageScanner.scanAll((count) => {
        btns.forEach(b => b.textContent = `${count}則`);
        ToastModule.show(`正在讀取對話內容… (已擷取 ${count} 則)`, 0);
      });
      
      ToastModule.hide();
      ToastModule.show('讀取完成，正在產生檔案…', 2000);
      btns.forEach((b, i) => { b.disabled = false; b.textContent = origTexts[i]; });

      const data = this._collectMessages();
      const title = document.title.replace(' — Gemini', '').trim() || 'conversation';
      const safe = title.replace(/[/\\?%*:|"<>]/g, '_').slice(0, 60);

      if (format === 'json') {
        this._download(`${safe}.json`, JSON.stringify({ title, exportedAt: new Date().toISOString(), messages: data }, null, 2), 'application/json');
      } else if (format === 'md') {
        const md = [`# ${title}`, `> 匯出時間：${new Date().toLocaleString('zh-TW')}`, ''].concat(
          data.map(m => {
            const header = m.role === 'user' ? '**👤 使用者**' : '**🤖 Gemini**';
            return `${header}\n\n${m.content.trim()}\n\n---`;
          })
        ).join('\n');
        this._download(`${safe}.md`, md, 'text/markdown');
      }
    },

    _download(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  QuoteReplyModule — 引用回覆
  // ═══════════════════════════════════════════════════════════════

  const QuoteReplyModule = {
    _tooltip: null,

    init() {
      this._tooltip = document.createElement('div');
      this._tooltip.id = 'cf-quote-tooltip';
      this._tooltip.innerHTML = '💬 引用';
      this._tooltip.style.display = 'none';
      document.body.appendChild(this._tooltip);

      document.addEventListener('mouseup', (e) => {
        // 點擊 tooltip 本身時，不重新觸發（selection 已由 preventDefault 保留）
        if (this._tooltip.contains(e.target)) return;
        this._onMouseUp();
      });
      document.addEventListener('mousedown', (e) => {
        if (!this._tooltip.contains(e.target)) this._hide();
      });
      // mousedown preventDefault：防止點擊 tooltip 時清除文字選取 & 移走焦點
      this._tooltip.addEventListener('mousedown', (e) => e.preventDefault());
      this._tooltip.addEventListener('click', () => this._insertQuote());
    },

    _onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { this._hide(); return; }
      const text = sel.toString().trim();
      if (!text || text.length < 3) { this._hide(); return; }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      this._selectedText = text;

      this._tooltip.style.display = 'block';
      this._tooltip.style.top = `${window.scrollY + rect.top - 40}px`;
      this._tooltip.style.left = `${window.scrollX + rect.left + rect.width / 2 - 30}px`;
    },

    _hide() {
      this._tooltip.style.display = 'none';
      this._selectedText = '';
    },

    _insertQuote() {
      if (!this._selectedText) return;
      const input = Selectors.findInput();
      if (!input) return;
      
      // 使用 \n\n 結尾，保持引用後的空白行
      const quote = this._selectedText.split('\n').map(l => `> ${l}`).join('\n') + '\n\n';

      input.focus();

      if (input.tagName === 'DIV') {
        // 優先使用 execCommand('insertText')，這能讓富文本編輯器正確處理換行與撤銷(Undo)
        // 且不會造成注音輸入法(IME)衝突或出現奇怪的換行字元
        try {
          document.execCommand('insertText', false, quote);
        } catch (err) {
          // 備援方案：如果 execCommand 失敗，則 fallback 到較安全的插入策略
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(quote));
            range.collapse(false);
          }
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const pos = input.selectionEnd || input.value.length;
        const val = input.value || '';
        input.value = val.slice(0, pos) + quote + val.slice(pos);
        input.selectionStart = input.selectionEnd = pos + quote.length;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      this._hide();
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  FormulaCopyModule — 公式複製
  // ═══════════════════════════════════════════════════════════════

  const FormulaCopyModule = {
    init() {
      EventBus.on('messages:updated', () => this._processAll());
      this._processAll();
    },

    _processAll() {
      // 優先抓 Gemini 的 .math-block[data-math]（含完整 LaTeX 原始碼）
      // 備援：KaTeX / MathJax 等其他渲染器
      $$('.math-block[data-math], .MathJax, mjx-container').forEach(el => {
        if (el.dataset.chatfolioFormula) return;
        el.dataset.chatfolioFormula = '1';
        el.style.cursor = 'pointer';
        el.title = '點擊複製 LaTeX';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const latex = el.dataset.math                                          // Gemini: data-math
            || el.dataset.mathTex                                                // 其他: data-math-tex
            || el.getAttribute('data-latex')                                     // 其他: data-latex
            || el.querySelector('annotation[encoding*="tex"]')?.textContent     // MathML annotation
            || el.textContent;                                                   // 備援：純文字
          navigator.clipboard.writeText(latex?.trim() || '').then(() => {
            const tip = document.createElement('span');
            tip.textContent = '已複製！';
            tip.className = 'cf-copy-tip';
            el.appendChild(tip);
            setTimeout(() => tip.remove(), 1500);
          });
        });
      });
    }
  };


  // ═══════════════════════════════════════════════════════════════
  //  DOMObserver — 監聽 Gemini DOM 變化
  // ═══════════════════════════════════════════════════════════════

  const DOMObserver = {
    _observer: null,
    _routeObserver: null,
    _titleObserver: null,
    _titleRetryTimer: null,
    _titleRetryToken: 0,
    _titleRepairInProgress: false,
    _titleRepairTimer: null,
    _titleRepairAttempts: 0,
    _titleRepairDonePath: '',
    _lastRepairPath: '',
    _lastRepairAt: 0,
    _frozenSidebarTitle: '',
    _frozenSidebarPath: '',
    _confirmedPageTitle: '',
    _lastPath: '',
    _lastTitle: '',
    _msgCount: 0,

    init() {
      this._lastPath  = location.pathname;
      this._lastTitle = document.title;
      this._startObserver();
      this._startRouteObserver();
      this._startTitleObserver();
      // 初次載入：捲動側邊欄到當前對話，觸發 Gemini 渲染頂部標題
      this._scrollSidebarToActive();
      [800, 1800, 3200].forEach(delay => this._scheduleTitleRepair(`init-${delay}`, delay));
    },

    _startObserver() {
      const onMutations = debounce(() => {
        const messages = Selectors.findMessages();
        if (messages.length !== this._msgCount) {
          this._msgCount = messages.length;
          EventBus.emit('messages:updated', { count: messages.length });
        }
        // 更新原生側邊欄中的已分類標記
        if (typeof CategorizedMarkModule !== 'undefined') CategorizedMarkModule.refreshMarks();
      }, 300);

      this._observer = new MutationObserver(onMutations);
      this._observer.observe(document.body, { childList: true, subtree: true });
    },

    _startRouteObserver() {
      // 監聽 SPA 路由切換
      this._routeObserver = new MutationObserver(debounce(() => {
        if (location.pathname !== this._lastPath) {
          this._lastPath  = location.pathname;
          this._lastTitle = document.title;
          this._msgCount  = 0;
          EventBus.emit('route:changed', { path: location.pathname });
          // 路由切換時先隱藏時間軸，等待訊息載入後再判斷是否顯示
          TimelineModule._setVisible(false);
          TimelineModule.nodes = [];
          if (TimelineModule.nodeList) TimelineModule.nodeList.innerHTML = '';
          // 重新初始化模組（多次嘗試，因 Gemini SPA 非同步載入內容）
          [500, 1500, 3000].forEach(delay => setTimeout(() => {
            TimelineModule._processAll();
             if (SettingsManager.get('formulaCopyEnabled')) FormulaCopyModule._processAll();
            // 標題穩定後同步資料夾對話名稱
            this._syncTabTitle();
            this._scheduleTitleRepair(`route-${delay}`, 0);
            FolderPathModule.update();
          }, delay));
          // 捲動側邊欄至當前對話項目，觸發 Gemini lazy-render 頂部標題
          this._scrollSidebarToActive();
        }
      }, 200));
      this._routeObserver.observe(document.head, { childList: true, subtree: false });
    },

    // 監聽 <title> 元素內容變動，自動更新資料夾中儲存的對話名稱
    _startTitleObserver() {
      const titleEl = document.querySelector('title');
      if (!titleEl) return;
      this._titleObserver = new MutationObserver(debounce(() => {
        if (document.title !== this._lastTitle) {
          this._lastTitle = document.title;
           this._syncTabTitle();
        }
        this._scheduleTitleRepair('title-observer', 1400);
        FolderPathModule.update();
      }, 800));
      this._titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    },

    // [Phase 3-1] Deleted obsolete empty sync methods

    _getConversationId() {
      return getConversationIdFromUrl(location.href);
    },

    _getConversationPathKey(urlLike) {
      if (!urlLike) return '';
      try {
        return new URL(urlLike, location.origin).pathname.replace(/\/+$/, '');
      } catch {
        return '';
      }
    },

    /* _resetTitleState removed */

    _isAbnormalConversationTitle(title) {
      const text = normalizeConversationTitle(title || '');
      if (!text) return true;
      if (isGenericConversationTitle(text)) return true;
      return text.length <= 2;
    },

    _hasUsableConversationTitle() {
      const headerTitle = this._getNativeHeaderText(this._getHeaderTitleHost());
      const pageTitle = normalizeConversationTitle(document.title);
      const confirmedTitle = normalizeConversationTitle(this._getConfirmedPageTitle());
      return [headerTitle, pageTitle, confirmedTitle].some(title => !this._isAbnormalConversationTitle(title));
    },

    _getConversationRenderRoot() {
      return document.querySelector('#chat-history')
        || document.querySelector('chat-window-content')
        || document.querySelector('chat-window')
        || document.querySelector('.main-content');
    },

    _isConversationRendered() {
      if (!TimelineModule._isConversationPage()) return true;
      const root = this._getConversationRenderRoot();
      if (!root) return false;

      // 1. 檢查主視窗訊息
      const messages = Selectors.findMessages();
      if (!messages.length) return false;

      // 2. 檢查主視窗是否還在繁忙中 (Spinner, aria-busy)
      const busyNode = root.querySelector(
        '[aria-busy="true"], .processing-state-visible[aria-busy="true"], ' +
        '[data-test-id="loading-history-spinner"], [data-test-id="loading-content-spinner"], ' +
        'mat-progress-spinner, mat-spinner'
      );
      // 必須是「可見」的轉圈圈才視為繁忙
      if (busyNode && busyNode.getBoundingClientRect().height > 0) return false;

      const latestModel = [...messages].reverse().find(el => el.tagName?.toLowerCase() === 'model-response');
      if (latestModel?.querySelector?.('[aria-busy="true"]')) return false;

      // 3. 檢查側邊欄載入狀態 (防止 Title Repair 在側邊欄未就緒前執行)
      const sidebar = document.querySelector('mat-sidenav, nav, [class*="sidenav"]');
      if (sidebar && sidebar.getBoundingClientRect().width > 100) {
        const sidebarBusy = sidebar.querySelector('mat-progress-spinner, mat-spinner, [data-test-id*="spinner"]');
        if (sidebarBusy && sidebarBusy.getBoundingClientRect().height > 0) return false;
      }

      return true;
    },

    async _waitForConversationRendered(timeoutMs = 5000, stableMs = 400) {
      const startedAt = Date.now();
      let stableStartedAt = 0;
      let lastSignature = '';

      while (Date.now() - startedAt < timeoutMs) {
        const root = this._getConversationRenderRoot();
        const messages = Selectors.findMessages();
        const signature = [
          messages.length,
          root?.scrollHeight || 0,
          root?.clientHeight || 0,
          normalizeConversationTitle(document.title),
          normalizeConversationTitle(this._getNativeHeaderText(this._getHeaderTitleHost()))
        ].join('|');

        if (this._isConversationRendered()) {
          if (signature !== lastSignature) {
            lastSignature = signature;
            stableStartedAt = Date.now();
          } else if (stableStartedAt && Date.now() - stableStartedAt >= stableMs) {
            return true;
          }
        } else {
          stableStartedAt = 0;
          lastSignature = signature;
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return this._isConversationRendered();
    },



    _isSidebarCollapsed() {
      const sidenav = document.querySelector('mat-sidenav, bard-sidenav, side-navigation-v2, .side-navigation-v2-container, nav');
      if (!sidenav) return true;

      // 優先檢查：是否能看到對話歷史列表
      const list = sidenav.querySelector('conversations-list, .conversations-container, side-navigation-content, .side-navigation-content');
      if (list) {
        const rect = list.getBoundingClientRect();
        // 增加判斷可見性：如果寬度小於 150px (圖示模式) 或隱藏，視為收合
        if (rect.width > 150 && rect.height > 100) return false;
      }

      // 次要檢查：容器寬度
      const rect = sidenav.getBoundingClientRect();
      // 在圖示模式下寬度通常在 60-80px，展開後應為 250-300px
      return rect.width < 150;
    },

    async _ensureSidebarOpen() {
      if (!this._isSidebarCollapsed()) return true;

      // 1. 嘗試常見的 aria-label 選擇器
      const selectors = [
        'button[aria-label*="主選單"]',
        'button[aria-label*="選單"]',
        'button[aria-label*="Main menu"]',
        'button[aria-label*="Menu"]',
        'button[data-test-id="side-nav-toggle"]',
        '.side-nav-toggle-button',
        'mat-toolbar button:first-child' // 備援：頂部工具欄第一個按鈕通常是 Hamburger
      ];
      
      let toggle = null;
      for (const sel of selectors) {
        toggle = document.querySelector(sel);
        if (toggle && toggle.getBoundingClientRect().width > 0) break;
      }

      if (toggle) {
        toggle.click();
        // 等待展開動畫與歷史清單載入
        await new Promise(r => setTimeout(r, 700));
        return !this._isSidebarCollapsed();
      }
      return false;
    },

    _scheduleTitleRepair(reason = 'unknown', delay = 0) {
      const currentPath = this._getConversationPathKey(location.href);
      if (!currentPath) return;
      if (!SettingsManager.get('titleRepairEnabled')) return;
      if (this._titleRepairInProgress) return;
      if (this._titleRepairDonePath === currentPath) return;
      if (this._titleRepairTimer) clearTimeout(this._titleRepairTimer);

      this._titleRepairTimer = setTimeout(() => {
        this._titleRepairTimer = null;
        this._attemptTitleRepair(reason);
      }, Math.max(0, delay));
    },



    async _loadSidebarHistoryInChunks(retryLimit) {
      // 執行自動讀取標題時，如果發現側邊欄收合，則先強制開啟
      await this._ensureSidebarOpen();
      // 同時確保「對話」分組是展開狀態，否則掃描不到 DOM
      await NativeSidebarModule.expandSection('對話');
      const scroller = this._findSidebarScroller();
      if (!scroller) return false;

      let obtained = false;

      while (this._titleRepairAttempts < retryLimit) {
        if (this._cancelTitleRepairRequested) break;

        const pass = this._titleRepairAttempts;
        this._titleRepairAttempts += 1;

        // 更新 UI 提示文字
        this._setTitleRepairIndicator(
          true,
          `正在獲取對話視窗的標籤... (第 ${pass + 1} 個區塊)`,
          true
        );

        // 執行捲動：自動拉到最底
        scroller.scrollTop = scroller.scrollHeight;

        // 等待載入並確認標題是否出現
        await new Promise(resolve => setTimeout(resolve, 600));
        
        this._lastTitle = document.title;
        this._syncTabTitle();
        if (this._hasUsableConversationTitle()) {
          obtained = true;
          break;
        }

        // 額外的短暫緩衝
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      return obtained;
    },



    _findMatchingSidebarConversationLink() {
      const sidebar = document.querySelector('mat-sidenav') || document.querySelector('nav');
      if (!sidebar) return null;

      const currentPath = this._getConversationPathKey(location.href);
      if (!currentPath) return null;

      return [...sidebar.querySelectorAll('a[href]')].find(a => {
        if (a.closest('#cf-folders') || a.closest('#cf-timeline')) return false;
        const hrefPath = this._getConversationPathKey(a.href || a.getAttribute('href'));
        return hrefPath && hrefPath === currentPath;
      }) || null;
    },

    _getSidebarConversationTitle() {
      const link = this._findMatchingSidebarConversationLink();
      const text = normalizeConversationTitle(link?.textContent || '');
      return isGenericConversationTitle(text) ? '' : text;
    },

    _getStableSidebarConversationTitle() {
      const currentPath = this._getConversationPathKey(location.href);
      const liveTitle = this._getSidebarConversationTitle();

      if (this._frozenSidebarPath !== currentPath) {
        this._frozenSidebarPath = currentPath;
        this._frozenSidebarTitle = liveTitle || '';
        return this._frozenSidebarTitle;
      }

      if (liveTitle) {
        if (!this._frozenSidebarTitle) {
          this._frozenSidebarTitle = liveTitle;
        } else if (this._confirmedPageTitle) {
          this._frozenSidebarTitle = liveTitle;
        }
      }

      return this._frozenSidebarTitle || liveTitle || '';
    },

    _getConfirmedPageTitle() {
      const docTitle = normalizeConversationTitle(document.title);
      if (!shouldSkipConversationNameUpdate(docTitle)) {
        this._confirmedPageTitle = docTitle;
        return docTitle;
      }

      const nativeTitle = normalizeConversationTitle(this._getNativeHeaderText(this._getHeaderTitleHost()));
      if (!shouldSkipConversationNameUpdate(nativeTitle)) {
        this._confirmedPageTitle = nativeTitle;
        return nativeTitle;
      }

      return this._confirmedPageTitle || '';
    },

    _getStoredConversationTitle() {
      const convId = this._getConversationId();
      if (!convId || !FolderModule?.folders?.length) return '';

      for (const folder of FolderModule.folders) {
        const stored = folder._convNames?.[convId];
        if (!shouldSkipConversationNameUpdate(stored)) {
          return String(stored).trim().slice(0, 60);
        }
      }

      return '';
    },

    _getResolvedConversationTitle() {
      const confirmedPageTitle = this._getConfirmedPageTitle();
      if (!isGenericConversationTitle(confirmedPageTitle)) return confirmedPageTitle;

      const fromStoredName = this._getStoredConversationTitle();
      if (!isGenericConversationTitle(fromStoredName)) return fromStoredName;

      const fromSidebarLink = this._getStableSidebarConversationTitle();
      if (!isGenericConversationTitle(fromSidebarLink)) return fromSidebarLink;

      const convId = this._getConversationId();
      if (!convId) return '';

      const sidebar = document.querySelector('mat-sidenav') || document.querySelector('nav');
      if (!sidebar) return '';

      const candidates = [];
      const selectedNode = sidebar.querySelector(
        '[aria-current="page"], [aria-selected="true"], .selected, .active, [class*="selected"]'
      );
      if (selectedNode) candidates.push(selectedNode);

      const link = this._findMatchingSidebarConversationLink()
        || [...sidebar.querySelectorAll(`a[href*="${convId}"]`)]
          .find(a => !a.closest('#cf-folders') && !a.closest('#cf-timeline'));
      if (link) candidates.push(link);

      const textNode = [...sidebar.querySelectorAll('*')]
        .find(el => {
          if (el.closest('#cf-folders') || el.closest('#cf-timeline')) return false;
          if (!el.textContent?.trim()) return false;
          const href = el.getAttribute?.('href') || el.closest('a')?.getAttribute?.('href') || '';
          return href.includes(convId);
        });
      if (textNode) candidates.push(textNode);

      for (const node of candidates) {
        const text = normalizeConversationTitle(node?.textContent || '');
        if (!isGenericConversationTitle(text)) return text;
      }

      return '';
    },

    _getHeaderTitleHost() {
      return document.querySelector('.center-section');
    },



    _getNativeHeaderText(host) {
      if (!host) return '';
      return [...host.childNodes]
        .filter(node => !(node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('cf-page-title-fallback')))
        .map(node => node.textContent || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    },

    _getPreferredDisplayedConversationTitle() {
      const confirmedPageTitle = this._getConfirmedPageTitle();
      if (!isGenericConversationTitle(confirmedPageTitle)) return confirmedPageTitle;
      const storedName = this._getStoredConversationTitle();
      if (!isGenericConversationTitle(storedName)) return storedName;
      return this._getStableSidebarConversationTitle();
    },

    /* _syncPageTitleFallback removed */



    _findScroller(fromEl, boundary) {
      // 確保搜尋對象嚴格限制在側邊欄內，防止誤觸主對話視窗
      if (boundary && (boundary.closest('.chat-history') || boundary.closest('chat-window'))) {
        return null;
      }

      let el = fromEl;
      while (el && el !== boundary && el !== document.body) {
        const ov = getComputedStyle(el).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && el.scrollHeight > el.clientHeight + 20) {
          // 排除主對話區域的捲軸
          if (el.closest('.chat-history') || el.closest('chat-window')) {
            el = el.parentElement;
            continue;
          }
          return el;
        }
        el = el.parentElement;
      }
      // 備援：boundary 本身往下找第一個真正可 scroll 的子元素
      if (boundary) {
        const children = boundary.querySelectorAll('*');
        for (const child of children) {
          // 排除主對話區域
          if (child.closest('.chat-history') || child.closest('chat-window')) continue;
          
          const ov = getComputedStyle(child).overflowY;
          if ((ov === 'auto' || ov === 'scroll') && child.scrollHeight > child.clientHeight + 20) {
            return child;
          }
        }
      }
      return null;
    },


    _scrollSidebarToActive() {
      const convId = this._getConversationId();
      if (!convId) return;

      const _attempt = () => {
        // 標題已出現則停止
        const center = document.querySelector('.center-section');
        if (center?.textContent?.trim()) return true;

        // 在 Gemini 原生側邊欄中找對話連結
        const sidenav = document.querySelector('mat-sidenav, bard-sidenav, side-navigation-v2, .side-navigation-v2-container, nav');
        if (!sidenav) return false;

        const link = [...sidenav.querySelectorAll(`a[href*="${convId}"]`)]
          .find(a => !a.closest('#cf-folders') && !a.closest('#cf-timeline'));
        if (!link) return false;

        const scroller = this._findScroller(link.parentElement, sidenav);
        if (!scroller) return false;

        // getBoundingClientRect + scrollTop：不依賴 offsetParent 鏈，最可靠
        const linkRect     = link.getBoundingClientRect();
        const scrollerRect = scroller.getBoundingClientRect();
        // 連結在 scroller 可捲動內容中的絕對位置
        const linkAbsTop   = scroller.scrollTop + linkRect.top - scrollerRect.top;
        // 置中顯示
        const target = linkAbsTop - (scroller.clientHeight - link.clientHeight) / 2;
        scroller.scrollTop = Math.max(0, target);
        return true;
      };

      [100, 500, 1000, 2000, 3500, 6000].forEach(d => setTimeout(_attempt, d));
    },

    // 將目前頁面 URL 對應的對話名稱同步到資料夾中
    _syncTabTitle() {
      if (!SettingsManager.get('foldersEnabled')) return;
      const convId = this._getConversationId();
      if (!convId) return;

      // 優先從三個來源獲取名稱：自訂名稱、側邊欄、或目前的 document.title
      const titleCandidate = normalizeConversationTitle(document.title);
      const sidebarCandidate = this._getStableSidebarConversationTitle();
      
      const newName = (!isGenericConversationTitle(titleCandidate)) ? titleCandidate 
                    : (!isGenericConversationTitle(sidebarCandidate) ? sidebarCandidate : '');

      if (!newName || isGenericConversationTitle(newName)) return;

      // 在所有資料夾中尋找此對話，若名稱有變或舊名稱無效才更新
      let changed = false;
      FolderModule.folders.forEach(f => {
        if (f.conversationIds?.includes(convId)) {
          const old = f._convNames?.[convId];
          if (old !== newName || isGenericConversationTitle(old)) {
            if (!f._convNames) f._convNames = {};
            f._convNames[convId] = newName;
            f.updatedAt = Date.now();
            changed = true;
          }
        }
      });
      if (changed) FolderModule._save();
    },

    _getTitleRepairRetryLimit() {
      const raw = Number(SettingsManager.get('titleRepairMaxRetries'));
      const normalized = (Number.isFinite(raw) && raw >= 0 && raw <= 100) ? raw : 3;
      return normalized === 0 ? Number.POSITIVE_INFINITY : normalized;
    },



    async _showTitleRepairOutcome(text) {
      this._setTitleRepairIndicator(true, text);
      await new Promise(resolve => setTimeout(resolve, 1200));
    },

    _cancelTitleRepairRequested: false,

    _ensureTitleRepairIndicator() {
      let styleEl = document.getElementById('cf-title-repair-style');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'cf-title-repair-style';
        styleEl.textContent = `
          #cf-title-repair-indicator{
            position:fixed;
            top:18px;
            left:50%;
            transform:translateX(-50%);
            z-index:2147483000;
            display:none;
            align-items:center;
            gap:8px;
            padding:8px 14px;
            border-radius:999px;
            font:500 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;
            color:#e8edf7;
            background:rgba(35,42,58,.92);
            border:1px solid rgba(255,255,255,.12);
            box-shadow:0 10px 30px rgba(0,0,0,.24);
            backdrop-filter:blur(10px);
            white-space:nowrap;
          }
          #cf-title-repair-indicator.cf-visible{
            display:inline-flex;
          }
          #cf-title-repair-indicator .cf-title-repair-dot{
            width:8px;
            height:8px;
            border-radius:50%;
            background:#7ab7ff;
            box-shadow:0 0 0 0 rgba(122,183,255,.7);
            animation:cf-title-repair-pulse 1.2s ease-out infinite;
            flex:0 0 auto;
          }
          #cf-title-repair-indicator .cf-title-repair-stop{
            display:none;
            border:0;
            border-radius:999px;
            padding:5px 10px;
            font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
            color:#f7fbff;
            background:rgba(255,255,255,.14);
            cursor:pointer;
          }
          #cf-title-repair-indicator .cf-title-repair-stop:hover{
            background:rgba(255,255,255,.22);
          }
          #cf-title-repair-indicator .cf-title-repair-stop:disabled{
            opacity:.6;
            cursor:default;
          }
          #cf-title-repair-indicator.cf-running .cf-title-repair-stop{
            display:inline-flex;
            align-items:center;
            justify-content:center;
          }
          @keyframes cf-title-repair-pulse{
            0%{transform:scale(.9);box-shadow:0 0 0 0 rgba(122,183,255,.65)}
            70%{transform:scale(1);box-shadow:0 0 0 8px rgba(122,183,255,0)}
            100%{transform:scale(.9);box-shadow:0 0 0 0 rgba(122,183,255,0)}
          }
        `;
        document.head.appendChild(styleEl);
      }
  
      let indicator = document.getElementById('cf-title-repair-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'cf-title-repair-indicator';
        indicator.innerHTML = `
          <span class="cf-title-repair-dot"></span>
          <span class="cf-title-repair-text">正在讀取更多歷史標題區塊…</span>
          <button type="button" class="cf-title-repair-stop">停止</button>
        `;
        const stopBtn = indicator.querySelector('.cf-title-repair-stop');
        stopBtn?.addEventListener('click', () => {
          if (!this._titleRepairInProgress) return;
          this._cancelTitleRepairRequested = true;
          stopBtn.disabled = true;
          this._setTitleRepairIndicator(true, '正在停止自動讀取標題…', false);
        });
        document.body.appendChild(indicator);
      }
      return indicator;
    },

    _setTitleRepairIndicator(visible, text = '正在讀取更多歷史標題區塊…', showStop = false) {
      const indicator = this._ensureTitleRepairIndicator();
      const textEl = indicator.querySelector('.cf-title-repair-text');
      const stopBtn = indicator.querySelector('.cf-title-repair-stop');
      if (textEl) textEl.textContent = text;
      if (stopBtn) stopBtn.disabled = false;
      indicator.classList.toggle('cf-visible', !!visible);
      indicator.classList.toggle('cf-running', !!visible && !!showStop);
    },

    async _attemptTitleRepair(reason = 'unknown') {
      const path = location.pathname;
      if (path === '/app' || path === '/app/') return false;
      if (path.startsWith('/mystuff')) return false;
      if (path.startsWith('/notebook')) return false;
      if (path === '/gems/view' || path === '/gems/view/') return false;
      if (path.startsWith('/gem/')) {
        const parts = path.split('/').filter(Boolean);
        if (parts.length < 2) return false;
      }

      const convId = this._getConversationId();
      const currentPath = this._getConversationPathKey(location.href);
      const retryLimit = this._getTitleRepairRetryLimit();
      if (!convId || !currentPath) return false;
      if (!SettingsManager.get('titleRepairEnabled')) return false;
      if (this._titleRepairInProgress) return false;
  
      const now = Date.now();
      if (this._lastRepairPath !== currentPath) {
        this._lastRepairPath = currentPath;
        this._titleRepairAttempts = 0;
        this._titleRepairDonePath = '';
      }
      if (this._titleRepairAttempts >= retryLimit) return false;
      if (now - this._lastRepairAt < 1200) return false;
      if (this._hasUsableConversationTitle()) return false;
  
      this._titleRepairInProgress = true;
      this._cancelTitleRepairRequested = false;
      this._lastRepairAt = now;
  
      let obtainedTitle = false;
      let exhaustedWithoutTitle = false;
      let cancelledByUser = false;
  
      try {
        const rendered = await this._waitForConversationRendered(5000, 400);
        if (!rendered) {
          console.warn('[ChatFolio] title repair aborted: conversation not fully rendered', reason);
          return false;
        }
  
        await new Promise(resolve => setTimeout(resolve, 500));
        this._lastTitle = document.title;
        this._syncTabTitle();
        if (this._hasUsableConversationTitle()) {
          this._titleRepairDonePath = currentPath;
          obtainedTitle = true;
          return true;
        }
  
        await new Promise(resolve => setTimeout(resolve, 350));
  
        // 執行側邊欄自動捲動掃描
        obtainedTitle = await this._loadSidebarHistoryInChunks(retryLimit);
        
        if (obtainedTitle) {
          this._titleRepairDonePath = currentPath;
          return true;
        }
        
        if (this._cancelTitleRepairRequested) {
          cancelledByUser = true;
          return false;
        }
  
        exhaustedWithoutTitle = true;
        return false;
      } catch (error) {
        console.warn('[ChatFolio] title repair failed:', reason, error);
        return false;
      } finally {
        if (obtainedTitle) {
          await this._showTitleRepairOutcome('已成功取得對話標題');
        } else if (cancelledByUser) {
          await this._showTitleRepairOutcome('已停止自動讀取標題');
        } else if (exhaustedWithoutTitle) {
          await this._showTitleRepairOutcome('暫時無法取得對話標題');
        }
        
        // 結束後（不論結果），將側邊欄捲軸回到最頂部
        const scroller = this._findSidebarScroller();
        if (scroller) scroller.scrollTop = 0;

        this._cancelTitleRepairRequested = false;
        this._setTitleRepairIndicator(false);
        this._titleRepairInProgress = false;
      }
    },

    _findSidebarScroller() {
      const sidenav = document.querySelector('mat-sidenav, bard-sidenav, side-navigation-v2, .side-navigation-v2-container, nav');
      if (!sidenav) return null;
      for (const child of sidenav.querySelectorAll('*')) {
        const ov = getComputedStyle(child).overflowY;
        if ((ov === 'auto' || ov === 'scroll') && child.scrollHeight > child.clientHeight + 2) {
          return child;
        }
      }
      return null;
    },
  };

  // ═══════════════════════════════════════════════════════════════
  //  KeyboardShortcuts — 快捷鍵
  // ═══════════════════════════════════════════════════════════════

  // [Phase 3-3b/c] Relocated DOMObserver auxiliary methods and UI indicators to internal object properties.

  const KeyboardShortcuts = {
    init() {
      document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        if (!e.shiftKey) return;

        switch (e.key.toUpperCase()) {
          case 'L':
            e.preventDefault();
            TimelineModule.toggleExpand();
            break;
          case 'P':
            e.preventDefault();
            PromptVaultModule.toggle();
            break;
          case 'E':
            e.preventDefault();
            ExportModule.export('md');
            break;
          case 'F':
            e.preventDefault();
            // 資料夾快速選擇器（未來實作）
            break;
        }
      });

      // Esc 關閉所有 ChatFolio 浮層
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          PromptVaultModule.close();
          document.getElementById('cffld-selector')?.remove();
        }
      });
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  跨分頁訊息接收
  // ═══════════════════════════════════════════════════════════════

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'BROADCAST_STAR') {
      TimelineModule._starredSet = new Set(
        Object.keys(msg.starredMessages || {}).filter(k => msg.starredMessages[k])
      );
      TimelineModule._processAll();
    }
    if (msg.type === 'BROADCAST_SETTINGS') {
      const oldSettings = { ...SettingsManager._settings };
      SettingsManager._settings = Object.assign(SettingsManager._settings, msg.settings);
      const newSettings = SettingsManager.getAll();
      CustomizerModule.apply(newSettings);
      
      // 動態更新 Export 面板狀態
      if (oldSettings.exportPanelEnabled !== newSettings.exportPanelEnabled) {
        if (newSettings.exportPanelEnabled) ExportModule._buildBtn();
        else if (ExportModule._exportBtn) ExportModule._exportBtn.remove();
      }

      // 時間軸開關
      if (oldSettings.timelineEnabled !== newSettings.timelineEnabled) {
        if (newSettings.timelineEnabled) {
          if (!TimelineModule.panel) TimelineModule.init();
          else TimelineModule._processAll();
        } else if (TimelineModule.panel) {
          TimelineModule._setVisible(false);
        }
      }

      // 資料夾開關 (同步考慮浮動狀態)
      if (oldSettings.foldersEnabled !== newSettings.foldersEnabled) {
        if (newSettings.foldersEnabled) {
          if (!FolderModule.panel) FolderModule.init();
          else FolderModule.panel.style.display = 'flex';
        } else if (FolderModule.panel) {
          FolderModule.panel.style.display = 'none';
        }
      }

      // 提示詞開關
      if (oldSettings.promptVaultEnabled !== newSettings.promptVaultEnabled) {
        const trigger = document.getElementById('cf-prompt-trigger');
        if (newSettings.promptVaultEnabled) {
          if (!trigger) PromptVaultModule.init();
          else trigger.style.display = 'flex';
        } else if (trigger) {
          trigger.style.display = 'none';
        }
      }

      if (typeof FolderModule !== 'undefined' && FolderModule.panel && !FolderModule.panel.hidden) {
        FolderModule._applyFloatingState();
      }
    }
    if (msg.type === 'QUOTE_SELECTION' && msg.text) {
      QuoteReplyModule._selectedText = msg.text;
      QuoteReplyModule._insertQuote();
    }
    if (msg.type === 'SAVE_PROMPT_FROM_SELECTION' && msg.text) {
      const title = prompt('提示詞標題：', msg.text.slice(0, 30));
      if (title) {
        PromptVaultModule.prompts.unshift({
          id: uuid(), title: title.trim(), content: msg.text,
          tags: [], usageCount: 0, platforms: ['gemini'],
          createdAt: Date.now()
        });
        PromptVaultModule._save();
      }
    }
    // Popup 快速操作
    if (msg.type === 'TOGGLE_TIMELINE') TimelineModule.toggleExpand();
    if (msg.type === 'OPEN_PROMPT_VAULT') PromptVaultModule.open();
    if (msg.type === 'EXPORT') ExportModule.export(msg.format || 'md');
    
    if (msg.type === 'GET_THEME') {
      if (typeof sendResponse === 'function') {
        sendResponse(DarkModeModule._isDark() ? 'dark' : 'light');
      }
    }

    return false;
  });

  // ═══════════════════════════════════════════════════════════════
  //  DarkModeModule — 深色模式偵測與套用
  // ═══════════════════════════════════════════════════════════════

  const DarkModeModule = {
    init() {
      this._apply();
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this._apply());
      const obs = new MutationObserver(() => this._apply());
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    },

    _apply() {
      document.documentElement.classList.toggle('cf-dark', this._isDark());
    },

    _isDark() {
      // 1. 優先以頁面實際背景亮度判斷（Gemini 切主題時直接反映，覆蓋 OS 偏好）
      const getLum = el => {
        const bg = window.getComputedStyle(el).backgroundColor;
        if (!bg || bg === 'transparent') return null;
        const m = bg.match(/[\d.]+/g)?.map(Number);
        if (!m || m.length < 3) return null;
        // 透明（alpha = 0）時跳過
        if (m.length >= 4 && m[3] < 0.05) return null;
        return (m[0] + m[1] + m[2]) / 3;
      };
      const lum = getLum(document.body) ?? getLum(document.documentElement);
      if (lum !== null) {
        if (lum > 150) return false; // 明確淺色 → light
        if (lum <  80) return true;  // 明確深色 → dark
      }
      // 2. class / data-theme 關鍵字
      const cls = document.documentElement.className + ' ' + document.body.className;
      if (/\bdark\b|dark-theme|theme-dark/.test(cls)) return true;
      if (['dark'].includes(document.documentElement.getAttribute('data-theme'))) return true;
      if (['dark'].includes(document.body.getAttribute('data-theme'))) return true;
      // 3. OS 偏好（fallback，僅當 Gemini 主題不明確時才使用）
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  ConvMenuModule — 對話右鍵選單注入「加入資料夾」
  // ═══════════════════════════════════════════════════════════════

  const ConvMenuModule = {
    _lastLink: null,
    _lastMenuContext: '',

    init() {
      // 追蹤最後互動的對話元素
      // 問題：Gemini 側欄的 <a href> 和 ⋮ 按鈕是兄弟元素，closest() 找不到連結
      // 解法：向上走訪 DOM，找包含對話 URL 連結的最近容器，並記錄該連結
      document.addEventListener('mousedown', (e) => {
        if (e.target.closest('.cdk-overlay-container')) return; // 忽略彈出層內的點擊
        const trigger = e.target.closest('button, [role="button"], a');
        // 只針對側邊欄的對話清單進行追蹤（排除 bot-actions-menu 與 project-list-item-menu）
        const sidebarConv = trigger?.closest('conversations-list, .conversations-container, a[href*="/app/"], a[href*="/gem/"]');
        const isExcluded  = trigger?.closest('bot-actions-menu, project-list-item-menu, .notebook-item');
        
        if (sidebarConv && !isExcluded) {
          this._lastMenuContext = 'sidebar-conversation';
        } else {
          this._lastMenuContext = '';
        }
        let el = e.target;
        for (let depth = 0; depth < 10 && el && el !== document.body; depth++, el = el.parentElement) {
          // 容器本身就是連結
          if (el.tagName === 'A' && el.href) {
            if (/\/[a-zA-Z0-9_-]{8,}/.test(el.href)) { this._lastLink = el; return; }
          }
          // 容器內有對話連結（link 與 ⋮ 按鈕是兄弟）
          const link = el.querySelector('a[href]');
          if (link && /\/[a-zA-Z0-9_-]{8,}/.test(link.href)) {
            this._lastLink = link;
            return;
          }
        }
      }, true);

      // Gemini 不使用 role="menu"，改為監聽 addedNodes 直接偵測選單浮層
      const obs = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;
            // 先檢查節點本身
            if (!node.dataset.cfr && this._isConvMenu(node)) {
              node.dataset.cfr = '1';
              setTimeout(() => this._inject(node), 0);
              continue;
            }
            // 再檢查子孫節點（Gemini 有時在外層 portal 內包一層容器）
            const found = [...node.querySelectorAll('*')].find(
              el => !el.dataset.cfr && this._isConvMenu(el)
            );
            if (found) {
              found.dataset.cfr = '1';
              setTimeout(() => this._inject(found), 0);
            }
          }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    },

    _isConvMenu(el) {
      // 直接比對 Gemini Angular Material 對話選單（有 role="menu"）
      if (el.getAttribute('role') !== 'menu') return false;
      const t = el.textContent;
      return (t.includes('重新命名') || t.includes('釘選')) && t.length < 1000;
    },

    _inject(menu) {
      // _lastLink 由 mousedown 走訪 DOM 設定，是最可靠的來源
      // 若 _lastLink 未設定，才改用選單位置推算
      if (this._lastMenuContext !== 'sidebar-conversation') return;
      // 側邊欄注入必須嚴格鎖定該項目資訊，不應隨意套用當前活動頁面的對話 ID
      const convInfo = this._getConvInfo() || this._getConvInfoFromMenuPos(menu);
      if (!convInfo?.convId) return;

      // Gemini Angular Material：項目在 mat-mdc-menu-content 裡，不是直接在 [role="menu"] 下
      const container = menu.querySelector('.mat-mdc-menu-content') || menu;
      const docTitle = normalizeConversationTitle(document.title);
      const headerTitle = normalizeConversationTitle(
        document.querySelector('.center-section')?.textContent || ''
      );
      const pageTitle = !isGenericConversationTitle(docTitle) ? docTitle : headerTitle;
      if (!pageTitle || /^(Google\s+)?(Gemini|AI\s+Studio)$/i.test(pageTitle)) return;
      const items = [...container.querySelectorAll('[role="menuitem"],button.mat-mdc-menu-item')];

      // mat-icon 會在 textContent 裡加入圖示名稱（如 "delete"），需用 span.gds-body-m 取純文字
      const getLabel = el => {
        const s = el.querySelector('span.gds-body-m') || el.querySelector('span.mat-mdc-menu-item-text span');
        return (s?.textContent || el.textContent).trim();
      };
      const delItem = items.find(el => getLabel(el) === '刪除' || getLabel(el) === '删除');

      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;background:rgba(128,128,128,.2);margin:4px 0;';

      // 用 button 以匹配 Gemini 原生項目，並複製 class
      const item = document.createElement('button');
      item.setAttribute('role', 'menuitem');
      item.setAttribute('tabindex', '0');
      item.className = 'voyger-conv-menu-item';
      if (items[0]?.className) {
        items[0].className.split(' ')
          .filter(c => c && !c.startsWith('ng-') && c !== 'ng-star-inserted')
          .forEach(c => item.classList.add(c));
      }
      item.innerHTML = `
        <span style="font-size:16px;margin-right:8px;display:flex;align-items:center">📁</span>
        <span class="mat-mdc-menu-item-text">
          <span class="gds-body-m">加入資料夾</span>
        </span>`;

      item.addEventListener('mouseenter', () => item.style.background = 'rgba(128,128,128,.12)');
      item.addEventListener('mouseleave', () => item.style.background = '');
      item.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        // 使用注入時已擷取的 convInfo，不再重新呼叫 _getConvInfo()
        const { convId, convName, convUrl } = convInfo;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        setTimeout(() => FolderModule.showFolderSelector(convId, convName, convUrl), 120);
      });

      if (delItem) {
        container.insertBefore(divider, delItem);
        container.insertBefore(item, delItem);
      } else {
        container.appendChild(divider);
        container.appendChild(item);
      }
    },

    // 從選單出現的螢幕位置，找 Y 座標最接近的側邊欄對話連結
    _getConvInfoFromMenuPos(menu) {
      // CDK bounding-box 的 inset style 第一個值為 top（px）
      const bbox = menu.closest('.cdk-overlay-connected-position-bounding-box');
      let menuY = 0;
      if (bbox?.style.inset) {
        menuY = parseFloat(bbox.style.inset) || 0;   // "520px auto auto 260px" → 520
      }
      if (!menuY) {
        menuY = menu.getBoundingClientRect().top;
      }
      if (!menuY) return null;

      // 找所有包含對話 ID 的連結（排除 CDK overlay 內的連結）
      const links = [...document.querySelectorAll('a[href]')].filter(a => {
        if (a.closest('.cdk-overlay-container')) return false;
        return /\/[a-zA-Z0-9_-]{8,}/.test(a.href) && a.getBoundingClientRect().height > 0;
      });
      if (!links.length) return null;

      // 找垂直距離最近的連結
      links.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return Math.abs((ra.top + ra.bottom) / 2 - menuY) -
               Math.abs((rb.top + rb.bottom) / 2 - menuY);
      });

      const link = links[0];
      const convId  = getConversationIdFromUrl(link.href);
      if (!convId) return null;
      const convUrl = link.href;
      const clone   = link.cloneNode(true);
      clone.querySelectorAll('button,[role="button"],mat-icon,.mat-icon,svg').forEach(e => e.remove());
      const convName = clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) || convId;
      return { convId, convName, convUrl };
    },

    _getConvInfo() {
      // 優先用 mousedown 時記錄的 _lastLink（由 DOM walk-up 取得，最精確）
      const link = this._lastLink;
      if (!link?.href) return null;

      const convId  = getConversationIdFromUrl(link.href);
      if (!convId) return null;
      const convUrl = link.href;
      const clone   = link.cloneNode(true);
      clone.querySelectorAll('button,[role="button"],mat-icon,.mat-icon,svg').forEach(el => el.remove());
      const convName = clone.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) || convId;
      return { convId, convName, convUrl };
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  NativeSidebarModule — 收合原生側邊欄區塊
  // ═══════════════════════════════════════════════════════════════

  const NativeSidebarModule = {
    _sections: ['筆記本', 'Gem', '對話'],
    _collapsedState: {},

    async expandSection(name) {
      this._collapsedState[name] = false;
      await Storage.setLocal({ cf_sidebar_collapsed: this._collapsedState });
      
      // 先執行一次掃描，確保 DOM 節點已被識別並加上屬性
      this._applyAll();

      // 強制移除 DOM 上的收合類名
      const sec = document.querySelector(`[data-cf-section-name="${name}"]`);
      if (sec) sec.classList.remove('cf-nat-collapsed');
      
      await new Promise(r => setTimeout(r, 450)); // 等待收合動畫結束
    },

    async init() {
      const { cf_sidebar_collapsed } = await Storage.getLocal('cf_sidebar_collapsed');
      this._collapsedState = cf_sidebar_collapsed || {};
      
      this._applyAll();
      // 持續檢查（Gemini 的 Angular 可能會無預警重繪 DOM）
      setInterval(() => this._applyAll(), 2500);
    },

    _applyAll() {
      const sidebar = document.querySelector('nav, mat-sidenav, [class*="sidenav"], [class*="side-nav"], [class*="sidebar"]');
      if (!sidebar) return;

      this._sections.forEach(name => this._processSection(sidebar, name));
    },

    _processSection(sidebar, name) {
      // 1. 找包含該名稱的「最末端」文字元素 (排除隱藏或空元素)
      let textEl = null;
      const all = sidebar.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.children.length === 0 && el.textContent.trim() === name && el.getBoundingClientRect().height > 0) {
          // 如果該元素所在標頭已經有按鈕，則視為已處理
          const existingHeader = el.closest('[data-cf-header]');
          if (existingHeader && existingHeader.querySelector('.cf-nat-collapse-btn')) {
             continue;
          }
          textEl = el;
          break;
        }
      }
      if (!textEl) return;

      // 2. 向上找 Header 容器
      let header = textEl.parentElement;
      while (header && header.parentElement && header.parentElement !== sidebar && 
             header.parentElement.children.length < 2) {
        header = header.parentElement;
      }
      if (!header) return;

      // 3. 向外找 Section 總容器 (包含 Header 與 List)
      let section = header.parentElement;
      if (!section || section === sidebar) return;
      
      header.setAttribute('data-cf-header', 'true');
      const style = window.getComputedStyle(header);
      if (style.display !== 'flex') {
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.gap = '4px';
      }

      // 4. 重複檢查與清理
      const existingBtn = header.querySelector('.cf-nat-collapse-btn');
      if (existingBtn) {
         if (this._collapsedState[name]) section.classList.add('cf-nat-collapsed');
         else section.classList.remove('cf-nat-collapsed');
         return;
      }

      const btn = document.createElement('button');
      btn.className = 'cf-nat-collapse-btn';
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4 4 4-4"/></svg>`;
      btn.title = `收合／展開 ${name}`;

      header.insertBefore(btn, header.firstChild);

      if (this._collapsedState[name]) {
        section.classList.add('cf-nat-collapsed');
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        const isCollapsed = section.classList.toggle('cf-nat-collapsed');
        this._collapsedState[name] = isCollapsed;
        Storage.setLocal({ cf_sidebar_collapsed: this._collapsedState });
      });

      section.classList.add('cf-nat-section');
      section.setAttribute('data-cf-section-name', name);

      if (name === 'Gem') {
        this._updateGemVisibility(section);
      }
    },

    _updateGemVisibility(section) {
      const max = SettingsManager.get('gemMaxItems') || 10;
      // 1. 找尋 Gem 連結項目 (a[href*="/gem/"])
      //    Gemini 通常會把 a 包在 div 或 li 裡面
      const items = [...section.querySelectorAll('a[href*="/gem/"]')];
      if (items.length === 0) return;

      items.forEach((item, idx) => {
        const isVisible = idx < max;
        // 向上尋找最接近 section 的頂層列表項容器
        let entry = item;
        while (entry.parentElement && entry.parentElement !== section && 
               !entry.parentElement.classList.contains('cf-nat-section')) {
          entry = entry.parentElement;
        }

        if (isVisible) {
          entry.style.display = '';
          entry.style.visibility = 'visible';
          entry.style.maxHeight = 'none';
        } else {
          entry.style.display = 'none';
        }
      });

      // 2. 自動點擊「顯示更多」按鈕（如果存在且數量不夠）
      const moreBtn = section.querySelector('button[aria-label*="更多"], button[aria-label*="More"]');
      if (moreBtn && items.length < max && moreBtn.offsetParent !== null) {
        moreBtn.click();
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  NativeDeletionModule — 監聽原生刪除動作並同步
  // ═══════════════════════════════════════════════════════════════

  const NativeDeletionModule = {
    init() {
      // 監聽全局點擊，捕捉對話框中的「刪除」按鈕
      document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        
        const text = btn.textContent.trim();
        // 捕捉常見的刪除確認按鈕文字
        if (text === '刪除' || text === 'Delete' || text === 'Confirm') {
          // 檢查是否位於對話框中且內容包含「刪除對話」相關字眼
          const dialog = btn.closest('mat-dialog-container, [role="dialog"], .dialog-container');
          if (dialog) {
            const content = dialog.textContent || '';
            if (content.includes('刪除') || content.includes('Delete')) {
               this._handleNativeDelete();
            }
          }
        }
      }, true);
    },

    _handleNativeDelete() {
      // 檢查使用者是否啟用了同步刪除設定
      if (!SettingsManager.get('syncDeleteEnabled')) return;

      // 取得當前 URL 中的對話 ID
      const convId = FolderPathModule._getConversationId();
      if (!convId) return;

      console.log(`[ChatFolio] 偵測到原生刪除動作，同步移除資料夾快取: ${convId}`);
      
      let changed = false;
      if (FolderModule && FolderModule.folders) {
        FolderModule.folders.forEach(f => {
          if (f.conversationIds?.includes(convId)) {
            f.conversationIds = f.conversationIds.filter(id => id !== convId);
            if (f._convNames) delete f._convNames[convId];
            if (f._convUrls) delete f._convUrls[convId];
            changed = true;
          }
        });
      }

      if (changed) {
        FolderModule._save();
      }
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  App.init — 主要初始化流程
  // ═══════════════════════════════════════════════════════════════

  async function init() {
    // 等待 DOM 就緒
    if (document.readyState === 'loading') {
      await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    }

    // AI Studio 不啟用任何 ChatFolio 功能
    if (PLATFORM === 'aistudio') return;

    // 載入設定
    const settings = await SettingsManager.load();

    // 深色模式（最先偵測）
    DarkModeModule.init();

    // 客製化樣式
    CustomizerModule.init(settings);

    // 時間軸
    if (settings.timelineEnabled) {
      await TimelineModule.init();
    }

    // 資料夾
    if (settings.foldersEnabled) await FolderModule.init();

    // 提示詞庫
    if (settings.promptVaultEnabled) await PromptVaultModule.init();

    // 引用回覆
    if (settings.quoteReplyEnabled) QuoteReplyModule.init();

    // 頂部路徑顯示
    FolderPathModule.init();

    // 匯出
    ExportModule.init();

    // 公式複製
    if (settings.formulaCopyEnabled) FormulaCopyModule.init();

    // 快捷鍵
    KeyboardShortcuts.init();

    // 對話右鍵選單注入
    ConvMenuModule.init();

    // DOM 觀察器
    DOMObserver.init();

    // 原生側邊欄收合
    NativeSidebarModule.init();

    // 原生刪除同步
    NativeDeletionModule.init();

    console.log('[ChatFolio] AI Chat Enhancer 已載入 ✓');
  }

  // ═══════════════════════════════════════════════════════════════
  //  CategorizedMarkModule — 在原生側邊欄標記已分類的對話
  // ═══════════════════════════════════════════════════════════════
  const CategorizedMarkModule = {
    _categorizedIds: new Set(),

    updateIndex() {
      const ids = new Set();
      if (FolderModule && FolderModule.folders) {
        FolderModule.folders.forEach(f => {
          if (f.conversationIds) {
            f.conversationIds.forEach(id => ids.add(id));
          }
        });
      }
      this._categorizedIds = ids;
      this.refreshMarks();
    },

    refreshMarks() {
      // 檢查設定開關
      if (!SettingsManager.get('categorizedMarkEnabled')) {
        // 如果關閉，移除現有標記
        document.querySelectorAll('.cf-cat-mark').forEach(el => el.remove());
        return;
      }

      const links = document.querySelectorAll('a[href*="/app/"]');
      links.forEach(link => {
        if (link.closest('#cf-folders') || link.closest('#cf-timeline') || link.closest('#cffld-selector')) return;
        const convId = getConversationIdFromUrl(link.href || link.getAttribute('href'));
        if (!convId) return;

        const hasMark = link.querySelector('.cf-cat-mark');
        const isCategorized = this._categorizedIds.has(convId);

        if (isCategorized) {
          if (!hasMark) this._injectMark(link);
        } else if (hasMark) {
          hasMark.remove();
        }
      });
    },

    _injectMark(link) {
      // 找尋文字容器 (Gemini 的結構可能包含多層 span/div)
      const textNode = link.querySelector('span, div[class*="text"], div[class*="title"]');
      if (!textNode) return;

      const mark = document.createElement('span');
      mark.className = 'cf-cat-mark';
      mark.textContent = '📁';
      mark.title = '此對話已分類至 ChatFolio 資料夾中';
      mark.style.cssText = 'margin-right: 6px; font-size: 0.9em; filter: grayscale(0.2);';
      
      textNode.prepend(mark);
    }
  };

  init();

})();
