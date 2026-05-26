# Belmar Cloud Platform — User Guide
**Version:** 0.1
**Last updated:** May 2026
**Audience:** All internal staff + client portal users

---

## Getting started

### Signing in
1. Go to your Belmar Cloud platform URL
2. Click **Sign in with Google**
3. Select your `@belmarcloud.com` Google account
4. You'll land on your personal dashboard

> **Client portal users:** you'll receive an invitation email with a link. Click it, sign in with any Google account, and you'll land directly on your client view.

### Your dashboard
When you sign in you'll see a summary relevant to your role:
- **Consultants** — your assigned projects, time logged this week, upcoming allocations
- **PMs / Delivery Leads** — project health overview, team utilisation, pending time approvals
- **Sales** — pipeline summary, open opportunities, recent activity
- **Finance** — unpaid invoices, revenue this month, overdue items
- **Admin** — everything above plus system health

---

## Time tracking

### Logging time
1. Click **Time** in the left navigation
2. Click **Log time** (top right)
3. Select the **Project** from the dropdown
4. Enter the **Date**, **Hours**, and a brief **Description**
5. Check **Billable** if the time is client-billable (defaults to on for most projects)
6. Click **Save**

> **Tip:** You can log time directly from a project page too — open the project and click **+ Log time** in the Time tab.

### Editing a time entry
- Find the entry in your time list
- Click the pencil icon to edit
- You can only edit your own unapproved entries
- Once a PM approves an entry it is locked — contact your PM to make changes

### Weekly time view
- Switch to **Week view** using the toggle at the top of the Time page
- See all your entries laid out by day
- The week total appears in the top right

### Time approval (PMs only)
1. Go to **Time** → **Pending approval**
2. Review entries submitted by your team
3. Click **Approve** to lock or **Return** to send back for correction
4. Add a note when returning an entry so the consultant knows what to fix

---

## Projects

### Viewing your projects
- Click **Projects** in the left navigation
- Your assigned projects appear at the top
- Use the search bar and filters (status, client, billing type) to find others

### Project page tabs
Each project has five tabs:

| Tab | What's here |
|---|---|
| **Overview** | Status, budget, dates, PM, health indicator |
| **Team** | Allocated members, hours per week, date range |
| **Time** | All time entries logged against this project |
| **Forecast** | Weekly snapshots, opening vs latest vs actual |
| **Invoices** | Invoices raised against this project |

### Project health
PMs set a health status visible on the project list:
- 🟢 **Green** — on track
- 🟡 **Amber** — minor concerns, being managed
- 🔴 **Red** — at risk, needs attention

### Forecast snapshots
The Forecast tab shows how the billable hour forecast has changed week by week throughout the month:
- **Opening (P1)** — forecast set on the 1st of the month
- **Weekly (P2, P3...)** — updated each Sunday
- **Actual** — final logged hours at month end
- **Live** — current real-time pull from the system

---

## Allocations

Allocations show when you are scheduled to work on a project and for how many hours per week.

### Viewing your schedule
- Click **My schedule** in the left navigation
- See a weekly calendar of your allocations across all projects
- Hover over an allocation block to see project details

### Capacity
Your profile has a set number of available hours per day (e.g. 7.5h Mon–Fri). The system calculates your **adjusted capacity** for each month by deducting:
- Approved time off
- Stat holidays (based on your holiday schedule)

If your allocated hours exceed your adjusted capacity your name will be flagged in the **Capacity** view.

---

## Forecast tracker (management view)

The forecast tracker is the main management dashboard for delivery. Access it from **Delivery → Forecast**.

### Month selector
Use the dropdown at the top to switch between months (Feb, March, April, May...).

### Cutover date
The date field controls the split between **actuals** (time already logged) and **planned** (allocations for the rest of the month). Defaults to yesterday.

### Tabs

**Shortfall map**
Bubble chart showing projects where the latest forecast is below the opening forecast. Top-right bubbles are the highest risk — large projects that have dropped significantly.
- 🔴 Red = Critical (dropped more than 20h)
- 🟠 Amber = Watch (10–20h drop)
- 🔵 Blue = Minor (under 10h)

