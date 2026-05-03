// charts.js — Lazy Chart.js loader and chart builders
(function () {
  let chartLib = null;
  async function loadChart() {
    if (chartLib) return chartLib;
    if (window.Chart) { chartLib = window.Chart; return chartLib; }
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    chartLib = window.Chart;
    return chartLib;
  }

  const palette = ['#6366f1','#a855f7','#ec4899','#f97316','#22c55e','#14b8a6','#06b6d4','#f43f5e','#84cc16','#eab308','#475569','#0ea5e9'];
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || null;

  const chartInstances = new Map();
  function destroyChart(canvasId) {
    const inst = chartInstances.get(canvasId);
    if (inst) { try { inst.destroy(); } catch(e){} chartInstances.delete(canvasId); }
  }

  // ----- Cashflow line (last 30 days, income vs expense) -----
  async function renderCashflow(canvas, txs) {
    const Chart = await loadChart();
    destroyChart(canvas.id);
    const days = 30;
    const labels = [];
    const inc = [];
    const exp = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0,10);
      labels.push(d.toLocaleDateString('id-ID', { day:'2-digit', month:'short' }));
      const dayTxs = txs.filter(t => new Date(t.date).toISOString().slice(0,10) === key);
      inc.push(dayTxs.filter(t=>t.type==='income').reduce((a,b)=>a + +b.amount, 0));
      exp.push(dayTxs.filter(t=>t.type==='expense').reduce((a,b)=>a + +b.amount, 0));
    }
    const accent = cssVar('--accent') || '#6366f1';
    const inst = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Income',  data: inc, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.12)', tension: .35, fill: true, borderWidth: 2, pointRadius: 0 },
          { label: 'Expense', data: exp, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.12)', tension: .35, fill: true, borderWidth: 2, pointRadius: 0 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } }, y: { beginAtZero: true } }
      }
    });
    chartInstances.set(canvas.id, inst);
  }

  // ----- Top categories donut -----
  async function renderTopCategories(canvas, txs, categories, limit = 5) {
    const Chart = await loadChart();
    destroyChart(canvas.id);
    const totals = new Map();
    for (const t of txs.filter(x => x.type === 'expense')) {
      totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + +t.amount);
    }
    const sorted = [...totals.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit);
    const labels = sorted.map(([id]) => {
      const c = categories.find(x => x.id === id);
      return c ? `${c.icon} ${c.name}` : 'Lainnya';
    });
    const data = sorted.map(([,v]) => v);
    const inst = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: palette, borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom' } } }
    });
    chartInstances.set(canvas.id, inst);
  }

  // ----- Trend per category (last 6 months, multi-line) -----
  async function renderCategoryTrend(canvas, txs, categories, monthsBack = 6) {
    const Chart = await loadChart();
    destroyChart(canvas.id);
    const labels = [];
    const buckets = [];
    const today = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      labels.push(d.toLocaleDateString('id-ID', { month: 'short' }));
      buckets.push({ start: d, end: new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999) });
    }
    // top 4 categories overall
    const totals = new Map();
    for (const t of txs.filter(x=>x.type==='expense')) totals.set(t.categoryId, (totals.get(t.categoryId)||0) + +t.amount);
    const top = [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([id])=>id);
    const datasets = top.map((catId, idx) => {
      const cat = categories.find(c => c.id === catId);
      return {
        label: cat ? `${cat.icon} ${cat.name}` : 'Lainnya',
        data: buckets.map(b => txs.filter(t => t.categoryId === catId && t.type === 'expense' && new Date(t.date) >= b.start && new Date(t.date) <= b.end).reduce((a,t)=>a+ +t.amount, 0)),
        borderColor: palette[idx % palette.length],
        backgroundColor: palette[idx % palette.length] + '22',
        tension: .3, borderWidth: 2, pointRadius: 3
      };
    });
    const inst = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
    });
    chartInstances.set(canvas.id, inst);
  }

  // ----- Heatmap (calendar) — pure HTML, not Chart.js -----
  function renderHeatmap(container, txs, days = 84) {
    const today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - (days - 1));
    // align to Monday
    const dayOfWeek = (start.getDay() + 6) % 7; // Mon=0
    start.setDate(start.getDate() - dayOfWeek);
    const cells = [];
    const dayMap = new Map();
    for (const t of txs.filter(x=>x.type==='expense')) {
      const k = new Date(t.date).toISOString().slice(0,10);
      dayMap.set(k, (dayMap.get(k)||0) + +t.amount);
    }
    const max = Math.max(1, ...dayMap.values());
    let totalCells = 7 * Math.ceil((days + dayOfWeek) / 7);
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const k = d.toISOString().slice(0,10);
      const v = dayMap.get(k) || 0;
      const ratio = v / max;
      let cls = 'heat-cell';
      if (v > 0)   cls += ratio > 0.75 ? ' l4' : ratio > 0.5 ? ' l3' : ratio > 0.25 ? ' l2' : ' l1';
      const label = `${k}: ${new Intl.NumberFormat('id-ID').format(v)}`;
      cells.push(`<div class="${cls}" title="${label}"></div>`);
    }
    container.innerHTML = `<div class="heat-grid">${cells.join('')}</div>`;
  }

  // ----- Insights (auto text) -----
  function generateInsights(allTxs, accounts, categories) {
    const out = [];
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23,59,59,999);

    const thisMonth = allTxs.filter(t => new Date(t.date) >= thisMonthStart && new Date(t.date) <= now);
    const lastMonth = allTxs.filter(t => new Date(t.date) >= lastMonthStart && new Date(t.date) <= lastMonthEnd);

    const sumExp = (arr) => arr.filter(t=>t.type==='expense').reduce((a,t)=>a + +t.amount, 0);
    const sumInc = (arr) => arr.filter(t=>t.type==='income').reduce((a,t)=>a + +t.amount, 0);

    const thisExp = sumExp(thisMonth);
    const lastExp = sumExp(lastMonth);
    const thisInc = sumInc(thisMonth);

    if (lastExp > 0) {
      const delta = ((thisExp - lastExp) / lastExp) * 100;
      const sign = delta >= 0 ? '+' : '';
      out.push(`Pengeluaran bulan ini ${sign}${delta.toFixed(0)}% dibanding bulan lalu.`);
    }

    // Saving rate
    if (thisInc > 0) {
      const rate = ((thisInc - thisExp) / thisInc) * 100;
      out.push(`Saving rate bulan ini ${rate.toFixed(0)}%${rate > 20 ? ' 🎉' : ''}.`);
    }

    // Top category change
    const totalsByCat = (arr) => {
      const m = new Map();
      for (const t of arr.filter(x=>x.type==='expense')) m.set(t.categoryId, (m.get(t.categoryId)||0) + +t.amount);
      return m;
    };
    const tThis = totalsByCat(thisMonth), tLast = totalsByCat(lastMonth);
    let biggest = null, biggestDelta = 0;
    for (const [id, v] of tThis.entries()) {
      const lv = tLast.get(id) || 0;
      if (lv > 0) {
        const d = ((v - lv) / lv) * 100;
        if (Math.abs(d) > Math.abs(biggestDelta)) { biggest = id; biggestDelta = d; }
      }
    }
    if (biggest) {
      const c = categories.find(x => x.id === biggest);
      const arrow = biggestDelta >= 0 ? '↑' : '↓';
      out.push(`Kategori ${c?.icon || ''} ${c?.name || ''} ${arrow} ${biggestDelta.toFixed(0)}% vs bulan lalu.`);
    }

    // No transaction today?
    const todayKey = now.toISOString().slice(0,10);
    const hasToday = allTxs.some(t => new Date(t.date).toISOString().slice(0,10) === todayKey);
    if (!hasToday) out.push('Belum ada transaksi hari ini — lupa input?');

    // Largest expense this month
    const largest = thisMonth.filter(t=>t.type==='expense').sort((a,b)=> +b.amount - +a.amount)[0];
    if (largest) {
      const c = categories.find(x => x.id === largest.categoryId);
      out.push(`Pengeluaran terbesar bulan ini: ${largest.description || c?.name || ''} (${new Intl.NumberFormat('id-ID',{style:'currency',currency:largest.currency||'IDR',maximumFractionDigits:0}).format(+largest.amount)}).`);
    }

    return out.slice(0, 5);
  }

  window.duitkuCharts = { loadChart, renderCashflow, renderTopCategories, renderCategoryTrend, renderHeatmap, generateInsights, destroyChart };
})();
