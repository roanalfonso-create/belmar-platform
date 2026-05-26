# Belmar Cloud — Internal Platform Requirements
**Version:** 0.2
**Date:** May 2026
**Scope:** Full replacement of Salesforce (CRM) + Ruddr (PSA) with a single AI-first internal platform, Slack as primary UI for agents and queries, plus a client-facing web portal. Agents have full context across CRM, PSA, Google Workspace (Gmail + Calendar), and Slack conversation history.

---

## 1. Context & Goals

Belmar Cloud is a Salesforce consulting firm. The platform needs to support the full business lifecycle:

**Sell → Deliver → Bill**

- **Replace Salesforce** — pipeline management, accounts, contacts, opportunities, proposals
- **Replace Ruddr** — projects, resource allocation, time tracking, forecasting, invoicing
- **AI-first interaction** — Slack is the primary interface for queries, actions, and alerts via intelligent agents
- **Web app** — full-featured browser UI for structured data entry, dashboards, and reporting
- **Add client portal** — clients can view project status, time logs, and invoices
- **Single source of truth** — one platform, one login, no more data living in two systems

### Constraints
- Single tenant (Belmar Cloud only)
- Authentication via Google OAuth (`@belmarcloud.com` accounts for internal users)
- Client portal users authenticate via Google (any domain — invited by Belmar)
- Data migration required from both Salesforce and Ruddr
- Built on Cloudflare infrastructure (Workers, Pages, R2, Neon)
- AI layer via Anthropic API (Claude Sonnet) — powers both Slack agents and web app intelligence
- Slack workspace is the primary real-time interface during and after transition
- Agents have cross-domain context: CRM + PSA + Gmail + Google Calendar + Slack history
- Google Workspace access via existing MCP connectors (Gmail MCP, Google Calendar MCP)
- Slack history access via Slack Search API (bot token with `search:read` scope)

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

## 3. AI Agent Layer (Slack-first)

### Philosophy
The platform is **AI-first**. Slack is not a bolt-on — it is the primary way the team interacts with business data day to day. The web app handles structured data entry and rich visualisation. Slack handles everything else — queries, alerts, quick actions, scheduled reports, and analysis.

### Interface layers

| Interface | Primary use | Who uses it |
|---|---|---|
| **Slack** | Queries, quick actions, alerts, scheduled reports | All internal staff |
| **Web app** | Dashboards, data entry, detailed views, reports | All internal staff |
| **Client portal** | Project status, invoices, time logs | Client users only |

### Agent architecture

```
SLACK MESSAGE
      ↓
ORCHESTRATOR AGENT
Reads message → decides which specialist agent handles it
      ↓
┌─────────────┬──────────────┬──────────────┬─────────────┬─────────────┐
│  DELIVERY   │    SALES     │   FINANCE    │   REPORT    │   ACTION    │
│   AGENT     │    AGENT     │    AGENT     │   AGENT     │   AGENT     │
│             │              │              │             │             │
│ Forecasts   │ Pipeline     │ Invoices     │ Cross-domain│ Writes data │
│ Capacity    │ Opportunities│ Payments     │ Trends      │ (confirmed) │
│ Allocations │ Accounts     │ Revenue      │ Anomalies   │             │
│ Time entries│ Contacts     │ Overdue      │ Analysis    │             │
│ Health      │ Activities   │              │             │             │
└─────────────┴──────────────┴──────────────┴─────────────┴─────────────┘
      ↓
PLATFORM API (Hono.js Worker) + MCP SERVERS (Ruddr, Salesforce during migration)
      ↓
RESPONSE → posted back to Slack thread
```

### Agent data sources

Each agent has access to a combination of data sources depending on its domain. The orchestrator selects which sources to activate per query.

| Data source | Access method | Available now? | Agent(s) |
|---|---|---|---|
| **Platform CRM** | Platform API | ⏳ Phase 3 | Sales, Report |
| **Platform PSA** | Platform API | ⏳ Phase 1 | Delivery, Finance, Report |
| **Ruddr** | Ruddr MCP | ✅ Now | Delivery, Report |
| **Salesforce** | Salesforce MCP | ✅ Now | Sales, Report |
| **Gmail** | Gmail MCP | ✅ Now | Sales, Delivery, Report, Action |
| **Google Calendar** | Calendar MCP | ✅ Now | Sales, Delivery, Report |
| **Slack history** | Slack Search API | ✅ Now (with `search:read` scope) | All agents |

### Cross-domain context examples

The power of multi-source agents is synthesising across all domains in a single answer:

