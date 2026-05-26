/**
 * Ruddr MCP Server — Cloudflare Worker
 * Connects Claude to your Ruddr workspace via the Model Context Protocol.
 *
 * Setup instructions:
 * 1. Go to https://workers.cloudflare.com and create a free account
 * 2. Click "Create Worker"
 * 3. Paste this entire file into the editor
 * 4. Click "Settings" > "Variables" > add RUDDR_API_KEY as a secret
 * 5. Click "Deploy"
 * 6. Copy the worker URL (e.g. https://ruddr-mcp.yourname.workers.dev)
 * 7. In Claude.ai go to Settings > Integrations > Add MCP Server > paste the URL
 */

const BASE_URL = "https://www.ruddr.io/api/workspace";

// ── Helper: call Ruddr REST API ─────────────────────────────────────────────
async function ruddr(env, path, method = "GET", body = null) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.RUDDR_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ruddr API error ${res.status}: ${err}`);
  }
  return res.json();
}

// ── Helper: build query string from an object, omitting null/undefined ───────
function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ── Tool definitions ────────────────────────────────────────────────────────
const TOOLS = [
  // ── Workspace ──────────────────────────────────────────────────────────────
  {
    name: "get_workspace",
    description: "Get basic workspace details (ID and name).",
    inputSchema: { type: "object", properties: {} },
  },

  // ── Members ────────────────────────────────────────────────────────────────
  {
    name: "list_members",
    description: "List all workspace members. Supports cursor-based pagination via startingAfter.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID of last result from previous page" },
        endingBefore: { type: "string", description: "Cursor UUID for previous page" },
        nameContains: { type: "string", description: "Filter by name containing this string" },
        emailContains: { type: "string", description: "Filter by email containing this string" },
      },
    },
  },
  {
    name: "get_member",
    description: "Get details for a specific member by ID.",
    inputSchema: {
      type: "object",
      required: ["memberId"],
      properties: {
        memberId: { type: "string", description: "Member UUID" },
      },
    },
  },

  // ── Clients ────────────────────────────────────────────────────────────────
  {
    name: "list_clients",
    description: "List all clients in the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "get_client",
    description: "Get details for a specific client by ID.",
    inputSchema: {
      type: "object",
      required: ["clientId"],
      properties: {
        clientId: { type: "string", description: "Client UUID" },
      },
    },
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  {
    name: "list_projects",
    description: "List all projects. Optionally filter by client.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "get_project",
    description: "Get details for a specific project by ID.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string", description: "Project UUID" },
      },
    },
  },
  {
    name: "list_project_members",
    description: "List members assigned to a specific project.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string", description: "Project UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "list_project_tasks",
    description: "List tasks for a specific project.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string", description: "Project UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "list_project_health_reports",
    description: "List health reports for a specific project.",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string", description: "Project UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },

  // ── Time Entries ───────────────────────────────────────────────────────────
  {
    name: "list_time_entries",
    description: "List time entries. Filter by member, project, date range, or type. Use dateOnAfter/dateOnBefore for date ranges (inclusive). typeId can be 'project_time' or 'time_off'.",
    inputSchema: {
      type: "object",
      properties: {
        memberId: { type: "string", description: "Filter by member UUID" },
        projectId: { type: "string", description: "Filter by project UUID" },
        timesheetId: { type: "string", description: "Filter by timesheet UUID" },
        typeId: { type: "string", description: "Filter by type: project_time or time_off" },
        date: { type: "string", description: "Exact date filter (YYYY-MM-DD)" },
        dateAfter: { type: "string", description: "Entries after this date, exclusive (YYYY-MM-DD)" },
        dateOnAfter: { type: "string", description: "Entries on or after this date, inclusive (YYYY-MM-DD)" },
        dateBefore: { type: "string", description: "Entries before this date, exclusive (YYYY-MM-DD)" },
        dateOnBefore: { type: "string", description: "Entries on or before this date, inclusive (YYYY-MM-DD)" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
        endingBefore: { type: "string", description: "Cursor UUID for previous page" },
      },
    },
  },

  // ── Timesheets ─────────────────────────────────────────────────────────────
  {
    name: "list_timesheets",
    description: "List submitted timesheets.",
    inputSchema: {
      type: "object",
      properties: {
        memberId: { type: "string", description: "Filter by member UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },

  // ── Allocations ────────────────────────────────────────────────────────────
  {
    name: "list_allocations",
    description: "List resource allocations. Filter by member, project, assignment type, and date range. Use startOnBefore + endOnAfter together to find allocations overlapping a date range.",
    inputSchema: {
      type: "object",
      properties: {
        memberId: { type: "string", description: "Filter by member UUID" },
        projectId: { type: "string", description: "Filter by project UUID" },
        assignmentTypeId: { type: "string", description: "Filter by type: project or time_off" },
        startBefore: { type: "string", description: "Allocations starting before this date (YYYY-MM-DD)" },
        startOnBefore: { type: "string", description: "Allocations starting on or before this date (YYYY-MM-DD)" },
        endAfter: { type: "string", description: "Allocations ending after this date (YYYY-MM-DD)" },
        endOnAfter: { type: "string", description: "Allocations ending on or after this date (YYYY-MM-DD)" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
        endingBefore: { type: "string", description: "Cursor UUID for previous page" },
      },
    },
  },

  // ── Pipeline ───────────────────────────────────────────────────────────────
  {
    name: "list_opportunities",
    description: "List pipeline opportunities.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "list_companies",
    description: "List companies in the pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "list_contacts",
    description: "List contacts in the pipeline.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },

  // ── Expenses ───────────────────────────────────────────────────────────────
  {
    name: "list_expense_reports",
    description: "List expense reports.",
    inputSchema: {
      type: "object",
      properties: {
        memberId: { type: "string", description: "Filter by member UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "list_expense_items",
    description: "List individual expense items.",
    inputSchema: {
      type: "object",
      properties: {
        expenseReportId: { type: "string", description: "Filter by expense report UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },

  // ── Billing ────────────────────────────────────────────────────────────────
  {
    name: "list_invoices",
    description: "List invoices.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
  {
    name: "get_invoice",
    description: "Get details for a specific invoice by ID.",
    inputSchema: {
      type: "object",
      required: ["invoiceId"],
      properties: {
        invoiceId: { type: "string", description: "Invoice UUID" },
      },
    },
  },
  {
    name: "list_payments",
    description: "List payments.",
    inputSchema: {
      type: "object",
      properties: {
        clientId: { type: "string", description: "Filter by client UUID" },
        limit: { type: "number", description: "Max results (1-100, default 50)" },
        startingAfter: { type: "string", description: "Cursor UUID for next page" },
      },
    },
  },
];

// ── Tool execution ──────────────────────────────────────────────────────────
async function executeTool(name, args, env) {
  const limit = args.limit || 50;

  switch (name) {

    // ── Workspace ────────────────────────────────────────────────────────────
    case "get_workspace":
      return ruddr(env, "");

    // ── Members ──────────────────────────────────────────────────────────────
    case "list_members":
      return ruddr(env, `/members${qs({
        limit,
        startingAfter: args.startingAfter,
        endingBefore: args.endingBefore,
        nameContains: args.nameContains,
        emailContains: args.emailContains,
      })}`);

    case "get_member":
      return ruddr(env, `/members/${args.memberId}`);

    // ── Clients ──────────────────────────────────────────────────────────────
    case "list_clients":
      return ruddr(env, `/clients${qs({ limit, startingAfter: args.startingAfter })}`);

    case "get_client":
      return ruddr(env, `/clients/${args.clientId}`);

    // ── Projects ─────────────────────────────────────────────────────────────
    case "list_projects":
      return ruddr(env, `/projects${qs({
        limit,
        clientId: args.clientId,
        startingAfter: args.startingAfter,
      })}`);

    case "get_project":
      return ruddr(env, `/projects/${args.projectId}`);

    case "list_project_members":
      return ruddr(env, `/projects/${args.projectId}/members${qs({
        limit,
        startingAfter: args.startingAfter,
      })}`);

    case "list_project_tasks":
      return ruddr(env, `/projects/${args.projectId}/tasks${qs({
        limit,
        startingAfter: args.startingAfter,
      })}`);

    case "list_project_health_reports":
      return ruddr(env, `/projects/${args.projectId}/healthReports${qs({
        limit,
        startingAfter: args.startingAfter,
      })}`);

    // ── Time Entries ─────────────────────────────────────────────────────────
    case "list_time_entries":
      return ruddr(env, `/timeEntries${qs({
        limit,
        memberId: args.memberId,
        projectId: args.projectId,
        timesheetId: args.timesheetId,
        typeId: args.typeId,
        date: args.date,
        dateAfter: args.dateAfter,
        dateOnAfter: args.dateOnAfter,
        dateBefore: args.dateBefore,
        dateOnBefore: args.dateOnBefore,
        startingAfter: args.startingAfter,
        endingBefore: args.endingBefore,
      })}`);

    // ── Timesheets ───────────────────────────────────────────────────────────
    case "list_timesheets":
      return ruddr(env, `/timesheets${qs({
        limit,
        memberId: args.memberId,
        startingAfter: args.startingAfter,
      })}`);

    // ── Allocations ──────────────────────────────────────────────────────────
    case "list_allocations":
      return ruddr(env, `/allocations${qs({
        limit,
        memberId: args.memberId,
        projectId: args.projectId,
        assignmentTypeId: args.assignmentTypeId,
        startBefore: args.startBefore,
        startOnBefore: args.startOnBefore,
        endAfter: args.endAfter,
        endOnAfter: args.endOnAfter,
        startingAfter: args.startingAfter,
        endingBefore: args.endingBefore,
      })}`);

    // ── Pipeline ─────────────────────────────────────────────────────────────
    case "list_opportunities":
      return ruddr(env, `/opportunities${qs({ limit, startingAfter: args.startingAfter })}`);

    case "list_companies":
      return ruddr(env, `/companies${qs({ limit, startingAfter: args.startingAfter })}`);

    case "list_contacts":
      return ruddr(env, `/contacts${qs({ limit, startingAfter: args.startingAfter })}`);

    // ── Expenses ─────────────────────────────────────────────────────────────
    case "list_expense_reports":
      return ruddr(env, `/expenseReports${qs({
        limit,
        memberId: args.memberId,
        startingAfter: args.startingAfter,
      })}`);

    case "list_expense_items":
      return ruddr(env, `/expenseItems${qs({
        limit,
        expenseReportId: args.expenseReportId,
        startingAfter: args.startingAfter,
      })}`);

    // ── Billing ──────────────────────────────────────────────────────────────
    case "list_invoices":
      return ruddr(env, `/invoices${qs({
        limit,
        clientId: args.clientId,
        startingAfter: args.startingAfter,
      })}`);

    case "get_invoice":
      return ruddr(env, `/invoices/${args.invoiceId}`);

    case "list_payments":
      return ruddr(env, `/payments${qs({
        limit,
        clientId: args.clientId,
        startingAfter: args.startingAfter,
      })}`);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── MCP protocol handler ────────────────────────────────────────────────────
async function handleMCP(request, env) {
  if (request.method !== "POST") {
    return new Response("MCP endpoint expects POST requests", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const { method, params = {}, id } = body;

  try {
    if (method === "initialize") {
      return jsonRpcResult(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "ruddr-mcp", version: "2.0.0" },
      });
    }

    if (method === "tools/list") {
      return jsonRpcResult(id, { tools: TOOLS });
    }

    if (method === "tools/call") {
      const { name, arguments: args = {} } = params;
      const data = await executeTool(name, args, env);
      return jsonRpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      });
    }

    if (method === "ping") {
      return jsonRpcResult(id, {});
    }

    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  } catch (err) {
    return jsonRpcError(id, -32603, err.message);
  }
}

function jsonRpcResult(id, result) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function jsonRpcError(id, code, message) {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    }
  );
}

// ── Cloudflare Worker entry point ───────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", server: "ruddr-mcp", version: "2.0.0" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // MCP endpoint
    if (url.pathname === "/mcp" || url.pathname === "/sse") {
      return handleMCP(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};