// Arachnotes website: the header and footer, the webs, the latest release, and the spider that crawls around.
(() => {
  "use strict";
  const REPO = "real-CAK3D/CAK3D-Crawler";
  const WEB_APP = "https://arachnotes.vercel.app/";
  // set this to the Play Store link once the app is live there; the download buttons switch over by themselves
  const PLAY_URL = "";
  const LEGAL = "© 2026 CAK3D_Creations. Arachnotes™ and the Arachnotes spider are trademarks of CAK3D_Creations.";
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const here = (location.pathname.replace(/\/$/, "/index").split("/").pop() || "index").replace(/\.html$/, "");
  window.AN = { REPO, WEB_APP, PLAY_URL, store, reduced };

  // ---------- header and footer ----------
  const links = [["index", "./", "Home"], ["issues", "issues", "Issues"], ["ideas", "ideas", "Ideas"], ["privacy", "privacy", "Privacy"], ["terms", "terms", "Terms"]];
  const head = document.querySelector("header.site-head");
  if (head) head.innerHTML = `<a class="skip" href="#main">Skip to content</a><div class="wrap">
    <a class="brand" href="./"><img src="assets/icon-192.png" alt="" width="34" height="34">Arachnotes</a>
    <nav class="nav" aria-label="Site">${links.map(([id, href, name]) => `<a href="${href}"${id === here ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</nav></div>`;
  const foot = document.querySelector("footer.site-foot");
  if (foot) {
    foot.innerHTML = `<div class="wrap"><p>${LEGAL}</p>
      <button type="button" id="spiderToggle" aria-pressed="true">Spider: on</button></div>`;
  }

  // ---------- orb webs, drawn as SVG ----------
  // spokes from the hub, and a spiral of threads that sag a little toward the hub between spokes
  function orbWeb(svg, { spokes = 18, rings = 13, seed = 7, dew = true } = {}) {
    let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const NS = "http://www.w3.org/2000/svg", c = 100, R = 96;
    const ang = Array.from({ length: spokes }, (_, i) => (i / spokes) * Math.PI * 2 + (rnd() - .5) * .12);
    const len = ang.map(() => R * (.86 + rnd() * .14));
    svg.setAttribute("viewBox", "0 0 200 200");
    const add = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); svg.appendChild(el); return el; };
    ang.forEach((a, i) => {
      const el = add("line", { x1: c, y1: c, x2: c + Math.cos(a) * len[i], y2: c + Math.sin(a) * len[i], class: "spoke" });
      el.style.setProperty("--len", len[i].toFixed(1)); el.style.setProperty("--d", (i * .03).toFixed(2) + "s");
    });
    for (let r = 0; r < rings; r++) {
      const f = .14 + (r / rings) * .82; let d = "";
      for (let i = 0; i <= spokes; i++) {
        const k = i % spokes, a = ang[k], rr = len[k] * f, x = c + Math.cos(a) * rr, y = c + Math.sin(a) * rr;
        if (!i) { d = `M${x.toFixed(1)} ${y.toFixed(1)}`; continue; }
        const pa = ang[(i - 1) % spokes], mid = (pa + (a < pa ? a + Math.PI * 2 : a)) / 2, sag = rr * .9;
        d += ` Q${(c + Math.cos(mid) * sag).toFixed(1)} ${(c + Math.sin(mid) * sag).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const el = add("path", { d, class: "ring" });
      el.style.setProperty("--len", (2 * Math.PI * R * f * 1.05).toFixed(0)); el.style.setProperty("--d", (.5 + r * .07).toFixed(2) + "s");
    }
    if (dew) for (let i = 0; i < 9; i++) { const k = Math.floor(rnd() * spokes), f = .3 + rnd() * .65; add("circle", { cx: c + Math.cos(ang[k]) * len[k] * f, cy: c + Math.sin(ang[k]) * len[k] * f, r: .9 + rnd() * .9, class: "dew" }); }
    if (!reduced) svg.classList.add("draw");
  }
  document.querySelectorAll("svg.webart").forEach((svg, i) => orbWeb(svg, { seed: 11 + i * 5, spokes: +svg.dataset.spokes || 18, rings: +svg.dataset.rings || 13 }));
  window.AN.orbWeb = orbWeb;

  // a cobweb in the top-right corner of every page
  const corner = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  corner.setAttribute("class", "corner-web"); corner.setAttribute("aria-hidden", "true"); corner.setAttribute("viewBox", "0 0 100 100");
  {
    let d = ""; const n = 6, A = Array.from({ length: n }, (_, i) => Math.PI / 2 + (i / (n - 1)) * Math.PI / 2);
    A.forEach(a => { d += `M100 0 L${(100 + Math.cos(a) * 140).toFixed(1)} ${(Math.sin(a) * 140).toFixed(1)} `; });
    for (let r = 18; r < 110; r += 16) for (let i = 1; i < n; i++) {
      const a0 = A[i - 1], a1 = A[i], m = (a0 + a1) / 2, x0 = 100 + Math.cos(a0) * r, y0 = Math.sin(a0) * r, x1 = 100 + Math.cos(a1) * r, y1 = Math.sin(a1) * r;
      d += `M${x0.toFixed(1)} ${y0.toFixed(1)} Q${(100 + Math.cos(m) * r * .82).toFixed(1)} ${(Math.sin(m) * r * .82).toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)} `;
    }
    corner.innerHTML = `<path d="${d}" fill="none" stroke="var(--silk)" stroke-width=".6" opacity=".55"/>`;
  }
  document.body.appendChild(corner);

  // silk dividers spin themselves in when they scroll into view
  const rules = document.querySelectorAll(".silk-rule");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("seen"); io.unobserve(e.target); } }), { threshold: .4 });
    rules.forEach(r => io.observe(r));
  } else rules.forEach(r => r.classList.add("seen"));

  // ---------- the latest release ----------
  const fmtSize = b => (b / 1048576).toFixed(1) + " MB";
  const fmtDate = s => new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  async function latest() {
    try { const c = JSON.parse(sessionStorage.getItem("an-rel") || "null"); if (c && Date.now() - c.at < 6e5) return c.r; } catch {}
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(res.status);
    const j = await res.json(), apk = (j.assets || []).find(a => /^Arachnotes-v.*\.apk$/.test(a.name)) || (j.assets || []).find(a => /\.apk$/.test(a.name));
    const r = { tag: j.tag_name, date: j.published_at, url: j.html_url, apk: apk && apk.browser_download_url, size: apk && apk.size };
    try { sessionStorage.setItem("an-rel", JSON.stringify({ at: Date.now(), r })); } catch {}
    return r;
  }
  const apkLinks = document.querySelectorAll("[data-apk]"), relText = document.querySelectorAll("[data-release]");
  document.querySelectorAll("[data-play]").forEach(a => { if (PLAY_URL) { a.href = PLAY_URL; a.hidden = false; } else a.hidden = true; });
  document.querySelectorAll("[data-webapp]").forEach(a => { a.href = WEB_APP; });
  if (apkLinks.length || relText.length) latest().then(r => {
    apkLinks.forEach(a => { if (r.apk) a.href = r.apk; const s = a.querySelector("small"); if (s) s.textContent = `${r.tag}${r.size ? " · " + fmtSize(r.size) : ""}`; });
    relText.forEach(el => { el.innerHTML = `Latest: <a href="${r.url}">${r.tag}</a>, released ${fmtDate(r.date)}.`; });
  }).catch(() => {
    // the release files aren't public (for example once the app is on Google Play): point people to the store instead
    apkLinks.forEach(a => { if (PLAY_URL) { a.hidden = true; } else a.href = `https://github.com/${REPO}/releases/latest`; });
    relText.forEach(el => { el.textContent = PLAY_URL ? "Get the latest version from Google Play." : ""; });
  });

  // ---------- the spider ----------
  // The app's orb weaver, drawn on a canvas over the page. It wanders the edges, spins a small orb web when it
  // settles somewhere, drops on a thread now and then, and walks over to wherever you tap, waits, circles the spot
  // and wanders off again.
  const toggle = document.getElementById("spiderToggle");
  let on = store.get("an-spider") !== "off";
  const cv = document.createElement("canvas"); cv.className = "crawler"; cv.setAttribute("aria-hidden", "true");
  document.body.appendChild(cv);
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  function size() { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); addEventListener("resize", () => { size(); sp.x = Math.min(sp.x, W - 20); sp.y = Math.min(sp.y, H - 20); });
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let col = {}; const readCols = () => { col = { body: css("--spider"), silk: css("--silk"), eye: css("--paper"), mark: css("--grip") }; };
  readCols(); matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readCols);

  const sp = { x: W - 70, y: H - 90, a: -Math.PI / 2, mode: "rest", t: 1.2, tx: 0, ty: 0, phase: 0, speed: 0, thread: null, circle: null };
  const trail = [], webs = [];
  // an orb web spun around a spot: spokes first, then the spiral, from the outside in, like the real thing
  function spinWeb(x, y) {
    if (webs.length >= 3) webs.shift();
    const n = 10 + Math.floor(Math.random() * 4), R = r(34, 52), ang = Array.from({ length: n }, (_, i) => i / n * Math.PI * 2 + r(-.08, .08));
    webs.push({ x, y, R, ang, len: ang.map(() => R * r(.85, 1)), grow: 0, fade: 1, done: false });
  }
  const r = (a, b) => a + Math.random() * (b - a);
  function pickWander() {
    // mostly along the edges, where it won't sit on the words; sometimes across the page
    const m = 26, side = Math.random();
    if (side < .3) { sp.tx = r(m, W - m); sp.ty = r(70, H * .35); }
    else if (side < .55) { sp.tx = W - r(m, 90); sp.ty = r(80, H - m); }
    else if (side < .8) { sp.tx = r(m, 90); sp.ty = r(80, H - m); }
    else { sp.tx = r(m, W - m); sp.ty = H - r(m, 80); }
    sp.mode = "walk";
  }
  function dropThread() { sp.mode = "drop"; sp.thread = { x: sp.x, top: sp.y, down: Math.min(H - sp.y - 40, r(90, 200)), dir: 1 }; sp.a = Math.PI / 2; }
  function steer(tx, ty, spd, dt) {
    const dx = tx - sp.x, dy = ty - sp.y, d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx); let diff = ((want - sp.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    sp.a += Math.max(-1, Math.min(1, diff)) * Math.min(1, dt * 7);
    const step = Math.min(d, spd * dt * (Math.abs(diff) > 1.4 ? .3 : 1));
    sp.x += Math.cos(sp.a) * step; sp.y += Math.sin(sp.a) * step; sp.phase += step * .32; sp.speed = step / Math.max(dt, .001);
    return d;
  }
  function update(dt) {
    if (sp.mode === "rest") {
      sp.speed = 0;
      const w = sp.web; if (w && !w.done) { w.grow = Math.min(1, w.grow + dt / 4); sp.a += dt * 1.6; sp.phase += dt * 3; if (w.grow >= 1) w.done = true; }
      if ((sp.t -= dt) <= 0) { if (sp.web) { sp.web.leaving = true; sp.web = null; } if (sp.y < H * .45 && Math.random() < .22) dropThread(); else pickWander(); }
    }
    else if (sp.mode === "walk") {
      if (steer(sp.tx, sp.ty, 64, dt) < 4) {
        sp.mode = "rest"; sp.t = r(1.5, 5);
        // settled away from the words: sometimes it spins a web and waits in the middle of it
        if (Math.random() < .45 && sp.x > 50 && sp.x < W - 50 && sp.y > 110 && sp.y < H - 50) { spinWeb(sp.x, sp.y); sp.web = webs[webs.length - 1]; sp.t = r(7, 12); }
      }
    }
    else if (sp.mode === "visit") { if (steer(sp.tx, sp.ty, 150, dt) < 5) { sp.mode = "wait"; sp.t = .9; } }
    else if (sp.mode === "wait") { sp.speed = 0; sp.phase += dt * .6; if ((sp.t -= dt) <= 0) { sp.mode = "circle"; sp.circle = { cx: sp.tx, cy: sp.ty, ang: Math.atan2(sp.y - sp.ty, sp.x - sp.tx) - Math.PI / 2, left: Math.PI * 2 }; } }
    else if (sp.mode === "circle") {
      const c = sp.circle, rad = 28, w = 3; c.ang += w * dt; c.left -= w * dt;
      const nx = c.cx + Math.cos(c.ang) * rad, ny = c.cy + Math.sin(c.ang) * rad;
      sp.a = Math.atan2(ny - sp.y, nx - sp.x); sp.phase += Math.hypot(nx - sp.x, ny - sp.y) * .32; sp.x = nx; sp.y = ny;
      if (c.left <= 0) { sp.mode = "rest"; sp.t = .6; }
    }
    else if (sp.mode === "drop") {
      const th = sp.thread, v = 55 * dt * th.dir; sp.y += v; sp.x = th.x; sp.phase += Math.abs(v) * .1;
      if (th.dir > 0 && sp.y >= th.top + th.down) { th.dir = 0; th.wait = r(1, 2.4); }
      if (th.dir === 0 && (th.wait -= dt) <= 0) th.dir = -1;
      if (th.dir < 0 && sp.y <= th.top) { sp.y = th.top; sp.thread = null; sp.mode = "rest"; sp.t = r(.5, 2); }
    }
    sp.x = Math.max(8, Math.min(W - 8, sp.x)); sp.y = Math.max(8, Math.min(H - 8, sp.y));
    if (sp.speed > 5 && sp.mode !== "drop") { trail.push({ x: sp.x - Math.cos(sp.a) * 12, y: sp.y - Math.sin(sp.a) * 12, life: 1 }); if (trail.length > 90) trail.shift(); }
    for (const w of webs) if (w.leaving) w.fade -= dt / 6;
    while (webs.length && webs[0].fade <= 0) webs.shift();
    for (const p of trail) p.life -= dt * .35;
    while (trail.length && trail[0].life <= 0) trail.shift();
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // a fading line of silk behind it
    ctx.lineWidth = .8; ctx.strokeStyle = col.silk; ctx.lineCap = "round";
    for (let i = 1; i < trail.length; i++) { const a = trail[i - 1], b = trail[i]; if (Math.hypot(a.x - b.x, a.y - b.y) > 30) continue; ctx.globalAlpha = Math.max(0, b.life) * .5; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // its webs: the spokes reach out first, then the capture spiral is laid
    for (const w of webs) {
      const g = w.grow, spokes = Math.min(1, g / .35), spiral = Math.max(0, (g - .35) / .65);
      ctx.globalAlpha = .55 * w.fade; ctx.lineWidth = .7;
      ctx.beginPath();
      w.ang.forEach((a, i) => { ctx.moveTo(w.x, w.y); ctx.lineTo(w.x + Math.cos(a) * w.len[i] * spokes, w.y + Math.sin(a) * w.len[i] * spokes); });
      const rings = 7, shown = Math.floor(spiral * rings * w.ang.length);
      let c = 0;
      for (let k = rings; k >= 1 && c < shown; k--) {
        const f = .18 + (k / rings) * .8;
        for (let i = 0; i < w.ang.length && c < shown; i++, c++) {
          const a0 = w.ang[i], a1 = w.ang[(i + 1) % w.ang.length], l0 = w.len[i] * f, l1 = w.len[(i + 1) % w.ang.length] * f;
          const x0 = w.x + Math.cos(a0) * l0, y0 = w.y + Math.sin(a0) * l0, x1 = w.x + Math.cos(a1) * l1, y1 = w.y + Math.sin(a1) * l1;
          ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + (w.x - (x0 + x1) / 2) * .12, (y0 + y1) / 2 + (w.y - (y0 + y1) / 2) * .12, x1, y1);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (sp.thread) { ctx.globalAlpha = .7; ctx.beginPath(); ctx.moveTo(sp.thread.x, sp.thread.top - 8); ctx.lineTo(sp.x, sp.y); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(sp.a); ctx.scale(.62, .62);
    ctx.strokeStyle = col.body; ctx.lineWidth = 2; ctx.lineJoin = "round";
    // eight long legs, four a side, moving in two alternating sets (the orb weaver's front legs are the longest)
    const rest = [.5, 1.1, 1.9, 2.5], L = [27, 22, 19, 23];
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const set = (i + (side > 0 ? 0 : 1)) % 2, swing = Math.sin(sp.phase + set * Math.PI) * .22;
      const ax = 5 - i * 2.4, ay = side * 3, th = rest[i] - swing * (i < 2 ? 1 : -1);
      const fx = ax + Math.cos(th) * L[i], fy = ay + side * Math.sin(th) * L[i];
      const kx = ax + (fx - ax) * .42 + Math.cos(th) * 3, ky = ay + (fy - ay) * .42 + side * 8;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    }
    // the orb weaver, as the app draws it: a big round abdomen with a pale saddle and spots, a small head, two bright eyes
    ctx.fillStyle = col.body;
    ctx.beginPath(); ctx.ellipse(-15, 0, 14, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2, 0, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col.eye; ctx.globalAlpha = .35;
    ctx.beginPath(); ctx.ellipse(-16, 0, 8, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = .6;
    for (const [x, y] of [[-10, -5], [-10, 5], [-19, -6], [-19, 6], [-24, 0]]) { ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(7, -1.8, 1.1, 0, Math.PI * 2); ctx.arc(7, 1.8, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  let last = 0, raf = 0;
  function frame(t) { const dt = Math.min(.05, (t - last) / 1000 || 0); last = t; try { update(dt); draw(); } catch (e) { console.error(e); } raf = requestAnimationFrame(frame); }
  function start() { if (raf || !on) return; cv.hidden = false; if (reduced) { sp.x = W - 60; sp.y = H - 70; sp.a = -Math.PI / 2; draw(); return; } last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); });
  // tap anywhere that isn't a control and it comes to look
  document.addEventListener("pointerdown", e => {
    if (!on || reduced || e.button > 0) return;
    if (e.target.closest("a,button,input,textarea,select,label,summary,[contenteditable],.post,.compose")) return;
    sp.thread = null; if (sp.web) { sp.web.leaving = true; sp.web = null; } sp.tx = e.clientX; sp.ty = e.clientY; sp.mode = "visit";
  });
  function setOn(v) {
    on = v; store.set("an-spider", v ? "on" : "off");
    if (toggle) { toggle.setAttribute("aria-pressed", String(v)); toggle.textContent = v ? "Spider: on" : "Spider: off"; }
    if (v) start(); else { stop(); cv.hidden = true; }
  }
  if (toggle) toggle.onclick = () => setOn(!on);
  setOn(on);
})();

// the phone's clip: still for people who turn motion off, and it only plays while it's on screen
(() => {
  const v = document.querySelector(".phone video"); if (!v) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { v.removeAttribute("autoplay"); v.pause(); return; }
  // if one format won't decode, try the other (the browser only falls back by itself when a file is missing)
  v.addEventListener("error", () => { if (!/.mp4$/.test(v.currentSrc)) { v.src = "assets/phone-demo.mp4"; v.play().catch(() => {}); } });
  if ("IntersectionObserver" in window) new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }).observe(v);
})();
