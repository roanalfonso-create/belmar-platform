# Belmar Cloud — Internal Platform Requirements
**Version:** 0.1 (Discovery)
**Date:** May 2026
**Scope:** Full replacement of Salesforce (CRM) + Ruddr (PSA) with a single internal platform, plus a client-facing portal.

---

## 1. Context & Goals

Belmar Cloud is a Salesforce consulting firm. The platform needs to support the full business lifecycle:

**Sell → Deliver → Bill**

- **Replace Salesforce** — pipeline management, accounts, contacts, opportunities, proposals
- **Replace Ruddr** — projects, resource allocation, time tracking, forecasting, invoicing
- **Add client portal** — clients can view project status, time logs, and invoices
- **Single source of truth** — one platform, one login, no more data living in two systems

### Constraints
- Single tenant (Belmar Cloud only)
- Authentication via Google OAuth (`@belmarcloud.com` accounts only)
- Client portal users authenticate via Google (any domain — invited by Belmar)
- Data migration required from both Salesforce and Ruddr
- Built on Cloudflare infrastructure (Workers, Pages, R2, D1/Neon)
- AI-assisted via Anthropic API (Claude)

---

## 2. User Roles

| Role | Description | Access |
|---|---|---|
| **Admin** | Full access — manages users, settings, billing config | Everything |
| **Sales** | Manages pipeline, accounts, contacts, proposals | CRM + read-only PSA |
| **Delivery Lead / PM** | Manages projects, resources, forecasting | Full PSA |
| **Consultant** | Logs time, views own allocations and projects | Own time + assigned projects |
| **Finance** | Invoicing, payments, revenue reporting | Billing + read-only everything |
| **Client** | External portal user — views their projects and invoices | Client portal only |

---

## 3. Entities & Relationships

### Core entities

```
ORGANISATION (Belmar Cloud — single tenant, config only)

CRM DOMAIN
├── Account (client company)
│   ├── id, name, industry, website, address, status (prospect/client/inactive)
│   ├── salesOwner → Member
│   ├── → many Contacts
│   ├── → many Opportunities
│   └── → many Projects
│
├── Contact (person at a client)
│   ├── id, firstName, lastName, email, phone, title, linkedIn
│   ├── account → Account
│   └── isPrimary (boolean)
│
└── Opportunity
    ├── id, name, value, currency, closeDate, probability, stage
    ├── account → Account
    ├── contact → Contact (primary)
    ├── owner → Member
    ├── type (new business / expansion / renewal)
    ├── description, notes
    ├── → many OpportunityActivities
    ├── → many Proposals
    └── → Project (on close/won)

PSA DOMAIN
├── Project
│   ├── id, name, status, billingType (T&M / fixed / retainer)
│   ├── account → Account
│   ├── opportunity → Opportunity (nullable — some projects come direct)
│   ├── pm → Member
│   ├── startDate, endDate, budget, currency
│   ├── → many ProjectMembers (allocations)
│   ├── → many TimeEntries
│   ├── → many Milestones
│   └── → many Invoices
│
├── Allocation
│   ├── id, project → Project, member → Member
│   ├── startDate, endDate
│   ├── hoursPerWeek OR totalHours
│   ├── type (project / time_off)
│   └── notes
│
└── TimeEntry
    ├── id, member → Member, project → Project
    ├── date, hours, description, isBillable
    ├── task → Task (nullable)
    └── approvedBy → Member (nullable)

PEOPLE DOMAIN
└── Member (internal user)
    ├── id, name, email, googleId, role, title
    ├── isActive, isBillable, startDate
    ├── availabilityHoursPerDay (7-element array Mon–Sun)
    ├── costRate, billRate, currency
    └── holidaySchedule (e.g. BC, Canada Federal)

BILLING DOMAIN
├── Invoice
│   ├── id, project → Project, account → Account
│   ├── number, status (draft/sent/paid/overdue)
│   ├── issueDate, dueDate, paidDate
│   ├── subtotal, tax, total, currency
│   └── → many InvoiceLineItems
│
├── InvoiceLineItem
│   ├── id, invoice → Invoice
│   ├── description, quantity, unitPrice, amount
│   └── timeEntries → [TimeEntry] (nullable — for T&M invoices)
│
└── Payment
    ├── id, invoice → Invoice
    ├── amount, date, method, reference
    └── notes

ACTIVITY / AUDIT
├── OpportunityActivity (CRM)
│   ├── id, opportunity → Opportunity
│   ├── type (call / email / meeting / note / task)
│   ├── date, subject, body
│   ├── member → Member (logged by)
│   └── contact → Contact (nullable)
│
└── AuditLog
    ├── entity, entityId, action, changedBy → Member
    ├── before (JSON), after (JSON)
    └── timestamp

PORTAL
└── ClientUser
    ├── id, email, googleId, name
    ├── account → Account
    ├── isActive, invitedBy → Member
    └── permissions (view_projects / view_invoices / view_time)
```

