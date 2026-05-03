// db.js — Dexie (IndexedDB) schema and queries for Duitku
/* global Dexie */

const db = new Dexie('duitku');

db.version(1).stores({
  user:         'id, name, mainCurrency, createdAt',
  accounts:     'id, name, type, balance, currency, icon, color, archived, createdAt',
  categories:   'id, name, icon, color, type, parentId, archived, createdAt',
  transactions: 'id, date, amount, currency, amountInMain, type, categoryId, accountId, toAccountId, projectId, description, createdAt',
  projects:     'id, name, type, startDate, endDate, budget, status, createdAt',
  recurring:    'id, frequency, nextDate, amount, categoryId, accountId, description, active, createdAt',
  budgets:      'id, month, categoryId, amount',
  goals:        'id, name, target, current, deadline, accountId, createdAt',
  settings:     'key'
});

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- DEFAULT SEED ----------
const DEFAULT_CATEGORIES = [
  { name: 'Makanan & Minum', icon: '🍔', color: '#f97316', type: 'expense' },
  { name: 'Rumah Tangga',    icon: '🏠', color: '#10b981', type: 'expense' },
  { name: 'Transport',       icon: '🚗', color: '#3b82f6', type: 'expense' },
  { name: 'Groceries',       icon: '🛒', color: '#22c55e', type: 'expense' },
  { name: 'Belanja',         icon: '👕', color: '#ec4899', type: 'expense' },
  { name: 'Kesehatan',       icon: '💊', color: '#ef4444', type: 'expense' },
  { name: 'Hiburan',         icon: '🎬', color: '#a855f7', type: 'expense' },
  { name: 'Pendidikan',      icon: '📚', color: '#06b6d4', type: 'expense' },
  { name: 'Bisnis',          icon: '💼', color: '#64748b', type: 'expense' },
  { name: 'Travel',          icon: '✈️', color: '#0ea5e9', type: 'expense' },
  { name: 'Tagihan & Bills', icon: '💸', color: '#f59e0b', type: 'expense' },
  { name: 'Gift & Donasi',   icon: '🎁', color: '#f43f5e', type: 'expense' },
  { name: 'Subscription',    icon: '📱', color: '#8b5cf6', type: 'expense' },
  { name: 'Maintenance',     icon: '🔧', color: '#475569', type: 'expense' },
  { name: 'Lain-lain',       icon: '📦', color: '#94a3b8', type: 'expense' },
  { name: 'Gaji',            icon: '💰', color: '#10b981', type: 'income'  },
  { name: 'Bisnis',          icon: '💼', color: '#22c55e', type: 'income'  },
  { name: 'Investasi',       icon: '📈', color: '#14b8a6', type: 'income'  },
  { name: 'Bonus',           icon: '🎁', color: '#f59e0b', type: 'income'  },
  { name: 'Freelance',       icon: '💵', color: '#6366f1', type: 'income'  },
  { name: 'Refund',          icon: '🔄', color: '#06b6d4', type: 'income'  },
  { name: 'Lain-lain',       icon: '📦', color: '#94a3b8', type: 'income'  }
];

const DEFAULT_ACCOUNTS = [
  { name: 'Cash',   type: 'cash',    balance: 0, currency: 'IDR', icon: '💵', color: '#10b981' },
  { name: 'BCA',    type: 'bank',    balance: 0, currency: 'IDR', icon: '🏦', color: '#3b82f6' },
  { name: 'GoPay',  type: 'ewallet', balance: 0, currency: 'IDR', icon: '📱', color: '#22c55e' }
];

// ---------- INIT ----------
async function dbInit() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    // First-run defaults; user object created during onboarding
    if ((await db.categories.count()) === 0) {
      const now = Date.now();
      await db.categories.bulkAdd(DEFAULT_CATEGORIES.map(c => ({ id: uid(), archived: 0, createdAt: now, ...c })));
    }
    if ((await db.accounts.count()) === 0) {
      const now = Date.now();
      await db.accounts.bulkAdd(DEFAULT_ACCOUNTS.map(a => ({ id: uid(), archived: 0, createdAt: now, ...a })));
    }
  }
}