```
@belmar what's the status on Valley Health?

Agent pulls from:
  → PSA:      Active project, 61.9h forecast, $16,347 rev, health green
  → CRM:      Account status client, sales owner Ro-An, last opp closed Jan
  → Gmail:    Last email 3 days ago — PM sent project update
  → Calendar: Steering committee call booked Friday 2pm
  → Slack:    #belmar-delivery mentioned budget concern last Tuesday

Response:
"*Valley Health Foundation* — here's the full picture:
• *Project:* MSA active, 61.9h forecast this month, on track (green)
• *Last contact:* Cole emailed an update 3 days ago
• *Upcoming:* Steering committee call Friday at 2pm
• *Heads up:* Budget concern raised in #belmar-delivery on Tuesday — 
  want me to pull that thread?"
```

```
@belmar is there anything I need to know before my call with UJA today?

Agent pulls from:
  → Calendar: Call found at 3pm with David Rosenberg (UJA)
  → CRM:      Account, open opportunity (Tax Receipting CR, $38k)
  → PSA:      UJA CR#2 project down 72h from opening forecast
  → Gmail:    Last email thread — invoice follow-up, no reply in 8 days
  → Slack:    Cole flagged scope creep in #belmar-delivery last week

Response:
"*Prep for UJA call at 3pm with David Rosenberg:*
• *Project health:* UJA CR#2 is down 72h from opening — flag this
• *Open invoice:* $21,395 sent 8 days ago, no payment yet
• *Scope concern:* Cole flagged potential scope creep last week 
  in #belmar-delivery — worth aligning on today
• *Opportunity:* Tax Receipting CR still open at $38k — good time 
  to progress this"
```

```
@belmar draft a follow-up email to Valley Health about their overdue invoice

Agent pulls from:
  → Finance:  Invoice #BC-2026-041, $16,347, 14 days overdue
  → CRM:      Primary contact: Sarah Chen, sarah@valleyhealth.org
  → Gmail:    Previous invoice emails — finds the original send
  → PSA:      Project is healthy — no delivery issues to flag

Response:
"Here's a draft — reply YES to send, or edit first:

To: sarah@valleyhealth.org
Subject: Re: Invoice BC-2026-041 — Valley Health Foundation

Hi Sarah,

I wanted to follow up on invoice BC-2026-041 for $16,347...
[full draft shown]

Send this? Reply YES to confirm."
```

### Agent capabilities by phase

| Agent | Phase 0 (now) | Phase 1 (PSA built) | Phase 3 (CRM built) |
|---|---|---|---|
| Delivery | ✅ Ruddr + Gmail + Calendar + Slack | ✅ Platform API + Gmail + Calendar + Slack | ✅ |
| Sales | ✅ Salesforce + Gmail + Calendar + Slack | ✅ + PSA context | ✅ Platform CRM + all sources |
| Finance | ⏳ Context only | ✅ Invoices + Gmail + Slack | ✅ |
| Report | ✅ Ruddr + Salesforce + Gmail + Slack | ✅ Full PSA + billing | ✅ Full cross-domain |
| Action | ✅ Gmail drafts + Calendar | ✅ Time, approvals + email send | ✅ Full CRM + billing |

### Agent interaction patterns

**PSA queries:**
```
@belmar what's our forecast vs opening for May?
@belmar who has capacity this week?
@belmar show me all projects in shortfall
@belmar what's Blueberry River tracking at?
```

**CRM queries:**
```
@belmar what's the pipeline weighted value?
@belmar show me all opportunities closing this month
@belmar what's the status on the UJA expansion?
```

**Cross-domain queries (multi-source):**
```
@belmar what's the full picture on Valley Health?
@belmar is there anything I need to know before my 3pm call?
@belmar which clients haven't heard from us in 30 days?
@belmar show me everything related to UJA this week
```

**Gmail + Calendar aware:**
```
@belmar what emails are waiting for a response?
@belmar do I have any client calls today?
@belmar has Sarah Chen replied to the invoice we sent?
@belmar when did we last speak to Blueberry River?
```

**Slack history:**
```
@belmar what was decided about the UJA scope last week?
@belmar has anyone flagged issues on the Valley Health project?
@belmar find the message where Cole mentioned the budget concern
```

**Actions (write, with confirmation):**
```
User:   @belmar log 6.5 hours on UJA CR#2 today — data migration review
Bot:    Log 6.5h on UJA CR#2 for Cole Berry, May 26? Reply YES to confirm.
User:   yes
Bot:    ✓ Logged. You're at 38h this week.

User:   @belmar draft a follow-up to Valley Health about their overdue invoice
Bot:    [shows draft email with full context pulled from CRM + Finance]
        Send this to sarah@valleyhealth.org? Reply YES to confirm.

User:   @belmar book a 30 min call with David at UJA for next week
Bot:    Found David Rosenberg (david@uja.org) in CRM. 
        You're both free Tuesday 2pm or Wednesday 10am. Which works?
```

