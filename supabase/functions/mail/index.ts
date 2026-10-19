// Copies support email into the dev_mail table, so the owner's dashboard and Claude can read what people send.
// The support address (SUPPORT_ADDRESS, normally arachnotes-app@yahoo.com) is a Yahoo disposable address that delivers into
// the owner's main mailbox (YAHOO_EMAIL, read with the app password in YAHOO_APP_PASSWORD). So ONLY messages sent to the
// support address are ever fetched: everything else in the mailbox is the owner's own mail and is never read.
// It looks in the inbox and in any folder whose name starts with Arachnotes, where the owner's Yahoo filters sort it.
// Run every 15 minutes by the database's "mail-sync" job, which proves itself with the private value in app_secrets.
// It only reads: folders are opened read-only (EXAMINE) and messages stay unread (BODY.PEEK).
import { createClient } from "jsr:@supabase/supabase-js@2";

const env = (k: string) => (Deno.env.get(k) || "").trim();
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

// bytes ↔ a string with one character per byte, so IMAP's byte counts line up
const bin = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192)); return s; };
const bytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0) & 255);
const decodeAs = (s: string, charset = "utf-8") => { try { return new TextDecoder(charset.toLowerCase().replace(/^(us-ascii|ascii)$/, "utf-8")).decode(bytes(s)); } catch { return new TextDecoder().decode(bytes(s)); } };
const quote = (s: string) => '"' + s.replace(/(["\\])/g, "\\$1") + '"';

class Imap {
  buf = ""; n = 0;
  constructor(private c: Deno.TlsConn) {}
  async fill() { const b = new Uint8Array(65536); const n = await this.c.read(b); if (n === null) throw new Error("Yahoo closed the connection"); this.buf += bin(b.subarray(0, n)); }
  async greet() { while (!/\r\n/.test(this.buf)) await this.fill(); this.buf = this.buf.slice(this.buf.indexOf("\r\n") + 2); }
  async cmd(text: string) {
    const tag = "a" + ++this.n;
    await this.c.write(new TextEncoder().encode(`${tag} ${text}\r\n`));
    const re = new RegExp(`(^|\\r\\n)${tag} (OK|NO|BAD)([^\\r]*)\\r\\n`);
    for (;;) {
      const m = re.exec(this.buf);
      if (m) { const out = this.buf.slice(0, m.index + m[0].length); this.buf = this.buf.slice(m.index + m[0].length); if (m[2] !== "OK") throw new Error(`Yahoo said ${m[2]}${m[3]}`); return out; }
      await this.fill();
    }
  }
}

// "=?utf-8?B?...?=" and "=?iso-8859-1?Q?...?=" words in headers
function words(s: string) {
  return s.replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, t) => {
    const raw = enc.toUpperCase() === "B" ? atob(t) : t.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, h: string) => String.fromCharCode(parseInt(h, 16)));
    return decodeAs(raw, cs);
  });
}
function headers(raw: string) {
  const h: Record<string, string> = {};
  for (const line of raw.replace(/\r\n[ \t]+/g, " ").split("\r\n")) { const i = line.indexOf(":"); if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim(); }
  return h;
}
const qp = (s: string) => s.replace(/=\r\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
function decodePart(body: string, enc = "", charset = "utf-8") {
  enc = enc.toLowerCase();
  const raw = enc === "base64" ? (() => { try { return atob(body.replace(/\s+/g, "")); } catch { return body; } })() : enc === "quoted-printable" ? qp(body) : body;
  return decodeAs(raw, charset);
}
const param = (v: string, name: string) => { const m = new RegExp(`${name}="?([^";]+)"?`, "i").exec(v || ""); return m ? m[1] : ""; };
const strip = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/div>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
// the readable text of a message: its plain-text part if it has one, otherwise its HTML part without the tags
function textOf(ctype: string, cte: string, body: string, depth = 0): string {
  const type = (ctype || "text/plain").toLowerCase();
  if (type.startsWith("multipart/") && depth < 4) {
    const b = param(ctype, "boundary"); if (!b) return "";
    const parts = body.split("--" + b).slice(1).filter(p => !p.startsWith("--"));
    const read = parts.map(p => { const i = p.indexOf("\r\n\r\n"); const h = headers(p.slice(0, i < 0 ? 0 : i).replace(/^\r\n/, "")); return { h, body: i < 0 ? "" : p.slice(i + 4) }; });
    const plain = read.find(p => /^text\/plain/i.test(p.h["content-type"] || "text/plain"));
    const pick = plain || read.find(p => /^text\/html/i.test(p.h["content-type"] || "")) || read.find(p => /^multipart\//i.test(p.h["content-type"] || ""));
    return pick ? textOf(pick.h["content-type"] || "text/plain", pick.h["content-transfer-encoding"] || "", pick.body, depth + 1) : "";
  }
  const text = decodePart(body, cte, param(ctype, "charset") || "utf-8");
  return type.startsWith("text/html") ? strip(text) : text;
}
// what an email is about: the tag the app's and website's email links put in the subject, or a guess from its words
function kindOf(subject: string, text: string) {
  const tag = /\[arachnotes\s*(issue|idea|question|purchase|data)\]/i.exec(subject);
  if (tag) return tag[1].toLowerCase();
  const t = (subject + " " + text.slice(0, 1500)).toLowerCase();
  if (/delete my data|my data|privacy|gdpr|remove my/.test(t)) return "data";
  if (/refund|purchase|bought|charged|payment|receipt|unlock/.test(t)) return "purchase";
  if (/\bbug\b|crash|broken|error|doesn'?t work|not working|freez|stuck|won'?t (open|load)|problem|issue/.test(t)) return "issue";
  if (/idea|suggest|feature|would be (nice|great|cool)|could you add|please add|\bwish\b/.test(t)) return "idea";
  if (/\?|how (do|can|to)|question/.test(t)) return "question";
  return "other";
}

type Msg = { uid?: number; flags?: string; date?: string; head?: string; text?: string };
// an IMAP FETCH response, taking each {n}-byte literal as it comes
function parseFetch(res: string): Msg[] {
  const out: Msg[] = [];
  let pos = 0, cur: Msg = {};
  const flush = () => { if (cur.uid) out.push(cur); cur = {}; };
  while (pos < res.length) {
    const lit = /\{(\d+)\}\r\n/g; lit.lastIndex = pos;
    const m = lit.exec(res);
    const chunk = res.slice(pos, m ? m.index : res.length);
    if (/\* \d+ FETCH \(/.test(chunk)) flush();
    const uid = /UID (\d+)/.exec(chunk); if (uid) cur.uid = Number(uid[1]);
    const fl = /FLAGS \(([^)]*)\)/.exec(chunk); if (fl) cur.flags = fl[1];
    const dt = /INTERNALDATE "([^"]+)"/.exec(chunk); if (dt) cur.date = dt[1];
    if (!m) break;
    const n = Number(m[1]), body = res.slice(m.index + m[0].length, m.index + m[0].length + n);
    if (/HEADER\.FIELDS/i.test(chunk.slice(-300))) cur.head = body; else cur.text = body;
    pos = m.index + m[0].length + n;
  }
  flush();
  return out;
}
function toRow(m: Msg, folder: string) {
  const h = headers(m.head || "");
  const text = textOf(h["content-type"] || "text/plain", h["content-transfer-encoding"] || "", m.text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  const when = Date.parse(h["date"] || "") || Date.parse(m.date || "") || Date.now();
  const subject = words(h["subject"] || "(no subject)").slice(0, 300);
  return { folder, uid: m.uid, from_addr: words(h["from"] || "").slice(0, 300), subject, sent_at: new Date(when).toISOString(), snippet: text.slice(0, 4000), seen: /\\Seen/.test(m.flags || ""), kind: kindOf(subject, text), fetched_at: new Date().toISOString() };
}

async function sync() {
  const user = env("YAHOO_EMAIL"), pass = env("YAHOO_APP_PASSWORD"), addr = (env("SUPPORT_ADDRESS") || "arachnotes-app@yahoo.com").toLowerCase();
  if (!user || !pass) return { error: "Add YAHOO_EMAIL and YAHOO_APP_PASSWORD to read the support inbox." };
  const conn = await Deno.connectTls({ hostname: "imap.mail.yahoo.com", port: 993 });
  const im = new Imap(conn);
  try {
    await im.greet();
    await im.cmd(`LOGIN ${quote(user)} ${quote(pass)}`);
    // the inbox, and the Arachnotes folders the owner's filters move support mail into
    const list = await im.cmd('LIST "" "*"');
    const named = [...list.matchAll(/\* LIST \([^)]*\) (?:"[^"]*"|NIL) (?:"([^"]+)"|(\S+))/g)].map(m => m[1] || m[2]);
    const folders = ["INBOX", ...named.filter(f => /^arachnotes/i.test(f))];
    const rows: Record<string, unknown>[] = [];
    for (const folder of folders) {
      await im.cmd(`EXAMINE ${quote(folder)}`); // read-only: nothing changes in the mailbox
      // only what was sent to the support address
      const found = await im.cmd(`UID SEARCH OR TO ${quote(addr)} CC ${quote(addr)}`);
      const uids = ((/\* SEARCH([\d ]*)/.exec(found) || [])[1] || "").trim().split(/\s+/).filter(Boolean).slice(-40);
      if (!uids.length) continue;
      const res = await im.cmd(`UID FETCH ${uids.join(",")} (UID FLAGS INTERNALDATE BODY.PEEK[HEADER.FIELDS (FROM TO CC SUBJECT DATE CONTENT-TYPE CONTENT-TRANSFER-ENCODING)] BODY.PEEK[TEXT]<0.12000>)`);
      for (const m of parseFetch(res)) {
        const h = headers(m.head || ""); // a second check, on the message itself
        if (!((h["to"] || "") + " " + (h["cc"] || "")).toLowerCase().includes(addr)) continue;
        rows.push(toRow(m, folder));
      }
    }
    await im.cmd("LOGOUT").catch(() => {});
    if (rows.length) { const { error } = await db.from("dev_mail").upsert(rows, { onConflict: "folder,uid", ignoreDuplicates: false }); if (error) throw error; }
    return { messages: rows.length, folders };
  } finally { try { conn.close(); } catch { /* closed */ } }
}

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const { data } = await db.from("app_secrets").select("value").eq("key", "cron").maybeSingle();
  if (!data || req.headers.get("x-cron") !== data.value) return json({ error: "Not allowed" }, 401);
  try { return json(await sync()); }
  catch (e) { console.error(e); return json({ error: String((e as Error).message).slice(0, 300) }, 500); }
});
