# Integrations

Scout coordinates local services and optional provider connections. Configure integrations only for the features you intend to use.

## Scout Engine business discovery

Searches require a compatible local Scout Engine service. The default endpoint is `http://127.0.0.1:8080` and can be changed with `GOSOM_URL`. Scout submits search jobs, checks their state, retrieves completed CSV results, normalizes them, and imports records into its own SQLite database. The Engine's job database is separate.

The current implementation uses the third-party [Gosom Google Maps Scraper](https://github.com/gosom/google-maps-scraper), licensed under MIT. Scout Engine is the product-facing name for this discovery component; it is not presented as Scout-authored code. Copyright and license attribution are recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). See [Installation](INSTALLATION.md).

## Website audits

Website intelligence uses Playwright with Chromium and Lighthouse. It audits the homepage, captures desktop/mobile evidence, and stores results locally. The audit code applies request/host safety controls and does not submit forms or crawl internal pages. Chromium may be selected explicitly with `WEBSITE_AUDIT_CHROMIUM_PATH`.

## Optional contact search

Contact discovery can inspect publicly available pages on company websites. An optional adapter can supplement that process with a public search provider. The safe `.env.example` selects `CONTACT_SEARCH_PROVIDER=none`; enabling a provider may require a provider key and can incur costs. Python bridge dependencies are declared in `scripts/requirements-contact-search.txt`. The isolated Python setup was validated in a clean project copy and its 7 tests passed; see [Installation](INSTALLATION.md#optional-python-bridge).

## AI-assisted drafts

The current implementation in `server/index.ts` uses a local ChatGPT connection flow: it stores a credential file under local storage, refreshes credentials, checks a specific granted scope, obtains available model choices, and sends generation/translation requests to the OpenAI Responses endpoint. `OUTREACH_PROVIDER=mock` is available for deterministic tests. There is no silent fallback to a paid API key provider in this flow.

This describes observed code behavior only. The project has not established that this authentication method is officially supported for arbitrary third-party/local applications or that it is included with a particular consumer subscription. Confirm provider terms, eligibility, and support before relying on it.

Generation creates editable drafts grounded in stored evidence; it does not itself deliver mail. Provider availability, selected model, account eligibility, and limits can affect operation.

## Email providers

Gmail and Zoho Mail are optional. The backend implements account connection, test/reconnect/disconnect actions, token refresh where OAuth is used, and sending through provider APIs. Gmail uses OAuth with account read and send scopes. Zoho supports OAuth and a password-based connection flow where configured; OAuth domains and API domains must match the mailbox region.

Set the provider's client credentials and exact callback URI in the backend environment, register the callback with the provider, and set a unique `MAIL_CREDENTIAL_ENCRYPTION_KEY`. Keep these values out of the frontend and repository. For Zoho, configure the matching accounts/API domains and callback. The app does not expose raw provider tokens in its public account records.

### Sending controls

The template sets `OUTREACH_SEND_ENABLED=false`. Delivery requires the backend gate to be explicitly enabled and sending to be resumed in the application. Drafts can be staged in the outbox and are subject to approval and pause/cancel controls. Test messages are restricted to `OUTREACH_TEST_RECIPIENTS`. A connected account alone does not imply automatic sending.
