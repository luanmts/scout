# Security and privacy

Scout is designed for local use by one operator. Local execution limits where application data is stored by default, but it does not make the host, browser, integrations, or collected data risk-free.

## Local data

- Scout's SQLite database is stored at `storage/capture.db`.
- Scout Engine's current Gosom implementation keeps its job database and CSV results under `storage/gmapsdata`.
- Website audit artifacts and captures are stored locally under `data/audits`.
- Other raw/processed exports and generated data may be present under `data/`.
- AI and mail connection material is stored in local files or SQLite-backed settings as implemented.

These are runtime/private files and should not be committed, attached to issues, or included in public screenshots.

## Credentials

Keep `.env`, OAuth client values, tokens, session files, mail credentials, and encryption keys on the local machine. The `.gitignore` excludes common environment, credential, database, backup, export, cache, and local-agent configuration patterns. A gitignore rule is not a substitute for reviewing staged files before publication.

Mail account credentials are encrypted using `MAIL_CREDENTIAL_ENCRYPTION_KEY`. Generate a unique key for the installation, protect it separately, and maintain a recovery plan: losing the key can make saved credentials unavailable. Do not publish the key or copy it into `.env.example`.

## Email safety

Outbound sending is disabled by default in the example environment. Sending is gated by `OUTREACH_SEND_ENABLED`, application pause/resume state, outbox state and approval actions; test recipients are allowlisted separately. Review recipients, content, legal basis, provider policy, and unsubscribe/opt-out requirements before sending. Do not enable sending for a new installation unintentionally.

## Website and prospect data

Only collect information you are authorized to process. Website audits access external sites and may be subject to their policies. Contact discovery can query public search pages if an adapter is enabled. Respect rate limits and access controls; do not use the product to bypass authentication, CAPTCHA, robots, or provider restrictions. Apply appropriate retention, access, and deletion practices to prospect data.

## Public release checklist

Before publishing, inspect the exact candidate file set and Git history for secrets and private data. Exclude operational SQLite files, backups, raw exports, audit screenshots, account files, logs, and the local Scout Engine/Gosom checkout. Use synthetic or explicitly sanitized examples and screenshots.