**Analysis:**
```
@belmar why did March actual beat the opening by 167h?
@belmar which clients are we most at risk of under-delivering to?
@belmar is there a pattern in our lost opportunities this year?
@belmar who on the team has the strongest relationship with Valley Health?
```

**Proactive / scheduled:**
- Every Sunday 8am: weekly forecast snapshot + summary posted to `#belmar-ops`
- Every Monday 8am: weekly briefing with pending approvals and key metrics
- 1st of month: opening snapshot reminder
- Last day of month: actual snapshot reminder
- Ad hoc alerts: forecast drop >10%, invoice overdue, member over capacity

### Slack channel structure

| Channel | Purpose | Bot behaviour |
|---|---|---|
| `#belmar-ops` | General queries, daily updates | Responds to @mentions, posts scheduled reports |
| `#belmar-delivery` | Project health, forecasts, capacity | Responds to @mentions, posts forecast alerts |
| `#belmar-sales` | Pipeline updates, opportunity activity | Responds to @mentions |
| `#belmar-finance` | Invoice alerts, payment notifications | Responds to @mentions, posts overdue alerts |
| `#belmar-admin` | System alerts, errors (bot only posts) | System notifications only |

### Action confirmation flow
All write operations require explicit confirmation before execution:
1. User requests action
2. Bot summarises exactly what it will do (entity, values, affected records)
3. User replies YES (or cancel)
4. Bot executes and confirms, or cancels cleanly
5. Destructive or financial actions (send invoice, mark paid) always require confirmation regardless of phrasing

### Agent context and memory
- Each Slack thread maintains conversation context
- Agents remember prior turns within the same thread (e.g. "what about last month?" resolves correctly)
- Cross-session memory is not persisted — each new thread starts fresh
- Agents have access to today's date at all times

---

## 4. Entities & Relationships

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

## 5. Workflows

### 5.1 Sell

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

### 5.2 Deliver

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

### 5.3 Bill

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

### 5.4 Client portal

```
Client logs in with Google (their own Google account, any domain)
→ Sees only their own account's data
→ Views: active projects, time logged this month, open invoices, invoice history
→ Can download invoices as PDF
→ Cannot see other clients, internal costs, or member rates
```

---

## 6. Key Views & Reports

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

## 7. Data Migration Plan

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

## 8. Integration Points (during transition)

| System | Direction | Purpose | When to retire |
|---|---|---|---|
| Ruddr | Read (API) | Live data during migration | Phase 2 complete |
| Salesforce | Read (MCP) | Opportunity sync during migration | Phase 3 complete |
| Google OAuth | Auth | Login for all users | Never — keep |
| Resend | Send | Invoice emails, notifications | Keep |
| Cloudflare R2 | Storage | Proposals, SOWs, invoice PDFs | Keep |
| Xero / QuickBooks | Write (future) | Accounting sync | Phase 4 |

---

## 9. Technical Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  INTERFACES                                                   │
│                                                              │
│  Slack (@belmar bot)          Web app          Client portal │
│  Primary daily interface      Full UI          External only │
└───────┬──────────────────────────┬──────────────────┬────────┘
        │                          │                  │
        │ Slack Events API         │ HTTPS + JWT      │
┌───────▼──────────────────────────▼──────────────────▼────────┐
│  API LAYER  (Cloudflare Workers — Hono.js TypeScript)         │
│                                                              │
│  /api/v1/...          REST API for web app                   │
│  /slack/events        Slack webhook receiver                 │
│  /slack/actions       Slack interactive components           │
│  /portal/api/...      Client portal API (restricted)         │
│                                                              │
│  AGENT ORCHESTRATION                                         │
│  Orchestrator → Delivery | Sales | Finance | Report | Action │
└──────┬───────────────────────────────────────────────────────┘
       │
┌──────▼──────┐  ┌─────────────┐  ┌──────────┐  ┌───────────┐
│  Neon       │  │ Anthropic   │  │ Cloudflare│  │  Resend   │
│  Postgres   │  │ API (Claude)│  │ R2 Storage│  │  (email)  │
│  (database) │  │ (agents)    │  │ (files)   │  │           │
└─────────────┘  └─────────────┘  └──────────┘  └───────────┘
       ↑
