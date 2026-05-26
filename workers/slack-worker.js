/**
 * Belmar Cloud — Slack Bot Worker
 * Cloudflare Worker that receives Slack events, orchestrates
 * AI agents via Claude, and posts responses back to Slack.
 *
 * Agents have full cross-domain context:
 *   - Platform CRM + PSA (via platform API — Phase 1+)
 *   - Ruddr (via MCP — now, until Phase 2)
 *   - Salesforce (via MCP — now, until Phase 3)
 *   - Gmail (via Gmail MCP — now)
 *   - Google Calendar (via Calendar MCP — now)
 *   - Slack conversation history (via Slack Search API — now)
 *
 * Setup:
 * 1. Create a Slack app at api.slack.com (see docs/slack-setup.md)
 * 2. Create a new Cloudflare Worker, paste this file
 * 3. Add secrets (Settings → Variables → Secrets):
 *      SLACK_BOT_TOKEN           xoxb-...
 *      SLACK_SIGNING_SECRET      from Slack app Basic Information page
 *      ANTHROPIC_API_KEY         sk-ant-...
 *      RUDDR_MCP_URL             https://ruddr-mcp.roan-alfonso.workers.dev/mcp
 *      SALESFORCE_MCP_URL        from your Salesforce MCP connector
 *      GMAIL_MCP_URL             https://gmailmcp.googleapis.com/mcp/v1
 *      CALENDAR_MCP_URL          https://calendarmcp.googleapis.com/mcp/v1
 *      GOOGLE_MCP_ACCESS_TOKEN   OAuth access token for Google MCP servers
 * 4. Deploy — copy the Worker URL
 * 5. In Slack app settings → Event Subscriptions → paste Worker URL + /slack/events
 * 6. Add search:read scope to the Slack bot token (see docs/slack-setup.md)
 */

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

// ── Agents ─────────────────────────────────────────────────────────────────
// ── MCP server builder ─────────────────────────────────────────────────────
// Builds the list of MCP servers to attach to a Claude call based on
// which data sources the agent needs. Google MCP servers require an
// OAuth access token passed as a header.
function buildMcpServers(sources, env) {
  const servers = [];

  if (sources.includes("ruddr") && env.RUDDR_MCP_URL) {
    servers.push({ type: "url", url: env.RUDDR_MCP_URL, name: "ruddr" });
  }
  if (sources.includes("salesforce") && env.SALESFORCE_MCP_URL) {
    servers.push({ type: "url", url: env.SALESFORCE_MCP_URL, name: "salesforce" });
  }
  if (sources.includes("gmail") && env.GMAIL_MCP_URL) {
    servers.push({
      type: "url", url: env.GMAIL_MCP_URL, name: "gmail",
      headers: env.GOOGLE_MCP_ACCESS_TOKEN
        ? { Authorization: `Bearer ${env.GOOGLE_MCP_ACCESS_TOKEN}` }
        : {},
    });
  }
  if (sources.includes("calendar") && env.CALENDAR_MCP_URL) {
    servers.push({
      type: "url", url: env.CALENDAR_MCP_URL, name: "google_calendar",
      headers: env.GOOGLE_MCP_ACCESS_TOKEN
        ? { Authorization: `Bearer ${env.GOOGLE_MCP_ACCESS_TOKEN}` }
        : {},
    });
  }

  return servers;
}

