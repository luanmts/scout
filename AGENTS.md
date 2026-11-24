# Scout — Agent Instructions

## 1. Project Overview

Scout is an AI-assisted B2B prospecting and sales intelligence application focused on:

- Business discovery.
- Contact discovery and enrichment.
- Website intelligence and auditing.
- Lead qualification and opportunity scoring.
- Ideal Customer Profile (ICP) evaluation.
- AI-assisted personalized outreach.
- Email management and delivery.
- Commercial pipeline and CRM.

Scout is currently designed as a local, single-user application.

All contributions must prioritize maintainability, consistency, reliability, security, and user experience.

## 2. Mandatory Documentation

Before implementing changes, inspect the relevant project documentation and existing implementation.

- `README.md`: project overview, setup, and usage.
- `docs/DESIGN_SYSTEM.md`: official visual standards and frontend conventions.
- `.env.example`: supported environment configuration.
- `package.json`: dependencies and available commands.

Consult `docs/DESIGN_SYSTEM.md` before any frontend or visual modification.

If documentation conflicts with the implementation, identify the discrepancy before proceeding. Do not silently introduce new conventions.

## 3. General Development Principles

- Inspect existing code before implementing changes.
- Reuse existing components, utilities, services, and patterns.
- Avoid unnecessary dependencies.
- Avoid duplicated implementations.
- Keep changes focused on the requested scope.
- Prefer incremental improvements over large rewrites.
- Preserve backward compatibility whenever possible.
- Do not modify unrelated functionality.
- Do not introduce speculative features.
- Do not hide errors or incomplete implementations.
- Do not use mock data in production workflows.

## 4. Frontend and Design System

The Scout Design System is the source of truth for visual implementation.

All frontend changes must follow `docs/DESIGN_SYSTEM.md`.

### Visual consistency

- Use shared design tokens for colors, spacing, typography, borders, radii, and shadows.
- Reuse existing UI primitives and shared components.
- Maintain consistent page widths, gutters, and header alignment.
- Equivalent components must share the same visual dimensions and interaction patterns.
- Avoid page-specific overrides when a shared component can solve the problem.
- Do not introduce arbitrary colors, font sizes, spacing, or border radii.
- Document justified exceptions.

### Visual identity

- Preserve Scout's official logo and icon assets.
- Never distort, recolor, or apply unnecessary filters to brand assets.
- Use the appropriate logo variant for light and dark surfaces.
- Preserve the approved green brand palette.
- Keep the bright green Scouter lens exclusive to the brand assets.
- Maintain neutral surfaces and intentional use of accent colors.
- Keep semantic colors independent from brand colors.

### Design direction

Scout should feel like a professional, modern operational platform.

Avoid:

- Decorative gradients.
- Excessive shadows.
- Unnecessary glassmorphism.
- Neon effects.
- Oversized headings.
- Excessive whitespace.
- Decorative icons without purpose.
- Inconsistent card dimensions.
- Generic AI-generated dashboard aesthetics.

### Component architecture

Prefer shared components for:

- Page containers and headers.
- Cards and metric cards.
- Buttons and icon buttons.
- Form fields and controls.
- Tables and filter bars.
- Badges and status indicators.
- Dialogs and menus.
- Empty and loading states.

Do not create duplicate components when an equivalent implementation already exists.

## 5. Responsive Design and Accessibility

All interface changes must support desktop, tablet, and mobile layouts.

- Prevent unintended horizontal overflow.
- Preserve internal scrolling where appropriate.
- Support keyboard navigation.
- Provide visible focus states.
- Use accessible labels and semantic HTML.
- Preserve appropriate contrast ratios.
- Target WCAG AA compliance.
- Do not communicate important states through color alone.
- Respect reduced-motion preferences.
- Account for variable content lengths and translated strings.

## 6. Internationalization

Scout supports Brazilian Portuguese and American English.

