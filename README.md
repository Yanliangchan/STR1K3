# STR1K3

*Standards, Discipline, Digitised.*

Instructor-only, mobile-first web app for recording **NORs** (Negative Observation Records), **CROWs** and **statements** against cadets, batch by batch.

Instructors open the app and land straight in the **active batch**. From there they can find cadets, select one or many, enter details once, and create an individual record for each selected cadet. They can then track each cadet's statement from request to acceptance and review statistics drawn from the saved records.

Cadets have no accounts. Everything is entered by instructors.

---

## Features

| Area | What it does |
|---|---|
| **Find anything, fast** | One search (header icon, the bar on Home, or `/` / Ctrl+K on desktop) finds cadets, statements, records **and pages**. Each cadet result has **NOR / CROW / Stmt** buttons to start a record for them straight away; typing "stats" or "export" jumps to that page. Recently viewed cadets show when the box is empty. Press `n` anywhere for a new record. |
| **Fewer taps** | <ul><li>Statement actions (**Handed in / Accept / Rewrite**) appear wherever a statement is listed: Home, the cadet profile and the queue.</li><li>Roster selection offers **+ NOR / + CROW / Statement** directly.</li><li>A single-cadet record is created in one tap. The confirm step is kept for bulk.</li><li>**Recently used descriptions** are one-tap chips that also fill the category, and the last category used for each type is remembered.</li><li>After saving NORs/CROWs: **Request statements from these cadets** (subject and occurrence carried over) or **Another record for the same cadets**.</li></ul> |
| **Undo** | After a quick **Handed in / Accept / Rewrite** (button or swipe), the toast offers **Undo** for 10 seconds. Nothing is deleted: the hand-in or review is marked *undone* and stays visible in the history, the previous status and deadline are restored, and the undo is audited. Only the instructor who made the change can undo it, within 2 minutes, and only if nothing has changed since. |
| **Swipe** | In the statement queue, swipe a row right to mark it handed in or to accept it. Buttons remain for everyone else. |
| **Install & offline** | Installable to the home screen (Android: *Install* in **More**; iPhone: Share → *Add to Home Screen*), with app shortcuts. If the connection drops while saving a NOR/CROW/statement request, it is kept in an on-device outbox and **sent automatically when you're back online**; the idempotency key means it can never be saved twice. A banner shows what is waiting to send. For security, the service worker caches only app files and a generic offline page, **never cadet pages or data**. |
| **Dark mode** | Follows the phone/computer setting by default; switch Auto / Light / Dark in **More** or **Account** (remembered per device). |
| **Brand** | Black and orange, with the STR1K3 mark (an outlined record panel with three bars, the top one orange). The login page animates the mark drawing in; a short splash plays once per session on app launch without blocking taps; the bars pulse while offline records wait to send. All motion is disabled when the device's *Reduce motion* setting is on. |
| **Self-guiding** | Until there is an active batch with cadets, Home shows a **setup checklist** with the next step highlighted. |
| **Sign-in** | Email + password (scrypt-hashed). Sessions are database-backed with HTTP-only cookies: 7 days idle, 30 days maximum (both configurable). Instructors can sign out other devices. Failed sign-ins are rate-limited. Administrators reset passwords, and the instructor must choose a new one at next sign-in. |
| **Active batch** | Exactly one active batch, stored in a database singleton with a unique constraint. The app always opens into it. Changing it is an explicit action: you type the batch name to confirm, and the change is audited. A new batch is never activated automatically. |
| **Batch management** | Create and edit batches and bytes, add or remove cadets, assign bytes in bulk, transfer cadets between batches (old records stay with the original batch), import rosters from CSV, archive a batch (with a checklist and a carry-over note when work is outstanding), and reopen a batch (with a reason). |
| **Roster** | Search by name, byte, or record and statement text. Filter by byte, NOR, CROW, outstanding, rewrite required or no records. Filters live in the URL, so **Back** keeps them. Multi-select supports select-all-shown and a sticky **Create record** bar. |
| **Bulk / quick record form** | Choose NOR, CROW or Statement and pick cadets with a **type-to-filter box**: type part of a name or byte, then tap or use arrow keys and Enter. You can also add all matches or add a whole byte in one tap. Enter the shared details once. Per-cadet adjustments are optional, and you can exclude a cadet before confirming. A review step shows: "5 cadets selected · Statement · 5 individual statement requests will be created". Creation runs in a **single transaction** with an **idempotency key**, so a double-tap or network retry never duplicates records. Drafts are saved on the device, and you are warned before leaving with unsaved changes. |
| **Shared occurrence** | Optional link between records that came from one event. Linked records count as one occurrence when detecting recurring issues. Never mandatory. |
| **Statements (tracking only)** | STR1K3 does **not** store what a cadet wrote. Each statement has a subject, optional notes, an **issue date** and a required **deadline** (date and time, default 23:59, with one-tap presets). Statuses: Not submitted → Pending review → Accepted / Rewrite required → (rewrite handed in) → Pending review. **Rewrite required always sets a new deadline**; feedback is optional. Every hand-in is logged with its time and marked **On time** or **Late** against the deadline that applied. Statements past their deadline are marked **Overdue**. Extensions go through *Edit / extend deadline*, with a reason. The queue has one-tap **Handed in / Accept / Rewrite** buttons on each row, plus confirmed bulk versions of the same actions. Reopening an accepted statement requires a reason. |
| **Corrections** | NORs, CROWs and statement requests can be corrected with a mandatory reason; the before/after values are kept in the audit trail. Records can be **voided** (kept, but excluded from counts). There is no hard delete anywhere in the UI, and the database blocks deletes. |
| **Dashboard** | Built around what needs doing, in this order:<br>1. A one-line summary (e.g. "2 overdue · 1 due within 24 h · 2 waiting for your review").<br>2. **Outstanding statements, grouped by cadet**: overdue first, then due soon, then waiting on you.<br>3. **Cadets flagged for review**: N+ separate NOR/CROW occurrences, N+ statements, or the same category repeating, each with a plain-language reason. Thresholds are configurable and flags are ordered by recent activity, not by count.<br>4. **What the data says**: findings that each state *why it matters*, such as overdue rate, review backlog age, late hand-in rate, rewrite rate, week-on-week trend, a dominant category, or a byte with a higher rate per cadet. A finding is only shown when there is enough data for it to mean something.<br>5. Batch totals and latest changes. |
| **Statistics** | Record distribution, statement status, records by byte (NOR/CROW toggle), categories, activity over time, and outstanding statements over time (rebuilt from the audit trail). Filters: batch, byte, type, category, status and date range. Every chart has a data-table view and links through to the filtered list. |
| **Recurring issues** | Flags a cadet with ≥ N distinct occurrences in the same NOR/CROW category (default 3; configurable, optionally within a day window). Shared occurrences count once. Unlinked records on the same date are flagged for **manual review** rather than counted as separate occurrences. Statements never count. Flags never create records or trigger action. |
| **Audit** | Append-only audit table: a database trigger rejects UPDATE and DELETE. It records the actor, time, entity, batch, cadet, a summary, a before/after diff and a reason. Browse it on the **Activity history** page. |
| **Import / export** | CSV roster import with preview, row-level errors, duplicate-name warnings, invalid-byte detection and explicit confirmation. Existing cadets are never overwritten. CSV export of records, statements or roster with filters. Exports are formula-injection-safe, POST + same-origin only, and audited. Statement content is included only when explicitly ticked. |