**By project**
Full list of projects with current forecast, opening forecast, and change. Click any project row to expand and see which team members are allocated and how many hours each.

**By member**
Pivoted view showing each consultant's total forecast hours this month. Expand any row to see their project breakdown. The capacity badge shows whether they have hours available.

**Capacity**
Members grouped by capacity status:
- **Has capacity** — allocated below their adjusted monthly capacity
- **At capacity** — fully allocated
- **Over capacity** — allocated more than available — review needed

Each member row shows a breakdown: `raw capacity − time off = adjusted capacity`.

**Timeline**
Bar chart of all snapshots for the selected month, colour coded by type (opening/weekly/actual/live).

**Month history**
Comparison across all months showing opening vs latest vs actual and the variance.

---

## CRM — Accounts & contacts

### Finding an account
1. Click **Accounts** in the left navigation
2. Search by name or use filters (status, industry, owner)
3. Click an account to open its full page

### Account page
Each account shows:
- **Overview** — company details, sales owner, status
- **Contacts** — people at this company
- **Opportunities** — open and closed deals
- **Projects** — active and past projects
- **Activity** — calls, emails, meetings, notes

### Adding a contact
1. Open the account
2. Go to the **Contacts** tab
3. Click **+ Add contact**
4. Fill in name, email, title
5. Mark as **Primary contact** if they are the main point of contact

---

## CRM — Opportunities

### Pipeline view
Click **Pipeline** to see all opportunities laid out in a kanban board by stage:
**Prospect → Qualified → Proposal → Negotiation → Won / Lost**

Drag an opportunity card between columns to update its stage.

### Creating an opportunity
1. Click **+ New opportunity** from the Pipeline page or from an Account page
2. Fill in: name, account, value, expected close date, type (new / expansion / renewal)
3. Assign an owner
4. Click **Save** — it lands in Prospect stage

### Logging activity
Open an opportunity and click **+ Log activity** to record:
- **Call** — phone or video call with a contact
- **Email** — summary of an email exchange
- **Meeting** — in-person or online meeting
- **Note** — internal note about the opportunity
- **Task** — follow-up action (with due date)

### Closing an opportunity
**Won:**
1. Open the opportunity
2. Click **Close Won**
3. Confirm the final value and close date
4. The system creates a project shell linked to this opportunity
5. A PM is notified to set up the project

**Lost:**
1. Open the opportunity
2. Click **Close Lost**
3. Select a loss reason (required — helps track patterns)
4. The opportunity is archived but remains visible in the account history

---

## Invoices (Finance & PM)

### Creating an invoice
**From a project (T&M):**
1. Open the project → **Invoices** tab
2. Click **Generate invoice from time**
3. Select the date range of approved time entries to include
4. Review the auto-generated line items
5. Adjust if needed, add any fixed fee line items
6. Click **Save as draft**

**Fixed fee:**
1. Open the project → **Invoices** tab
2. Click **+ New invoice**
3. Add line items manually
4. Set the amount and due date

### Sending an invoice
1. Open the invoice
2. Review all details and line items
3. Click **Send to client**
4. The system emails the invoice PDF to the account's primary contact
5. The invoice appears in the client portal automatically

### Recording a payment
1. Open the paid invoice
2. Click **Mark as paid**
3. Enter payment date, amount, and reference number
4. The invoice status changes to **Paid**

---

## Client portal

### What clients can see
- **Projects** — name, PM, status, health, % complete
- **Time this month** — hours logged by consultant
- **Invoices** — all invoices, open and paid, with PDF download
- They cannot see: other clients' data, internal cost rates, member details beyond names

### Downloading an invoice
1. Go to **Invoices** in the portal
2. Find the invoice
3. Click the **Download PDF** button

---

## Getting help

- **Technical issues** — contact your system administrator
- **Time entry corrections after approval** — speak to your PM
- **Access issues** — speak to your Admin

---

*This document is maintained alongside the platform. If something has changed and isn't reflected here, please flag it to your Admin.*
