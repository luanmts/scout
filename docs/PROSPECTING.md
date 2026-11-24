# Prospecting workflow

## 1. Discover businesses

Create a search by industry or advanced terms, country, and optionally selected regions or cities. The backend validates the active geographic mode and creates Scout Engine jobs for the selected scope. Entire-country searches use one job; selected-region and selected-city modes can create separate jobs.

## 2. Import and organize

Scout retrieves completed job results, normalizes fields, and deduplicates businesses in the local database. Search/job membership is retained so the same business can be associated with multiple campaigns without duplicating the global lead record. Older records without a recoverable association can remain under an unknown source.

## 3. Discover contacts and analyze websites

Contact discovery checks public website information and can use an optional public search adapter. Evidence has confidence/status distinctions; a public address is not proof of deliverability. Website Intelligence uses Playwright/Chromium and Lighthouse on the homepage and stores evidence locally.

## Qualification

Scout records lead signals, observations, ICP profiles and scores, cohorts, and website opportunity evidence. Scores summarize available criteria/evidence; they are not sales outcomes or conversion probabilities unless separately validated.

## 4. Prepare outreach

The Outreach workspace can generate campaign-scoped drafts from persisted business facts and selected evidence. Drafts can be reviewed and edited. AI availability depends on a configured local connection and external provider terms/limits; see [Integrations](INTEGRATIONS.md#ai-assisted-drafts).

## 5. Deliver email with controls

When Gmail or Zoho is configured, eligible drafts can enter the outbox. Backend sending must be explicitly enabled, sending must be resumed in the app, and outbox controls govern approval, pause, cancellation, and test recipients. The system does not claim autonomous delivery by default or reliable reply/conversion tracking.

## 6. Manage the commercial pipeline

Companies can be added to the CRM pipeline, where the operator tracks commercial stages, channels, notes, last contact, and activities. Pipeline records are local; they do not themselves send messages.
