// ui.js — Rendering, navigation, modal, toasts
(function () {
  const { db, getSetting } = window.duitkuDB;

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));

  const fmtMoney = (n, currency = 'IDR') => {
    const v = +n || 0;
    try {
      return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
    } catch (e) {
      return currency + ' ' + v.toLocaleString('id-ID');
    }
  };
  const fmtDate = (d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const fmtDateShort = (d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
  };
  const monthKey = (d) => {
    const dt = new Date(d);
    return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
  };
  const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth   = (d = new Date()) => new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999);

  // ---------- TOASTS ----------
  function toast(msg, kind = 'info') {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ---------- SHEET ----------
  function openSheet(html) {
    $('#sheet-content').innerHTML = html;
    $('#sheet').classList.add('open');
    $('#sheet-backdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (navigator.vibrate) navigator.vibrate(8);
  }
  function closeSheet() {
    $('#sheet').classList.remove('open');
    $('#sheet-backdrop').classList.remove('open');
    document.body.style.overflow = '';
  }
  $('#sheet-backdrop').addEventListener('click', closeSheet);

  // ---------- ROUTING ----------
  let currentScreen = 'home';
  let currentProjectId = null;
  const screenRenderers = {};
  function registerScreen(name, fn) { screenRenderers[name] = fn; }
  async function navigate(name, params = {}) {
    currentScreen = name;
    if (params.projectId !== undefined) currentProjectId = params.projectId;
    $$('.bottom-nav button, .sidebar button').forEach(b => {
      b.classList.toggle('active', b.dataset.nav === name);
    });
    const root = $('#screen-root');
    root.innerHTML = '<div class="screen"><div class="skel" style="height:200px;"></div></div>';
    if (screenRenderers[name]) {
      try {
        const html = await screenRenderers[name](params);
        root.innerHTML = html;
        if (typeof root._afterRender === 'function') {
          root._afterRender();
          root._afterRender = null;
        }
        // fire post-render hook
        document.dispatchEvent(new CustomEvent('screen:rendered', { detail: { name, params } }));
      } catch (e) {
        console.error(e);
        root.innerHTML = '<div class="screen"><div class="empty"><div class="emoji">😅</div><p>Gagal memuat. Coba lagi.</p></div></div>';
      }
    }
  }

  // Bind nav buttons
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-nav]');
    if (btn) { navigate(btn.dataset.nav); }
  });

  // ---------- POST-RENDER HOOK ----------
  function setAfterRender(fn) { $('#screen-root')._afterRender = fn; }

  // ---------- ICONS ----------
  function txTypeIcon(type) {
    return type === 'income' ? '💰' : type === 'transfer' ? '🔁' : '🛍️';
  }

  // Expose
  window.duitkuUI = {
    $, $$, escapeHtml, fmtMoney, fmtDate, fmtDateShort, monthKey,
    startOfMonth, endOfMonth,
    toast, openSheet, closeSheet,
    registerScreen, navigate, setAfterRender,
    getCurrentScreen: () => currentScreen,
    getCurrentProjectId: () => currentProjectId,
    setCurrentProjectId: (id) => { currentProjectId = id; },
    txTypeIcon
  };
})();