┌──────┴──────────────────────────────────────────────────────┐
│  MCP SERVERS (during migration — retire per phase)           │
│  Ruddr MCP (retire Phase 2) · Salesforce MCP (retire Phase 3)│
└─────────────────────────────────────────────────────────────┘
```

### Cloudflare Workers deployed

| Worker | Purpose | Secrets needed |
|---|---|---|
| `belmar-api` | Main Hono.js API + agent orchestration | `NEON_DATABASE_URL`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` |
| `belmar-ai-proxy` | Anthropic API proxy for web app (browser → Claude) | `ANTHROPIC_API_KEY` |
| `belmar-slack-bot` | Slack event receiver + agent runner | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ANTHROPIC_API_KEY`, `RUDDR_MCP_URL`, `SLACK_OPS_CHANNEL` |
| `ruddr-mcp` | Ruddr API connector (retire Phase 2) | `RUDDR_API_KEY` |

### API route structure
```
-- Auth
POST   /api/auth/google          exchange Google token for session JWT
GET    /api/auth/me              current user

-- Accounts
GET    /api/accounts             list (filterable)
POST   /api/accounts             create
GET    /api/accounts/:id         get + contacts + opportunities + projects
PATCH  /api/accounts/:id         update

-- Contacts
POST   /api/contacts             create
PATCH  /api/contacts/:id         update

-- Opportunities
GET    /api/opportunities        list (filterable by stage, owner, account)
POST   /api/opportunities        create
PATCH  /api/opportunities/:id    update (including stage change)
POST   /api/opportunities/:id/won  close won → creates project shell

-- Projects
GET    /api/projects             list
POST   /api/projects             create
GET    /api/projects/:id         get + members + time + invoices
PATCH  /api/projects/:id         update

-- Members + capacity
GET    /api/members              list
GET    /api/members/:id/capacity adjusted capacity for date range

-- Time
POST   /api/time                 log time entry
GET    /api/time                 list (filterable)
PATCH  /api/time/:id/approve     approve time entry

-- Forecast
GET    /api/forecast/snapshots   list snapshots
POST   /api/forecast/snapshot    capture new snapshot

-- Invoices
GET    /api/invoices             list
POST   /api/invoices             create
POST   /api/invoices/:id/send    generate PDF + send via Resend
PATCH  /api/invoices/:id/pay     mark paid

-- Slack (internal — verified by Slack signature)
POST   /slack/events             receive Slack events
POST   /slack/actions            receive Slack interactive actions

