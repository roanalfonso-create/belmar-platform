# Slack Bot Setup Guide
**Time:** ~30 minutes
**Result:** @belmar bot working in your Slack workspace

---

## Overview

You will:
1. Create a Slack app at api.slack.com
2. Deploy the `slack-worker.js` Cloudflare Worker
3. Connect them together
4. Invite the bot to your channels

---

## Step 1 — Create the Slack app

1. Go to **api.slack.com/apps**
2. Click **Create New App**
3. Choose **From scratch**
4. Fill in:
   - **App name:** `Belmar`
   - **Workspace:** select your Belmar Cloud workspace
5. Click **Create App**

You'll land on the app's Basic Information page. Keep this tab open.

---

## Step 2 — Configure bot permissions

1. In the left sidebar click **OAuth & Permissions**
2. Scroll to **Scopes** → **Bot Token Scopes**
3. Click **Add an OAuth Scope** and add each of these:

| Scope | Why |
|---|---|
| `app_mentions:read` | Receive @belmar mentions |
| `chat:write` | Post messages |
| `channels:history` | Read channel messages |
| `channels:read` | List channels |
| `users:read` | Look up user names |
| `users:read.email` | Match Slack users to platform members |
| `search:read` | Search Slack message history for agent context |

4. Scroll back up and click **Install to Workspace**
5. Click **Allow**
6. Copy the **Bot User OAuth Token** — starts with `xoxb-...`
   - Save this — you'll need it as a secret in Cloudflare

---

## Step 3 — Get the signing secret

1. Go to **Basic Information** (left sidebar)
2. Scroll to **App Credentials**
3. Copy the **Signing Secret**
   - Save this — you'll need it as a Cloudflare secret

---

## Step 4 — Deploy the Slack Worker to Cloudflare

1. Go to `dash.cloudflare.com` → **Workers & Pages** → **Create application** → **Start with Hello World**
2. Name it: `belmar-slack-bot`
3. Delete the default code
4. Paste the entire contents of `workers/slack-worker.js`
5. Click **Deploy**
6. Copy the Worker URL — e.g. `https://belmar-slack-bot.yourname.workers.dev`

### Add secrets to the Worker

Go to the Worker → **Settings** → **Variables and Secrets** → add each:

| Secret name | Value | Where to find it |
|---|---|---|
| `SLACK_BOT_TOKEN` | `xoxb-...` | Step 2 above |
| `SLACK_SIGNING_SECRET` | from Basic Information | Step 3 above |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | console.anthropic.com → API Keys |
| `RUDDR_MCP_URL` | `https://ruddr-mcp.roan-alfonso.workers.dev/mcp` | Your existing Ruddr Worker |
| `SALESFORCE_MCP_URL` | from your Salesforce MCP settings | Claude.ai → Settings → Integrations |
| `GMAIL_MCP_URL` | `https://gmailmcp.googleapis.com/mcp/v1` | Fixed — same for all |
| `CALENDAR_MCP_URL` | `https://calendarmcp.googleapis.com/mcp/v1` | Fixed — same for all |
| `GOOGLE_MCP_ACCESS_TOKEN` | OAuth token for Google MCP | See Google MCP setup below |
| `SLACK_OPS_CHANNEL` | Channel ID (e.g. `C07ABC123`) | Slack channel settings |

### Getting the Google MCP access token

The Gmail and Calendar MCP servers require an OAuth access token so the bot can
read emails and calendar events on behalf of your Google Workspace.

**Option A — Use your personal token (quickest for testing):**
1. Go to `console.cloud.google.com`
2. Select your Google Cloud project (or create one)
3. Enable the Gmail API and Google Calendar API
4. OAuth consent screen → add your `@belmarcloud.com` account as a test user
5. Create OAuth 2.0 credentials → Desktop app
6. Use the OAuth playground (`developers.google.com/oauthplayground`) to get an access token
7. Add it as the `GOOGLE_MCP_ACCESS_TOKEN` secret

**Option B — Service account (for production):**
This requires domain-wide delegation in Google Workspace Admin.
Recommended for the full platform build — raise with your Google Workspace admin.
See `docs/admin-guide.md` → Google Workspace section for full setup.

> **Note:** Access tokens expire after 1 hour. For production, the Worker needs
> to refresh tokens automatically using a refresh token + client credentials.
> This is part of the Phase 1 build — for now the bot will gracefully skip
> Gmail/Calendar context if the token has expired.

### Getting a Slack channel ID
1. In Slack, right-click the channel name → **View channel details**
2. Scroll to the bottom — the Channel ID starts with `C` (e.g. `C07ABC123`)
3. Use this ID (not the channel name) as the `SLACK_OPS_CHANNEL` secret

---

## Step 5 — Enable Event Subscriptions