- Preserve the existing internationalization system.
- All new user-facing interface strings must support both languages.
- Avoid hardcoded interface text.
- Use natural, professional translations.
- Preserve existing internal locale identifiers and API contracts.
- Use locale-aware formatting for dates, numbers, and percentages.
- Keep interface language independent from outreach language.
- Do not automatically translate business names, collected content, addresses, URLs, or user-provided data.

## 7. Architecture and Backend

Respect the existing application architecture.

- React and TypeScript frontend.
- Vite development and build tooling.
- Node.js and Express backend.
- SQLite persistence.
- Python-based auxiliary services.
- External discovery, auditing, AI, and email integrations.

Preserve established boundaries between presentation, application logic, persistence, and external integrations.

Frontend-only requests must not introduce backend changes.

Do not modify API contracts, database schemas, scoring algorithms, authentication flows, or business rules unless explicitly required by the task.

Database migrations must be reviewed for compatibility and data preservation.

Do not expose the local application publicly or assume multi-user security capabilities that have not been implemented.

## 8. Security and Privacy

Never expose or commit:

- API keys.
- OAuth tokens.
- Credentials.
- Session data.
- Encryption keys.
- Operational databases.
- Real customer or prospect records.
- Private email content.
- Backups containing sensitive information.
- Local environment configuration.

Use `.env.example` with safe placeholders when documenting configuration.

Preserve existing credential encryption and security controls.

Do not weaken security mechanisms to simplify implementation or testing.

Use synthetic or sanitized data for tests, screenshots, examples, and demonstrations.

Never execute real email deliveries, external prospecting jobs, paid API requests, or destructive operations during routine development validation without explicit authorization.

## 9. Testing and Validation

Before considering a task complete:

- Run relevant automated tests.
- Validate TypeScript when applicable.
- Run the production build for frontend changes.
- Verify affected functionality.
- Check for regressions in related workflows.
- Validate both supported languages for interface changes.
- Inspect responsive layouts when modifying visual components.

Discover the actual test and build commands from the project configuration.

Do not delete, skip, or weaken tests merely to obtain passing results.

Report existing failures separately from failures introduced by the current task.

Never claim that a test or validation was performed if it was not executed.

## 10. Git and Version Control

- Keep changes focused and reviewable.
- Respect the existing `.gitignore`.
- Preserve user changes and unrelated working-tree modifications.
- Never commit sensitive or operational data.
- Do not commit or push without explicit authorization.
- Do not rewrite Git history or execute destructive Git commands without approval.

Before publication, inspect the files intended for version control and verify that no credentials, private records, or operational artifacts are included.

## 11. Third-Party Code and Licensing

Respect third-party licenses.

External projects may be used as references for design, architecture, and general engineering principles.

Do not copy third-party source code, assets, or components without verifying their license and compatibility with Scout.

Preserve required copyright notices and attribution.

Do not assume that publicly accessible source code is unrestricted.

## 12. Documentation Maintenance

Keep documentation synchronized with meaningful changes.

Update the relevant documentation when introducing:

- New shared components.
- Design tokens or visual conventions.
- Environment variables.
- Dependencies.
- Architectural changes.
- New integrations.
- Setup requirements.
- Important limitations.

Do not change approved design standards silently. Proposed changes to the Design System must be explicitly identified and approved.

## 13. Implementation Workflow

For every task:

1. Inspect the relevant files and documentation.
2. Understand the existing implementation.
3. Identify affected components and potential regressions.
4. Implement the smallest complete solution.
5. Validate the changes.
6. Report the results.

For complex or high-risk changes, present an implementation plan before modifying the code.

## 14. Completion Report

After completing a task, provide a concise report containing:

- Summary of implemented changes.
- Files created or modified.
- Important technical decisions.
- Tests and validations performed.
- Known limitations or unresolved issues.
- Any changes outside the original scope.

Include screenshots when useful for reviewing visual changes.

Communicate with the project owner in Brazilian Portuguese unless another language is requested.

## Core Principle

Build Scout as a cohesive, maintainable product, not as a collection of independent pages.

Consistency is a requirement, not an optional refinement.