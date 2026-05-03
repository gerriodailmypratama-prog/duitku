// app.js — Main application logic
(function () {
  const { db, dbInit, dbSeedSample, dbClearAll, dbClearSampleData, getSetting, setSetting, recomputeAccountBalances, uid } = window.duitkuDB;
  const UI = window.duitkuUI;
  const { $, $$, escapeHtml, fmtMoney, fmtDate, fmtDateShort, monthKey, startOfMonth, endOfMonth, toast, openSheet, closeSheet, registerScreen, navigate, setAfterRender } = UI;

  // ---------- STATE ----------
  let mainCurrency = 'IDR';
  let projectScopeId = null; // null = daily life

  // ---------- BOOT ----------
  async function boot() {
    await dbInit();
    // theme + accent
    const theme  = await getSetting('theme', 'auto');
    const accent = await getSetting('accent', 'violet');
    applyTheme(theme); applyAccent(accent);

    const user = await db.user.toCollection().first();
    mainCurrency = user?.mainCurrency || (await getSetting('mainCurrency', 'IDR'));

    // PIN lock?
    const pin = await getSetting('pin', null);
    if (pin) await showPinLock(pin);

    if (!user) {
      showOnboarding();
    } else {
      // Initial nav from URL params
      const params = new URLSearchParams(location.search);
      const screen = params.get('screen') || 'home';
      const action = params.get('action');
      navigate(screen);
      if (action === 'add') setTimeout(openTransactionSheet, 300);
      // Recurring + budget alerts (run in background)
      processRecurring().catch(()=>{});
      checkBudgetAlerts().catch(()=>{});
    }

    // FAB
    $('#fab').addEventListener('click', () => openTransactionSheet());
    // Update SW
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        toast('App diperbarui — refresh untuk versi terbaru');
      });
    }
  }

  // ---------- THEME ----------
  function applyTheme(t) {
    if (t === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = t;
    }
  }
  function applyAccent(a) { document.documentElement.dataset.accent = a; }

  // ---------- ONBOARDING ----------
  function showOnboarding() {
    const slides = [
      { e: '💸', h: 'Welcome ke Duitku', p: 'Catat duit lo dengan cepat. Daily life, trip, project — semua di satu app.' },
      { e: '🌍', h: 'Project Mode', p: 'Pisahin tracking trip atau project khusus. Multi-currency dengan custom rate.' },
      { e: '🔒', h: 'Privacy First', p: 'Semua data lokal di device lo. Gak ada akun, gak ada cloud (kecuali lo mau).' }
    ];
    const root = $('#screen-root');
    root.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'onboard';
    overlay.innerHTML = `
      <div class="slides" id="ob-slides">
        ${slides.map((s,i)=>`
          <div class="slide" style="transform: translateX(${i*100}%);" data-i="${i}">
            <div class="big-emoji">${s.e}</div>
            <h2>${s.h}</h2>
            <p>${s.p}</p>
          </div>
        `).join('')}
      </div>
      <div class="dots" id="ob-dots">${slides.map((_,i)=>`<div class="dot ${i===0?'active':''}"></div>`).join('')}</div>
      <div class="card" style="margin-top:16px">
        <div class="field"><label>Nama lo</label><input class="input" id="ob-name" placeholder="Contoh: Gerry"></div>
        <div class="field"><label>Currency utama</label>
          <select class="input" id="ob-cur">
            <option value="IDR">IDR — Indonesian Rupiah</option>
            <option value="USD">USD — US Dollar</option>
            <option value="SGD">SGD — Singapore Dollar</option>
            <option value="MYR">MYR — Malaysian Ringgit</option>
            <option value="EUR">EUR — Euro</option>
            <option value="JPY">JPY — Yen</option>
            <option value="CNY">CNY — Yuan</option>
          </select>
        </div>
        <div class="field"><label>Saldo awal (opsional)</label>
          <input class="input" id="ob-bal" type="number" inputmode="numeric" placeholder="0">
        </div>
        <label class="row" style="font-size:14px; margin: 8px 0"><input type="checkbox" id="ob-sample"> Pakai sample data (untuk demo)</label>
        <button class="btn btn-primary btn-block" id="ob-start">Mulai 🚀</button>
      </div>
    `;
    document.body.appendChild(overlay);

    let idx = 0;
    const slidesEl = overlay.querySelector('#ob-slides');
    function shift() {
      slidesEl.querySelectorAll('.slide').forEach((s,i)=> s.style.transform = `translateX(${(i-idx)*100}%)`);
      overlay.querySelectorAll('#ob-dots .dot').forEach((d,i)=> d.classList.toggle('active', i===idx));
    }
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'ob-start') return;
      idx = (idx + 1) % slides.length; shift();
    });

    overlay.querySelector('#ob-start').addEventListener('click', async () => {
      const name = overlay.querySelector('#ob-name').value.trim() || 'User';
      const cur  = overlay.querySelector('#ob-cur').value;
      const bal  = +overlay.querySelector('#ob-bal').value || 0;
      const sample = overlay.querySelector('#ob-sample').checked;
      mainCurrency = cur;
      await db.user.put({ id: 'me', name, mainCurrency: cur, createdAt: Date.now() });
      await setSetting('mainCurrency', cur);
      // set default account balance (Cash) if provided
      if (bal > 0) {
        const cash = await db.accounts.where({ name: 'Cash' }).first();
        if (cash) { cash.initialBalance = bal; cash.balance = bal; await db.accounts.put(cash); }
      }
      if (sample) await dbSeedSample();
      await recomputeAccountBalances();
      overlay.remove();
      navigate('home');
      toast('Welcome, ' + name + '! 👋');
    });
  }


  // ---------- PIN LOCK ----------
  async function showPinLock(savedPin) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'pinlock';
      wrap.innerHTML = `
        <h2 style="margin:0">🔒 Duitku Locked</h2>
        <p class="muted">Masukkan PIN 6-digit</p>
        <div class="dots" id="pin-dots">${[0,1,2,3,4,5].map(()=>'<div class="dot"></div>').join('')}</div>
        <div class="keypad">
          ${[1,2,3,4,5,6,7,8,9,'⌫',0,'OK'].map(k => `<button data-k="${k}">${k}</button>`).join('')}
        </div>
      `;
      document.body.appendChild(wrap);
      let buf = '';
      const dots = wrap.querySelectorAll('#pin-dots .dot');
      const refresh = () => dots.forEach((d,i)=> d.classList.toggle('f', i < buf.length));
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-k]'); if (!b) return;
        const k = b.dataset.k;
        if (k === '⌫') buf = buf.slice(0, -1);
        else if (k === 'OK' || buf.length === 6) {
          if (buf === savedPin) { wrap.remove(); resolve(); return; }
          else { buf = ''; refresh(); wrap.style.animation = 'shake .2s'; setTimeout(()=> wrap.style.animation='', 200); toast('PIN salah'); return; }
        }
        else if (buf.length < 6) buf += k;
        refresh();
        if (buf.length === 6) {
          if (buf === savedPin) { wrap.remove(); resolve(); }
          else { setTimeout(()=> { buf=''; refresh(); toast('PIN salah'); }, 200); }
        }
      });
    });
  }

  // ---------- TRANSACTION SHEET ----------
  async function openTransactionSheet(existing = null) {
    const accounts   = (await db.accounts.toArray()).filter(a => !a.archived);
    const categories = (await db.categories.toArray()).filter(c => !c.archived);
    const projects   = (await db.projects.toArray()).filter(p => p.status !== 'archived');
    const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    const dateVal = (existing?.date ? new Date(existing.date) : today).toISOString().slice(0,16);
    const type = existing?.type || 'expense';

    const html = `
      <h3 id="sheet-title" style="margin:0 0 10px">${existing ? 'Edit' : 'Tambah'} Transaksi</h3>
      <div class="type-tabs" id="ttabs">
        <button data-t="expense" class="${type==='expense'?'active':''}">Expense</button>
        <button data-t="income"  class="${type==='income' ?'active':''}">Income</button>
        <button data-t="transfer" class="${type==='transfer'?'active':''}">Transfer</button>
      </div>

      <div class="field">
        <label>Jumlah</label>
        <div class="row">
          <select class="input" id="t-cur" style="max-width:110px">
            ${['IDR','USD','SGD','MYR','EUR','JPY','CNY'].map(c => `<option ${c===(existing?.currency||mainCurrency)?'selected':''}>${c}</option>`).join('')}
          </select>
          <input class="input" id="t-amt" type="number" inputmode="decimal" placeholder="0" value="${existing?.amount || ''}">
        </div>
      </div>

      <div class="field" id="cat-wrap">
        <label>Kategori</label>
        <div class="cat-grid" id="cat-grid"></div>
      </div>

      <div class="field" id="acc-wrap">
        <label>Akun</label>
        <select class="input" id="t-acc">
          ${accounts.map(a => `<option value="${a.id}" ${existing?.accountId===a.id?'selected':''}>${a.icon||''} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field hidden" id="acc2-wrap">
        <label>Ke akun</label>
        <select class="input" id="t-acc2">
          ${accounts.map(a => `<option value="${a.id}" ${existing?.toAccountId===a.id?'selected':''}>${a.icon||''} ${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field"><label>Tanggal & Waktu</label>
        <input class="input" id="t-date" type="datetime-local" value="${dateVal}">
      </div>

      ${projects.length ? `<div class="field"><label>Attach to</label>
        <select class="input" id="t-proj">
          <option value="">— Daily Life —</option>
          ${projects.map(p => `<option value="${p.id}" ${existing?.projectId===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>` : ''}

      <div class="field"><label>Keterangan</label>
        <input class="input" id="t-desc" placeholder="Contoh: Makan siang ayam geprek" value="${escapeHtml(existing?.description||'')}">
      </div>

      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="t-del">Hapus</button>` : ''}
        <button class="btn btn-secondary" id="t-cancel">Batal</button>
        <button class="btn btn-primary" id="t-save" style="margin-left:auto">${existing ? 'Update' : 'Simpan'}</button>
      </div>
    `;
    openSheet(html);

    let curType = type;
    let curCat  = existing?.categoryId || null;

    function renderCats() {
      const list = categories.filter(c => c.type === (curType === 'transfer' ? 'expense' : curType));
      $('#cat-grid').innerHTML = list.map(c => `
        <button data-cid="${c.id}" class="${c.id===curCat?'active':''}">
          <span class="ico">${c.icon}</span>
          <span>${escapeHtml(c.name)}</span>
        </button>`).join('');
      $$('#cat-grid button').forEach(b => b.addEventListener('click', () => {
        curCat = b.dataset.cid; renderCats();
      }));
    }
    function applyTypeUI() {
      $('#cat-wrap').classList.toggle('hidden', curType === 'transfer');
      $('#acc2-wrap').classList.toggle('hidden', curType !== 'transfer');
      renderCats();
    }
    applyTypeUI();

    $$('#ttabs button').forEach(b => b.addEventListener('click', () => {
      $$('#ttabs button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      curType = b.dataset.t;
      curCat = null;
      applyTypeUI();
    }));

    $('#t-cancel').addEventListener('click', closeSheet);
    if ($('#t-del')) $('#t-del').addEventListener('click', async () => {
      if (!confirm('Yakin hapus transaksi ini?')) return;
      await db.transactions.delete(existing.id);
      await recomputeAccountBalances();
      toast('Transaksi dihapus');
      closeSheet(); navigate(UI.getCurrentScreen());
    });
    $('#t-save').addEventListener('click', async () => {
      const amt = +$('#t-amt').value;
      if (!amt || amt <= 0) return toast('Jumlah tidak valid');
      if (curType !== 'transfer' && !curCat) return toast('Pilih kategori');
      const cur = $('#t-cur').value;
      const acc = $('#t-acc').value;
      const acc2 = curType === 'transfer' ? $('#t-acc2').value : null;
      if (curType === 'transfer' && acc === acc2) return toast('Akun asal & tujuan harus beda');
      const date = new Date($('#t-date').value || Date.now()).toISOString();
      const desc = $('#t-desc').value.trim();
      const proj = $('#t-proj') ? $('#t-proj').value || null : null;

      const data = {
        id: existing?.id || uid(),
        date, amount: amt, currency: cur,
        amountInMain: amt, // simple v1; project mode handles rate separately
        type: curType,
        categoryId: curType==='transfer' ? null : curCat,
        accountId: acc,
        toAccountId: acc2,
        projectId: proj,
        description: desc,
        createdAt: existing?.createdAt || Date.now()
      };
      await db.transactions.put(data);
      await recomputeAccountBalances();
      if (navigator.vibrate) navigator.vibrate([10,30,10]);
      toast(existing ? 'Transaksi diupdate' : 'Transaksi ditambah');
      closeSheet(); navigate(UI.getCurrentScreen());
    });
  }


  // ---------- HOME SCREEN ----------
  registerScreen('home', async () => {
    const accounts = await db.accounts.toArray();
    const txs = await db.transactions.toArray();
    const totalBal = accounts.filter(a => !a.archived).reduce((a,b) => a + (+b.balance || 0), 0);
    const start = startOfMonth(), end = endOfMonth();
    const mTxs = txs.filter(t => !t.projectId && new Date(t.date) >= start && new Date(t.date) <= end);
    const inc = mTxs.filter(t=>t.type==='income').reduce((a,t)=>a + +t.amount, 0);
    const exp = mTxs.filter(t=>t.type==='expense').reduce((a,t)=>a + +t.amount, 0);
    const recents = txs.filter(t => !t.projectId).sort((a,b)=> new Date(b.date) - new Date(a.date)).slice(0, 8);
    const cats = await db.categories.toArray();
    const accs = accounts;

    // upcoming recurring (7 days)
    const recurring = await db.recurring.where({ active: 1 }).toArray();
    const soon = recurring.filter(r => new Date(r.nextDate) <= new Date(Date.now() + 7*86400000));

    setAfterRender(async () => {
      const cv = $('#cf-canvas');
      if (cv) await window.duitkuCharts.renderCashflow(cv, mTxs);
      const dn = $('#cat-canvas');
      if (dn) await window.duitkuCharts.renderTopCategories(dn, mTxs, cats);
    });

    return `
      <div class="screen">
        <div class="between mt-2">
          <div>
            <div class="muted" style="font-size:13px">Total Saldo</div>
            <div style="font-size:28px;font-weight:800">${fmtMoney(totalBal, mainCurrency)}</div>
          </div>
          <button class="btn btn-secondary" data-nav="profile">⚙️</button>
        </div>

        <div class="stat-grid mt-4">
          <div class="stat-tile"><div class="stat-label">Income (bulan ini)</div><div class="stat-value text-income">${fmtMoney(inc, mainCurrency)}</div></div>
          <div class="stat-tile"><div class="stat-label">Expense (bulan ini)</div><div class="stat-value text-expense">${fmtMoney(exp, mainCurrency)}</div></div>
        </div>

        <div class="card mt-4">
          <div class="between"><strong>Cashflow 30 hari</strong><span class="chip">📈</span></div>
          <div style="height:200px; margin-top:8px"><canvas id="cf-canvas"></canvas></div>
        </div>

        <div class="card mt-4">
          <div class="between"><strong>Top Kategori (bulan ini)</strong></div>
          <div style="height:240px; margin-top:8px"><canvas id="cat-canvas"></canvas></div>
        </div>

        ${soon.length ? `<div class="card mt-4">
          <strong>📅 Upcoming (7 hari)</strong>
          <div class="mt-2">${soon.map(r => {
            const c = cats.find(x => x.id === r.categoryId);
            return `<div class="tx-row" style="border-color: var(--border)">
              <div class="tx-icon">${c?.icon || '🔁'}</div>
              <div class="tx-meta"><div class="tx-title">${escapeHtml(r.description)}</div><div class="tx-sub">${fmtDate(r.nextDate)}</div></div>
              <div class="tx-amount expense">${fmtMoney(r.amount, mainCurrency)}</div>
            </div>`;
          }).join('')}</div>
        </div>` : ''}

        <div class="card mt-4">
          <div class="between"><strong>Transaksi terbaru</strong>${recents.length ? `<button class="btn btn-ghost" data-nav="trans">Lihat semua</button>` : ''}</div>
          ${recents.length ? `<div class="mt-2">${recents.map(t => txRowHtml(t, cats, accs)).join('')}</div>`
                            : `<div class="empty"><div class="emoji">💼</div><p>Belum ada transaksi.<br>Tap tombol + untuk mulai.</p></div>`}
        </div>
      </div>
    `;
  });

  function txRowHtml(t, cats, accs) {
    const c = cats.find(x => x.id === t.categoryId);
    const a = accs.find(x => x.id === t.accountId);
    const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '-' : '';
    return `<div class="tx-row" data-tid="${t.id}">
      <div class="tx-icon" style="background:${c?.color ? c.color+'22' : ''}">${t.type==='transfer' ? '🔁' : (c?.icon || '📦')}</div>
      <div class="tx-meta">
        <div class="tx-title">${escapeHtml(t.description || c?.name || (t.type==='transfer'?'Transfer':'Transaction'))}</div>
        <div class="tx-sub">${fmtDateShort(t.date)} • ${a?.icon || ''} ${escapeHtml(a?.name || '')}</div>
      </div>
      <div class="tx-amount ${t.type}">${sign}${fmtMoney(t.amount, t.currency || mainCurrency)}</div>
    </div>`;
  }

  // Open edit on row click
  document.addEventListener('click', async (e) => {
    const row = e.target.closest('.tx-row[data-tid]');
    if (!row) return;
    const t = await db.transactions.get(row.dataset.tid);
    if (t) openTransactionSheet(t);
  });


  // ---------- TRANSACTIONS SCREEN ----------
  registerScreen('trans', async () => {
    const txs = (await db.transactions.toArray()).sort((a,b)=> new Date(b.date) - new Date(a.date));
    const cats = await db.categories.toArray();
    const accs = await db.accounts.toArray();
    const projs = await db.projects.toArray();

    setAfterRender(() => {
      const search = $('#search-input');
      const filterType = $('#filter-type');
      const filterAcc  = $('#filter-acc');
      const filterProj = $('#filter-proj');
      function apply() {
        const q = (search.value || '').toLowerCase();
        const ft = filterType.value, fa = filterAcc.value, fp = filterProj.value;
        const list = txs.filter(t => {
          if (ft && t.type !== ft) return false;
          if (fa && t.accountId !== fa) return false;
          if (fp === '__daily') { if (t.projectId) return false; }
          else if (fp && t.projectId !== fp) return false;
          if (q) {
            const c = cats.find(x => x.id === t.categoryId);
            const blob = (t.description||'') + ' ' + (c?.name||'') + ' ' + t.amount;
            if (!blob.toLowerCase().includes(q)) return false;
          }
          return true;
        });
        const root = $('#tx-list');
        if (!list.length) {
          root.innerHTML = '<div class="empty"><div class="emoji">🔍</div><p>Gak ada transaksi.</p></div>';
          return;
        }
        // Group by date
        const groups = {};
        for (const t of list) {
          const k = new Date(t.date).toISOString().slice(0,10);
          (groups[k] = groups[k] || []).push(t);
        }
        root.innerHTML = Object.entries(groups).map(([k, items]) => {
          const total = items.reduce((a,t)=>{ if (t.type==='expense') return a - +t.amount; if (t.type==='income') return a + +t.amount; return a; }, 0);
          return `<div class="card mt-2">
            <div class="between"><strong>${fmtDate(k)}</strong><span class="muted">${fmtMoney(total, mainCurrency)}</span></div>
            <div class="mt-2">${items.map(t => txRowHtml(t, cats, accs)).join('')}</div>
          </div>`;
        }).join('');
      }
      [search, filterType, filterAcc, filterProj].forEach(el => el.addEventListener('input', apply));
      apply();
    });

    return `
      <div class="screen">
        <h2 style="margin:0 0 12px">Transactions</h2>
        <div class="card">
          <input class="input" id="search-input" placeholder="🔍 Cari... (deskripsi, kategori, jumlah)">
          <div class="row gap-2 mt-2" style="flex-wrap:wrap">
            <select class="input" id="filter-type" style="max-width:140px">
              <option value="">Semua tipe</option>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="transfer">Transfer</option>
            </select>
            <select class="input" id="filter-acc" style="max-width:160px">
              <option value="">Semua akun</option>
              ${accs.map(a => `<option value="${a.id}">${a.icon||''} ${escapeHtml(a.name)}</option>`).join('')}
            </select>
            <select class="input" id="filter-proj" style="max-width:180px">
              <option value="">Semua scope</option>
              <option value="__daily">Daily Life only</option>
              ${projs.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="tx-list"></div>
      </div>
    `;
  });

  // ---------- STATS SCREEN ----------
  registerScreen('stats', async () => {
    const txs = (await db.transactions.toArray()).filter(t => !t.projectId);
    const cats = await db.categories.toArray();
    const start = startOfMonth(), end = endOfMonth();
    const mTxs = txs.filter(t => new Date(t.date) >= start && new Date(t.date) <= end);

    const insights = window.duitkuCharts.generateInsights(txs, [], cats);
    const exp = mTxs.filter(t=>t.type==='expense');
    const avgDaily = exp.length ? exp.reduce((a,t)=>a + +t.amount, 0) / Math.max(1, new Date().getDate()) : 0;

    setAfterRender(async () => {
      await window.duitkuCharts.renderCategoryTrend($('#trend-canvas'), txs, cats, 6);
      window.duitkuCharts.renderHeatmap($('#heat-wrap'), txs);
    });

    return `
      <div class="screen">
        <h2 style="margin:0 0 12px">Analytics</h2>

        ${insights.length ? `<div class="card glass">
          <strong>🧠 Smart Insights</strong>
          <ul style="margin: 8px 0 0; padding-left:20px; line-height:1.7">
            ${insights.map(i => `<li>${escapeHtml(i)}</li>`).join('')}
          </ul>
        </div>` : ''}

        <div class="stat-grid mt-4">
          <div class="stat-tile"><div class="stat-label">Avg / hari (bulan ini)</div><div class="stat-value">${fmtMoney(avgDaily, mainCurrency)}</div></div>
          <div class="stat-tile"><div class="stat-label">Transaksi (bulan ini)</div><div class="stat-value">${mTxs.length}</div></div>
        </div>

        <div class="card mt-4">
          <div class="between"><strong>Trend per Kategori (6 bulan)</strong></div>
          <div style="height:240px; margin-top:8px"><canvas id="trend-canvas"></canvas></div>
        </div>

        <div class="card mt-4">
          <strong>🔥 Spending Heatmap (12 minggu)</strong>
          <div id="heat-wrap" class="mt-2"></div>
        </div>
      </div>
    `;
  });

  // ---------- PROJECTS SCREEN ----------
  registerScreen('projects', async () => {
    const projects = await db.projects.toArray();
    const txs = await db.transactions.toArray();

    setAfterRender(() => {
      $('#new-proj').addEventListener('click', () => openProjectSheet());
      $$('.proj-card').forEach(c => c.addEventListener('click', () => navigate('project-detail', { projectId: c.dataset.pid })));
    });

    return `
      <div class="screen">
        <div class="between"><h2 style="margin:0">Projects</h2><button class="btn btn-primary" id="new-proj">+ New</button></div>
        ${projects.length ? `<div class="mt-4">${projects.map(p => {
          const ptx = txs.filter(t => t.projectId === p.id && t.type==='expense');
          const total = ptx.reduce((a,t)=> a + +t.amount, 0);
          return `<div class="card proj-card mt-2" data-pid="${p.id}" style="cursor:pointer">
            <div class="between"><strong>${escapeHtml(p.name)}</strong><span class="chip">${p.type}</span></div>
            <div class="muted" style="font-size:12px">${fmtDate(p.startDate)} → ${fmtDate(p.endDate)}</div>
            <div class="mt-2 between">
              <span>Total expense:</span>
              <strong>${fmtMoney(total, mainCurrency)}</strong>
            </div>
            ${p.budget ? `<div class="progress ${total/p.budget>=1?'hi':total/p.budget>=.8?'mid':'low'} mt-2"><span style="width:${Math.min(100, total/p.budget*100)}%"></span></div>
              <div class="muted" style="font-size:12px; margin-top:4px">${fmtMoney(total, mainCurrency)} / ${fmtMoney(p.budget, mainCurrency)}</div>` : ''}
          </div>`;
        }).join('')}</div>` : '<div class="empty"><div class="emoji">🎒</div><p>Belum ada project.<br>Buat untuk lacak trip atau event!</p></div>'}
      </div>
    `;
  });

  registerScreen('project-detail', async ({ projectId }) => {
    const p = await db.projects.get(projectId);
    if (!p) return '<div class="screen"><div class="empty">Project tidak ditemukan.</div></div>';
    const txs = (await db.transactions.where({ projectId }).toArray()).sort((a,b)=> new Date(b.date) - new Date(a.date));
    const cats = await db.categories.toArray();
    const accs = await db.accounts.toArray();
    const totalExp = txs.filter(t=>t.type==='expense').reduce((a,t)=>a + +t.amount, 0);

    setAfterRender(() => {
      $('#edit-proj').addEventListener('click', () => openProjectSheet(p));
      $('#proj-back').addEventListener('click', () => navigate('projects'));
    });

    return `
      <div class="screen">
        <button class="btn btn-ghost" id="proj-back">← Back</button>
        <div class="between mt-2"><h2 style="margin:0">${escapeHtml(p.name)}</h2><button class="btn btn-secondary" id="edit-proj">Edit</button></div>
        <div class="muted" style="font-size:13px">${fmtDate(p.startDate)} → ${fmtDate(p.endDate)} • ${p.type}</div>

        <div class="stat-grid mt-4">
          <div class="stat-tile"><div class="stat-label">Total Expense</div><div class="stat-value text-expense">${fmtMoney(totalExp, mainCurrency)}</div></div>
          <div class="stat-tile"><div class="stat-label">Budget</div><div class="stat-value">${p.budget ? fmtMoney(p.budget, mainCurrency) : '—'}</div></div>
        </div>

        ${p.budget ? `<div class="card mt-4"><div class="between"><strong>Progress</strong><span>${(totalExp/p.budget*100).toFixed(0)}%</span></div>
          <div class="progress ${totalExp/p.budget>=1?'hi':totalExp/p.budget>=.8?'mid':'low'} mt-2"><span style="width:${Math.min(100, totalExp/p.budget*100)}%"></span></div></div>` : ''}

        <div class="card mt-4">
          <strong>Transaksi (${txs.length})</strong>
          ${txs.length ? `<div class="mt-2">${txs.map(t => txRowHtml(t, cats, accs)).join('')}</div>`
                       : '<div class="empty"><div class="emoji">📝</div><p>Belum ada transaksi project. Tap + untuk tambah.</p></div>'}
        </div>
      </div>
    `;
  });

  async function openProjectSheet(existing = null) {
    const today = new Date().toISOString().slice(0,10);
    openSheet(`
      <h3 style="margin:0 0 10px">${existing ? 'Edit' : 'New'} Project</h3>
      <div class="field"><label>Nama</label><input class="input" id="p-name" value="${escapeHtml(existing?.name||'')}" placeholder="China April 2026"></div>
      <div class="field"><label>Tipe</label>
        <select class="input" id="p-type">
          ${['trip','business','event','renovation','custom'].map(t => `<option value="${t}" ${existing?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="row gap-2">
        <div class="field" style="flex:1"><label>Mulai</label><input class="input" id="p-start" type="date" value="${existing?.startDate?.slice(0,10) || today}"></div>
        <div class="field" style="flex:1"><label>Selesai</label><input class="input" id="p-end" type="date" value="${existing?.endDate?.slice(0,10) || today}"></div>
      </div>
      <div class="field"><label>Budget (${mainCurrency}, opsional)</label><input class="input" id="p-budget" type="number" inputmode="numeric" value="${existing?.budget||''}"></div>

      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="p-archive">${existing.status==='archived'?'Unarchive':'Archive'}</button>` : ''}
        <button class="btn btn-secondary" id="p-cancel">Batal</button>
        <button class="btn btn-primary" id="p-save" style="margin-left:auto">Simpan</button>
      </div>
    `);
    $('#p-cancel').addEventListener('click', closeSheet);
    if ($('#p-archive')) $('#p-archive').addEventListener('click', async () => {
      existing.status = existing.status === 'archived' ? 'active' : 'archived';
      await db.projects.put(existing); toast('Status diubah'); closeSheet(); navigate('projects');
    });
    $('#p-save').addEventListener('click', async () => {
      const name = $('#p-name').value.trim();
      if (!name) return toast('Nama wajib diisi');
      const data = {
        id: existing?.id || uid(),
        name,
        type: $('#p-type').value,
        startDate: new Date($('#p-start').value).toISOString(),
        endDate:   new Date($('#p-end').value).toISOString(),
        budget: +$('#p-budget').value || 0,
        currencies: existing?.currencies || JSON.stringify({ [mainCurrency]: 1 }),
        status: existing?.status || 'active',
        createdAt: existing?.createdAt || Date.now()
      };
      await db.projects.put(data);
      toast('Project disimpan'); closeSheet(); navigate('projects');
    });
  }


  // ---------- BUDGET SCREEN ----------
  registerScreen('budget', async () => {
    const cats = (await db.categories.toArray()).filter(c => c.type === 'expense' && !c.archived);
    const month = monthKey(new Date());
    const budgets = await db.budgets.where({ month }).toArray();
    const txs = await db.transactions.toArray();
    const start = startOfMonth(), end = endOfMonth();
    const monthTxs = txs.filter(t => !t.projectId && t.type==='expense' && new Date(t.date) >= start && new Date(t.date) <= end);

    setAfterRender(() => {
      $$('.budget-edit').forEach(b => b.addEventListener('click', () => openBudgetSheet(b.dataset.cid, month)));
      $('#copy-last').addEventListener('click', async () => {
        const lastMonth = (() => { const d = new Date(); d.setMonth(d.getMonth()-1); return monthKey(d); })();
        const last = await db.budgets.where({ month: lastMonth }).toArray();
        for (const b of last) await db.budgets.put({ id: uid(), month, categoryId: b.categoryId, amount: b.amount });
        toast('Budget disalin'); navigate('budget');
      });
    });

    return `
      <div class="screen">
        <div class="between"><h2 style="margin:0">Budget — ${month}</h2><button class="btn btn-secondary" id="copy-last">📋 Copy bulan lalu</button></div>
        <div class="mt-4">
          ${cats.map(c => {
            const b = budgets.find(x => x.categoryId === c.id);
            const spent = monthTxs.filter(t => t.categoryId === c.id).reduce((a,t)=>a + +t.amount, 0);
            const limit = b?.amount || 0;
            const ratio = limit > 0 ? spent / limit : 0;
            const bar = limit > 0 ? `<div class="progress ${ratio>=1?'hi':ratio>=.8?'mid':'low'} mt-2"><span style="width:${Math.min(100, ratio*100)}%"></span></div>` : '';
            return `<div class="card mt-2 budget-edit" data-cid="${c.id}" style="cursor:pointer">
              <div class="between"><strong>${c.icon} ${escapeHtml(c.name)}</strong>
                <span class="${ratio>=1?'text-expense':''}">${fmtMoney(spent, mainCurrency)}${limit?' / '+fmtMoney(limit, mainCurrency):' / —'}</span>
              </div>
              ${bar}
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  });

  async function openBudgetSheet(catId, month) {
    const cat = await db.categories.get(catId);
    const existing = await db.budgets.where({ month, categoryId: catId }).first();
    openSheet(`
      <h3 style="margin:0 0 10px">Budget: ${cat.icon} ${escapeHtml(cat.name)}</h3>
      <div class="field"><label>Limit per bulan (${mainCurrency})</label>
        <input class="input" id="b-amt" type="number" inputmode="numeric" value="${existing?.amount || ''}" placeholder="0">
      </div>
      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="b-del">Hapus</button>` : ''}
        <button class="btn btn-secondary" id="b-cancel">Batal</button>
        <button class="btn btn-primary" id="b-save" style="margin-left:auto">Simpan</button>
      </div>
    `);
    $('#b-cancel').addEventListener('click', closeSheet);
    if ($('#b-del')) $('#b-del').addEventListener('click', async () => { await db.budgets.delete(existing.id); toast('Budget dihapus'); closeSheet(); navigate('budget'); });
    $('#b-save').addEventListener('click', async () => {
      const amt = +$('#b-amt').value;
      if (!amt) return toast('Masukkan jumlah');
      const data = { id: existing?.id || uid(), month, categoryId: catId, amount: amt };
      await db.budgets.put(data);
      toast('Budget disimpan'); closeSheet(); navigate('budget');
    });
  }

  // ---------- GOALS SCREEN ----------
  registerScreen('goals', async () => {
    const goals = await db.goals.toArray();
    setAfterRender(() => {
      $('#new-goal').addEventListener('click', () => openGoalSheet());
      $$('.goal-edit').forEach(c => c.addEventListener('click', async () => {
        const g = await db.goals.get(c.dataset.gid); openGoalSheet(g);
      }));
    });
    return `
      <div class="screen">
        <div class="between"><h2 style="margin:0">Goals</h2><button class="btn btn-primary" id="new-goal">+ New</button></div>
        ${goals.length ? `<div class="mt-4">${goals.map(g => {
          const ratio = g.target ? Math.min(1, g.current / g.target) : 0;
          return `<div class="card mt-2 goal-edit" data-gid="${g.id}" style="cursor:pointer">
            <div class="between"><strong>🎯 ${escapeHtml(g.name)}</strong><span class="muted">${fmtDate(g.deadline)}</span></div>
            <div class="mt-2">${fmtMoney(g.current, mainCurrency)} / ${fmtMoney(g.target, mainCurrency)} (${(ratio*100).toFixed(0)}%)</div>
            <div class="progress low mt-2"><span style="width:${ratio*100}%"></span></div>
          </div>`;
        }).join('')}</div>` : '<div class="empty"><div class="emoji">🏆</div><p>Belum ada goal. Set target tabungan!</p></div>'}
      </div>
    `;
  });

  async function openGoalSheet(existing = null) {
    const today = new Date().toISOString().slice(0,10);
    openSheet(`
      <h3 style="margin:0 0 10px">${existing ? 'Edit' : 'New'} Goal</h3>
      <div class="field"><label>Nama</label><input class="input" id="g-name" value="${escapeHtml(existing?.name||'')}" placeholder="Emergency Fund"></div>
      <div class="field"><label>Target (${mainCurrency})</label><input class="input" id="g-target" type="number" value="${existing?.target||''}"></div>
      <div class="field"><label>Saat ini (${mainCurrency})</label><input class="input" id="g-current" type="number" value="${existing?.current||0}"></div>
      <div class="field"><label>Deadline</label><input class="input" id="g-dl" type="date" value="${existing?.deadline?.slice(0,10) || today}"></div>
      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="g-del">Hapus</button>` : ''}
        <button class="btn btn-secondary" id="g-cancel">Batal</button>
        <button class="btn btn-primary" id="g-save" style="margin-left:auto">Simpan</button>
      </div>
    `);
    $('#g-cancel').addEventListener('click', closeSheet);
    if ($('#g-del')) $('#g-del').addEventListener('click', async () => { await db.goals.delete(existing.id); toast('Goal dihapus'); closeSheet(); navigate('goals'); });
    $('#g-save').addEventListener('click', async () => {
      const data = {
        id: existing?.id || uid(),
        name: $('#g-name').value.trim() || 'Goal',
        target: +$('#g-target').value || 0,
        current: +$('#g-current').value || 0,
        deadline: new Date($('#g-dl').value).toISOString(),
        accountId: existing?.accountId || null,
        createdAt: existing?.createdAt || Date.now()
      };
      await db.goals.put(data); toast('Goal disimpan'); closeSheet(); navigate('goals');
    });
  }

  // ---------- PROFILE / SETTINGS SCREEN ----------
  registerScreen('profile', async () => {
    const user = await db.user.toCollection().first();
    const accs = await db.accounts.toArray();
    const cats = await db.categories.toArray();
    const txs  = await db.transactions.toArray();
    const theme  = await getSetting('theme', 'auto');
    const accent = await getSetting('accent', 'violet');
    const pin    = await getSetting('pin', null);

    // streak
    const days = new Set(txs.map(t => new Date(t.date).toISOString().slice(0,10)));
    let streak = 0; const d = new Date();
    while (days.has(d.toISOString().slice(0,10))) { streak++; d.setDate(d.getDate()-1); }

    // badges
    const badges = [];
    if (txs.length >= 100) badges.push({e:'🏆', t:'100 Transactions'});
    if (txs.length >= 1)   badges.push({e:'🥇', t:'First Transaction'});
    if ((await db.projects.count()) >= 1) badges.push({e:'🎒', t:'First Project'});
    if (streak >= 7)       badges.push({e:'🔥', t:'7-Day Streak'});
    if (streak >= 30)      badges.push({e:'🌟', t:'30-Day Streak'});

    setAfterRender(() => {
      $('#sel-theme').addEventListener('change', async (e) => { await setSetting('theme', e.target.value); applyTheme(e.target.value); toast('Theme: '+e.target.value); });
      $('#sel-accent').addEventListener('change', async (e) => { await setSetting('accent', e.target.value); applyAccent(e.target.value); toast('Accent: '+e.target.value); });
      $('#manage-acc').addEventListener('click', () => openAccountManager());
      $('#manage-cat').addEventListener('click', () => openCategoryManager());
      $('#manage-rec').addEventListener('click', () => navigate('recurring'));
      $('#exp-csv').addEventListener('click', exportCSV);
      $('#exp-json').addEventListener('click', exportJSON);
      $('#imp-json').addEventListener('click', importJSON);
      $('#set-pin').addEventListener('click', async () => {
        if (pin) { if (confirm('Hapus PIN?')) { await setSetting('pin', null); toast('PIN dihapus'); navigate('profile'); } return; }
        const p = prompt('Set PIN 6-digit (angka):');
        if (!p) return;
        if (!/^\d{6}$/.test(p)) return toast('PIN harus 6 angka');
        await setSetting('pin', p); toast('PIN disimpan'); navigate('profile');
      });
      $('#clear-data').addEventListener('click', async () => {
        if (!confirm('Hapus SEMUA data? Ini gak bisa di-undo.')) return;
        if (!confirm('Yakin banget? Pastikan udah backup dulu.')) return;
        await dbClearAll(); location.reload();
      });
    });

    return `
      <div class="screen">
        <h2 style="margin:0 0 12px">Profile</h2>
        <div class="card glass">
          <strong>👋 ${escapeHtml(user?.name || 'User')}</strong>
          <div class="muted" style="font-size:13px">Currency: ${user?.mainCurrency || 'IDR'} • ${accs.length} akun • ${cats.length} kategori</div>
          <div class="row gap-2 mt-2">
            <span class="chip">🔥 Streak: ${streak} hari</span>
            ${badges.map(b => `<span class="chip">${b.e} ${b.t}</span>`).join('')}
          </div>
        </div>

        <div class="card mt-4">
          <strong>Theme</strong>
          <div class="row gap-2 mt-2">
            <select class="input" id="sel-theme">
              <option value="auto" ${theme==='auto'?'selected':''}>Auto (system)</option>
              <option value="light" ${theme==='light'?'selected':''}>Light</option>
              <option value="dark" ${theme==='dark'?'selected':''}>Dark</option>
            </select>
            <select class="input" id="sel-accent">
              ${['violet','blue','green','rose','orange','teal','slate'].map(a => `<option value="${a}" ${accent===a?'selected':''}>${a}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="card mt-4">
          <strong>Manage</strong>
          <div class="row gap-2 mt-2" style="flex-wrap:wrap">
            <button class="btn btn-secondary" id="manage-acc">🏦 Akun</button>
            <button class="btn btn-secondary" id="manage-cat">🏷️ Kategori</button>
            <button class="btn btn-secondary" id="manage-rec">🔁 Recurring</button>
          </div>
        </div>

        <div class="card mt-4">
          <strong>Backup & Export</strong>
          <div class="row gap-2 mt-2" style="flex-wrap:wrap">
            <button class="btn btn-secondary" id="exp-csv">📄 Export CSV</button>
            <button class="btn btn-secondary" id="exp-json">💾 Export JSON</button>
            <button class="btn btn-secondary" id="imp-json">📥 Import JSON</button>
          </div>
        </div>

        <div class="card mt-4">
          <strong>Privacy</strong>
          <div class="row gap-2 mt-2"><button class="btn btn-secondary" id="set-pin">${pin ? '🔓 Hapus PIN' : '🔒 Set PIN 6-digit'}</button></div>
        </div>

        <div class="card mt-4">
          <strong>Danger Zone</strong>
          <div class="row gap-2 mt-2"><button class="btn btn-danger" id="clear-data">🗑️ Clear all data</button></div>
        </div>

        <div class="muted" style="text-align:center; margin-top: 24px; font-size:12px">Duitku v1.0.0 • Made with ❤️</div>
      </div>
    `;
  });


  // ---------- ACCOUNT MANAGER ----------
  async function openAccountManager() {
    const accs = await db.accounts.toArray();
    openSheet(`
      <h3 style="margin:0 0 10px">Akun</h3>
      <div id="acc-list">
        ${accs.map(a => `<div class="tx-row" data-aid="${a.id}" style="cursor:pointer">
          <div class="tx-icon" style="background:${a.color||''}22">${a.icon||'🏦'}</div>
          <div class="tx-meta"><div class="tx-title">${escapeHtml(a.name)}</div><div class="tx-sub">${a.type} • ${a.currency}</div></div>
          <div class="tx-amount">${fmtMoney(a.balance, a.currency || mainCurrency)}</div>
        </div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block mt-4" id="acc-new">+ Akun Baru</button>
    `);
    $('#acc-new').addEventListener('click', () => openAccountForm());
    $$('#acc-list .tx-row').forEach(r => r.addEventListener('click', async () => {
      const a = await db.accounts.get(r.dataset.aid);
      openAccountForm(a);
    }));
  }

  function openAccountForm(existing = null) {
    openSheet(`
      <h3 style="margin:0 0 10px">${existing ? 'Edit' : 'New'} Akun</h3>
      <div class="field"><label>Nama</label><input class="input" id="a-name" value="${escapeHtml(existing?.name||'')}" placeholder="Contoh: BCA"></div>
      <div class="field"><label>Tipe</label>
        <select class="input" id="a-type">
          ${['cash','bank','ewallet','credit','investment'].map(t => `<option value="${t}" ${existing?.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="row gap-2">
        <div class="field" style="flex:1"><label>Icon (emoji)</label><input class="input" id="a-icon" value="${existing?.icon||'🏦'}" maxlength="2"></div>
        <div class="field" style="flex:1"><label>Currency</label>
          <select class="input" id="a-cur">${['IDR','USD','SGD','MYR','EUR','JPY','CNY'].map(c => `<option ${(existing?.currency||mainCurrency)===c?'selected':''}>${c}</option>`).join('')}</select>
        </div>
      </div>
      <div class="field"><label>Saldo awal</label><input class="input" id="a-bal" type="number" inputmode="numeric" value="${existing?.initialBalance||existing?.balance||0}"></div>
      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="a-del">Hapus</button>` : ''}
        <button class="btn btn-secondary" id="a-cancel">Batal</button>
        <button class="btn btn-primary" id="a-save" style="margin-left:auto">Simpan</button>
      </div>
    `);
    $('#a-cancel').addEventListener('click', closeSheet);
    if ($('#a-del')) $('#a-del').addEventListener('click', async () => {
      if (!confirm('Hapus akun? Transaksi terkait gak ikut hapus.')) return;
      await db.accounts.delete(existing.id); toast('Akun dihapus'); closeSheet(); navigate('profile');
    });
    $('#a-save').addEventListener('click', async () => {
      const name = $('#a-name').value.trim();
      if (!name) return toast('Nama wajib');
      const bal = +$('#a-bal').value || 0;
      const data = {
        id: existing?.id || uid(),
        name, type: $('#a-type').value, icon: $('#a-icon').value || '🏦',
        currency: $('#a-cur').value, initialBalance: bal, balance: bal,
        archived: existing?.archived || 0, createdAt: existing?.createdAt || Date.now(),
        color: existing?.color || '#6366f1'
      };
      await db.accounts.put(data);
      await recomputeAccountBalances();
      toast('Akun disimpan'); closeSheet(); navigate('profile');
    });
  }

  // ---------- CATEGORY MANAGER ----------
  async function openCategoryManager() {
    const cats = await db.categories.toArray();
    openSheet(`
      <h3 style="margin:0 0 10px">Kategori</h3>
      <div id="cat-list">
        ${cats.map(c => `<div class="tx-row" data-cid="${c.id}" style="cursor:pointer">
          <div class="tx-icon" style="background:${c.color}22">${c.icon}</div>
          <div class="tx-meta"><div class="tx-title">${escapeHtml(c.name)}</div><div class="tx-sub">${c.type}${c.archived?' • archived':''}</div></div>
        </div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block mt-4" id="cat-new">+ Kategori Baru</button>
    `);
    $('#cat-new').addEventListener('click', () => openCategoryForm());
    $$('#cat-list .tx-row').forEach(r => r.addEventListener('click', async () => {
      const c = await db.categories.get(r.dataset.cid);
      openCategoryForm(c);
    }));
  }

  function openCategoryForm(existing = null) {
    openSheet(`
      <h3 style="margin:0 0 10px">${existing ? 'Edit' : 'New'} Kategori</h3>
      <div class="row gap-2">
        <div class="field" style="flex:1"><label>Nama</label><input class="input" id="c-name" value="${escapeHtml(existing?.name||'')}"></div>
        <div class="field" style="width:80px"><label>Icon</label><input class="input" id="c-icon" value="${existing?.icon||'📦'}" maxlength="2"></div>
      </div>
      <div class="row gap-2">
        <div class="field" style="flex:1"><label>Tipe</label>
          <select class="input" id="c-type">
            <option value="expense" ${existing?.type==='expense'?'selected':''}>Expense</option>
            <option value="income" ${existing?.type==='income'?'selected':''}>Income</option>
          </select>
        </div>
        <div class="field" style="flex:1"><label>Warna</label><input class="input" id="c-color" type="color" value="${existing?.color||'#6366f1'}"></div>
      </div>
      <label class="row gap-2 mt-2"><input type="checkbox" id="c-archive" ${existing?.archived?'checked':''}> Archive (sembunyikan)</label>
      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="c-del">Hapus</button>` : ''}
        <button class="btn btn-secondary" id="c-cancel">Batal</button>
        <button class="btn btn-primary" id="c-save" style="margin-left:auto">Simpan</button>
      </div>
    `);
    $('#c-cancel').addEventListener('click', closeSheet);
    if ($('#c-del')) $('#c-del').addEventListener('click', async () => {
      if (!confirm('Hapus kategori?')) return;
      await db.categories.delete(existing.id); toast('Kategori dihapus'); closeSheet(); navigate('profile');
    });
    $('#c-save').addEventListener('click', async () => {
      const data = {
        id: existing?.id || uid(),
        name: $('#c-name').value.trim() || 'Kategori',
        icon: $('#c-icon').value || '📦',
        type: $('#c-type').value,
        color: $('#c-color').value,
        archived: $('#c-archive').checked ? 1 : 0,
        parentId: existing?.parentId || null,
        createdAt: existing?.createdAt || Date.now()
      };
      await db.categories.put(data); toast('Kategori disimpan'); closeSheet(); navigate('profile');
    });
  }

  // ---------- RECURRING SCREEN ----------
  registerScreen('recurring', async () => {
    const list = await db.recurring.toArray();
    const cats = await db.categories.toArray();
    setAfterRender(() => {
      $('#new-rec').addEventListener('click', () => openRecurringForm());
      $('#rec-back').addEventListener('click', () => navigate('profile'));
      $$('.rec-item').forEach(r => r.addEventListener('click', async () => {
        const x = await db.recurring.get(r.dataset.rid); openRecurringForm(x);
      }));
    });
    return `
      <div class="screen">
        <button class="btn btn-ghost" id="rec-back">← Back</button>
        <div class="between mt-2"><h2 style="margin:0">Recurring</h2><button class="btn btn-primary" id="new-rec">+ New</button></div>
        ${list.length ? `<div class="mt-4">${list.map(r => {
          const c = cats.find(x => x.id === r.categoryId);
          return `<div class="card mt-2 rec-item" data-rid="${r.id}" style="cursor:pointer">
            <div class="between"><strong>${c?.icon||'🔁'} ${escapeHtml(r.description)}</strong>
              <span class="${r.active?'':'muted'}">${r.active?'Active':'Paused'}</span>
            </div>
            <div class="muted" style="font-size:13px">Setiap ${r.frequency} • Next: ${fmtDate(r.nextDate)}</div>
            <div class="mt-2">${fmtMoney(r.amount, mainCurrency)}</div>
          </div>`;
        }).join('')}</div>` : '<div class="empty"><div class="emoji">🔁</div><p>Belum ada recurring transaction.</p></div>'}
      </div>
    `;
  });

  async function openRecurringForm(existing = null) {
    const cats = (await db.categories.toArray()).filter(c => !c.archived);
    const accs = (await db.accounts.toArray()).filter(a => !a.archived);
    const today = new Date().toISOString().slice(0,10);
    openSheet(`
      <h3 style="margin:0 0 10px">${existing ? 'Edit' : 'New'} Recurring</h3>
      <div class="field"><label>Deskripsi</label><input class="input" id="r-desc" value="${escapeHtml(existing?.description||'')}" placeholder="Netflix, Gaji, Cicilan"></div>
      <div class="field"><label>Jumlah</label><input class="input" id="r-amt" type="number" value="${existing?.amount||''}"></div>
      <div class="row gap-2">
        <div class="field" style="flex:1"><label>Kategori</label><select class="input" id="r-cat">${cats.map(c => `<option value="${c.id}" ${existing?.categoryId===c.id?'selected':''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field" style="flex:1"><label>Akun</label><select class="input" id="r-acc">${accs.map(a => `<option value="${a.id}" ${existing?.accountId===a.id?'selected':''}>${a.icon||''} ${escapeHtml(a.name)}</option>`).join('')}</select></div>
      </div>
      <div class="row gap-2">
        <div class="field" style="flex:1"><label>Frequency</label>
          <select class="input" id="r-freq">
            ${['daily','weekly','monthly','yearly'].map(f => `<option value="${f}" ${existing?.frequency===f?'selected':''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="field" style="flex:1"><label>Next date</label><input class="input" id="r-date" type="date" value="${existing?.nextDate?.slice(0,10) || today}"></div>
      </div>
      <label class="row gap-2 mt-2"><input type="checkbox" id="r-active" ${existing?.active!==0 ? 'checked':''}> Active</label>
      <div class="row gap-2 mt-2">
        ${existing ? `<button class="btn btn-danger" id="r-del">Hapus</button>` : ''}
        <button class="btn btn-secondary" id="r-cancel">Batal</button>
        <button class="btn btn-primary" id="r-save" style="margin-left:auto">Simpan</button>
      </div>
    `);
    $('#r-cancel').addEventListener('click', closeSheet);
    if ($('#r-del')) $('#r-del').addEventListener('click', async () => { await db.recurring.delete(existing.id); toast('Dihapus'); closeSheet(); navigate('recurring'); });
    $('#r-save').addEventListener('click', async () => {
      const data = {
        id: existing?.id || uid(),
        description: $('#r-desc').value.trim() || 'Recurring',
        amount: +$('#r-amt').value || 0,
        categoryId: $('#r-cat').value,
        accountId: $('#r-acc').value,
        frequency: $('#r-freq').value,
        nextDate: new Date($('#r-date').value).toISOString(),
        active: $('#r-active').checked ? 1 : 0,
        createdAt: existing?.createdAt || Date.now()
      };
      await db.recurring.put(data); toast('Disimpan'); closeSheet(); navigate('recurring');
    });
  }

  // ---------- RECURRING ENGINE ----------
  async function processRecurring() {
    const list = await db.recurring.where({ active: 1 }).toArray();
    const now = new Date();
    for (const r of list) {
      let next = new Date(r.nextDate);
      let created = 0;
      while (next <= now && created < 50) {
        await db.transactions.add({
          id: uid(),
          date: next.toISOString(),
          amount: r.amount, currency: mainCurrency, amountInMain: r.amount,
          type: 'expense', categoryId: r.categoryId, accountId: r.accountId,
          projectId: null, description: r.description + ' (auto)',
          recurringId: r.id, createdAt: Date.now()
        });
        created++;
        next = advanceDate(next, r.frequency);
      }
      if (created > 0) {
        r.nextDate = next.toISOString();
        await db.recurring.put(r);
      }
    }
    if (list.length) await recomputeAccountBalances();
  }
  function advanceDate(d, freq) {
    const x = new Date(d);
    if (freq === 'daily')   x.setDate(x.getDate()+1);
    if (freq === 'weekly')  x.setDate(x.getDate()+7);
    if (freq === 'monthly') x.setMonth(x.getMonth()+1);
    if (freq === 'yearly')  x.setFullYear(x.getFullYear()+1);
    return x;
  }

  // ---------- BUDGET ALERTS ----------
  async function checkBudgetAlerts() {
    const month = monthKey(new Date());
    const budgets = await db.budgets.where({ month }).toArray();
    const txs = await db.transactions.toArray();
    const start = startOfMonth(), end = endOfMonth();
    for (const b of budgets) {
      const spent = txs.filter(t => !t.projectId && t.type === 'expense' && t.categoryId === b.categoryId && new Date(t.date) >= start && new Date(t.date) <= end).reduce((a,t)=>a+ +t.amount, 0);
      const ratio = spent / b.amount;
      if (ratio >= 1) toast('⚠️ Budget kategori terlampaui!');
      else if (ratio >= 0.8) toast('🟠 Budget kategori sudah ' + (ratio*100).toFixed(0) + '%');
    }
  }

  // ---------- EXPORT / IMPORT ----------
  async function exportCSV() {
    const txs = await db.transactions.toArray();
    const cats = await db.categories.toArray();
    const accs = await db.accounts.toArray();
    const projs = await db.projects.toArray();
    const rows = [['date','type','amount','currency','category','account','project','description']];
    for (const t of txs) {
      const c = cats.find(x => x.id === t.categoryId)?.name || '';
      const a = accs.find(x => x.id === t.accountId)?.name || '';
      const p = projs.find(x => x.id === t.projectId)?.name || '';
      rows.push([t.date, t.type, t.amount, t.currency, c, a, p, (t.description||'').replace(/"/g,'""')]);
    }
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(',')).join('\n');
    downloadFile('duitku-export-'+new Date().toISOString().slice(0,10)+'.csv', csv, 'text/csv');
    toast('CSV diunduh');
  }
  async function exportJSON() {
    const data = {
      version: 1, exportedAt: new Date().toISOString(),
      user: await db.user.toArray(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      transactions: await db.transactions.toArray(),
      projects: await db.projects.toArray(),
      recurring: await db.recurring.toArray(),
      budgets: await db.budgets.toArray(),
      goals: await db.goals.toArray(),
      settings: await db.settings.toArray()
    };
    downloadFile('duitku-backup-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(data, null, 2), 'application/json');
    toast('Backup JSON diunduh');
  }
  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importJSON() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!confirm('Import akan menggantikan semua data saat ini. Lanjut?')) return;
        await dbClearAll();
        for (const k of ['user','accounts','categories','transactions','projects','recurring','budgets','goals','settings']) {
          if (Array.isArray(data[k])) await db[k].bulkPut(data[k]);
        }
        await recomputeAccountBalances();
        toast('Import berhasil 🎉'); navigate('home');
      } catch (e) { toast('File tidak valid'); }
    };
    inp.click();
  }

  // ---------- BOOT ----------
  document.addEventListener('DOMContentLoaded', boot);
})();