1. Back in api.slack.com → your Belmar app → **Event Subscriptions** (left sidebar)
2. Toggle **Enable Events** to ON
3. In **Request URL** paste your Worker URL + `/slack/events`:
   ```
   https://belmar-slack-bot.yourname.workers.dev/slack/events
   ```
4. Slack will send a verification request — your Worker handles this automatically
5. You'll see a green **Verified** checkmark

### Subscribe to bot events

Scroll down to **Subscribe to bot events** → **Add Bot User Event**:

| Event | Why |
|---|---|
| `app_mention` | Fires when someone @mentions @belmar |

6. Click **Save Changes**

---

## Step 6 — Enable Slash commands (optional but useful)

Slash commands let users type `/forecast` instead of `@belmar what's the forecast`.

1. **Slash Commands** (left sidebar) → **Create New Command**
2. Add these commands:

| Command | Request URL | Description |
|---|---|---|
| `/forecast` | `https://belmar-slack-bot.yourname.workers.dev/slack/events` | Current month forecast |
| `/capacity` | same | Team capacity this week |
| `/pipeline` | same | Sales pipeline summary |

3. Click **Save** after each

> Slash command support can be added to the Worker in a later update.

---

## Step 7 — Add the bot to your channels

The bot needs to be invited to each channel it should respond in.

In Slack, go to each channel and type:
```
/invite @Belmar
```

Suggested channels to add it to:
- `#belmar-ops` (or create this channel)
- `#belmar-delivery`
- `#general` (optional)

---

## Step 8 — Test it

In the `#belmar-ops` channel, type:
```
@Belmar what's our forecast for May?
```

You should see:
1. A "thinking" message appear (the bot acknowledges)
2. A response from the Delivery Agent with live Ruddr data

If nothing happens, check the Worker logs:
- Cloudflare → belmar-slack-bot → **Logs** → **Begin log stream**
- Then send another message to see what error appears

---

## Step 9 — Set up scheduled messages (Cron Triggers)

The Worker can automatically post weekly reports and reminders.

1. Cloudflare → belmar-slack-bot → **Settings** → **Triggers** → **Cron Triggers**
2. Add these schedules:

| Cron expression | When | What it does |
|---|---|---|
| `0 8 * * 0` | 8am every Sunday | Weekly forecast update |
| `0 8 * * 1` | 8am every Monday | Monday briefing message |
| `0 8 1 * *` | 8am on 1st of month | Opening snapshot reminder |
| `0 17 L * *` | 5pm on last day of month | Month-end actual reminder |

3. Click **Add Cron Trigger** for each

---

## Example interactions

**PSA + Delivery:**
```
@Belmar what's our forecast vs opening for May?
@Belmar who has capacity this week?
@Belmar which projects are in shortfall?
@Belmar what's Blueberry River tracking at?
```

**Cross-domain (multi-source):**
```
@Belmar what's the full picture on Valley Health?
@Belmar is there anything I need to know before my call with UJA today?
@Belmar which clients haven't heard from us in the last 30 days?
@Belmar show me everything related to UJA this week
```

**Gmail + Calendar:**
```
@Belmar what emails are waiting for a reply?
@Belmar do I have any client calls today?
@Belmar has Valley Health replied to the invoice we sent?
@Belmar when did we last speak to Blueberry River?
```

**Slack history:**
```
@Belmar what was decided about the UJA scope last week?
@Belmar has anyone flagged issues on the Valley Health project?
@Belmar find the message where Cole mentioned the budget concern
```

**Actions:**
```
@Belmar log 6.5 hours on UJA CR#2 today — data migration review
@Belmar draft a follow-up to Valley Health about their overdue invoice
@Belmar book a 30 min call with David at UJA for next week
```

---

## Troubleshooting

**Bot doesn't respond:**
- Check it's been invited to the channel (`/invite @Belmar`)
- Check Worker logs for errors (Cloudflare → belmar-slack-bot → Logs)
- Verify all 5 secrets are set correctly

**"Invalid signature" errors in logs:**
- Make sure `SLACK_SIGNING_SECRET` matches exactly what's in Slack Basic Information
- Check the Worker URL in Slack Event Subscriptions matches exactly

**Ruddr data not loading:**
- Check `RUDDR_MCP_URL` secret is set correctly
- Test the Ruddr Worker directly: paste the MCP URL into your browser — should return `{"status":"ok"}`

**Bot responds but data is wrong:**
- The Delivery Agent is pulling live from Ruddr — if Ruddr data is stale, that's the source
- Check the cutover date logic in the agent prompt

---

## Adding new capabilities

To add a new agent or capability:

1. Add a new entry to the `AGENTS` object in `slack-worker.js`
2. Update the orchestrator prompt to mention the new agent and when to use it
3. Add MCP servers to `runAgent()` if the new agent needs data access
4. Commit to GitHub and redeploy the Worker

