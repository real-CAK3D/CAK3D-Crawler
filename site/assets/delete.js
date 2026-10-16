// The "Delete your data" form: deletes the reports and fixes for a support ID at once, and records forum posts to remove.
(() => {
  "use strict";
  const f = document.getElementById("delForm"), msg = document.getElementById("delMsg");
  if (!f) return;
  const SB = "https://gepkziwvlczkwernhtjm.supabase.co/rest/v1/rpc/delete_my_data";
  const KEY = "sb_publishable_xMcywbR7DxLl_Ygy_yxPdQ_UbF3HOzd"; // public by design: it can only call the app's own functions
  const say = (t, bad) => { msg.textContent = t; msg.hidden = false; msg.classList.toggle("err", !!bad); };
  f.onsubmit = async e => {
    e.preventDefault();
    const sid = f.sid.value.trim().toUpperCase(), posts = f.posts.value.trim(), note = f.note.value.trim();
    if (!sid && !posts && !note) { say("Enter your support ID, your forum post links, or a note so we can find your data.", true); f.sid.focus(); return; }
    if (sid && !/^AN-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(sid)) { say("That support ID doesn't look right. It looks like AN-7K3Q-9XWD-2M4P.", true); f.sid.focus(); return; }
    const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Deleting…";
    try {
      const res = await fetch(SB, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_support_id: sid || null, p_posts: posts || (note && !sid ? "(see note)" : null), p_note: note || null }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message || "Something went wrong.");
      const parts = [];
      if (sid) parts.push(j.reports_deleted ? `Deleted ${j.reports_deleted} report${j.reports_deleted === 1 ? "" : "s"} and any fixes for ${sid}.` : `There were no reports or fixes stored for ${sid}, so there was nothing to delete.`);
      if (j.posts_pending) parts.push("Your request is recorded, and the forum posts or details you listed will be removed within 30 days.");
      say(parts.join(" ")); f.reset();
    } catch (err) { say(`Couldn't send that: ${err.message} Please try again.`, true); }
    btn.disabled = false; btn.textContent = "Delete my data";
  };
})();
