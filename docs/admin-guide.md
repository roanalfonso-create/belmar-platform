# Belmar Cloud Platform — Admin Guide
**Version:** 0.1
**Last updated:** May 2026
**Audience:** Platform administrators only

---

## Overview

This guide covers everything needed to manage, maintain, and extend the Belmar Cloud internal platform. It assumes familiarity with the [User Guide](./user-guide.md) for day-to-day functionality.

---

## Infrastructure overview

```
Service             Provider            Purpose
─────────────────────────────────────────────────────────────
Frontend app        Cloudflare Pages    Hosts index.html / React app
API proxy           Cloudflare Workers  belmar-ai-proxy (Anthropic API key)
Ruddr MCP           Cloudflare Workers  ruddr-mcp (Ruddr API connector)
Database            Neon (Postgres)     All application data
File storage        Cloudflare R2       PDFs, proposals, SOWs
Email               Resend              Invoice emails, notifications
Auth                Google OAuth 2.0    @belmarcloud.com + client invites
AI                  Anthropic API       Claude Sonnet — live data + AI features
Source control      GitHub              belmar-platform repo
```

---

## Cloudflare dashboard

URL: `dash.cloudflare.com`

### Workers

| Worker name | URL | Purpose |
|---|---|---|
| `belmar-ai-proxy` | `https://belmar-ai-proxy.*.workers.dev` | Proxies requests to Anthropic API, injects API key |
| `ruddr-mcp` | `https://ruddr-mcp.roan-alfonso.workers.dev` | Ruddr MCP connector |

**To view/edit a Worker:**
1. Workers & Pages → click the Worker name
2. **Edit code** to view/modify the script
3. **Settings → Variables and Secrets** to manage secrets
4. **Deployments** to see version history and roll back

**belmar-ai-proxy secrets:**

| Secret name | Value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | From console.anthropic.com → API Keys |

**To rotate the API key:**
1. console.anthropic.com → API Keys → Create new key
2. Cloudflare → belmar-ai-proxy → Settings → Variables → edit `ANTHROPIC_API_KEY`
3. Paste new key → Save → Deploy
4. Delete the old key from Anthropic console

### Pages

| Project name | URL | Source |
|---|---|---|
| `belmar-psa` | `https://belmar-psa.pages.dev` | Manually uploaded or GitHub connected |

**To update the dashboard:**
- **Manual:** Pages → belmar-psa → Deployments → Upload files → upload new `index.html`
- **GitHub (recommended):** push to `main` branch → auto-deploys in ~30 seconds

**Custom domain (when ready):**
1. Pages → belmar-psa → Custom domains → Add domain
2. Follow Cloudflare DNS instructions (automatic if domain is on Cloudflare)

### CORS configuration

The `belmar-ai-proxy` Worker has an `ALLOWED_ORIGINS` array. Any new domain that needs to call the API must be added here:

```javascript
const ALLOWED_ORIGINS = [
  "https://belmar-psa.pages.dev",
  "https://psa.belmarcloud.com",  // add custom domain here
  "null",        // local file:// dev
  "http://localhost:3000",
];
```

After editing, click **Deploy** in the Worker editor.

---

## Neon database

URL: `console.neon.tech`

### Connection details

| Setting | Value |
|---|---|
| Project | `belmar-platform` |
| Database | `belmar` |
| Connection string | Found in Neon console → Connection details |

**Never commit the connection string to GitHub.** Store it as a secret in Cloudflare Workers.

### Running queries

1. Neon console → SQL Editor
2. Select the `belmar` database
3. Write and run queries directly

**Common admin queries:**

```sql
-- List all active members
SELECT name, email, role, title FROM members WHERE is_active = true ORDER BY name;

-- Check forecast snapshots for current month
SELECT month, period, type, total_hours, created_at
FROM forecast_snapshots
WHERE month = '2026-05'
ORDER BY created_at;

-- Find invoices overdue more than 30 days
SELECT i.number, a.name as client, i.total, i.due_date
FROM invoices i
JOIN accounts a ON i.account_id = a.id
WHERE i.status = 'sent'
AND i.due_date < CURRENT_DATE - INTERVAL '30 days';

-- Member utilisation this month
SELECT m.name,
  COALESCE(SUM(te.hours), 0) as hours_logged
FROM members m
LEFT JOIN time_entries te ON te.member_id = m.id
  AND te.date >= date_trunc('month', CURRENT_DATE)
WHERE m.is_active = true AND m.is_billable = true
GROUP BY m.name
ORDER BY hours_logged DESC;
```

### Backups

Neon automatically backs up your database. To restore:
1. Neon console → Branches → create a branch from a past point in time
2. Connect to that branch to inspect/restore data
3. Copy data back to main branch if needed

### Schema changes

**Always create a migration file before changing the schema:**

```sql
-- migrations/0002_add_proposal_table.sql
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),
  ...
);
```

