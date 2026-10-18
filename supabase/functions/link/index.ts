// Makes a link code for the Android app, after Google vouches for it.
// The app sends a Play Integrity token (proof it's the real Arachnotes from Google Play) and the purchase tokens Google
// Play gave it. Both are checked with Google using the service account in the PLAY_SA_JSON secret. Only then is a code
// made: one use, 30 minutes, and it carries the purchases Google confirmed. The web app trades it for a pass
// (link_redeem in the database) that lifts the free-use limit and unlocks those purchases there.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PKG = "com.arachnotes.web";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });
const fail = (error: string, status = 400) => json({ error }, status);

const b64url = (b: Uint8Array | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function googleToken(sa: { client_email: string; private_key: string }, scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const claim = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(claim)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: claim + "." + b64url(sig) }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("google auth: " + (j.error_description || j.error));
  return j.access_token as string;
}
async function sha256hex(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
}
// the same as public.code_hash in the database: letters and digits only, upper case
const codeHash = (c: string) => sha256hex(c.replace(/[^0-9A-Za-z]/g, "").toUpperCase());
function newCode() {
  const A = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ", r = crypto.getRandomValues(new Uint8Array(12));
  const c = [...r].map(b => A[b % 32]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return fail("POST only", 405);
  const sa = JSON.parse(Deno.env.get("PLAY_SA_JSON") || "null");
  if (!sa || !sa.client_email || !sa.private_key) return fail("Linking isn't switched on yet. Try again after the next update.", 503);
  let body: { nonce?: string; integrity?: string; purchases?: { id: string; token: string }[]; install?: string };
  try { body = await req.json(); } catch { return fail("Bad request"); }
  if ((body as { check?: boolean }).check) {
    try {
      const pi = await googleToken(sa, "https://www.googleapis.com/auth/playintegrity");
      const r = await fetch(`https://playintegrity.googleapis.com/v1/${PKG}:decodeIntegrityToken`, { method: "POST", headers: { authorization: `Bearer ${pi}`, "content-type": "application/json" }, body: JSON.stringify({ integrity_token: "check" }) });
      // 400 means Google took the key and looked at the (fake) token; 403 means the API or the project link isn't set up
      return json({ key: "ok", integrity: r.status === 400 ? "ok" : `not ready (${r.status})` });
    } catch (e) { return json({ key: "rejected: " + String((e as Error).message || e).slice(0, 200) }); }
  }
  const { nonce = "", integrity = "", purchases = [], install = "" } = body;
  if (!/^[A-Za-z0-9_-]{22,200}$/.test(nonce) || !integrity) return fail("Bad request");

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // a vouch is good for one code
  const { error: dup } = await db.from("link_nonces").insert({ nonce });
  if (dup) return fail("That request was already used. Try again.");

  try {
    // 1. is this the real app, installed from Google Play?
    const pi = await googleToken(sa, "https://www.googleapis.com/auth/playintegrity");
    const dr = await fetch(`https://playintegrity.googleapis.com/v1/${PKG}:decodeIntegrityToken`, { method: "POST", headers: { authorization: `Bearer ${pi}`, "content-type": "application/json" }, body: JSON.stringify({ integrity_token: integrity }) });
    const dj = await dr.json();
    const p = dj.tokenPayloadExternal;
    if (!p) return fail("Google couldn't check the app. Try again in a minute.", 502);
    const age = Date.now() - Number(p.requestDetails?.timestampMillis || 0);
    if (p.requestDetails?.requestPackageName !== PKG || p.requestDetails?.nonce !== nonce || age > 10 * 60 * 1000 || age < -60 * 1000)
      return fail("Google couldn't confirm this request. Try again.");
    if (p.appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED")
      return fail("Link codes only work in Arachnotes installed from Google Play.", 403);

    // 2. which purchases does Google confirm?
    const owned: string[] = [];
    const list = (Array.isArray(purchases) ? purchases : []).filter(x => x && /^[a-z0-9_.]{1,100}$/.test(x.id) && typeof x.token === "string" && x.token.length < 2000).slice(0, 80);
    if (list.length) {
      const ap = await googleToken(sa, "https://www.googleapis.com/auth/androidpublisher");
      for (const x of list) {
        const r = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}/purchases/products/${x.id}/tokens/${encodeURIComponent(x.token)}`, { headers: { authorization: `Bearer ${ap}` } });
        if (!r.ok) continue;
        const pj = await r.json();
        if (pj.purchaseState === 0 && !owned.includes(x.id)) owned.push(x.id);
      }
    }

    // 3. the code: one use, 30 minutes
    const code = newCode();
    const { error } = await db.from("app_links").insert({ code_hash: await codeHash(code), owned, install: /^AN-[0-9A-Z-]{14}$/.test(install) ? install : null, expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
    if (error) throw error;
    return json({ code, owned, minutes: 30 });
  } catch (e) {
    console.error(e);
    return fail("Couldn't make a code right now. Try again in a minute.", 500);
  }
});
