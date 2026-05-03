# 💸 Duitku — Personal Finance Tracker PWA

> Catat duit lo, kelola budget, lacak trip, capai goals — semua offline-first di HP & laptop. 🚀

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8.svg)](https://web.dev/progressive-web-apps/)
[![Made with](https://img.shields.io/badge/Made%20with-Vanilla%20JS-f7df1e.svg)](#)

**Live Demo:** https://gerriodailmypratama-prog.github.io/duitku/

---

## ✨ Features

- 📲 **Installable PWA** — install di iOS, Android, atau desktop. Jalan offline 100%.
- 💵 **Daily Life + Project Mode** — pisahin tracking harian dari trip/event/proyek.
- 🌍 **Multi-currency** — set custom rate per project (China April 2026 ✈️, Bali, Wedding, dll).
- 🏦 **Multi-account** — Cash, BCA, Mandiri, GoPay, OVO, Credit Card, Investment.
- 🏷️ **Smart categories** — emoji-based, customizable, dengan warna.
- 🔁 **Recurring transactions** — gaji, Netflix, KPR auto-create.
- 🎯 **Budgets & Goals** — monthly per-category budget + savings goals.
- 📊 **Analytics** — cashflow chart, top categories, heatmap kalender.
- 🧠 **Smart Insights** — auto-generated text insight ala Spotify Wrapped.
- 🔍 **Search & Filter** — global search + advanced filter.
- 📥 **Export & Backup** — CSV, JSON. Restore dari file.
- 🌙 **Dark Mode** — proper, bukan invert. + 8 color accents.
- 🔒 **Privacy-first** — semua data lokal di IndexedDB. PIN lock optional.
- ⚡ **Streak & Badges** — gamifikasi biar konsisten.

---

## 📸 Screenshots

> _Screenshots coming soon — install dulu & screenshot sendiri!_

---

## 🛠️ Tech Stack

- **Vanilla HTML/CSS/JS** — no framework, no build step
- **Tailwind CSS** (via CDN)
- **Chart.js** (via CDN)
- **Dexie.js** (via CDN) — IndexedDB wrapper
- **Service Worker** — offline-first
- **Web APIs** — Notification, Vibration, Web Speech (opsional)

---

## 🚀 Install sebagai PWA

### Android (Chrome)
1. Buka https://gerriodailmypratama-prog.github.io/duitku/
2. Tap menu (⋮) → **Install app** / **Add to Home screen**
3. Done — Duitku muncul di home screen lo.

### iOS (Safari)
1. Buka link demo di Safari (bukan Chrome).
2. Tap **Share** → **Add to Home Screen**.
3. Beres.

### Desktop (Chrome / Edge)
1. Buka link demo.
2. Klik icon install (⊕) di address bar, atau menu → **Install Duitku**.

---

## 🧑‍💻 Run Locally

```bash
git clone https://github.com/gerriodailmypratama-prog/duitku.git
cd duitku
python3 -m http.server 8000
```

Buka `http://localhost:8000`.

> **Note:** Service Worker hanya jalan di `https://` atau `localhost`.

---

## 🗺️ Roadmap

### v1.0 (current) ✅
- PWA shell + offline
- Transaction CRUD + multi-account
- Project mode + multi-currency
- Budgets + recurring
- Analytics + smart insights
- Export CSV/JSON
- Dark mode

### v1.1 (next)
- ☁️ Google Drive backup (OAuth)
- 🔐 WebAuthn biometric lock
- 🎤 Voice input (Web Speech API)
- 📸 Receipt OCR
- 🔔 Push notifications (server-side)
- 🌐 Multi-language (i18n full)

---

## 🤝 Contributing

PR welcome! Untuk perubahan besar, buka issue dulu untuk diskusi.

---

## 📄 License

MIT © 2026 [gerriodailmypratama-prog](https://github.com/gerriodailmypratama-prog)

Lihat [LICENSE](LICENSE) untuk detail.
