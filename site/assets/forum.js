// The Issues and Ideas forum. Posts live in the Arachnotes Supabase project and are reached only through the forum_* functions.
(() => {
  "use strict";
  const root = document.getElementById("forum");
  if (!root) return;
  const KIND = root.dataset.kind === "idea" ? "idea" : "issue";
  const SB = "https://gepkziwvlczkwernhtjm.supabase.co/rest/v1/rpc/";
  const KEY = "sb_publishable_xMcywbR7DxLl_Ygy_yxPdQ_UbF3HOzd"; // public by design: it can only call the forum functions
  const PAGE = 20;
  const T = KIND === "idea"
    ? { title: "Ideas", lede: "Suggest a feature, a spider look, a theme or anything else, and vote for the ideas you want most. The most-wanted ideas get built first.", new: "Suggest an idea", ph: "A short name for your idea", body: "What would it do, and why would it help?", none: "No ideas here yet. Spin the first thread." }
    : { title: "Issues", lede: "Something not working? Look for it below and vote so we know it affects you too, or post a new issue. For anything private, like a purchase, use Report an issue in the app.", new: "Report an issue", ph: "What's wrong, in a few words", body: "What did you do, what did you expect, and what happened instead? Which phone or browser?", none: "No issues reported. The web is holding." };
  const STATUS = { open: "Open", planned: "Planned", working: "Being worked on", fixed: "Fixed", done: "Added", declined: "Not planned", duplicate: "Duplicate" };
  const { store } = window.AN || { store: { get() { return null; }, set() {} } };

  // a random voting ID kept in this browser, so you can vote once per post and take it back
  let voter = store.get("an-voter");
  if (!voter) { const a = new Uint8Array(16); crypto.getRandomValues(a); voter = Array.from(a, b => b.toString(16).padStart(2, "0")).join(""); store.set("an-voter", voter); }
  const myVotes = new Set((store.get("an-votes") || "").split(",").filter(Boolean));
  const saveVotes = () => store.set("an-votes", [...myVotes].slice(-500).join(","));

  async function rpc(fn, args) {
    const res = await fetch(SB + fn, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    const text = await res.text(), data = text ? JSON.parse(text) : null;
    if (!res.ok) { const e = new Error((data && data.message) || "Something went wrong. Please try again."); e.code = data && data.code; throw e; }
    return data;
  }
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ago = iso => {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 60) return "just now"; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 30) { const d = Math.floor(s / 86400); return `${d} day${d > 1 ? "s" : ""} ago`; }
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  // links in posts become real links, everything else stays plain text
  const linkify = s => esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"'\]]/g, u => `<a href="${u}" rel="nofollow ugc noopener" target="_blank">${u}</a>`);
  const UP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5.5 4.5 15h15z"/></svg>`;
  const SPIN = `<div class="loading" role="status" aria-label="Loading"><svg class="webart"></svg></div>`;
  const EMPTY = msg => `<div class="empty"><svg class="webart"></svg><p>${esc(msg)}</p></div>`;
  const webs = el => el.querySelectorAll("svg.webart:not([viewBox])").forEach((s, i) => window.AN && window.AN.orbWeb(s, { seed: 3 + i, spokes: 12, rings: 8, dew: false }));

  root.innerHTML = `
    <div class="forum-head">
      <nav class="tabs" aria-label="Forum"><a href="issues"${KIND === "issue" ? ' aria-current="page"' : ""}>Issues</a><a href="ideas"${KIND === "idea" ? ' aria-current="page"' : ""}>Ideas</a></nav>
      <h1>${T.title}</h1><p class="muted prose">${T.lede}</p>
    </div>
    <div id="view"></div>`;
  const view = root.querySelector("#view");

  // ---------- the list ----------
  const st = { sort: "top", status: KIND === "issue" ? "open" : "", q: "", offset: 0, items: [], mode: store.get("an-forum-mode") === "web" ? "web" : "list" };
  function listShell() {
    view.innerHTML = `
      <div class="toolbar">
        <input type="search" id="q" placeholder="Search ${T.title.toLowerCase()}" aria-label="Search" value="${esc(st.q)}">
        <div class="seg" role="group" aria-label="Sort"><button type="button" data-sort="top" aria-pressed="${st.sort === "top"}">Top</button><button type="button" data-sort="new" aria-pressed="${st.sort === "new"}">New</button></div>
        <select id="status" aria-label="Show"><option value="">All</option><option value="open">Open</option><option value="closed">Closed</option></select>
        <div class="seg" role="group" aria-label="View"><button type="button" data-mode="list" aria-pressed="${st.mode === "list"}">List</button><button type="button" data-mode="web" aria-pressed="${st.mode === "web"}">Web</button></div>
        <button type="button" class="btn small" id="newBtn">${T.new}</button>
      </div>
      <div id="composeBox"></div>
      <div id="webBox" hidden></div>
      <div id="listBox"><ul class="posts" id="posts" aria-live="polite"></ul>
      <div class="more"><button type="button" class="btn small ghost" id="more" hidden>Load more</button></div></div>`;
    view.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => { st.mode = b.dataset.mode; store.set("an-forum-mode", st.mode); view.querySelectorAll("[data-mode]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); showMode(); });
    view.querySelector("#status").value = st.status;
    let t; view.querySelector("#q").addEventListener("input", e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(true); }, 300); });
    view.querySelectorAll("[data-sort]").forEach(b => b.onclick = () => { st.sort = b.dataset.sort; view.querySelectorAll("[data-sort]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); load(true); });
    view.querySelector("#status").onchange = e => { st.status = e.target.value; load(true); };
    view.querySelector("#newBtn").onclick = () => compose();
    view.querySelector("#more").onclick = () => load(false);
    load(true); showMode();
  }
  function showMode() {
    const web = st.mode === "web";
    view.querySelector("#webBox").hidden = !web; view.querySelector("#listBox").hidden = web;
    view.querySelectorAll("#q, [data-sort], #status").forEach(el => { el.disabled = web; });
    if (web) drawWeb(view.querySelector("#webBox"));
  }

  // ---------- Issues and Ideas as one web ----------
  // Each post is a dew drop; posts that say similar things are tied together with silk. Issues and Ideas share one web,
  // so an idea that would fix an issue hangs right next to it.
  // An orb web: spokes from a hub, a spiral of capture thread, and a frame. Each post is a dew drop where a spoke
  // meets a ring; the most-voted sit nearest the hub. Posts that say similar things share neighbouring spokes and are
  // tied together with silk, so a cluster of alike posts shows as a knot in the web.
  function orderBySimilarity(nodes, links) {
    const sim = new Map(); for (const l of links) { sim.set(l.a + ":" + l.b, l.s); sim.set(l.b + ":" + l.a, l.s); }
    const left = nodes.slice().sort((x, y) => y.votes - x.votes || y.replies - x.replies), out = [];
    while (left.length) {
      let i = 0;
      if (out.length) { const last = out[out.length - 1]; let best = 0; left.forEach((n, j) => { const v = sim.get(last.id + ":" + n.id) || 0; if (v > best) { best = v; i = j; } }); }
      out.push(left.splice(i, 1)[0]);
    }
    return out;
  }
  async function drawWeb(box) {
    box.innerHTML = SPIN; webs(box);
    let d; try { d = await rpc("forum_web", { p_limit: 150 }); } catch (e) { box.innerHTML = `<p class="msg err">Couldn't load the web: ${esc(e.message)}</p>`; return; }
    if (!d.nodes.length) { box.innerHTML = EMPTY(T.none); webs(box); return; }
    const nodes = orderBySimilarity(d.nodes, d.links), n = nodes.length;
    const S = Math.min(36, Math.max(12, n)), RINGS = 9;
    const W = 1000, H = 820, cx = W / 2, cy = H / 2 + 6, R = 330;
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const ang = Array.from({ length: S }, (_, i) => -Math.PI / 2 + (i / S) * Math.PI * 2 + (rnd() - .5) * .05);
    const spokeLen = ang.map(() => R * (.93 + rnd() * .07));
    const ringF = k => .16 + (k / (RINGS - 1)) * .8; // ring k as a share of the spoke's length
    const pt = (i, k) => ({ x: cx + Math.cos(ang[i]) * spokeLen[i] * ringF(k), y: cy + Math.sin(ang[i]) * spokeLen[i] * ringF(k) });
    // place posts: in order around the web; more votes, closer to the hub; a second lap uses the next rings out
    const maxV = Math.max(1, ...nodes.map(x => x.votes)), taken = new Set();
    nodes.forEach((p, i) => {
      const sp = i % S, lap = Math.floor(i / S);
      let k = Math.round(1 + (1 - Math.sqrt(p.votes / maxV)) * 4) + lap * 2; k = Math.max(1, Math.min(RINGS - 1, k));
      while (taken.has(sp + ":" + k) && k < RINGS - 1) k++;
      taken.add(sp + ":" + k); Object.assign(p, pt(sp, k), { sp, k });
    });
    const byId = new Map(nodes.map(p => [p.id, p]));
    const ties = d.links.map(l => ({ a: byId.get(l.a), b: byId.get(l.b), s: l.s })).filter(l => l.a && l.b);
    const linked = new Set(ties.flatMap(l => [l.a.id, l.b.id]));
    // the web itself
    let web = "";
    for (let i = 0; i < S; i++) web += `M${cx} ${cy} L${(cx + Math.cos(ang[i]) * spokeLen[i]).toFixed(1)} ${(cy + Math.sin(ang[i]) * spokeLen[i]).toFixed(1)} `;
    for (let k = 0; k < RINGS; k++) {
      for (let i = 0; i <= S; i++) {
        const j = i % S, q = pt(j, k);
        if (!i) { web += `M${q.x.toFixed(1)} ${q.y.toFixed(1)} `; continue; }
        const p0 = pt(i - 1, k), mx = (p0.x + q.x) / 2, my = (p0.y + q.y) / 2, sag = .1; // sag toward the hub
        web += `Q${(mx + (cx - mx) * sag).toFixed(1)} ${(my + (cy - my) * sag).toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)} `;
      }
    }
    // the frame and the anchor threads to the corners
    const frame = ang.map((a2, i) => ({ x: cx + Math.cos(a2) * spokeLen[i], y: cy + Math.sin(a2) * spokeLen[i] }));
    let fr = "M" + frame.map(q => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" L") + " Z";
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) { let best = frame[0], bd = Infinity; for (const q of frame) { const dd = Math.hypot(q.x - x, q.y - y); if (dd < bd) { bd = dd; best = q; } } fr += ` M${best.x.toFixed(1)} ${best.y.toFixed(1)} L${x} ${y}`; }
    // silk ties between similar posts, sagging toward the hub like real thread
    const tie = l => { const mx = (l.a.x + l.b.x) / 2, my = (l.a.y + l.b.y) / 2; return `M${l.a.x.toFixed(1)} ${l.a.y.toFixed(1)} Q${(mx + (cx - mx) * .25).toFixed(1)} ${(my + (cy - my) * .25).toFixed(1)} ${l.b.x.toFixed(1)} ${l.b.y.toFixed(1)}`; };
    const r = p => 8 + Math.min(10, Math.sqrt(p.votes) * 2.2);
    const label = p => { const right = p.x >= cx, t = p.title.length > 30 ? p.title.slice(0, 28) + "…" : p.title, dx = right ? r(p) + 6 : -r(p) - 6; return `<text x="${(p.x + dx).toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="${right ? "start" : "end"}">${esc(t)}</text>`; };
    box.innerHTML = `<div class="webwrap"><svg class="forumweb" viewBox="0 0 ${W} ${H}" role="group" aria-label="Issues and ideas on one web. Posts that are alike are tied together.">
      <path class="frame" d="${fr}"/><path class="silk" d="${web}"/>
      ${ties.map(l => `<path class="tie" d="${tie(l)}" style="stroke-width:${(1 + l.s * 3.5).toFixed(2)}"/>`).join("")}
      <g class="hub"><circle cx="${cx}" cy="${cy}" r="16"/><g transform="translate(${cx} ${cy}) rotate(-90)"><ellipse cx="-4" cy="0" rx="6" ry="4.6"/><circle cx="4" cy="0" r="3.4"/><path d="M4-2l4-7M2-3l1-9M0-3l-3-8M-2-3l-6-6M4 2l4 7M2 3l1 9M0 3l-3 8M-2 3l-6 6"/></g></g>
      ${nodes.map(p => `<a href="${p.kind === "idea" ? "ideas" : "issues"}#${p.id}" class="drop ${p.kind}${p.kind === KIND ? " mine" : ""}${linked.has(p.id) ? " tied" : ""}" aria-label="${p.kind === "idea" ? "Idea" : "Issue"}: ${esc(p.title)}, ${p.votes} vote${p.votes === 1 ? "" : "s"}">
        <title>${esc(p.title)}</title><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r(p).toFixed(1)}"/><circle class="shine" cx="${(p.x - r(p) * .35).toFixed(1)}" cy="${(p.y - r(p) * .35).toFixed(1)}" r="${(r(p) * .28).toFixed(1)}"/>${label(p)}</a>`).join("")}
    </svg></div>
    <p class="web-key"><span class="key issue"></span>Issue <span class="key idea"></span>Idea · The more votes, the closer to the hub and the bigger the drop. Bright silk ties together posts that say similar things. Tap a drop to open it.</p>`;
  }
  function postRow(p) {
    const voted = myVotes.has(String(p.id));
    return `<li class="post${p.pinned ? " pinned" : ""}">
      <button type="button" class="vote" data-vote="${p.id}" aria-pressed="${voted}" aria-label="${voted ? "Remove your vote" : "Vote for this"}, ${p.votes} vote${p.votes === 1 ? "" : "s"}">${UP}<span>${p.votes}</span></button>
      <div class="post-main">
        <a class="post-title" href="#${p.id}">${esc(p.title)}</a>
        <p class="post-ex">${esc(p.excerpt)}</p>
        <div class="meta-row"><span class="badge ${p.status}">${STATUS[p.status] || p.status}</span>${p.answered ? '<span class="badge dev">Dev replied</span>' : ""}<span>${esc(p.author)}</span><span>${ago(p.created_at)}</span><span>${p.replies} repl${p.replies === 1 ? "y" : "ies"}</span></div>
      </div></li>`;
  }
  async function load(reset) {
    const ul = view.querySelector("#posts"), more = view.querySelector("#more");
    if (!ul) return;
    if (reset) { st.offset = 0; st.items = []; ul.innerHTML = `<li>${SPIN}</li>`; webs(ul); }
    more.disabled = true;
    try {
      const rows = await rpc("forum_list", { p_kind: KIND, p_sort: st.sort, p_q: st.q || null, p_status: st.status || null, p_limit: PAGE, p_offset: st.offset });
      st.items.push(...rows); st.offset += rows.length;
      ul.innerHTML = st.items.length ? st.items.map(postRow).join("") : `<li>${EMPTY(st.q ? "Nothing matches that search." : T.none)}</li>`;
      webs(ul); bindVotes(ul);
      more.hidden = rows.length < PAGE; more.disabled = false;
    } catch (e) { ul.innerHTML = `<li class="msg err">Couldn't load posts: ${esc(e.message)}</li>`; }
  }
  function bindVotes(scope) {
    scope.querySelectorAll("[data-vote]").forEach(b => b.onclick = async () => {
      const id = b.dataset.vote; b.disabled = true;
      try {
        const r = await rpc("forum_vote", { p_post: +id, p_voter: voter });
        if (r.voted) myVotes.add(id); else myVotes.delete(id); saveVotes();
        b.setAttribute("aria-pressed", String(r.voted)); b.querySelector("span").textContent = r.votes;
        b.setAttribute("aria-label", `${r.voted ? "Remove your vote" : "Vote for this"}, ${r.votes} vote${r.votes === 1 ? "" : "s"}`);
        const it = st.items.find(x => String(x.id) === id); if (it) it.votes = r.votes;
      } catch (e) { flash(b, e.message); }
      b.disabled = false;
    });
  }
  function flash(near, text) {
    const m = document.createElement("p"); m.className = "msg err"; m.setAttribute("role", "alert"); m.textContent = text;
    (near.closest(".post, .detail, .compose") || view).appendChild(m); setTimeout(() => m.remove(), 5000);
  }

  // ---------- writing a post ----------
  function compose() {
    const box = view.querySelector("#composeBox");
    if (box.firstChild) { box.querySelector("input").focus(); return; }
    box.innerHTML = `<form class="compose" novalidate>
      <label>Title<input name="title" maxlength="120" required placeholder="${esc(T.ph)}" autocomplete="off"></label>
      <label>Details<textarea name="body" maxlength="4000" required placeholder="${esc(T.body)}"></textarea></label><span class="counter" data-count>0 / 4000</span>
      <div class="row"><label>Your name (optional)<input name="author" maxlength="40" placeholder="Anonymous" autocomplete="nickname"></label>
      ${KIND === "issue" ? `<label>App version (optional)<input name="ver" maxlength="40" placeholder="For example v1.13.1"></label>` : "<span></span>"}</div>
      <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="muted" style="font-size:.95rem">Posts are public. Please don't include personal details or your support ID. By posting you agree to the <a href="terms#forum">forum rules</a>.</p>
      <div class="btns"><button class="btn small" type="submit">Post</button><button class="btn small ghost" type="button" data-cancel>Cancel</button></div>
      <p class="msg err" data-err hidden role="alert"></p></form>`;
    const f = box.querySelector("form"), err = f.querySelector("[data-err]");
    f.body.addEventListener("input", () => { f.querySelector("[data-count]").textContent = `${f.body.value.length} / 4000`; });
    f.querySelector("[data-cancel]").onclick = () => { box.innerHTML = ""; };
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      if (f.website.value) return; // a bot filled the hidden field
      const title = f.title.value.trim(), body = f.body.value.trim();
      if (title.length < 4) { err.textContent = "Please give it a title of at least 4 characters."; err.hidden = false; f.title.focus(); return; }
      if (!body) { err.textContent = "Please add some details."; err.hidden = false; f.body.focus(); return; }
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Posting…";
      try {
        const id = await rpc("forum_post", { p_kind: KIND, p_title: title, p_body: body, p_author: f.author.value.trim() || null, p_app_version: f.ver ? f.ver.value.trim() || null : null, p_voter: voter });
        myVotes.add(String(id)); saveVotes(); store.set("an-name", f.author.value.trim());
        location.hash = String(id);
      } catch (e2) { err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.textContent = "Post"; }
    };
    const nm = store.get("an-name"); if (nm) f.author.value = nm;
    f.title.focus();
  }

  // ---------- one post with its replies ----------
  async function detail(id) {
    view.innerHTML = SPIN; webs(view); scrollTo({ top: 0 });
    let d;
    try { d = await rpc("forum_get", { p_id: id, p_voter: voter }); }
    catch (e) { view.innerHTML = `<p class="msg err">Couldn't load this post: ${esc(e.message)}</p><p style="margin-top:12px"><a href="#">← All ${T.title.toLowerCase()}</a></p>`; return; }
    if (!d) { view.innerHTML = `${EMPTY("This post isn't here any more. It may have been removed.")}<p style="text-align:center"><a href="#">← All ${T.title.toLowerCase()}</a></p>`; webs(view); return; }
    const p = d.post; if (d.voted) myVotes.add(String(p.id)); else myVotes.delete(String(p.id)); saveVotes();
    document.title = `${p.title} · Arachnotes ${T.title}`;
    view.innerHTML = `<article class="detail">
      <p><a href="#">← All ${T.title.toLowerCase()}</a></p>
      <div class="post">
        <button type="button" class="vote" data-vote="${p.id}" aria-pressed="${d.voted}" aria-label="${d.voted ? "Remove your vote" : "Vote for this"}, ${p.votes} votes">${UP}<span>${p.votes}</span></button>
        <div class="post-main">
          <h2 style="font-size:1.5rem;overflow-wrap:anywhere">${esc(p.title)}</h2>
          <div class="meta-row"><span class="badge ${p.status}">${STATUS[p.status] || p.status}</span><span>${esc(p.author)}</span><span>${ago(p.created_at)}</span>${p.app_version ? `<span>${esc(p.app_version)}</span>` : ""}</div>
          <div class="body">${linkify(p.body)}</div>
          ${p.dev_note ? `<div class="devnote"><span class="badge dev">CAK3D_Creations</span><div style="margin-top:8px">${linkify(p.dev_note)}</div></div>` : ""}
          <div><button type="button" class="linkish" data-flag="p:${p.id}">Report this post</button></div>
        </div>
      </div>
      <section class="related" hidden></section>
      <h3>${d.replies.length ? `${d.replies.length} repl${d.replies.length === 1 ? "y" : "ies"}` : "No replies yet"}</h3>
      <ul class="replies">${d.replies.map(r => `<li class="reply${r.is_dev ? " dev" : ""}">
        <div class="meta-row">${r.is_dev ? '<span class="badge dev">CAK3D_Creations</span>' : `<span>${esc(r.author)}</span>`}<span>${ago(r.created_at)}</span><button type="button" class="linkish" data-flag="r:${r.id}">Report</button></div>
        <div class="body">${linkify(r.body)}</div></li>`).join("")}</ul>
      <form class="compose" novalidate>
        <label>Add a reply<textarea name="body" maxlength="2000" required placeholder="${KIND === "issue" ? "Seeing this too? Add your phone or browser and what you tried." : "What would make this idea better?"}"></textarea></label>
        <div class="row"><label>Your name (optional)<input name="author" maxlength="40" placeholder="Anonymous" autocomplete="nickname"></label><span></span></div>
        <label class="hp" aria-hidden="true">Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label>
        <div class="btns"><button class="btn small" type="submit">Reply</button></div>
        <p class="msg err" data-err hidden role="alert"></p>
      </form></article>`;
    bindVotes(view); related(p);
    view.querySelectorAll("[data-flag]").forEach(b => b.onclick = async () => {
      if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to report it"; setTimeout(() => { if (b.isConnected && b.dataset.armed === "1") { b.dataset.armed = ""; b.textContent = b.dataset.flag[0] === "p" ? "Report this post" : "Report"; } }, 4000); return; }
      b.disabled = true;
      try { await rpc("forum_flag", { p_target: b.dataset.flag, p_voter: voter }); b.textContent = "Reported. Thanks."; } catch (e) { b.textContent = e.message; }
    });
    const f = view.querySelector("form.compose"), err = f.querySelector("[data-err]");
    const nm = store.get("an-name"); if (nm) f.author.value = nm;
    f.onsubmit = async e => {
      e.preventDefault(); err.hidden = true;
      if (f.website.value) return;
      const body = f.body.value.trim(); if (!body) { err.textContent = "Please write a reply first."; err.hidden = false; return; }
      const btn = f.querySelector("[type=submit]"); btn.disabled = true; btn.textContent = "Replying…";
      try { await rpc("forum_reply", { p_post: p.id, p_body: body, p_author: f.author.value.trim() || null }); store.set("an-name", f.author.value.trim()); detail(p.id); }
      catch (e2) { err.textContent = e2.message; err.hidden = false; btn.disabled = false; btn.textContent = "Reply"; }
    };
  }

  async function related(p) {
    const box = view.querySelector(".related"); if (!box) return;
    let rows; try { rows = await rpc("forum_related", { p_id: p.id, p_limit: 6 }); } catch { return; }
    if (!rows.length || !box.isConnected) return;
    const W = 320, H = 200, cx = W / 2, cy = H / 2;
    const pts = rows.map((o, i) => { const a = -Math.PI / 2 + i / rows.length * Math.PI * 2, rr = 78 - o.s * 50; return { o, x: cx + Math.cos(a) * rr * 1.5, y: cy + Math.sin(a) * rr }; });
    box.innerHTML = `<h3>Tied to this</h3><p class="muted" style="font-size:.95rem">Posts that say similar things, from Issues and Ideas. Closer means more alike.</p>
      <div class="related-row"><svg viewBox="0 0 ${W} ${H}" class="miniweb" aria-hidden="true">
        ${pts.map(q => `<line x1="${cx}" y1="${cy}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" style="stroke-width:${(.6 + q.o.s * 3).toFixed(2)}"/>`).join("")}
        <circle class="hub" cx="${cx}" cy="${cy}" r="9"/>
        ${pts.map((q, i) => `<circle class="drop-c ${q.o.kind}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="7"/><text x="${q.x.toFixed(1)}" y="${(q.y + 4).toFixed(1)}">${i + 1}</text>`).join("")}
      </svg>
      <ol class="related-list">${rows.map(o => `<li><a href="${o.kind === "idea" ? "ideas" : "issues"}#${o.id}">${esc(o.title)}</a> <span class="meta-row" style="display:inline-flex"><span class="badge ${o.status}">${o.kind === "idea" ? "Idea" : "Issue"} · ${STATUS[o.status] || o.status}</span></span></li>`).join("")}</ol></div>`;
    box.hidden = false;
  }

  // the address's #number opens that post; no number shows the list
  function route() {
    const id = +location.hash.slice(1);
    if (id > 0) detail(id);
    else { document.title = `Arachnotes ${T.title}`; listShell(); }
  }
  addEventListener("hashchange", route);
  route();
})();