// ── Slack history search ────────────────────────────────────────────────────
// Searches Slack message history for relevant context before running an agent.
// Returns a formatted string of recent relevant messages or empty string.
async function searchSlackHistory(query, token, maxResults = 5) {
  if (!token) return "";
  try {
    const res = await fetch(
      `https://slack.com/api/search.messages?query=${encodeURIComponent(query)}&count=${maxResults}&sort=timestamp`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    if (!data.ok || !data.messages?.matches?.length) return "";

    const messages = data.messages.matches
      .slice(0, maxResults)
      .map(m => {
        const date = new Date(parseFloat(m.ts) * 1000).toLocaleDateString("en-CA");
        const channel = m.channel?.name ? `#${m.channel.name}` : "Slack";
        const user = m.username || m.user || "someone";
        return `[${date} in ${channel}] ${user}: ${m.text?.slice(0, 200)}`;
      })
      .join("\n");

    return messages ? `\n\nRelevant Slack history:\n${messages}` : "";
  } catch (e) {
    console.error("Slack search error:", e);
    return "";
  }
}

const TODAY = new Date().toISOString().slice(0, 10);

const BASE_INSTRUCTIONS = `
Always be concise — this is a Slack response, not a report.
Use bullet points for lists. Use *bold* for key numbers and names.
When showing hours, round to 1 decimal place. Currency in CAD unless stated.
If data is unavailable from your tools, say so clearly rather than guessing.
When you have context from multiple sources (PSA, CRM, email, calendar, Slack history),
synthesise it into a single coherent answer rather than listing sources separately.
Today's date is ${TODAY}.`;

const AGENTS = {
  delivery: {
    name: "Delivery Agent",
    emoji: "📊",
    // Data sources this agent uses
    sources: ["ruddr", "gmail", "calendar"],
    systemPrompt: `You are the Delivery Agent for Belmar Cloud, a Salesforce consulting firm.
You have access to multiple data sources to give a complete picture of delivery health:

RUDDR (PSA data):
- Project forecasts and actuals (billable hours, week-over-week changes)
- Resource allocations, capacity, and utilisation
- Member availability and time-off
- Forecast shortfalls and variance from opening

GMAIL:
- Recent email exchanges with clients about projects
- Unanswered emails related to projects
- Proposal or SOW threads

GOOGLE CALENDAR:
- Upcoming client meetings and project calls
- Steering committee or review sessions

When a user asks about a project or client, check ALL available sources and
synthesise the information into a complete status update.
${BASE_INSTRUCTIONS}`,
  },

  sales: {
    name: "Sales Agent",
    emoji: "🎯",
    sources: ["salesforce", "gmail", "calendar"],
    systemPrompt: `You are the Sales Agent for Belmar Cloud.
You have access to multiple data sources to give a complete picture of sales activity:

SALESFORCE (CRM data):
- Pipeline opportunities by stage and value
- Account status and history
- Contact information
- Activity history

GMAIL:
- Recent email threads with prospects and clients
- Proposal follow-ups awaiting response
- Introduction or outreach threads

GOOGLE CALENDAR:
- Upcoming sales calls and demos
- Discovery or proposal meetings

When asked about a client, opportunity, or pipeline status, check ALL available
sources and synthesise into a complete answer.
${BASE_INSTRUCTIONS}`,
  },

  finance: {
    name: "Finance Agent",
    emoji: "💰",
    sources: ["ruddr", "gmail"],
    systemPrompt: `You are the Finance Agent for Belmar Cloud.
You have access to:

RUDDR (billing data):
- Invoices — status, amounts, due dates
- Payments received
- Revenue by project and client

GMAIL:
- Invoice email threads
- Payment confirmations
- Overdue chasing correspondence

When asked about invoices or payments, check both Ruddr data and Gmail for the
full picture — e.g. whether a client has already replied about a payment.
${BASE_INSTRUCTIONS}`,
  },

  report: {
    name: "Report Agent",
    emoji: "📈",
    sources: ["ruddr", "salesforce", "gmail", "calendar"],
    systemPrompt: `You are the Report Agent for Belmar Cloud.
You synthesise data across ALL available sources to answer cross-domain questions,
identify trends, spot anomalies, and provide business intelligence.

You have access to:
- RUDDR: delivery, forecasts, capacity, time entries
- SALESFORCE: pipeline, opportunities, accounts
- GMAIL: email activity, client communication patterns
- GOOGLE CALENDAR: meeting cadence, upcoming events

Use all available sources to answer questions like:
- "What's the full picture on [client]?"
- "Which clients haven't heard from us recently?"
- "What are our biggest risks this month?"
- "Compare this month vs last month"

Always synthesise across sources — do not just list data from one tool.
${BASE_INSTRUCTIONS}`,
  },
};

// ── Orchestrator system prompt ──────────────────────────────────────────────
const ORCHESTRATOR_PROMPT = `You are the Belmar Cloud AI orchestrator.
Your job is to read a Slack message and return ONLY a JSON object deciding how to handle it.

Available agents and their data sources:
- "delivery" — forecasts, allocations, capacity, time entries, project health (Ruddr + Gmail + Calendar)
- "sales"    — pipeline, opportunities, accounts, contacts (Salesforce + Gmail + Calendar)
- "finance"  — invoices, payments, revenue, overdue (Ruddr + Gmail)
- "report"   — cross-domain questions spanning multiple domains, full client picture, trends (all sources)
- "action"   — user wants to DO something: log time, draft/send email, book calendar event, update a record
- "chitchat" — greetings, thanks, off-topic

Routing rules:
- Use "report" when the question spans multiple domains or asks for a "full picture" of a client/project
- Use "report" when asking about communication history, relationship health, or last contact
- Use "delivery" for PSA-only questions (forecasts, hours, capacity)
- Use "sales" for CRM-only questions (pipeline, opps, accounts)
- Use "finance" for billing-only questions (invoices, payments)
- Use "action" when the user says "draft", "send", "book", "log", "create", "update"

Also extract a search query for Slack history context (2-5 keywords relevant to the question).

Return exactly:
{
  "agent": "<agent name>",
  "intent": "<one sentence describing what the user wants>",
  "isAction": <true if this would write/change data or send something, false if read-only>,
  "slackSearchQuery": "<2-5 keywords to search Slack history for relevant context>",
  "confidence": <0.0-1.0>
}

Return ONLY the JSON, no markdown.`;

// ── Verify Slack signature ──────────────────────────────────────────────────
async function verifySlackSignature(request, body, signingSecret) {
  const timestamp = request.headers.get("X-Slack-Request-Timestamp");
  const signature = request.headers.get("X-Slack-Signature");
  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBasestring));
  const hexSig = "v0=" + Array.from(new Uint8Array(sigBytes))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return hexSig === signature;
}

