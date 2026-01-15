/**
 * PicLet Shared GUI Utilities
 */
(function() {
  // DOM helper
  function $(id) {
    return document.getElementById(id);
  }

  // Logging helper
  function log(container, type, msg) {
    const el = typeof container === 'string' ? $(container) : container;
    el.classList.add('on');
    el.innerHTML += `<p class="${type}">${msg}</p>`;
    el.scrollTop = el.scrollHeight;
  }

  // Fetch JSON helper
  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Invalid JSON response:', text.substring(0, 200));
      throw new Error('Server returned invalid response');
    }
  }

  // POST JSON helper
  async function postJson(url, data) {
    return fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  // Close window via API
  function close() {
    fetch('/api/close', { method: 'POST' }).finally(() => window.close());
  }

  // Open URL in default browser
  function openUrl(url) {
    fetch('/api/open-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
  }

  // Initialize window
  function init(opts = {}) {
    const w = opts.width || 320;
    const h = opts.height || 280;

    // Center on available screen (excludes taskbar)
    const x = Math.round((screen.availWidth - w) / 2) + (screen.availLeft || 0);
    const y = Math.round((screen.availHeight - h) / 2) + (screen.availTop || 0);
    window.moveTo(x, y);
    window.resizeTo(w, h);

    // Reset zoom
    document.documentElement.style.zoom = '100%';

    // Disable context menu
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  // Export to global
  window.PicLet = { $, log, fetchJson, postJson, close, openUrl, init };

  // Auto-init on DOMContentLoaded if data attributes present
  document.addEventListener('DOMContentLoaded', () => {
    const html = document.documentElement;
    if (html.dataset.piclet !== undefined) {
      init({
        width: parseInt(html.dataset.width) || undefined,
        height: parseInt(html.dataset.height) || undefined
      });
    }
  });
})();
