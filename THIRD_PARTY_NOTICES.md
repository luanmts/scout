# Third-party notices

The root [`LICENSE`](LICENSE) applies to original Scout-authored code only. It does not relicense third-party software, content, brands, or services in this repository.

## Harvey-derived materials

The following materials retain the original MIT license and attribution notices from Ethan Rogers / the Harvey project:

- `vendor/contact-discovery/` — selective contact-discovery reuse. See `vendor/contact-discovery/LICENSE`, `vendor/contact-discovery/README.md`, and `vendor/contact-discovery/SEARCH_LICENSE_NOTICE.txt`.
- `skills/sales-intelligence/` — imported sales skills. See `skills/sales-intelligence/LICENSE` and `skills/sales-intelligence/README.md`.
- Additional code adapted from Harvey is identified by source comments in `server/mail-providers.ts`, `server/outreach-outbox.ts`, and `server/website-intelligence.ts`. Preserve the Harvey MIT attribution and license when redistributing those portions.

## npm dependencies

The package lock currently records dependencies under MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0, CC-BY-4.0, BlueOak-1.0.0, 0BSD, `(MIT OR CC0-1.0)`, and `FSL-1.1-Apache-2.0` license expressions. These are package metadata, not a complete legal review of each package's bundled assets or notices. Preserve upstream notices when distributing dependencies.

`sentry@0.50.0` is a transitive dependency of `lighthouse@13.6.0` through `@sentry/node` and `@sentry/bundler-plugins`; it is not a direct or optional dependency declared by Scout. Its package metadata reports `FSL-1.1-Apache-2.0`. The dependency's source is not included in this source repository, so this notice does not identify a source-publication blocker. Preserve its license and notices if redistributing installed dependencies or a bundled application, and review the applicable license for that distribution. See the [upstream Sentry license](https://github.com/getsentry/sentry/blob/master/LICENSE.md) and [Sentry licensing information](https://open.sentry.io/licensing/).

## Scout Engine implementation and external providers

Scout Engine is the product-facing name of Scout's business-discovery component. Its current implementation communicates with the separately run [Gosom Google Maps Scraper](https://github.com/gosom/google-maps-scraper), licensed under MIT. The upstream copyright notice is © 2023 Georgios Komninos; the upstream license is available in the [Gosom repository](https://github.com/gosom/google-maps-scraper/blob/main/LICENSE). The local checkout or binary is not Scout-authored code and is excluded from the publish set. Preserve the upstream MIT notice when redistributing that software. Gmail, Zoho, OpenAI, search providers, websites, and other integrations retain their own terms and policies; this project license grants no rights to their services or marks.

## Scout brand assets

The Scout logo variants and icon are project identity assets under `public/assets/`. Their copyright holder is the Scout copyright holder named in the root license, unless a separate notice is added. Do not imply that third-party trademarks shown in the application are Scout assets.
