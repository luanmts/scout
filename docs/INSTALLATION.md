# Installation

## Requirements

- Node.js `>=22.19.0`; `.nvmrc` recommends `24.22.2`.
- npm and the project lockfile.
- A local Scout Engine service for business discovery (currently using Gosom Google Maps Scraper).
- Chromium available to Playwright for website audits.
- Docker Compose is optional when Scout Engine is started another compatible local way.

## Install Scout

From the project root:

```bash
npm ci
cp .env.example .env
```

## Start Scout Engine with Compose

```bash
docker compose up -d
```

The Compose file binds Scout Engine to loopback by default and stores service data in `storage/gmapsdata`. It currently runs the third-party, MIT-licensed [Gosom Google Maps Scraper](https://github.com/gosom/google-maps-scraper). The default image reference is `gosom/google-maps-scraper:latest`; select a tested immutable release/tag for repeatable use. Stop the service without deleting the host data with `docker compose down`.

## Start the application

```bash
npm run dev
```

Open `http://localhost:5173`. The local API listens on `127.0.0.1:8787`, and Vite proxies `/api` to it. `npm run dev:api` and `npm run dev:web` start the processes separately. The backend creates the `storage/` directory and SQLite database automatically on first startup.

Check local API/Scout Engine connectivity at `http://127.0.0.1:8787/api/health`.

## Scout Engine without Compose

You can run a compatible local Scout Engine service independently and point `GOSOM_URL` to it. This repository does not publish or maintain a separate Scout Engine binary installation workflow; follow the upstream project's current instructions for that service.

## Playwright and Chromium

Playwright is a declared production dependency. npm installation does not itself install Chromium. Install the Playwright Chromium browser with `npx playwright install chromium`; on Linux hosts missing browser shared libraries, use `npx playwright install --with-deps chromium` (this may require system package-manager privileges). If automatic browser discovery does not find an existing compatible executable, set `WEBSITE_AUDIT_CHROMIUM_PATH` to its path.

## Optional Python bridge

Python is not required to start Scout. It is only needed if enabling the optional contact-search bridge. The project declares `httpx` and `beautifulsoup4` in `scripts/requirements-contact-search.txt`.

This isolated setup was validated in a clean project copy. The Python suite passed all 7 tests using only the dependencies listed in the requirements file:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r scripts/requirements-contact-search.txt
npm run test:python
```