// ---------- SEED SAMPLE DATA ----------
async function dbSeedSample() {
  const cats = await db.categories.toArray();
  const accs = await db.accounts.toArray();
  if (!cats.length || !accs.length) return;
  const expenseCats = cats.filter(c => c.type === 'expense');
  const incomeCats  = cats.filter(c => c.type === 'income');
  const today = new Date();
  const txs = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today); d.setDate(today.getDate() - Math.floor(Math.random()*30));
    const isIncome = Math.random() < 0.18;
    const cat = isIncome ? incomeCats[Math.floor(Math.random()*incomeCats.length)]
                          : expenseCats[Math.floor(Math.random()*expenseCats.length)];
    const acc = accs[Math.floor(Math.random()*accs.length)];
    const amt = isIncome ? (1_000_000 + Math.random()*9_000_000) : (10_000 + Math.random()*250_000);
    txs.push({
      id: uid(),
      date: d.toISOString(),
      amount: Math.round(amt/1000)*1000,
      currency: acc.currency,
      amountInMain: Math.round(amt/1000)*1000,
      type: isIncome ? 'income' : 'expense',
      categoryId: cat.id,
      accountId: acc.id,
      projectId: null,
      description: isIncome ? `${cat.name} ${d.toLocaleDateString('id-ID', { month: 'short' })}` : `Sample ${cat.name.toLowerCase()}`,
      createdAt: Date.now()
    });
  }
  await db.transactions.bulkAdd(txs);

  const proj = {
    id: uid(),
    name: 'Bali Trip Demo',
    type: 'trip',
    startDate: new Date(Date.now() - 7*86400000).toISOString(),
    endDate:   new Date(Date.now() + 7*86400000).toISOString(),
    budget: 8_000_000,
    currencies: JSON.stringify({ IDR: 1 }),
    status: 'active',
    createdAt: Date.now()
  };
  await db.projects.add(proj);

  await db.goals.add({
    id: uid(), name: 'Emergency Fund', target: 50_000_000, current: 12_000_000,
    deadline: new Date(Date.now()+365*86400000).toISOString(), accountId: accs[1]?.id || null, createdAt: Date.now()
  });

  await db.recurring.add({
    id: uid(), frequency: 'monthly', nextDate: new Date(today.getFullYear(), today.getMonth()+1, 1).toISOString(),
    amount: 186000, categoryId: expenseCats.find(c=>c.icon==='📱')?.id || expenseCats[0].id,
    accountId: accs[1]?.id || accs[0].id, description: 'Netflix Subscription', active: 1, createdAt: Date.now()
  });
}

async function dbClearAll() {
  await Promise.all([
    db.user.clear(), db.accounts.clear(), db.categories.clear(),
    db.transactions.clear(), db.projects.clear(), db.recurring.clear(),
    db.budgets.clear(), db.goals.clear(), db.settings.clear()
  ]);
  await dbInit();
}

async function dbClearSampleData() {
  await db.transactions.clear();
  await db.projects.clear();
  await db.goals.clear();
  await db.recurring.clear();
}

// ---------- HELPERS ----------
async function getSetting(key, fallback = null) {
  const r = await db.settings.get(key);
  return r ? r.value : fallback;
}
async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

async function getAccountById(id)  { return db.accounts.get(id); }
async function getCategoryById(id) { return db.categories.get(id); }

async function recomputeAccountBalances() {
  const accs = await db.accounts.toArray();
  const txs = await db.transactions.toArray();
  for (const a of accs) {
    let bal = a.initialBalance || 0;
    for (const t of txs) {
      if (t.type === 'income'   && t.accountId === a.id) bal += +t.amount;
      if (t.type === 'expense'  && t.accountId === a.id) bal -= +t.amount;
      if (t.type === 'transfer' && t.accountId === a.id) bal -= +t.amount;
      if (t.type === 'transfer' && t.toAccountId === a.id) bal += +t.amount;
    }
    a.balance = bal;
    await db.accounts.put(a);
  }
}

// Expose
window.duitkuDB = {
  db, uid, dbInit, dbSeedSample, dbClearAll, dbClearSampleData,
  getSetting, setSetting, getAccountById, getCategoryById,
  recomputeAccountBalances,
  DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS
};
