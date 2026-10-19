// The owner's dashboard. Only the owner can use it: the passphrase in the OWNER_PASSPHRASE secret, from a device whose
// support ID is in OWNER_DEVICES. Five wrong tries from one place lock it for an hour. A sign-in gives a 30-day token
// that only works on that device. Everything else (stats from Supabase, GitHub, Vercel and Google Play, and messages
// with Claude) needs that token. Other secrets, all optional: GITHUB_TOKEN, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN,
// PLAY_REPORTS_BUCKET, PLAY_SA_JSON (shared with the "link" function), and GITHUB_ACTIONS_TOKEN (to run release workflows).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { unzipSync } from "npm:fflate@0.8.2";

const PKG = "com.arachnotes.web", REPO = "real-CAK3D/CAK3D-Crawler", GH_USER = "real-CAK3D", REF = "gepkziwvlczkwernhtjm";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const env = (k: string) => (Deno.env.get(k) || "").trim();
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function sha(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}
// compares fingerprints, so the time taken says nothing about how much of the passphrase was right
async function same(a: string, b: string) { const [x, y] = [await sha(a), await sha(b)]; let d = 0; for (let i = 0; i < x.length; i++) d |= x.charCodeAt(i) ^ y.charCodeAt(i); return d === 0; }
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, "0")).join("");
const withTimeout = <T>(p: Promise<T>, ms = 15000) => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("timed out")), ms))]);

