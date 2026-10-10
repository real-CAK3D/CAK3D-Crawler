// A tiny key-holding proxy for the crawler's AI features, for Cloudflare Workers.
// The app sends requests here instead of to the AI service; the worker adds your API key
// (kept as a Worker secret, never shipped to browsers) and forwards the request.
//
// Settings (wrangler.toml [vars] plus one secret):
//   UPSTREAM        https://api.anthropic.com  or an OpenAI-compatible base such as https://api.openai.com/v1
//   KIND            "anthropic" or "openai"
//   ALLOWED_ORIGIN  comma-separated sites allowed to use it, e.g. https://you.github.io,https://localhost
//   API_KEY         secret: `npx wrangler secret put API_KEY`
//
// Anyone who can load an allowed site can spend from this key, so keep ALLOWED_ORIGIN tight
// and add a spending limit with your AI provider.

const PATHS = new Set(["/v1/messages", "/chat/completions"]);

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = { "Access-Control-Allow-Origin": okOrigin ? origin : "null", Vary: "Origin" };

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" } });
    }
    if (!okOrigin) return new Response("This site isn't allowed to use this proxy.", { status: 403, headers: cors });
    if (req.method !== "POST") return new Response("Use POST.", { status: 405, headers: cors });

    const path = new URL(req.url).pathname;
    if (!PATHS.has(path)) return new Response("Not found.", { status: 404, headers: cors });

    const headers = new Headers(req.headers);
    for (const h of ["host", "origin", "referer", "cookie", "authorization", "x-api-key", "anthropic-dangerous-direct-browser-access"]) headers.delete(h);
    if (env.KIND === "anthropic") headers.set("x-api-key", env.API_KEY);
    else headers.set("authorization", `Bearer ${env.API_KEY}`);

    const upstream = await fetch(env.UPSTREAM.replace(/\/+$/, "") + path, { method: "POST", headers, body: req.body });
    const out = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors)) out.set(k, v);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
};
