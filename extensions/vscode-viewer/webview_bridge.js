// VS Code Webview Host Bridge for WeaveMX UI (zero polling, zero localhost HTTP)
(function() {
  function createWeaveHostBridge(options) {
    if (options !== undefined && (typeof options !== 'object' || options === null || Array.isArray(options))) {
      throw new TypeError('CRITICAL: createWeaveHostBridge options must be a plain object');
    }
    const opts = options || {};
    const vscodeApi = opts.vscodeApi || (typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null);
    if (!vscodeApi || typeof vscodeApi.postMessage !== 'function') {
      throw new Error('CRITICAL: VS Code Webview API (acquireVsCodeApi) is unavailable');
    }

    const boot = opts.bootConfig || (typeof window !== 'undefined' && window.__WEAVEMX_BOOT__ ? window.__WEAVEMX_BOOT__ : {});
    const listeners = new Set();
    const memoryState = {};

    const storage = {
      getItem(key) {
        if (typeof key !== 'string' || !key) return null;
        try {
          if (typeof vscodeApi.getState === 'function') {
            const st = vscodeApi.getState();
            if (st && typeof st === 'object' && Object.prototype.hasOwnProperty.call(st, key)) {
              return st[key];
            }
          }
        } catch {
          // ignore webview state errors
        }
        return Object.prototype.hasOwnProperty.call(memoryState, key) ? memoryState[key] : null;
      },
      setItem(key, val) {
        if (typeof key !== 'string' || !key) return;
        const strVal = String(val);
        memoryState[key] = strVal;
        try {
          if (typeof vscodeApi.getState === 'function' && typeof vscodeApi.setState === 'function') {
            const prev = vscodeApi.getState() || {};
            vscodeApi.setState(Object.assign({}, prev, { [key]: strVal }));
          }
        } catch {
          // ignore webview state errors
        }
      }
    };

    const storedTheme = storage.getItem('weavemx-ui-theme');
    const defaultTheme = (storedTheme === 'light' || storedTheme === 'dark')
      ? storedTheme
      : (boot.initialTheme === 'light' ? 'light' : 'dark');
    if (typeof document !== 'undefined' && document.documentElement) {
      if (typeof document.documentElement.setAttribute === 'function') {
        document.documentElement.setAttribute('data-theme', defaultTheme);
      }
      if (document.documentElement.style) {
        document.documentElement.style.colorScheme = defaultTheme;
      }
    }

    function handleHostMessage(event) {
      const msg = event && event.data ? event.data : null;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'pipelineUpdate' && msg.payload && typeof msg.payload === 'object') {
        listeners.forEach((fn) => {
          try {
            fn(msg.payload);
          } catch (err) {
            console.error('[weavemx-viewer] listener error:', err);
          }
        });
      } else if (msg.type === 'theme-change') {
        if (typeof window !== 'undefined' && window.HeaderBar && typeof window.HeaderBar.handleThemeMessage === 'function') {
          window.HeaderBar.handleThemeMessage(event);
        } else if (msg.theme === 'light' || msg.theme === 'dark') {
          if (typeof document !== 'undefined' && document.documentElement) {
            if (typeof document.documentElement.removeAttribute === 'function') {
              document.documentElement.removeAttribute('data-theme-override');
            }
            if (typeof document.documentElement.setAttribute === 'function') {
              document.documentElement.setAttribute('data-theme', msg.theme);
            }
            if (document.documentElement.dataset) {
              document.documentElement.dataset.theme = msg.theme;
            }
            if (document.documentElement.style) {
              document.documentElement.style.colorScheme = msg.theme;
            }
          }
        }
      }
    }

    const win = opts.windowObj || (typeof window !== 'undefined' ? window : null);
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('message', handleHostMessage);
    }

    return {
      initialPayload: boot.initialPayload || null,
      initialContextDir: boot.initialContextDir || null,
      storage,
      onPipelineUpdate(listener) {
        if (typeof listener !== 'function') {
          throw new TypeError('CRITICAL: onPipelineUpdate requires a function listener');
        }
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      notifyReady(contextDir) {
        vscodeApi.postMessage({ type: 'ready', contextDir: contextDir || null });
      },
      requestPipeline(contextDir) {
        vscodeApi.postMessage({ type: 'requestPipeline', contextDir: contextDir || null });
      },
      selectContext(contextDir) {
        if (typeof contextDir !== 'string' || !contextDir.trim()) {
          throw new TypeError('CRITICAL: selectContext requires a non-empty contextDir string');
        }
        vscodeApi.postMessage({ type: 'selectContext', contextDir: contextDir.trim() });
      },
      viewRawMarkdown(contextDir) {
        vscodeApi.postMessage({ type: 'viewRawMarkdown', contextDir: contextDir || null });
      },
      openConversation(conversationId) {
        if (typeof conversationId !== 'string' || !conversationId.trim()) return;
        vscodeApi.postMessage({ type: 'openConversation', conversationId: conversationId.trim() });
      },
      _handleHostMessage: handleHostMessage
    };
  }

  if (typeof window !== 'undefined' && typeof acquireVsCodeApi === 'function') {
    window.WeaveHostBridge = createWeaveHostBridge();
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createWeaveHostBridge };
  }
})();
