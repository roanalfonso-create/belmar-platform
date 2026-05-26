/**
 * Belmar Cloud — Anthropic API Proxy Worker
 * Cloudflare Worker that adds the API key server-side so it never
 * appears in the browser.
 *
 * Setup:
 * 1. Create a new Worker in dash.cloudflare.com → Workers & Pages
 * 2. Paste this file
 * 3. Settings → Variables → add secret: ANTHROPIC_API_KEY = sk-ant-...
 * 4. Deploy — copy the worker URL (e.g. https://belmar-ai-proxy.yourname.workers.dev)
 * 5. In index.html set PROXY_URL to that URL
 *
 * Optional: add Cloudflare Access in front of this Worker to restrict
 * to your team only (Zero Trust → Access → Applications → add the worker URL).
 */

const ANTHROPIC_API = "https://api.anthropic.com";
const ALLOWED_ORIGINS = [
  // Add your Cloudflare Pages URL here once deployed, e.g.:
  // "https://belmar-psa.pages.dev",
  // "https://psa.belmarcloud.com",
  // During local dev, allow file:// and localhost:
  "null",           // file:// origin
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1",
  "https://belmar-platform.pages.dev",  // ← add this

];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin?.startsWith(o)) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, anthropic-version, anthropic-beta",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only allow POST to /v1/messages
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/v1/messages") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY secret not set on this Worker" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Read and validate the request body
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward to Anthropic — inject the API key
    const upstream = await fetch(`${ANTHROPIC_API}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": request.headers.get("anthropic-version") || "2023-06-01",
        "anthropic-beta": request.headers.get("anthropic-beta") || "mcp-client-2025-04-04",
      },
      body: JSON.stringify(body),
    });

    const responseBody = await upstream.text();

    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        ...corsHeaders(origin),
      },
    });
  },
};