-- Portal (ClientUser JWT — restricted to own account)
GET    /portal/api/projects      client's projects only
GET    /portal/api/invoices      client's invoices only
GET    /portal/api/invoices/:id/pdf  download PDF
```

---

## 10. Build Phases

### Phase 0 — Foundation (weeks 1–3)
- [ ] GitHub repo set up (`belmar-platform`)
- [ ] Neon database provisioned and schema applied
- [ ] Hono.js Worker scaffold deployed to Cloudflare
- [ ] Google OAuth working end-to-end (internal users)
- [ ] Database schema migrated (`schema.sql`)
- [ ] Basic React app shell on Cloudflare Pages
- [ ] CI/CD: push to main → auto deploy via Cloudflare Pages
- [ ] **Slack bot live** — `belmar-slack-bot` Worker deployed
- [ ] **Delivery agent working** — queries Ruddr MCP, responds in Slack
- [ ] **Scheduled posts** — Sunday forecast update, Monday briefing live
- [ ] Slack users linked to Member records

### Phase 1 — PSA (weeks 4–10)
- [ ] Members CRUD (web app)
- [ ] Projects CRUD (web app)
- [ ] Allocations + adjusted capacity calculation
- [ ] Time entry logging + approval (web app + **Slack action agent**)
- [ ] Forecast snapshots — database-backed, automated cron
- [ ] Ruddr data migration script
- [ ] Run parallel with Ruddr — validate parity
- [ ] **Delivery agent switches from Ruddr MCP to platform API**
- [ ] **Action agent: log time, approve time via Slack**
- [ ] **Report agent: full delivery + capacity cross-analysis**

### Phase 2 — Billing (weeks 10–14)
- [ ] Invoice generation (T&M + fixed fee) — web app
- [ ] PDF generation (Worker + HTML template → R2)
- [ ] Resend integration (invoice emails)
- [ ] Payment tracking
- [ ] Finance reporting views
- [ ] **Finance agent: invoice status, overdue alerts, revenue queries**
- [ ] **Proactive Slack alert: invoice overdue, payment received**
- [ ] Retire Ruddr

### Phase 3 — CRM (weeks 14–22)
- [ ] Accounts + Contacts CRUD (web app)
- [ ] Opportunities + pipeline kanban (web app)
- [ ] Activity logging (web app + **Slack: "@belmar log call with Valley Health..."**)
- [ ] Proposals (file upload to R2)
- [ ] Opportunity → Project handoff
- [ ] Salesforce data migration script
- [ ] Run parallel with Salesforce — validate parity
- [ ] **Sales agent: pipeline queries, opportunity updates, account lookup**
- [ ] **Action agent: create opportunity, update stage, log activity via Slack**
- [ ] Retire Salesforce

### Phase 4 — Client Portal (weeks 20–24)
- [ ] ClientUser auth (Google OAuth, any domain)
- [ ] Client invitation flow (web app + email)
- [ ] Portal views (projects, time, invoices)
- [ ] Invoice PDF download
- [ ] Notification emails (invoice sent, project update)

### Phase 5 — AI + Polish (ongoing)
- [ ] Natural language queries across all domains
- [ ] Anomaly detection ("UJA CR#2 is down 15h this week — want me to investigate?")
- [ ] Proposal drafting assistant via Slack
- [ ] Smart invoice chasing — draft follow-up emails
- [ ] Capacity recommendations — suggest reallocation to shortfall projects
- [ ] Accounting system sync (Xero/QuickBooks)
- [ ] Mobile-friendly web app

---

## 11. Database Schema (starter — expand per phase)

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

-- SLACK INTEGRATION
CREATE TABLE slack_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id),
  slack_user_id TEXT UNIQUE NOT NULL,  -- Slack's U... ID
  slack_workspace_id TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent conversation log (for audit + debugging)
CREATE TABLE agent_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_channel_id TEXT NOT NULL,
  slack_thread_ts TEXT NOT NULL,
  slack_user_id TEXT,
  member_id UUID REFERENCES members(id),
  agent TEXT NOT NULL,               -- delivery | sales | finance | report | action
  user_message TEXT NOT NULL,
  agent_response TEXT,
  was_action BOOLEAN DEFAULT false,
  action_confirmed BOOLEAN,
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_agent_conversations_thread ON agent_conversations(slack_thread_ts);
CREATE INDEX idx_agent_conversations_member ON agent_conversations(member_id);
CREATE INDEX idx_slack_users_member ON slack_users(member_id);
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

## 12. Console Build Instructions

When working in Claude Console / Workbench, always include these files as context:

| File | Purpose | Keep updated? |
|---|---|---|
| `requirements.md` | This document — scope and decisions | Yes — update when scope changes |
| `schema.sql` | Database schema | Yes — update with every migration |
| `index.html` | Current dashboard (until migrated to React) | Yes — always latest version |
| `workers/proxy-worker.js` | Anthropic API proxy | Only if changed |
| `workers/slack-worker.js` | Slack bot + agents | Yes — update as agents evolve |
| `CONVENTIONS.md` | Code style, naming, patterns | Yes — add patterns as established |

### System prompt for Console sessions
```
You are a senior full-stack developer building Belmar Cloud's internal business platform.

Stack:
- Frontend: React + TypeScript on Cloudflare Pages
- API: Hono.js on Cloudflare Workers (TypeScript)
- Database: Neon Postgres — parameterised queries only, never string interpolation
- Auth: Google OAuth ID tokens verified server-side, sessions as signed JWTs in httpOnly cookies
- AI: Anthropic Claude Sonnet via API — agents orchestrated in slack-worker.js
- Slack: Multi-agent bot — Orchestrator routes to Delivery / Sales / Finance / Report / Action agents
- Storage: Cloudflare R2 for files
- Email: Resend for transactional email

Rules:
- Always write TypeScript
- Always handle errors explicitly
- Always return complete file contents when editing existing files
- Refer to requirements.md for scope and business rules
- Refer to schema.sql for all entity definitions
- When adding Slack agent capabilities, follow the existing agent pattern in slack-worker.js
```

### Useful Console session starters

**Starting Phase 0:**
> *"Scaffold a Hono.js Cloudflare Worker in TypeScript that connects to Neon Postgres and implements Google OAuth. Follow Phase 0 from requirements.md."*

**Adding a new Slack agent capability:**
> *"Add the ability for the Delivery agent in slack-worker.js to answer questions about member capacity. It should pull adjusted capacity from the platform API (GET /api/members/:id/capacity). Here is the current slack-worker.js: [paste file]"*

**Building a new API endpoint:**
> *"Add the POST /api/time endpoint to the Hono.js API Worker. Follow the schema in requirements.md for the time_entries table. Include validation, error handling, and role-based access (consultants can only log their own time)."*

---

*Next step: Phase 0 — set up the repo, provision Neon, scaffold the Hono.js Worker, get Google OAuth and Slack bot working end-to-end.*
