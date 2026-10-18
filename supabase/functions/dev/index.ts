// The owner's dashboard. Only the owner can use it: the passphrase in the OWNER_PASSPHRASE secret, from a device whose
// support ID is in OWNER_DEVICES. Five wrong tries from one place lock it for an hour. A sign-in gives a 30-day token
// that only works on that device. Everything else (stats from Supabase, GitHub, Vercel and Google Play, and messages
// with Claude) needs that token. Other secrets, all optional: GITHUB_TOKEN, VERCEL_TOKEN, SUPABASE_ACCESS_TOKEN,
// PLAY_REPORTS_BUCKET, and PLAY_SA_JSON (shared with the "link" function).
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
  return new TextDecoder().decode(buf).replace(/^﻿/, "");
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
  const t = env("SUPABASE_ACCESS_TOKEN");
  if (t) {
    try {
      const h = { authorization: `Bearer ${t}` };
      const p = await getJson(`https://api.supabase.com/v1/projects/${REF}`, h);
      out.status = p.status; out.region = p.region;
      const u = await getJson(`https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/usage.api-counts?interval=7day`, h);
      const rows = (u.result || []) as Record<string, number>[];
      out.requests_week = rows.reduce((a, r) => a + (r.total_rest_requests || 0) + (r.total_auth_requests || 0) + (r.total_storage_requests || 0) + (r.total_realtime_requests || 0), 0);
    } catch (e) { out.usage_note = String((e as Error).message); }
  } else out.usage_note = "Add SUPABASE_ACCESS_TOKEN to see request counts and project status.";
  return out;
}
async function githubPart() {
  const t = env("GITHUB_TOKEN"), h: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "arachnotes-dashboard" };
  if (t) h.authorization = `Bearer ${t}`;
  const [repo, runs, rels] = await Promise.all([getJson(`https://api.github.com/repos/${REPO}`, h), getJson(`https://api.github.com/repos/${REPO}/actions/runs?per_page=40`, h), getJson(`https://api.github.com/repos/${REPO}/releases?per_page=12`, h)]);
  const latest: Record<string, unknown> = {};
  for (const r of runs.workflow_runs || []) if (!latest[r.name]) latest[r.name] = { name: r.name, status: r.status, conclusion: r.conclusion, title: r.display_title, branch: r.head_branch, url: r.html_url, at: r.updated_at };
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
    const list = (rv.reviews || []).map((r: { authorName: string; comments: { userComment: { text: string; starRating: number; lastModified: { seconds: string } } }[] }) => {
      const c = r.comments[0].userComment; return { author: r.authorName, stars: c.starRating, text: c.text.slice(0, 300), at: new Date(+c.lastModified.seconds * 1000).toISOString() };
    });
    out.reviews = list.slice(0, 5); out.reviews_week = list.length;
  } catch (e) { out.reviews_note = (e as Error).message; }
  const bucket = env("PLAY_REPORTS_BUCKET").replace(/^gs:\/\//, "").split("/")[0];
  if (!bucket) { out.note = "Add PLAY_REPORTS_BUCKET to see installs, purchases, ratings and crashes."; return out; }
  const gs = await googleToken("https://www.googleapis.com/auth/devstorage.read_only"), h = { authorization: `Bearer ${gs}` };
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

async function stats() {
  const parts = { supabase: supabasePart, github: githubPart, vercel: vercelPart, play: playPart };
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