---

## 4. Workflows

### 4.1 Sell

```
1. New lead identified
   → Create Account (if new) or find existing
   → Create Contact
   → Create Opportunity (stage: Prospect)

2. Qualify & progress
   → Log activities (calls, meetings, emails)
   → Attach proposals / SOW drafts (R2 file storage)
   → Move through stages: Prospect → Qualified → Proposal → Negotiation → Closed Won/Lost

3. Close Won
   → Opportunity auto-creates a Project shell
   → PM assigned, project details filled in
   → Resource allocation begins

4. Close Lost
   → Log reason
   → Opportunity archived, account remains active for future
```

**Opportunity stages & probability defaults:**

| Stage | Probability |
|---|---|
| Prospect | 10% |
| Qualified | 25% |
| Proposal Sent | 50% |
| Negotiation | 75% |
| Closed Won | 100% |
| Closed Lost | 0% |

### 4.2 Deliver

```
1. Project setup
   → Name, billing type, budget, start/end dates
   → Assign PM
   → Add team members with allocations (hrs/week or total hrs)

2. Weekly forecasting
   → Allocations drive the forecast
   → Snapshot taken each Sunday automatically
   → Variance tracked vs month opening snapshot

3. Time tracking
   → Consultants log time daily/weekly
   → PM approves time
   → Billable vs non-billable flagged per entry

4. Project health
   → Budget burn vs forecast
   → Scheduled vs actual hours
   → Health status set by PM (green/amber/red)

5. Month close
   → Final actual snapshot taken last day of month
   → Approved time entries locked
   → Invoice generation triggered
```

### 4.3 Bill

```
1. Invoice generation
   → Manual (fixed fee) or auto-generated from approved time entries (T&M)
   → Line items editable before sending
   → PDF generated and stored in R2

2. Send to client
   → Email via Resend with PDF attached
   → Client portal updated — invoice visible to client user

3. Payment tracking
   → Mark invoice as paid, log payment details
   → Overdue flagging (configurable days)

4. Revenue reporting
   → Billed vs collected
   → Revenue by client, by month, by consultant
   → Pipeline weighted forecast vs actual billed
```

### 4.4 Client portal

```
Client logs in with Google (their own Google account, any domain)
→ Sees only their own account's data
→ Views: active projects, time logged this month, open invoices, invoice history
→ Can download invoices as PDF
→ Cannot see other clients, internal costs, or member rates
```

---

## 5. Key Views & Reports