// ---- Google: a token from a service account key
const b64url = (b: Uint8Array | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function googleToken(scope: string) {
  const sa = JSON.parse(env("PLAY_SA_JSON") || "null");
  if (!sa || !sa.private_key) throw new Error("The Google key (PLAY_SA_JSON) isn't set.");
  const now = Math.floor(Date.now() / 1000);
  const claim = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(claim)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: claim + "." + b64url(sig) }) });
  const j = await r.json(); if (!j.access_token) throw new Error("Google didn't accept the key: " + (j.error_description || j.error));
  return j.access_token as string;
}
async function getJson(url: string, headers: Record<string, string> = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${new URL(url).hostname} answered ${r.status}`);
  return r.json();
}

// ---- CSV (Play's reports): quoted fields, UTF-16 or UTF-8
function decodeText(buf: Uint8Array) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf.subarray(2));
  return new TextDecoder().decode(buf).replace(/^\uFEFF/, "");
}
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter(r => r.some(x => x.trim()));
  return (body || []).map(r => Object.fromEntries((head || []).map((h, i) => [h.trim(), (r[i] || "").trim()])));
}

// ---- each part of the dashboard; a part that fails says why and the rest still show
async function supabasePart() {
  const { data, error } = await db.rpc("dev_db_stats"); if (error) throw error;
  const out: Record<string, unknown> = { ...data, db_limit: 500 * 1024 * 1024 };
  // Supabase won't save secret names that start with SUPABASE_, so the token is ARACHNOTES_SUPABASE_ACCESS_TOKEN
  const t = env("ARACHNOTES_SUPABASE_ACCESS_TOKEN") || env("SUPABASE_ACCESS_TOKEN");
  if (t) {
    try {
      const h = { authorization: `Bearer ${t}` };
      const p = await getJson(`https://api.supabase.com/v1/projects/${REF}`, h);
      out.status = p.status; out.region = p.region;
      const u = await getJson(`https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/usage.api-counts?interval=7day`, h);
      const rows = (u.result || []) as Record<string, number>[];
      out.requests_week = rows.reduce((a, r) => a + (r.total_rest_requests || 0) + (r.total_auth_requests || 0) + (r.total_storage_requests || 0) + (r.total_realtime_requests || 0), 0);
    } catch (e) { out.usage_note = String((e as Error).message); }
  } else out.usage_note = "Add ARACHNOTES_SUPABASE_ACCESS_TOKEN to see request counts and project status.";
  return out;
}
async function githubPart() {
  const t = env("GITHUB_TOKEN"), h: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "arachnotes-dashboard" };
  if (t) h.authorization = `Bearer ${t}`;
  const [repo, runs, rels] = await Promise.all([getJson(`https://api.github.com/repos/${REPO}`, h), getJson(`https://api.github.com/repos/${REPO}/actions/runs?per_page=40`, h), getJson(`https://api.github.com/repos/${REPO}/releases?per_page=12`, h)]);
  const latest: Record<string, unknown> = {};
  for (const r of runs.workflow_runs || []) if (!latest[r.name]) latest[r.name] = { id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, title: r.display_title, branch: r.head_branch, url: r.html_url, at: r.updated_at };
  const releases = (rels || []).map((r: { tag_name: string; published_at: string; html_url: string; assets: { name: string; download_count: number }[] }) => ({
    tag: r.tag_name, at: r.published_at, url: r.html_url,
    apk: r.assets.filter(a => a.name.endsWith(".apk")).reduce((s, a) => s + a.download_count, 0),
    downloads: r.assets.reduce((s, a) => s + a.download_count, 0) }));
  const out: Record<string, unknown> = { private: repo.private, workflows: Object.values(latest), releases, apk_total: releases.reduce((s: number, r: { apk: number }) => s + r.apk, 0) };
  if (t) {
    try {
      const u = await getJson(`https://api.github.com/users/${GH_USER}/settings/billing/usage`, h);
      const month = new Date().toISOString().slice(0, 7);
      out.actions_minutes = (u.usageItems || []).filter((x: { product: string; unitType: string; date: string }) => x.product === "actions" && /minute/i.test(x.unitType) && String(x.date).startsWith(month)).reduce((s: number, x: { quantity: number }) => s + x.quantity, 0);
      out.actions_limit = repo.private ? 2000 : null;
    } catch (e) { out.usage_note = "Actions minutes: " + (e as Error).message; }
  } else out.usage_note = "Add GITHUB_TOKEN to see Actions minutes (and to keep builds showing once the repository is private).";
  return out;
}
async function vercelPart() {
  const t = env("VERCEL_TOKEN"); if (!t) return { note: "Add VERCEL_TOKEN to see deploys." };
  const d = await getJson("https://api.vercel.com/v6/deployments?limit=30", { authorization: `Bearer ${t}` });
  const latest: Record<string, unknown> = {};
  for (const x of d.deployments || []) if (!latest[x.name]) latest[x.name] = { project: x.name, state: x.state || x.readyState, target: x.target, url: "https://" + x.url, at: new Date(x.created).toISOString(), commit: x.meta && x.meta.githubCommitMessage };
  return { projects: Object.values(latest) };
}
async function playPart() {
  const out: Record<string, unknown> = {};
  const ap = await googleToken("https://www.googleapis.com/auth/androidpublisher");
  try {
    const rv = await getJson(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/reviews?maxResults=20`, { authorization: `Bearer ${ap}` });
    type Review = { reviewId: string; authorName: string; comments: { userComment?: { text: string; starRating: number; lastModified: { seconds: string } }; developerComment?: { text: string } }[] };
    const list = ((rv.reviews || []) as Review[]).filter(r => r.comments.some(x => x.userComment)).map(r => {
      const c = r.comments.find(x => x.userComment)!.userComment!, dev = r.comments.find(x => x.developerComment);
      return { id: r.reviewId, author: r.authorName, stars: c.starRating, text: c.text.slice(0, 500), at: new Date(+c.lastModified.seconds * 1000).toISOString(), reply: dev ? dev.developerComment!.text : "" };
    });
    out.reviews = list.slice(0, 20); out.reviews_week = list.length;
  } catch (e) { out.reviews_note = (e as Error).message; }
  // the reports bucket: PLAY_REPORTS_BUCKET (the Cloud Storage URI from Download reports), or worked out from the
  // developer account number (PLAY_DEVELOPER_ID, the long number in the Play Console address) under either of Google's names
  const gs = await googleToken("https://www.googleapis.com/auth/devstorage.read_only"), h = { authorization: `Bearer ${gs}` };
  let bucket = env("PLAY_REPORTS_BUCKET").replace(/^gs:\/\//, "").split("/")[0];
  const devId = env("PLAY_DEVELOPER_ID").replace(/\D/g, "");
  if (!bucket && devId) for (const name of [`pubsite_prod_rev_${devId}`, `pubsite_prod_${devId}`]) {
    const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${name}/o?maxResults=1`, { headers: h });
    if (r.ok) { bucket = name; break; }
  }
  if (!bucket) { out.note = devId ? "Couldn't open the reports for that developer ID yet. Google can take a day to let the robot account in." : "Add PLAY_DEVELOPER_ID (or PLAY_REPORTS_BUCKET) to see installs, purchases, ratings and crashes."; return out; }
  const latestObject = async (prefix: string, suffix: string) => {
    const l = await getJson(`https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}`, h);
    const names = (l.items || []).map((i: { name: string }) => i.name).filter((n: string) => n.endsWith(suffix)).sort();
    return names.length ? names[names.length - 1] : null;
  };
  const download = async (name: string) => {
    const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, { headers: h });
    if (!r.ok) throw new Error(`report ${r.status}`); return new Uint8Array(await r.arrayBuffer());
  };
  const num = (x: string | undefined) => Number(String(x || "0").replace(/[^0-9.\-]/g, "")) || 0;
  try {
    const n = await latestObject(`stats/installs/installs_${PKG}_`, "_overview.csv");
    if (n) { const rows = csv(decodeText(await download(n))), last = rows[rows.length - 1] || {};
      out.installs_daily = rows.map(r => ({ day: r["Date"], installs: num(r["Daily User Installs"]), uninstalls: num(r["Daily User Uninstalls"]), active: num(r["Active Device Installs"]) }));
      out.installs = { date: last["Date"], total_users: num(last["Total User Installs"]), active_devices: num(last["Active Device Installs"]),
        installs_month: rows.reduce((s, r) => s + num(r["Daily User Installs"]), 0), uninstalls_month: rows.reduce((s, r) => s + num(r["Daily User Uninstalls"]), 0) }; }
    else out.installs_note = "No install report yet. Google makes them a day or two after the app has users.";
  } catch (e) { out.installs_note = (e as Error).message; }
  try {
    const n = await latestObject(`stats/ratings/ratings_${PKG}_`, "_overview.csv");
    if (n) { const rows = csv(decodeText(await download(n))), last = rows[rows.length - 1] || {}; out.rating = { date: last["Date"], average: num(last["Total Average Rating"]) }; }
  } catch (e) { out.rating_note = (e as Error).message; }
  try {
    const n = await latestObject(`stats/crashes/crashes_${PKG}_`, "_overview.csv");
    if (n) { const rows = csv(decodeText(await download(n))); out.crashes = { month_crashes: rows.reduce((s, r) => s + num(r["Daily Crashes"]), 0), month_anrs: rows.reduce((s, r) => s + num(r["Daily ANRs"]), 0) }; }
  } catch (e) { out.crashes_note = (e as Error).message; }
  try {
    const n = await latestObject("sales/salesreport_", ".zip");
    if (n) {
      const files = unzipSync(await download(n)), first = Object.values(files)[0];
      const rows = csv(decodeText(first)).filter(r => /charged/i.test(r["Financial Status"] || "Charged"));
      const byCur: Record<string, number> = {}, byProduct: Record<string, number> = {};
      for (const r of rows) { const c = r["Currency of Sale"] || "?"; byCur[c] = (byCur[c] || 0) + num(r["Item Price"]); const p = r["Product ID"] || r["SKU ID"] || "?"; byProduct[p] = (byProduct[p] || 0) + 1; }
      out.sales = { report: n.replace(/^sales\/|\.zip$/g, ""), orders: rows.length, by_currency: byCur, top: Object.entries(byProduct).sort((a, b) => b[1] - a[1]).slice(0, 6) };
    } else out.sales_note = "No sales report yet (they appear after the first purchase).";
  } catch (e) { out.sales_note = (e as Error).message; }
  return out;
}

