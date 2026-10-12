# DOARDS / S&S Fahrzeugverleih

Vehicle-only fleet, rental, workshop and inventory application. React/TypeScript frontend, Node.js HTTP API and persistent SQLite database. Bosnian, German and English interfaces. This is a functional local development version, not a deployed or certified accounting system.

## Run Locally

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by the server, normally http://127.0.0.1:5173. Development uses `data/demo.sqlite`. The sign-in screen offers seven demonstration roles. Demo access is loopback-only by default. Do not enter real customer data in demo mode.

For testing on the trusted local network, use PowerShell:

```powershell
$env:PORT = '3005'
$env:DOARDS_HOST = '0.0.0.0'
$env:DOARDS_DEMO_LAN_SUBNET = '192.168.1.0'
npm run dev
```

Open http://192.168.1.2:3005 from a device on the same network. The explicit development-only setting enables passwordless demo roles for this /24 subnet, not other networks. Do not forward this port on the router. HTTP LAN testing does not enable phone GPS or PWA installation; those require HTTPS. Remove the variables to return to local-only defaults.

## Production Startup

```sh
npm run build
npm start
```

Defaults: http://127.0.0.1:4319 and a separate `data/doards.sqlite` database. With an empty database, create the first administrator from the setup screen (password: at least 12 characters). Complete company details and reviewed contract terms before issuing documents.

This application needs its Node server and persistent disk; uploading `dist` alone to a static host is insufficient. Deploy behind an HTTPS reverse proxy, disable demo mode, configure secure cookies, restrict network access, establish backups and test restoration before live use. Complete initial administrator setup before exposing the server publicly.

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port; defaults to 4319 in production, 5173 in development |
| `DOARDS_HOST` | Production bind address; defaults to 127.0.0.1 |
| `DOARDS_DB` | SQLite file path on persistent storage |
| `DOARDS_SECURE_COOKIE=1` | Require HTTPS for session cookies |
| `DOARDS_GPS_TOKEN` | Secret bearer token for the optional hardware telemetry adapter |
| `DOARDS_DEMO=1` | Demonstration mode; never enable on a live customer deployment |

Supply variables through the shell or host; an `.env` file is not automatically loaded.

## Verification

```sh
npm test
npm run test:browser
npm run test:portals
npm run test:intelligence
```

Browser tests build the app, start an isolated in-memory database and exercise vehicle creation, photos/damage, signed rental handover/return, invoice/payment, workshop parts/time, GPS, languages and role isolation. They use installed Google Chrome; set `CHROME_PATH` for another compatible executable. Screenshots and a test invoice go to `tmp/`. Tests never use the live database.

Portal tests cover cross-app messages and attachments, notifications, independent workshop/inventory permissions, dual application access, mobile/tablet layouts and every board view. Map verification needs internet access for OpenStreetMap tiles.

## Three Workspaces

- `/`: primary board for desktop, also responsive on smaller screens.
- `/clients`: mobile/tablet workspace for companies and their drivers, including private drivers without a company. Company accounts see their assigned fleet; drivers see assigned vehicles.
- `/workshop`: mobile/tablet workspace with both work orders and inventory. Each module has independent read/create/edit permissions.

The two portal layouts are available up to 1100px viewport width; wider windows show a device notice. This is a layout restriction, not device authentication. Administrators grant access to each workspace separately in Users & permissions. One account can use both portals without acquiring board privileges. Client-company scope must be configured explicitly for users whose primary role is not client.

All three workspaces use the same server/database. Server-sent events trigger live refreshes, with periodic polling as fallback. Messages have separate customer and internal workshop channels, read receipts and protected attachments. Notifications are persistent in-app notices; background push, email and closed-app delivery are not implemented.

Demo enrichment is additive and versioned; it does not reset existing records. Example locations are labelled Demo. Vehicle image attribution is available at `/credits.html`. The supplied Supabase project has not been connected: current persistence is local SQLite.

### Client presentation demo

At `/clients`, the company-client demo has two active vehicles, one reservation, pickup/return dates and five shared sample documents. Switch between company client and assigned driver using the demo profile controls. The driver sees only the assigned Vito, operational rental dates and shared non-financial documents; rental/document changes remain forbidden. Demo logins have per-app sessions, so presenting a client or driver does not replace the board session. On desktop, the demo-only **Tablet demo** action opens the real portal in a tablet-sized preview; the production device restriction is unchanged. Sample data is added once without resetting existing records or edits. Run `npm run test:client-demo` for focused presentation checks.

## Storage and Access