// ── Post message to Slack ───────────────────────────────────────────────────
async function postToSlack(token, channel, text, threadTs = null) {
  const body = { channel, text };
  if (threadTs) body.thread_ts = threadTs;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// ── Post a "thinking" indicator ─────────────────────────────────────────────
async function postThinking(token, channel, threadTs, agentName, emoji) {
  return postToSlack(token, channel, `${emoji} _${agentName} is thinking..._`, threadTs);
}

// ── Call Claude (with optional MCP) ────────────────────────────────────────
async function callClaude(apiKey, systemPrompt, userMessage, mcpServers = [], maxTokens = 1000) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  };

  if (mcpServers.length > 0) {
    body.mcp_servers = mcpServers;
  }

  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-04-04",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("\n")
    .trim();
}

// ── Orchestrate: decide which agent handles this ───────────────────────────
async function orchestrate(apiKey, userMessage) {
  try {
    const raw = await callClaude(apiKey, ORCHESTRATOR_PROMPT, userMessage, [], 200);
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error("Orchestrator error:", e);
    return { agent: "delivery", intent: userMessage, isAction: false, confidence: 0.5 };
  }
}

// ── Run a specific agent ────────────────────────────────────────────────────
async function runAgent(agentKey, userMessage, env, slackContext = "") {
  const agent = AGENTS[agentKey];
  if (!agent) return "I'm not sure how to help with that yet.";

  // Build MCP servers based on agent's declared sources
  const mcpServers = buildMcpServers(agent.sources || [], env);

  // Prepend any Slack history context to the user message
  const enrichedMessage = slackContext
    ? `${userMessage}\n\n---\nRelevant Slack context (use if helpful):\n${slackContext}`
    : userMessage;

  return callClaude(
    env.ANTHROPIC_API_KEY,
    agent.systemPrompt,
    enrichedMessage,
    mcpServers,
    2000
  );
}

// ── Handle action intent (confirmation flow) ───────────────────────────────
async function handleAction(userMessage, channel, threadTs, env) {
  // For now, acknowledge and explain — full action handling comes in Phase 1
  await postToSlack(
    env.SLACK_BOT_TOKEN,
    channel,
    `⚡ I can see you want to take an action. Full write capabilities are coming in Phase 1 of the platform build.\n\nFor now, please use Ruddr or Salesforce directly for data entry.\n\n_Intent detected: "${userMessage}"_`,
    threadTs
  );
}

// ── Process a Slack message event ──────────────────────────────────────────
async function processMessage(event, env) {
  const { text, channel, ts, thread_ts, user } = event;
  const threadTs = thread_ts || ts;

  // Strip bot mention from message (e.g. "<@U123ABC> what's the forecast" → "what's the forecast")
  const cleanText = text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!cleanText) {
    await postToSlack(env.SLACK_BOT_TOKEN, channel, "Hey! Ask me anything about forecasts, pipeline, capacity, or invoices.", threadTs);
    return;
  }

  try {
    // Step 1: Orchestrate — decide which agent + extract search query
    const routing = await orchestrate(env.ANTHROPIC_API_KEY, cleanText);
    console.log("Routing:", JSON.stringify(routing));

    // Step 2: Handle action intents with confirmation flow
    if (routing.isAction) {
      await handleAction(cleanText, channel, threadTs, env);
      return;
    }

    // Step 3: Handle chitchat directly
    if (routing.agent === "chitchat") {
      await postToSlack(
        env.SLACK_BOT_TOKEN,
        channel,
        "Hey! 👋 I'm the Belmar Cloud assistant. Ask me about projects, pipeline, capacity, invoices, emails, or anything happening across the business.",
        threadTs
      );
      return;
    }

    // Step 4: Run the appropriate agent
    const agent = AGENTS[routing.agent] || AGENTS.delivery;

    // Post thinking indicator
    await postThinking(env.SLACK_BOT_TOKEN, channel, threadTs, agent.name, agent.emoji);

    // Step 5: Search Slack history for relevant context (parallel with agent prep)
    const slackContext = routing.slackSearchQuery
      ? await searchSlackHistory(routing.slackSearchQuery, env.SLACK_BOT_TOKEN)
      : "";

    // Step 6: Run the agent with all context
    const response = await runAgent(routing.agent, cleanText, env, slackContext);

    // Post the response
    await postToSlack(
      env.SLACK_BOT_TOKEN,
      channel,
      `${agent.emoji} *${agent.name}*\n\n${response}`,
      threadTs
    );

  } catch (e) {
    console.error("processMessage error:", e);
    await postToSlack(
      env.SLACK_BOT_TOKEN,
      channel,
      `❌ Something went wrong: ${e.message}. Try again or check the logs.`,
      threadTs
    );
  }
}