### Data integrity enforced by the database (not just the UI)

- Records and statements reference the cadet by **(cadetId, batchId)** composite foreign key, so a record cannot point at a cadet in a different batch.
- Triggers prevent:
  - a cadet being assigned another batch's byte
  - a record or statement linking to another batch's occurrence
  - any row moving between batches
  - any write into an **archived** batch
  - an archived batch becoming active, or the active batch being archived
  - hard deletes of records, statements, versions and reviews
  - edits or deletes of audit events

---

## Tech stack

Next.js 15 (App Router, Server Actions) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Radix Dialog · Lucide icons · Recharts · PostgreSQL · Prisma 6 · Zod · Vitest · Playwright

---

## Local setup

Requirements: Node 20.18+ (22 recommended) and PostgreSQL 14+.

```bash
npm install
cp .env.example .env            # then edit DATABASE_URL etc. For local http, set COOKIE_SECURE=false
npx prisma migrate deploy       # or: npm run db:migrate (development)
npm run db:seed                 # creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if no users exist
npm run db:seed:demo            # OPTIONAL fictional demo data (refuses to run with NODE_ENV=production)
npm run dev                     # http://localhost:3000
```

Demo sign-in after `db:seed:demo`: `instructor@example.com` or `admin@example.com`, password `DemoPassword123!`. The demo data is entirely fictional.