async function healthPart() {
  const check = async (name: string, url: string, init: RequestInit = {}) => {
    const t0 = Date.now();
    try { const r = await withTimeout(fetch(url, { redirect: "follow", ...init }), 8000); return { name, ok: r.status < 500, status: r.status, ms: Date.now() - t0 }; }
    catch (e) { return { name, ok: false, status: 0, ms: Date.now() - t0, error: String((e as Error).message) }; }
  };
  const key = env("SUPABASE_ANON_KEY");
  return { checks: await Promise.all([
    check("Web app", "https://arachnotes.vercel.app/"),
    check("Website", "https://arachnotes-web.vercel.app/"),
    check("Database", env("SUPABASE_URL") + "/rest/v1/rpc/dev_inbox_count", { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: "{}" }),
    check("Wikipedia (keyword lookups)", "https://en.wikipedia.org/api/rest_v1/page/summary/Spider"),
    check("Reader service (web pages)", "https://r.jina.ai/https://example.com"),
  ]) };
}
async function stats() {
  const parts = { supabase: supabasePart, github: githubPart, vercel: vercelPart, play: playPart, health: healthPart };
  const res = await Promise.allSettled(Object.values(parts).map(f => withTimeout(f())));
  const out: Record<string, unknown> = { at: new Date().toISOString() };
  Object.keys(parts).forEach((k, i) => { const r = res[i]; out[k] = r.status === "fulfilled" ? { ok: true, ...(r.value as object) } : { ok: false, error: String((r.reason as Error)?.message || r.reason).slice(0, 300) }; });
  return out;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: { action?: string; passphrase?: string; device?: string; token?: string; text?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const device = String(body.device || "").toUpperCase().trim();
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const who = await sha(ip + env("SUPABASE_SERVICE_ROLE_KEY").slice(-24));

  if (body.action === "signin") {
    const pass = env("OWNER_PASSPHRASE"), devices = env("OWNER_DEVICES").toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if (!pass || !devices.length) return json({ error: "The dashboard isn't set up yet." }, 503);
    const { count } = await db.from("dev_tries").select("*", { count: "exact", head: true }).eq("who", who).gt("at", new Date(Date.now() - 3600e3).toISOString());
    if ((count || 0) >= 5) return json({ error: "Too many tries. Wait an hour." }, 429);
    const ok = (await same(String(body.passphrase || ""), pass)) && devices.includes(device);
    if (!ok) { await db.from("dev_tries").insert({ who }); return json({ error: "That didn't work." }, 401); }
    const token = hex(32);
    await db.from("dev_sessions").insert({ token_hash: await sha(token), device, expires_at: new Date(Date.now() + 30 * 86400e3).toISOString() });
    return json({ token });
  }

  // everything else needs a live session from this same device
  const { data: s } = await db.from("dev_sessions").select("device, expires_at").eq("token_hash", await sha(String(body.token || ""))).maybeSingle();
  if (!s || s.device !== device || new Date(s.expires_at) < new Date()) return json({ error: "Signed out. Sign in again." }, 401);

  try {
    if (body.action === "stats") return json(await stats());
    const a = body as Record<string, unknown>, str = (k: string, max = 4000) => String(a[k] ?? "").trim().slice(0, max), id = Number(a.id);
    const ok = (data: unknown = { ok: true }) => json(data);
    const must = (e: { message?: string } | null) => { if (e) throw new Error(e.message || "database error"); };
    // numbers over time, and since the start
    if (body.action === "series") {
      const days = Math.max(7, Math.min(400, Number(a.days) || 30));
      const [{ data: series, error: e1 }, { data: life, error: e2 }] = await Promise.all([db.rpc("dev_series", { p_days: days }), db.rpc("dev_lifetime")]);
      must(e1); must(e2);
      return ok({ series, lifetime: life });
    }
    // support: issue reports, error reports and data-deletion requests
    if (body.action === "inbox") {
      const [r, e, d] = await Promise.all([
        db.from("reports").select("id, user_id, created_at, app_version, platform, message, contact, settings, status, notes").order("id", { ascending: false }).limit(100),
        db.from("error_reports").select("id, created_at, last_at, user_id, version, platform, place, message, stack, count, fixed_at").order("last_at", { ascending: false }).limit(100),
        db.from("deletion_requests").select("id, created_at, support_id, posts, note, reports_deleted, status").order("id", { ascending: false }).limit(50)]);
      must(r.error); must(e.error); must(d.error);
      return ok({ reports: r.data, errors: e.data, deletions: d.data });
    }
    if (body.action === "report_set") { must((await db.from("reports").update({ status: str("status", 20) || "new", notes: str("notes") }).eq("id", id)).error); return ok(); }
    if (body.action === "error_set") { must((await db.from("error_reports").update({ fixed_at: a.fixed ? new Date().toISOString() : null }).eq("id", id)).error); return ok(); }
    if (body.action === "error_fix_all") { must((await db.from("error_reports").update({ fixed_at: new Date().toISOString() }).eq("message", str("message", 500)).is("fixed_at", null)).error); return ok(); }
    if (body.action === "deletion_set") { must((await db.from("deletion_requests").update({ status: str("status", 20) || "done" }).eq("id", id)).error); return ok(); }
    // the forum: every post, whatever its status
    if (body.action === "forum") {
      const q = db.from("forum_posts").select("id, kind, title, body, author, app_version, status, dev_note, pinned, votes, replies, reports, created_at").order("id", { ascending: false }).limit(150);
      const { data, error } = str("status", 20) ? await q.eq("status", str("status", 20)) : await q; must(error);
      return ok({ posts: data });
    }
    if (body.action === "forum_post") {
      const [p, r] = await Promise.all([db.from("forum_posts").select("*").eq("id", id).maybeSingle(), db.from("forum_replies").select("id, body, author, is_dev, hidden, reports, created_at").eq("post_id", id).order("id")]);
      must(p.error); must(r.error); return ok({ post: p.data, replies: r.data });
    }
    if (body.action === "forum_set") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (a.status != null) patch.status = str("status", 20);
      if (a.dev_note != null) patch.dev_note = str("dev_note") || null;
      if (a.pinned != null) patch.pinned = !!a.pinned;
      if (a.clear_reports) patch.reports = 0;
      must((await db.from("forum_posts").update(patch).eq("id", id)).error); return ok();
    }
    if (body.action === "forum_reply") {
      const text = str("text"); if (!text) return json({ error: "Write the reply first." }, 400);
      must((await db.from("forum_replies").insert({ post_id: id, body: text, author: "CAK3D_Creations", is_dev: true, who: "owner" })).error);
      const { count } = await db.from("forum_replies").select("*", { count: "exact", head: true }).eq("post_id", id).eq("hidden", false);
      await db.from("forum_posts").update({ replies: count || 0, updated_at: new Date().toISOString() }).eq("id", id);
      return ok();
    }
    if (body.action === "reply_hide") { must((await db.from("forum_replies").update({ hidden: !!a.hidden }).eq("id", id)).error); return ok(); }
    // fixes for one app or for everyone, and whether they were picked up
    if (body.action === "fixes") {
      const [f, seen] = await Promise.all([db.from("fixes").select("user_id, actions, note, updated_at").order("updated_at", { ascending: false }).limit(100), db.from("fix_seen").select("user_id, at, fix_at")]);
      must(f.error); must(seen.error); return ok({ fixes: f.data, seen: seen.data });
    }
    if (body.action === "fix_send") {
      const target = str("target", 20).toUpperCase() === "*" || str("target", 20).toLowerCase() === "everyone" ? "*" : str("target", 20).toUpperCase();
      if (target !== "*" && !/^AN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(target)) return json({ error: "That support ID doesn't look right. It looks like AN-7K3Q-9XWD-2M4P." }, 400);
      const actions = (a.actions && typeof a.actions === "object") ? a.actions : {};
      must((await db.from("fixes").upsert({ user_id: target, actions, note: str("note", 500), updated_at: new Date().toISOString() })).error);
      return ok();
    }
    if (body.action === "fix_clear") { must((await db.from("fixes").delete().eq("user_id", str("target", 20).toUpperCase() === "EVERYONE" ? "*" : str("target", 20).toUpperCase())).error); return ok(); }
    // switches and the announcement every app reads at launch
    if (body.action === "config") { const { data, error } = await db.from("app_config").select("key, value, updated_at"); must(error); return ok({ config: Object.fromEntries((data || []).map(r => [r.key, r.value])) }); }
    if (body.action === "config_set") {
      const k = str("key", 40); if (!["switches", "announcement"].includes(k)) return json({ error: "Unknown setting." }, 400);
      must((await db.from("app_config").upsert({ key: k, value: a.value ?? null, updated_at: new Date().toISOString() })).error); return ok();
    }
    // one user, by support ID
    if (body.action === "user") {
      const uid = str("user", 20).toUpperCase(); if (!/^AN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(uid)) return json({ error: "That support ID doesn't look right." }, 400);
      const [u, c, r, e, w, l, f, s2] = await Promise.all([
        db.from("app_users").select("*").eq("user_id", uid).maybeSingle(),
        db.from("app_checkins").select("day, version, platform").eq("user_id", uid).order("day", { ascending: false }).limit(60),
        db.from("reports").select("id, created_at, app_version, platform, message, contact, status").eq("user_id", uid).order("id", { ascending: false }).limit(50),
        db.from("error_reports").select("id, last_at, version, place, message, count, fixed_at").eq("user_id", uid).order("last_at", { ascending: false }).limit(50),
        db.from("web_passes").select("created_at, last_seen, owned").eq("install", uid),
        db.from("app_links").select("created_at, used_at, owned").eq("install", uid).order("created_at", { ascending: false }).limit(20),
        db.from("fixes").select("actions, note, updated_at").eq("user_id", uid).maybeSingle(),
        db.from("fix_seen").select("at, fix_at").eq("user_id", uid).maybeSingle()]);
      return ok({ user: u.data, checkins: c.data, reports: r.data, errors: e.data, passes: w.data, links: l.data, fix: f.data, fix_seen: s2.data });
    }
    if (body.action === "unlink") { const { count } = await db.from("web_passes").delete({ count: "exact" }).eq("install", str("user", 20).toUpperCase()); return ok({ removed: count || 0 }); }
    if (body.action === "reset_network") { const { data, error } = await db.rpc("dev_reset_network", { p_ip: ip }); must(error); return ok({ removed: data }); }
    // answer a Google Play review (it shows under the review on the store)
    if (body.action === "review_reply") {
      const text = str("text", 350); if (!text || !str("review", 200)) return json({ error: "Write the reply first." }, 400);
      const ap = await googleToken("https://www.googleapis.com/auth/androidpublisher");
      const r = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/reviews/${encodeURIComponent(str("review", 200))}:reply`, { method: "POST", headers: { authorization: `Bearer ${ap}`, "content-type": "application/json" }, body: JSON.stringify({ replyText: text }) });
      if (!r.ok) return json({ error: `Google answered ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
      return ok();
    }
    // release buttons: run the GitHub workflows (needs GITHUB_ACTIONS_TOKEN with "Actions: read and write")
    if (body.action === "release") {
      const t = env("GITHUB_ACTIONS_TOKEN"); if (!t) return json({ error: "Add GITHUB_ACTIONS_TOKEN to use the release buttons." }, 400);
      const h = { authorization: `Bearer ${t}`, accept: "application/vnd.github+json", "user-agent": "arachnotes-dashboard", "content-type": "application/json" };
      const kind = str("kind", 20);
      let url = "", payload: unknown = {};
      if (["check", "rollout", "to_closed"].includes(kind)) { url = `https://api.github.com/repos/${REPO}/actions/workflows/play-listing.yml/dispatches`; payload = { ref: "main", inputs: { [kind]: true } }; }
      else if (kind === "listing") { url = `https://api.github.com/repos/${REPO}/actions/workflows/play-listing.yml/dispatches`; payload = { ref: "main", inputs: { images: true } }; }
      else if (kind === "rerun") { if (!Number(a.run)) return json({ error: "Which build?" }, 400); url = `https://api.github.com/repos/${REPO}/actions/runs/${Number(a.run)}/rerun-failed-jobs`; }
      else return json({ error: "Unknown release action." }, 400);
      const r = await fetch(url, { method: "POST", headers: h, body: JSON.stringify(payload) });
      if (!r.ok) return json({ error: `GitHub answered ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
      return ok({ started: kind });
    }
    if (body.action === "messages") {
      const { data } = await db.from("dev_messages").select("id, at, sender, body, read_at").order("id", { ascending: false }).limit(100);
      await db.from("dev_messages").update({ read_at: new Date().toISOString() }).eq("sender", "claude").is("read_at", null);
      return json({ messages: (data || []).reverse() });
    }
    if (body.action === "send") {
      const text = String(body.text || "").trim().slice(0, 4000); if (!text) return json({ error: "Write something first." }, 400);
      const { error } = await db.from("dev_messages").insert({ sender: "owner", body: text }); if (error) throw error;
      return json({ ok: true });
    }
    if (body.action === "signout") { await db.from("dev_sessions").delete().eq("token_hash", await sha(String(body.token || ""))); return json({ ok: true }); }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { console.error(e); return json({ error: "Something went wrong on the server: " + String((e as Error).message).slice(0, 200) }, 500); }
});