// ── Main Worker ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", service: "belmar-slack-bot" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Only handle POST to /slack/events
    if (url.pathname !== "/slack/events" || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }

    // Read body as text for signature verification
    const bodyText = await request.text();

    // Verify Slack signature
    const valid = await verifySlackSignature(request, bodyText, env.SLACK_SIGNING_SECRET);
    if (!valid) {
      return new Response("Invalid signature", { status: 401 });
    }

    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    // Slack URL verification challenge (one-time setup)
    if (payload.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Process events
    if (payload.type === "event_callback") {
      const event = payload.event;

      // Only handle app_mention events (when someone @mentions the bot)
      // To handle all messages in a channel, also include "message" type
      if (event.type === "app_mention" && !event.bot_id) {
        // Respond to Slack immediately (required within 3 seconds)
        // Process the actual work asynchronously using waitUntil
        const ctx = { waitUntil: (p) => p }; // Cloudflare provides this automatically
        processMessage(event, env).catch(console.error);

        return new Response("", { status: 200 });
      }
    }

    return new Response("", { status: 200 });
  },

  // ── Scheduled triggers (cron) ─────────────────────────────────────────────
  async scheduled(event, env) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
    const dayOfMonth = now.getDate();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Sunday — weekly forecast snapshot notification
    if (dayOfWeek === 0) {
      await postScheduledWeeklyReport(env);
    }

    // Monday — weekly briefing
    if (dayOfWeek === 1) {
      await postMondayBriefing(env);
    }

    // 1st of month — opening snapshot reminder
    if (dayOfMonth === 1) {
      await postMonthOpeningReminder(env);
    }

    // Last day of month — actual snapshot reminder
    if (dayOfMonth === lastDayOfMonth) {
      await postMonthEndReminder(env);
    }
  },
};

// ── Scheduled message handlers ─────────────────────────────────────────────
async function postScheduledWeeklyReport(env) {
  if (!env.SLACK_OPS_CHANNEL) return;

  const response = await runAgent(
    "delivery",
    `Give me a brief Sunday forecast update. What is the current month's forecast total, 
     how does it compare to the opening, and which projects (if any) are in shortfall? 
     Keep it to 5 bullet points maximum.`,
    env
  );

  await postToSlack(
    env.SLACK_BOT_TOKEN,
    env.SLACK_OPS_CHANNEL,
    `📊 *Weekly forecast update*\n\n${response}`
  );
}

async function postMondayBriefing(env) {
  if (!env.SLACK_OPS_CHANNEL) return;

  await postToSlack(
    env.SLACK_BOT_TOKEN,
    env.SLACK_OPS_CHANNEL,
    `👋 *Good morning Belmar Cloud!*\n\nMention me with any questions:\n• _@belmar what's our forecast this month?_\n• _@belmar who has capacity this week?_\n• _@belmar show me the pipeline_`
  );
}

async function postMonthOpeningReminder(env) {
  if (!env.SLACK_OPS_CHANNEL) return;
  await postToSlack(
    env.SLACK_BOT_TOKEN,
    env.SLACK_OPS_CHANNEL,
    `📅 *Month opening reminder* — it's the 1st! Don't forget to capture the opening forecast snapshot in the dashboard.`
  );
}

async function postMonthEndReminder(env) {
  if (!env.SLACK_OPS_CHANNEL) return;
  await postToSlack(
    env.SLACK_BOT_TOKEN,
    env.SLACK_OPS_CHANNEL,
    `📅 *Month end reminder* — last day of the month. Capture the final actual snapshot in the dashboard once all time is approved.`
  );
}
