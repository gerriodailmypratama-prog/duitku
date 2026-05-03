# Changelog

All notable changes to Duitku will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-04

### Added
- Initial release
- PWA shell with installable manifest and service worker (offline-first)
- IndexedDB schema via Dexie (user, accounts, categories, transactions, projects, recurring, budgets, goals, settings)
- Onboarding flow with sample-data toggle
- Transaction CRUD: expense, income, transfer
- Multi-account support (cash, bank, e-wallet, credit card, investment)
- Customizable categories with emoji icons and colors
- Project / Trip mode with multi-currency and custom rates
- Monthly per-category budgeting with progress bars
- Recurring transactions engine
- Analytics dashboard: cashflow chart, top categories donut, calendar heatmap, trend lines
- Smart auto-generated insights (delta vs last month, saving rate, etc.)
- Savings goals tracker
- Global search and advanced filter
- Export CSV / JSON, restore from backup file
- Settings: currency, date format, theme, accent color, language, PIN lock
- Dark mode (proper, not invert) with 8 accent options
- Streak counter and badges (gamification)
- Bottom navigation (mobile) and sidebar (desktop)
- Floating Action Button quick-add
- Toast notifications, skeleton loading, friendly empty states

### Known limitations
- Google Drive backup not yet implemented (planned v1.1)
- WebAuthn biometric lock not yet implemented (planned v1.1)
- Voice input not yet implemented (planned v1.1)
- Push notifications limited to local-only (no server push)
