# STR1K3

Instructor-only, mobile-first web app for recording **NORs** (Negative Observation Records), **CROWs** and **statements** against cadets, batch by batch.

Instructors open the app and land straight in the **active batch**. From there they can find cadets, select one or many, enter details once, and create an individual record for each selected cadet. They can then track each cadet's statement from request to acceptance and review statistics drawn from the saved records.

Cadets have no accounts. Everything is entered by instructors.

---

## Features

| Area | What it does |
|---|---|
| **Sign-in** | Email + password (scrypt-hashed). Sessions are database-backed with HTTP-only cookies: 7 days idle, 30 days maximum (both configurable). Instructors can sign out other devices. Failed sign-ins are rate-limited. Administrators reset passwords, and the instructor must choose a new one at next sign-in. |
| **Active batch** | Exactly one active batch, stored in a database singleton with a unique constraint. The app always opens into it. Changing it is an explicit action: you type the batch name to confirm, and the change is audited. A new batch is never activated automatically. |
| **Batch management** | Create and edit batches and bytes, add or remove cadets, assign bytes in bulk, transfer cadets between batches (old records stay with the original batch), import rosters from CSV, archive a batch (with a checklist and a carry-over note when work is outstanding), and reopen a batch (with a reason). |
| **Roster** | Search by name, byte, or record and statement text. Filter by byte, NOR, CROW, outstanding, rewrite required or no records. Filters live in the URL, so **Back** keeps them. Multi-select supports select-all-shown and a sticky **Create record** bar. |
| **Bulk / quick record form** | Choose NOR, CROW or Statement, pick one or more cadets, and enter the shared details once. Per-cadet adjustments are optional, and you can exclude a cadet before confirming. A review step shows: "5 cadets selected · Statement · 5 individual statement requests will be created". Creation runs in a **single transaction** with an **idempotency key**, so a double-tap or network retry never duplicates records. Drafts are saved on the device, and you are warned before leaving with unsaved changes. |
| **Shared occurrence** | Optional link between records that came from one event. Linked records count as one occurrence when detecting recurring issues. Never mandatory. |
| **Statements** | Exactly four statuses: Not submitted → Pending review → Accepted / Rewrite required → (rewrite received) → Pending review. Every receipt creates a new **version**, and every review decision is a separate **review row**, so nothing is overwritten. An accepted statement can only be reopened with a recorded reason. Bulk "record receipt" and bulk "accept" (with explicit confirmation) are all-or-nothing. |
| **Corrections** | NORs, CROWs and statement requests can be corrected with a mandatory reason; the before/after values are kept in the audit trail. Records can be **voided** (kept, but excluded from counts). There is no hard delete anywhere in the UI, and the database blocks deletes. |
| **Dashboard** | Live counts for cadets, NORs, CROWs, statements, pending review, rewrite required, not submitted and accepted. Each card opens the filtered list. Also shows quick actions, a "needs attention" list and recent activity (statement content is never shown). |
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
| `npm run dev` / `build` / `start` | Develop, build, serve |
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

**Integration tests (42)** cover:
- passwords, sign-in, rate limiting, session renewal, idle and absolute expiry, logout and revocation, deactivation, and admin-only account management
- single active batch, explicit switching, new batches starting empty, and historical isolation
- rejection of cross-batch writes at both the service and database level
- archive rules, read-only archived batches, reopening and transfers
- bulk creation (one cadet, many cadets, shared fields, overrides, idempotent sequential and concurrent retries, all-or-nothing behaviour, validation)
- corrections with diffs, and voiding
- all four statement statuses with independence between cadets, versioning, invalid transitions, reopen and bulk accept
- dashboard counts against the database, statistics filters, and recurring flags without double counting
- append-only audit, no hard deletes, CSV formula injection, export scoping, and CSV import validation

**End-to-end tests (3, mobile viewport)** cover:
- the full Definition of Done workflow: sign in, land on the active batch, search and multi-select cadets, bulk-create statements, take three statements down independent paths (pending review, rewrite, accepted), check dashboard counts, cadet history and statistics, sign out and back in, switch the active batch and back, and check the activity history
- bulk NOR creation with a correction that keeps the previous value
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
3. Deploy. `railway.json` does the rest:
   - builds with `npm run build`
   - runs `prisma migrate deploy` and the idempotent admin bootstrap as a **pre-deploy** step
   - starts with `npm run start` (binds `0.0.0.0:$PORT`)
   - health-checks `/api/health`
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
- **Statement content cannot be edited after receipt.** Record a corrected submission through the rewrite workflow instead; this keeps every version.
- **Per-cadet overrides in bulk entry** cover description, notes and instructions. Category, date and time are shared across the selection, and each record can be corrected individually afterwards.
- **Long lists are capped** rather than paginated: the newest 200 records and 300 statements per view, and 50 entries per page in the activity history. Filters narrow the lists.
- **Notifications** appear in the in-app activity feed only (no push or email).
- **Offline:** there is no offline queue. The new-record form keeps an unsent draft on the device and retries safely when the connection returns.
- **"Outstanding over time"** is rebuilt from the audit trail, so data written directly to the database outside the app is not reflected.
- **Light theme only. A single configured time zone.**