Commit the migration file to GitHub before running it. This keeps a full history of schema changes.

---

## GitHub repository

URL: `https://github.com/belmarcloud/belmar-platform`

### Repository structure

```
belmar-platform/
├── README.md
├── docs/
│   ├── requirements.md      ← build brief and technical spec
│   ├── user-guide.md        ← this doc's companion
│   └── admin-guide.md       ← this doc
├── migrations/
│   ├── 0001_initial_schema.sql
│   └── 0002_...sql          ← add one file per schema change
├── workers/
│   ├── proxy-worker.js      ← belmar-ai-proxy (deploy to Cloudflare)
│   └── ruddr-mcp.js         ← Ruddr MCP connector
├── src/                     ← React app (Phase 1+)
│   ├── components/
│   ├── pages/
│   └── api/
└── index.html               ← current dashboard (pre-React migration)
```

### Branch strategy

| Branch | Purpose |
|---|---|
| `main` | Production — auto-deploys to Cloudflare Pages |
| `dev` | Active development — test here before merging |
| `feature/xxx` | Individual features — merge into dev when ready |

**Never push directly to main.** Always merge via a pull request so changes can be reviewed.

### Making a change (step by step)

```bash
# 1. Make sure you're up to date
git pull origin main

# 2. Create a feature branch
git checkout -b feature/capacity-tab-fix

# 3. Make your changes to the files

# 4. Stage and commit
git add .
git commit -m "fix: capacity tab uses adjustedCapacityHrs correctly"

# 5. Push to GitHub
git push origin feature/capacity-tab-fix

# 6. Open a Pull Request on GitHub
# GitHub → your repo → Pull requests → New pull request
# Select: base=main, compare=feature/capacity-tab-fix
# Add description → Create pull request → Merge
```

### Connecting Pages to GitHub (auto-deploy)

1. Cloudflare Pages → belmar-psa → Settings → Build & deploy
2. Connect to Git → authorise GitHub → select `belmar-platform`
3. Branch to deploy: `main`
4. Build command: *(leave blank for static HTML)*
5. Build output directory: `/` (root)
6. Save — from now on every push to `main` auto-deploys

---

## User management

### Adding a new internal user

Currently managed by editing the database directly. Once the admin UI is built, this will be done in-app.

```sql
INSERT INTO members (name, email, role, title, is_active, is_billable, availability_hours_per_day)
VALUES (
  'New Person',
  'newperson@belmarcloud.com',
  'consultant',           -- admin | sales | pm | consultant | finance
  'Salesforce Consultant',
  true,
  true,
  '[7.5, 7.5, 7.5, 7.5, 7.5, 0, 0]'  -- Mon–Sun hours per day
);
```

The user can then sign in with their `@belmarcloud.com` Google account. Their `google_id` gets populated automatically on first login.

### Changing a user's role

```sql
UPDATE members
SET role = 'pm'   -- admin | sales | pm | consultant | finance
WHERE email = 'person@belmarcloud.com';
```

### Deactivating a user (e.g. someone leaves)

```sql
UPDATE members
SET is_active = false
WHERE email = 'person@belmarcloud.com';
```

This prevents login but preserves all their historical time entries and allocations.

### Inviting a client portal user

Once the client portal UI is built, this is done in-app. Until then:

```sql
INSERT INTO client_users (account_id, email, name, invited_by_id, permissions)
VALUES (
  '<account UUID>',
  'client@theirclient.com',
  'Client Contact Name',
  '<your member UUID>',
  '{"view_projects": true, "view_invoices": true, "view_time": false}'
);
```

Then send them the portal URL manually and ask them to sign in with that Google account.

---

## Anthropic Console (API)

URL: `console.anthropic.com`

### API key management

1. console.anthropic.com → API Keys
2. One key is used by `belmar-ai-proxy` Worker
3. Set a **monthly spend limit** under Billing → Usage limits (recommended: $50/month to start)
4. Monitor usage in the **Usage** tab — you can see cost per day

### Spend estimate

| Action | Approx cost |
|---|---|
| One live Ruddr data pull (dashboard refresh) | ~$0.02–0.05 |
| One Console build session (coding, 1 hour) | ~$2–8 |
| Monthly dashboard usage (20 team members, daily refresh) | ~$15–30 |

### Console Projects setup

For building in Console, maintain a Project with these files always uploaded:

| File | Keep updated? |
|---|---|
| `requirements.md` | Yes — update when scope changes |
| `schema.sql` | Yes — update with every migration |
| `index.html` | Yes — always the latest version |
| `proxy-worker.js` | Only if changed |
| `CONVENTIONS.md` | Yes — add patterns as they're established |