- Records, uploads, signatures and audit entries are stored in SQLite, not browser local storage. This is a single-server design.
- Back up using SQLite's backup facilities, or stop the server before copying the database and its WAL files. Test restoration periodically. Scheduled backups are not included.
- Roles and module overrides are enforced on the server. Financial fields and media are permission-filtered. Password changes invalidate sessions.
- Audit entries include actor, timestamp, old/new values and a hash chain. Database triggers reject updates/deletes; they cannot protect against an administrator replacing the database file.
- Private records are not cached offline. Edits require connectivity.
- Existing RentalPilot browser-local data is not migrated. Original source is preserved under `tmp/original`; no old customer data was deleted by this change.

## Assistant and Automation

The Assistant is available from the header in all three workspaces. It answers only from the signed-in user's authorized records. Without a configured provider, it clearly identifies itself as a local, rule-based record lookup, not a connected language model. The external AI path is read-only, has no action tools, limits context fields, uses a 20-second timeout and allows ten requests per user per minute. Questions are not stored by this application; replies remain in the current component session.

To enable the OpenAI Responses API integration, explicitly set all of these server environment variables and restart the server:

```powershell
$env:DOARDS_AI_ENABLED = '1'
$env:OPENAI_API_KEY = '<project-specific secret>'
$env:DOARDS_AI_MODEL = '<model available to your API account>'
```

Do not put secrets in frontend variables or reuse another project's credentials without authorization. The provider receives the question plus a minimized, permission-filtered operational snapshot with `store: false`. Review provider data processing before production. Model output can still be wrong; review the linked records. Provider failure is labelled explicitly and falls back to local lookups.

Voice input uses browser speech recognition with explicit consent and microphone permission, only on HTTPS or localhost. Browser/language support varies; recognition may use the browser vendor's remote service. Transcripts stay editable and require Send; read-aloud is separately user-triggered. Text input remains available on LAN HTTP. Automated tests mock recognition events; a real microphone, Bosnian recognition and actual provider access still need testing on the target devices.

The Automation page shows service deadlines and billing. A server-side worker runs on startup, every minute and after business changes. It catches up after restarts while the server is running:

- Service tasks and notifications use the stored next dates (14-day window) and odometer thresholds (1,000 km window), including latest per-kind service records. System tasks close when the source deadline is updated; marking a task manually complete cannot hide overdue maintenance. Kilometer tracking uses the last recorded odometer, not an estimated live reading.
- New rentals default to monthly billing, with billing on return available as an alternative. Existing rentals retain their prior billing mode. One explicitly labelled long-term demo rental supplies monthly examples.
- Monthly invoices cover completed calendar-month slices at the agreed daily rate. The period is start-inclusive/end-exclusive. Extras and late-return charges are settled on return. Current server business dates follow UTC, consistent with the existing rental engine; confirm the production business timezone before live billing.
- The administrator must enable automatic invoice issuance on the Automation page and complete company/customer addresses and tax details. It starts disabled. The worker then issues invoices without repeated manual commands, with audit entries and duplicate-period protection. It does not email invoices, debit cards or record payments automatically.
- The final invoice includes deductions for non-cancelled monthly invoice lines and their original tax rates, preventing double billing. Cancelled monthly periods are not automatically reissued; they are settled on the final invoice. A monthly invoice cannot be cancelled after a live final settlement exists. Paid invoice cancellation/credit-note workflows retain the existing limitations.

Tests cover leap years, partial months, idempotency, final reconciliation, cancellation guards, missing-company blocks, automatic service resolution, permission isolation and a mocked AI provider. `npm run test:intelligence` also verifies the UI and editable mocked voice transcripts in mobile/tablet layouts. A live paid AI request is not part of the tests.

Implementation references: [OpenAI text generation](https://developers.openai.com/api/docs/guides/text), [browser speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).

## Phone GPS and Future Trackers

Phone location requires explicit user choice and browser permission. Coordinates, accuracy, source and timestamp are recorded. Sharing stops when the page is hidden or closed: this is not continuous native background tracking. Physical phones need a reachable HTTPS deployment. The PWA can then be installed where supported, with role-specific views in the same application.

Hardware integration is provider-neutral. Assign a unique tracker ID to a vehicle and send a request to `POST /api/telemetry`:

```http
Authorization: Bearer <DOARDS_GPS_TOKEN>
Content-Type: application/json

{"trackerId":"vehicle-tracker-001","latitude":48.2082,"longitude":16.3738,"accuracy":8,"observedAt":"2026-10-12T12:00:00Z"}
```

The endpoint validates mappings and coordinates and is disabled without a token. Supplier connectors, device provisioning, retention policies and monitoring remain to be configured.

## Scope

See [REQUIREMENTS.md](./REQUIREMENTS.md) for the PDF/transcript checklist and limitations. The eight-angle photo viewer is not automatic 3D reconstruction; browser printing is not e-invoice submission; local tests are not production security, fiscal or legal certification.
