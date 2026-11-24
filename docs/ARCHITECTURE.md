# Scout architecture

Scout is a local, single-user application. The browser interface communicates with a local Express API; it does not connect to SQLite directly.

```text
React + Vite (127.0.0.1:5173)
       │ /api proxy
       ▼
Express + Node.js (127.0.0.1:8787)
       ├── SQLite: storage/capture.db
       ├── Scout Engine HTTP API (Gosom): 127.0.0.1:8080
       ├── Playwright / Chromium + Lighthouse
       ├── Optional Python contact-search bridge
       ├── Configured AI connection
       └── Optional Gmail / Zoho providers
```

## Responsibilities

- `src/App.tsx`, `src/i18n.ts`, and `src/styles.css` provide the interface, localization, and visual system.
- `server/index.ts` initializes the local database, owns API routes and coordinates search, campaign, lead, audit, qualification, CRM, and outreach workflows.
- Focused server modules implement contact discovery, website intelligence, ICP scoring, lead intelligence, cohort evaluation, outreach policy, OAuth state, and mail account storage.
- `scripts/prepare-leads.mjs` normalizes Scout Engine exports before import.
- `storage/capture.db` stores Scout application data. Scout Engine's current Gosom implementation stores its own job database and CSV outputs under `storage/gmapsdata`.

## Data flow

A saved search is planned into one or more Scout Engine jobs. Scout queries the local API of its current discovery implementation, Gosom Google Maps Scraper, obtains completed result files, normalizes them, and imports deduplicated businesses into SQLite while recording campaign/job associations. The scraper is third-party MIT-licensed software, not code authored by Scout; see [third-party notices](../THIRD_PARTY_NOTICES.md). Local queues coordinate contact discovery and website audits. Qualification and ICP records retain scores and evidence. Outreach drafts are generated from selected persisted business evidence and remain campaign-scoped. Mail delivery uses connected providers only after the application's safety gates allow it.

There is no public multi-user deployment architecture or separate hosted database in the current project.
