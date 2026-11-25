# Configuration

Copy `.env.example` to `.env` for local overrides. The template contains safe values and no required secret for opening the interface. Keep `.env` private and never publish credentials.

| Variable | Purpose | Default / notes |
| --- | --- | --- |
| `GOSOM_URL` | Local Scout Engine API endpoint (current implementation: Gosom Google Maps Scraper). | `http://127.0.0.1:8080` |
| `PORT` | Local Scout API port. | `8787` |
| `GMS_IMAGE` | Docker Compose image used by Scout Engine. | Defaults to `gosom/google-maps-scraper:latest`; pin a tested release for repeatability. |
| `GMS_BIND_ADDRESS`, `GMS_HOST_PORT`, `GMS_DATA_DIR` | Compose bind address, host port, and persisted Scout Engine data. | Loopback, port 8080, `./storage/gmapsdata`. |
| `CONTACT_SEARCH_PROVIDER` | Optional external contact-search adapter selection. | `none` in the safe template. |
| `HARVEY_SEARCH_BRIDGE`, `HARVEY_PYTHON`, `HARVEY_SEARCH_DELAY_MIN` | Existing optional bridge path, interpreter, and Python-side delay overrides. | Names remain supported for local configuration compatibility; unset path uses `scripts/contact-search-bridge.py` and `python3`. The former bundled bridge path is redirected to the renamed file. |
| `HARVEY_SEARCH_BRIDGE`, `HARVEY_PYTHON` | Existing overrides for the optional Python bridge path and interpreter. | Kept for compatibility; when the path is unset, Scout uses `scripts/contact-search-bridge.py`, with `python3` as the interpreter default. The former bundled script path is redirected to the renamed file. |
| `SERPER_API_KEY` | Optional Serper adapter credential. | Not set; provider usage may incur charges. |
| `WEBSITE_AUDIT_CHROMIUM_PATH` | Explicit Chromium executable for audits. | Optional if browser discovery succeeds. |
| `IMPORT_LEAD_LIMIT` | Local import safety limit per completed result job. | `250`; backend clamps accepted range. |
| `OUTREACH_PROVIDER`, `OUTREACH_CONCURRENCY` | Draft-generation provider and batch concurrency. | Provider default `chatgpt`; mock is for tests. |
| `MAIL_CREDENTIAL_ENCRYPTION_KEY` | Encrypt stored mail account credentials. | Empty by default; generate a unique local key before connecting accounts. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` | Gmail OAuth client and callback configuration. | Optional; backend only. |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_ACCOUNTS_DOMAIN`, `ZOHO_API_DOMAIN`, `ZOHO_REDIRECT_URI` | Zoho OAuth and regional API configuration. | Optional; use the region matching the mailbox. |
| `ZOHO_SMTP_*`, `ZOHO_IMAP_*` | Zoho app-password connection endpoints when that flow is used. | Optional; defaults are global Zoho endpoints. |
| `OUTREACH_SEND_ENABLED` | Backend gate for outbound email. | `false`; leave disabled until sending is deliberately configured. |
| `OUTREACH_TEST_RECIPIENTS` | Allowlisted test recipients. | Empty in the template. |

Local application settings, including interface language and selected AI model/preferences, are persisted in SQLite. Read [Integrations](INTEGRATIONS.md) before configuring providers and [Security and privacy](SECURITY.md) before handling real data.