**System prompt to use in Console:**
```
You are a senior full-stack developer building Belmar Cloud's internal business platform.
Stack: React + TypeScript (frontend), Hono.js on Cloudflare Workers (API), Neon Postgres (database), Google OAuth (auth), Cloudflare R2 (storage), Resend (email), Anthropic API (AI features).
Always write TypeScript. Always handle errors explicitly. Always return complete file contents when editing existing files.
Database: Neon Postgres — use parameterised queries, never string interpolation.
Auth: Google OAuth ID tokens verified server-side, sessions as signed JWTs in httpOnly cookies.
Refer to requirements.md and schema.sql for all entity definitions and business rules.
```

---

## Ruddr MCP connector

URL: `https://ruddr-mcp.roan-alfonso.workers.dev/mcp`

This is the custom Cloudflare Worker that connects the platform to the Ruddr API.

**Source file:** `workers/ruddr-mcp.js` in GitHub

**Ruddr API key:** stored as `RUDDR_API_KEY` secret in the `ruddr-mcp` Worker settings.

### Updating the connector

If Ruddr's API changes or you need to add new endpoints:
1. Edit `workers/ruddr-mcp.js` locally
2. Test locally with `wrangler dev` if possible
3. Paste updated code into the Worker editor in Cloudflare
4. Deploy
5. Commit the updated file to GitHub

### Known limitations
- `list_members` requires pagination via `startingAfter` cursor (max 100 per page)
- `list_time_entries` uses `dateOnAfter`/`dateOnBefore` — not `startDate`/`endDate`
- No webhook support — all data is pulled on demand

---

## Forecast snapshot scheduling

Currently snapshots are captured manually via the dashboard UI. When the backend API is built (Phase 1), automate this with a Cloudflare Cron Trigger:

```javascript
// In the API Worker — wrangler.toml
[triggers]
crons = [
  "0 0 1 * *",    // 00:00 on the 1st of every month → opening snapshot
  "0 0 * * 0",    // 00:00 every Sunday → weekly snapshot
  "0 23 L * *",   // 23:00 on the last day of every month → actual snapshot
]
```

---

## Data migration (when ready)

### Phase 1 — Migrate from Ruddr

Use the existing MCP connector to read all Ruddr data and insert into Neon.

**Migration script approach:**
1. Pull all members → insert into `members`
2. Pull all clients → insert into `accounts`
3. Pull all projects → insert into `projects` (link to `accounts`)
4. Pull all allocations → insert into `allocations`
5. Pull all time entries (paginate by month) → insert into `time_entries`
6. Pull all invoices → insert into `invoices` + `invoice_line_items`

Store the `ruddr_id` on each record for deduplication. Run in dry-run mode first (count records, check for conflicts) before committing.

### Phase 2 — Migrate from Salesforce

Use the Salesforce MCP connector (already connected in Claude).

**Migration script approach:**
1. Pull Accounts → merge with existing `accounts` (match on name similarity)
2. Pull Contacts → insert into `contacts`
3. Pull Opportunities → insert into `opportunities`
4. Pull Activities → insert into `opportunity_activities`

Flag any Account name conflicts for manual review before final import.

---

## Monitoring & alerts

### Currently manual — check these regularly:

| Check | Where | How often |
|---|---|---|
| Anthropic API spend | console.anthropic.com → Usage | Weekly |
| Cloudflare Worker errors | Cloudflare → Workers → your worker → Logs | Weekly |
| Neon database size | Neon console → Project → Storage | Monthly |
| Failed invoice emails | Resend dashboard (when configured) | Weekly |
| Overdue invoices | Neon SQL query (see above) | Weekly |

### When the API is built, add:
- Cloudflare Workers alerts for error rate spikes
- Neon connection pool alerts
- Resend delivery failure webhooks

---

## Security checklist

- [ ] `ANTHROPIC_API_KEY` stored as Cloudflare Worker secret (never in code)
- [ ] `RUDDR_API_KEY` stored as Cloudflare Worker secret
- [ ] Neon connection string stored as Worker secret
- [ ] GitHub repo is **private**
- [ ] No secrets in any committed file
- [ ] CORS restricted to known domains in `proxy-worker.js`
- [ ] Google OAuth restricted to `@belmarcloud.com` domain for internal users
- [ ] Client portal users can only see their own account's data
- [ ] Database queries use parameterised inputs (never string interpolation)
- [ ] Cloudflare Access in front of Workers API (Phase 1)

---

## Document maintenance

This admin guide should be updated whenever:
- A new Worker is deployed or modified
- Database schema changes (add migration file + update schema section)
- A new secret or API key is added
- A user role or permission changes
- Infrastructure is added or removed

**To update docs in GitHub:**
1. Edit the file locally or directly on GitHub (pencil icon)
2. Commit with message: `docs: update admin guide — [what changed]`
3. Changes are live immediately in the repo

---

*For questions or incidents outside this guide, contact the platform owner or raise a GitHub issue in the `belmar-platform` repo.*