### Environment variables

See `.env.example`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `APP_TIMEZONE` | Time zone used for display and for "today" (default `Asia/Singapore`) |
| `SESSION_IDLE_DAYS` / `SESSION_MAX_DAYS` | Session policy (default 7 / 30) |
| `COOKIE_SECURE` | `true` in production (HTTPS). `false` only for local http |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Used once by `npm run db:seed` to create the first administrator. That administrator must change the password at first sign-in |

### Scripts

| Script | |
|---|---|
| `npm run dev` / `build` | Develop (applies pending migrations first) / build |
| `npm run start` | Apply migrations, bootstrap admin, then serve (used in production) |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:validate` | Validate the Prisma schema |
| `npm run db:seed` | Bootstrap the first admin (idempotent) |
| `npm run db:seed:demo` | Fictional demo data |
| `npm test` | Integration tests (Vitest) against a real Postgres test DB |
| `npm run test:e2e` | End-to-end tests (Playwright, mobile viewport) |

---

## Testing

The tests use **separate databases**: `str1k3_test` for integration and `str1k3_e2e_test` for end-to-end. They refuse to run against any database whose name does not contain `test`. Create the databases once:

```sql
CREATE DATABASE str1k3_test OWNER <user>;
CREATE DATABASE str1k3_e2e_test OWNER <user>;
```

```bash
TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/str1k3_test npm test
npm run build && E2E_DATABASE_URL=postgresql://user:pass@localhost:5432/str1k3_e2e_test npm run test:e2e
```

Playwright uses its own Chromium. Set `PLAYWRIGHT_CHROMIUM_PATH` to use a different Chromium binary.

**Integration tests (53)** cover:
- passwords, sign-in, rate limiting, session renewal, idle and absolute expiry, logout and revocation, deactivation, and admin-only account management
- single active batch, explicit switching, new batches starting empty, and historical isolation
- rejection of cross-batch writes at both the service and database level
- archive rules, read-only archived batches, reopening and transfers
- bulk creation (one cadet, many cadets, shared fields, overrides, idempotent sequential and concurrent retries, all-or-nothing behaviour, validation)
- corrections with diffs, and voiding
- all four statement statuses with independence between cadets, submissions history, invalid transitions, reopen and bulk accept
- required deadlines (stored in the configured time zone), new deadlines on rewrite, overdue counts and late hand-ins
- undo of hand-ins, accepts and rewrites (restoring the deadline), ownership, the 2-minute window, and that nothing is deleted
- dashboard ordering (overdue first), flagged-cadet thresholds and reasons (shared occurrences count once), and insights shown only with enough data
- dashboard counts against the database, statistics filters, and recurring flags without double counting
- append-only audit, no hard deletes, CSV formula injection, export scoping, and CSV import validation

**End-to-end tests (13, mobile viewport)** cover:
- the full Definition of Done workflow: sign in, land on the active batch, search and multi-select cadets, bulk-create statements, take three statements down independent paths (pending review, rewrite, accepted), check dashboard counts, cadet history and statistics, sign out and back in, switch the active batch and back, and check the activity history
- bulk NOR creation using the type-ahead picker, with a correction that keeps the previous value
- the search palette (name → NOR for that cadet → one-tap create → follow-up statement request, and jumping to pages by name), statement actions from Home and the cadet profile,
- Undo from the toast, swipe-to-act, offline save then automatic send on reconnect, dark mode persistence, and the install assets (manifest, icons, service worker, offline page),
- the dashboard section order and explanations, the Overdue tab with one-tap "Handed in", and the roster search surviving Back from a cadet profile
- unauthenticated API rejection

---

## Deploying to Railway

1. Create a Railway project with two services: **PostgreSQL** and this repository.
2. On the app service, set these variables:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `APP_TIMEZONE` = `Asia/Singapore` (or your zone)
   - `COOKIE_SECURE` = `true`
   - `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` (first deploy only; remove `ADMIN_PASSWORD` afterwards)
   - optionally `SESSION_IDLE_DAYS` / `SESSION_MAX_DAYS`
3. Deploy. `railway.json` builds with `npm run build` and starts with `npm run start`, which on every start:
   - applies any pending database migrations (`prisma migrate deploy` — safe to repeat; already-applied migrations are skipped),
   - creates the first administrator if no accounts exist (from `ADMIN_*`),
   - then serves the app on `0.0.0.0:$PORT`. Railway health-checks `/api/health`.
4. Generate a Railway domain (HTTPS), sign in with the bootstrap admin, set a new password, then:
   - add categories in **Settings**
   - create your first batch in **Batch management** (add bytes, then import or add cadets)
   - set the batch as active

**Do not run `db:seed:demo` in production.**

Railway Postgres runs on Railway's infrastructure. Store cadet records only on infrastructure approved for the sensitivity of the data.

---

## Security notes

- Every server action and API route re-validates the session and all inputs (Zod) on the server. Batch ownership is checked in service code *and* enforced by database constraints and triggers.
- Session tokens are 256-bit random values. Only their SHA-256 hash is stored. A new token is issued at every sign-in (prevents session fixation). Deactivating a user or resetting their password revokes their sessions.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Server Actions carry Next.js's built-in origin check, and CSV export is POST-only with a same-origin check.
- Security headers include a CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and a `noindex` robots policy.
- Server logs never include request payloads or statement content.
- No data is sent to any third-party service.

---

## Limitations / not implemented

- **No self-service password reset by email.** No email service is configured; an administrator resets passwords instead.
- **No file attachments** (by design). Statement content, notes and evidence descriptions are stored as text in Postgres.
- **All instructors have equal access to all batches.** There are no per-batch assignments. Only *instructor account management* is restricted to administrators.
- **Statement text is not stored** (by design). Only the tracking details are kept: subject, dates, deadlines, hand-ins, outcomes and feedback.
- **Per-cadet overrides in bulk entry** cover description/subject and notes. Category, dates and the deadline are shared across the selection; each one can be changed individually afterwards (deadline via *Edit / extend deadline*).
- **Long lists are capped** rather than paginated: the newest 200 records and 300 statements per view, and 50 entries per page in the activity history. Filters narrow the lists.
- **Notifications** appear in the in-app activity feed only (no push or email).
- **Offline:** only *creating* NOR/CROW/statement records works offline (queued and sent later). Viewing records and other changes (reviews, corrections) need a connection.
- **"Outstanding over time"** is rebuilt from the audit trail, so data written directly to the database outside the app is not reflected.
- **A single configured time zone.**

### Troubleshooting

- **`The table public.LoginAttempt does not exist`** (or any missing table): the database has not been migrated. `npm run start` and `npm run dev` now apply migrations automatically; to do it by hand run `npx prisma migrate deploy` with the same `DATABASE_URL` the app uses. On Railway, check that the app's `DATABASE_URL` points at your Postgres service (`${{Postgres.DATABASE_URL}}`).