### Management dashboard
- Monthly billable hours forecast vs actual (what we've already built)
- Shortfall heatmap by project
- Member capacity vs allocation
- Pipeline weighted value by stage
- Revenue billed this month vs target

### Sales views
- Pipeline kanban (drag opportunity between stages)
- Pipeline list with filters (stage, owner, close date, value)
- Account view (all contacts, opportunities, projects for one client)
- Activity feed (recent calls, meetings, emails)
- Win/loss rate by period

### Delivery views
- Project list with health status
- Resource allocation calendar / gantt
- Utilisation by member (this month, rolling 3 months)
- Forecast vs actual by project
- Time approval queue (PM view)

### Finance views
- Invoice aging report
- Revenue by client / month
- Unbilled time (approved time not yet invoiced)
- Payment history

### Client portal views
- Project status card (name, PM, status, % complete)
- Time logged this month (hours, by consultant)
- Invoice list (number, date, amount, status)
- Invoice PDF download

---

## 6. Data Migration Plan

### From Ruddr (via API)
- Members → Members
- Clients → Accounts
- Projects → Projects
- Allocations → Allocations
- Time entries → TimeEntries (historical)
- Invoices → Invoices (historical)

**Approach:** Use the existing Ruddr MCP connector to read all data and INSERT into new database. One-time migration script, run in dry-run mode first.

### From Salesforce (via MCP connector — already connected)
- Accounts → Accounts (merge with Ruddr clients where overlap)
- Contacts → Contacts
- Opportunities → Opportunities
- Activities → OpportunityActivities

**Approach:** Salesforce MCP reads records, deduplication logic on Account name/email, then INSERT. Flag any conflicts for manual review.

### Migration sequence
1. Members first (no dependencies)
2. Accounts (merge Ruddr clients + Salesforce accounts)
3. Contacts
4. Opportunities
5. Projects (link to Accounts, link to Opportunities where match exists)
6. Allocations
7. Time entries
8. Invoices + payments
9. Activities

---

## 7. Integration Points (during transition)

| System | Direction | Purpose | When to retire |
|---|---|---|---|
| Ruddr | Read (API) | Live data during migration | Phase 2 complete |
| Salesforce | Read (MCP) | Opportunity sync during migration | Phase 3 complete |
| Google OAuth | Auth | Login for all users | Never — keep |
| Resend | Send | Invoice emails, notifications | Keep |
| Cloudflare R2 | Storage | Proposals, SOWs, invoice PDFs | Keep |
| Xero / QuickBooks | Write (future) | Accounting sync | Phase 4 |

---

## 8. Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│  CLIENTS                                             │
│  browser (Cloudflare Pages)                         │
│  React + TypeScript + TanStack Query                │
│  - Internal app  (/app)                             │
│  - Client portal (/portal)                          │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS + JWT
┌──────────────────▼──────────────────────────────────┐
│  API  (Cloudflare Worker — Hono.js)                  │
│  /api/v1/...                                        │
│  - Auth (Google OAuth verify + JWT issue)           │
│  - REST endpoints per entity                        │
│  - Role-based access control middleware             │
│  - AI endpoints (Claude via Anthropic API)          │
└──────┬─────────────────────┬────────────────────────┘
       │                     │
┌──────▼──────┐    ┌─────────▼────────┐
│  Neon       │    │  Cloudflare R2   │
│  Postgres   │    │  File storage    │
│  (database) │    │  (PDFs, docs)    │
└─────────────┘    └──────────────────┘
```

### API route structure
```
POST   /api/auth/google          — exchange Google token for session JWT
GET    /api/auth/me              — current user

GET    /api/accounts             — list accounts
POST   /api/accounts             — create account
GET    /api/accounts/:id         — get account + contacts + opportunities + projects
PATCH  /api/accounts/:id         — update account

GET    /api/opportunities        — list (filterable by stage, owner, account)
POST   /api/opportunities        — create
PATCH  /api/opportunities/:id    — update (including stage change)
POST   /api/opportunities/:id/won — close won → creates project shell

GET    /api/projects             — list
POST   /api/projects             — create
GET    /api/projects/:id         — get project + members + time + invoices
PATCH  /api/projects/:id         — update

GET    /api/members              — list
GET    /api/members/:id/capacity — adjusted capacity for date range

POST   /api/time                 — log time entry
GET    /api/time                 — list (filterable by member, project, date)
PATCH  /api/time/:id/approve     — approve time entry

GET    /api/forecast/snapshots   — list snapshots
POST   /api/forecast/snapshot    — capture new snapshot

GET    /api/invoices             — list
POST   /api/invoices             — create
POST   /api/invoices/:id/send    — generate PDF + send via Resend
PATCH  /api/invoices/:id/pay     — mark paid

-- Portal (restricted to ClientUser JWT)
GET    /portal/api/projects      — client's projects only
GET    /portal/api/invoices      — client's invoices only
GET    /portal/api/invoices/:id/pdf — download PDF
```

---

## 9. Build Phases

### Phase 0 — Foundation (weeks 1–3)
- [ ] GitHub repo set up (`belmar-platform`)
- [ ] Neon database provisioned
- [ ] Hono.js Worker scaffold deployed
- [ ] Google OAuth working end-to-end
- [ ] Database schema migrated (`schema.sql`)
- [ ] Basic React app shell on Cloudflare Pages
- [ ] CI/CD: push to main → auto deploy

### Phase 1 — PSA (weeks 4–10)
- [ ] Members CRUD
- [ ] Projects CRUD
- [ ] Allocations + capacity calculation
- [ ] Time entry logging + approval
- [ ] Forecast snapshots (migrate existing dashboard logic)
- [ ] Ruddr data migration script
- [ ] Run parallel with Ruddr — validate parity

### Phase 2 — Billing (weeks 10–14)
- [ ] Invoice generation (T&M from time entries + fixed fee)
- [ ] PDF generation (Cloudflare Worker + HTML template)
- [ ] Resend integration (invoice emails)
- [ ] Payment tracking
- [ ] Finance reporting views
- [ ] Retire Ruddr

### Phase 3 — CRM (weeks 14–22)
- [ ] Accounts + Contacts CRUD
- [ ] Opportunities + pipeline kanban
- [ ] Activity logging
- [ ] Proposals (file upload to R2)
- [ ] Opportunity → Project handoff
- [ ] Salesforce data migration script
- [ ] Run parallel with Salesforce — validate parity
- [ ] Retire Salesforce

### Phase 4 — Client Portal (weeks 20–24)
- [ ] ClientUser auth (Google OAuth, any domain)
- [ ] Client invitation flow
- [ ] Portal views (projects, time, invoices)
- [ ] PDF download
- [ ] Notification emails (invoice sent, project update)

### Phase 5 — Polish & AI (ongoing)
- [ ] AI forecast analysis (already started)
- [ ] Natural language queries ("show me all projects over budget")
- [ ] Automated weekly snapshot capture
- [ ] Anomaly detection on time entries
- [ ] Proposal drafting assistant
- [ ] Accounting system sync (Xero/QuickBooks)

---

## 10. Database Schema (starter — expand per phase)

```sql
-- MEMBERS
CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','sales','pm','consultant','finance')),
  title TEXT,
  is_active BOOLEAN DEFAULT true,
  is_billable BOOLEAN DEFAULT true,
  start_date DATE,
  availability_hours_per_day JSONB, -- [7.5,7.5,7.5,7.5,7.5,0,0]
  cost_rate NUMERIC(10,2),
  bill_rate NUMERIC(10,2),
  currency CHAR(3) DEFAULT 'CAD',
  holiday_schedule TEXT DEFAULT 'CA_BC',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ACCOUNTS (clients + prospects)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  website TEXT,
  status TEXT NOT NULL CHECK (status IN ('prospect','client','inactive')) DEFAULT 'prospect',
  sales_owner_id UUID REFERENCES members(id),
  salesforce_id TEXT, -- for migration tracking
  ruddr_id TEXT,      -- for migration tracking
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CONTACTS
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  title TEXT,
  is_primary BOOLEAN DEFAULT false,
  salesforce_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- OPPORTUNITIES
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  primary_contact_id UUID REFERENCES contacts(id),
  owner_id UUID REFERENCES members(id),
  name TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('prospect','qualified','proposal','negotiation','won','lost')) DEFAULT 'prospect',
  value NUMERIC(12,2),
  currency CHAR(3) DEFAULT 'CAD',
  close_date DATE,
  probability INTEGER DEFAULT 10,
  type TEXT CHECK (type IN ('new','expansion','renewal')),
  description TEXT,
  lost_reason TEXT,
  salesforce_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PROJECTS
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  opportunity_id UUID REFERENCES opportunities(id),
  pm_id UUID REFERENCES members(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planning','active','on_hold','complete','cancelled')) DEFAULT 'planning',
  billing_type TEXT NOT NULL CHECK (billing_type IN ('time_and_materials','fixed_fee','retainer')),
  budget NUMERIC(12,2),
  currency CHAR(3) DEFAULT 'CAD',
  start_date DATE,
  end_date DATE,
  health TEXT CHECK (health IN ('green','amber','red')) DEFAULT 'green',
  notes TEXT,
  ruddr_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ALLOCATIONS (project + time_off)
CREATE TABLE allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  member_id UUID NOT NULL REFERENCES members(id),
  type TEXT NOT NULL CHECK (type IN ('project','time_off')),
  start_date DATE NOT NULL,
  end_date DATE,
  hours_per_week NUMERIC(5,2),
  total_hours NUMERIC(8,2),
  notes TEXT,
  ruddr_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- TIME ENTRIES
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  date DATE NOT NULL,
  hours NUMERIC(5,2) NOT NULL,
  description TEXT,
  is_billable BOOLEAN DEFAULT true,
  approved_by_id UUID REFERENCES members(id),
  approved_at TIMESTAMPTZ,
  invoiced_at TIMESTAMPTZ,
  ruddr_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- FORECAST SNAPSHOTS
CREATE TABLE forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month CHAR(7) NOT NULL, -- '2026-05'
  period TEXT NOT NULL,   -- 'P1','P2','opening','actual','live'
  type TEXT NOT NULL CHECK (type IN ('opening','weekly','actual','live')),
  snapshot_date DATE NOT NULL,
  total_hours NUMERIC(8,2),
  total_revenue NUMERIC(12,2),
  data JSONB NOT NULL,    -- full byProject + byMember snapshot
  captured_by_id UUID REFERENCES members(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INVOICES
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  account_id UUID NOT NULL REFERENCES accounts(id),
  number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','sent','paid','overdue','void')) DEFAULT 'draft',
  issue_date DATE,
  due_date DATE,
  paid_date DATE,
  subtotal NUMERIC(12,2),
  tax_rate NUMERIC(5,4) DEFAULT 0,
  tax_amount NUMERIC(12,2),
  total NUMERIC(12,2),
  currency CHAR(3) DEFAULT 'CAD',
  pdf_url TEXT,
  notes TEXT,
  ruddr_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- INVOICE LINE ITEMS
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(8,2),
  unit_price NUMERIC(10,2),
  amount NUMERIC(12,2) NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- PAYMENTS
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  method TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- OPPORTUNITY ACTIVITIES
CREATE TABLE opportunity_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES opportunities(id),
  member_id UUID NOT NULL REFERENCES members(id),
  contact_id UUID REFERENCES contacts(id),
  type TEXT NOT NULL CHECK (type IN ('call','email','meeting','note','task')),
  subject TEXT NOT NULL,
  body TEXT,
  activity_date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENT PORTAL USERS
CREATE TABLE client_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  email TEXT UNIQUE NOT NULL,
  google_id TEXT UNIQUE,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  invited_by_id UUID REFERENCES members(id),
  permissions JSONB DEFAULT '{"view_projects":true,"view_invoices":true,"view_time":false}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX idx_time_entries_member_date ON time_entries(member_id, date);
CREATE INDEX idx_time_entries_project ON time_entries(project_id);
CREATE INDEX idx_allocations_member ON allocations(member_id);
CREATE INDEX idx_allocations_project ON allocations(project_id);
CREATE INDEX idx_opportunities_account ON opportunities(account_id);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);
CREATE INDEX idx_projects_account ON projects(account_id);
CREATE INDEX idx_forecast_snapshots_month ON forecast_snapshots(month, type);
CREATE INDEX idx_invoices_account ON invoices(account_id);
CREATE INDEX idx_invoices_status ON invoices(status);
```

---

## 11. Console Build Instructions

When working in Claude Console / Workbench, always include these files as context:

| File | Purpose |
|---|---|
| `requirements.md` | This document — scope and decisions |
| `schema.sql` | Database schema — always keep current |
| `index.html` | Current dashboard (until migrated to React) |
| `proxy-worker.js` | API proxy Worker |
| `CONVENTIONS.md` | Code style, naming, patterns (create as you establish them) |

### System prompt for Console sessions
```
You are a senior full-stack developer building Belmar Cloud's internal business platform.
Stack: React + TypeScript (frontend), Hono.js on Cloudflare Workers (API), Neon Postgres (database), Google OAuth (auth), Cloudflare R2 (storage), Resend (email), Anthropic API (AI features).
Always write TypeScript. Always handle errors explicitly. Always return complete file contents when editing existing files.
Database: Neon Postgres — use parameterised queries, never string interpolation.
Auth: Google OAuth ID tokens verified server-side, sessions as signed JWTs in httpOnly cookies.
Refer to requirements.md and schema.sql for all entity definitions and business rules.
```

---

*Next step: Phase 0 — set up the repo, provision Neon, scaffold the Hono.js Worker, get Google OAuth working end-to-end.*
