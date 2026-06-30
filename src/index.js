// index.js — Global Fighting Championship website (Cloudflare Worker)
// ---------------------------------------------------------------------------
// Server-rendered, dynamic site reading from the D1 `gfc-db` database.
// Sections: Home, Fighters, Fighter profile, Champions, News, Tickets.
// Data is written by the Discord bot (via db.js); this site mostly reads,
// plus it creates pending premium tickets from the ticket page.
// ---------------------------------------------------------------------------

import * as db from "./db.js";

// Upcoming events shown on the ticket page. Edit this list as you book cards.
// (Kept as config so you don't need a separate events table.)
const UPCOMING_EVENTS = [
  { name: "GFC 2: Reckoning", price: 5000, date: "2026-07-12" },
  { name: "GFC 3: Bad Blood", price: 5000, date: "2026-08-09" },
];

// The in-game account buyers pay. Change to your server's GFC account name.
const PAY_TO = "GFC";

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const html = (body, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

const redirect = (location) => new Response(null, { status: 302, headers: { location } });

// ---------------------------------------------------------------------------
// layout
// ---------------------------------------------------------------------------
function layout(title, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · GFC</title>
<style>
  :root{
    --bg:#0a0a0c; --panel:#141418; --panel2:#1c1c22; --line:#2a2a32;
    --text:#e8e8ec; --muted:#9a9aa6; --red:#e11d2a; --red2:#ff3b48; --gold:#f5c518;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:"Inter",system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5}
  a{color:inherit;text-decoration:none}
  .wrap{max-width:1080px;margin:0 auto;padding:0 20px}
  header.nav{position:sticky;top:0;z-index:10;background:rgba(10,10,12,.92);
    backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
  .nav .wrap{display:flex;align-items:center;gap:22px;height:62px}
  .brand{font-weight:900;letter-spacing:1px;font-size:20px}
  .brand b{color:var(--red2)}
  .nav nav{display:flex;gap:18px;flex:1;flex-wrap:wrap}
  .nav nav a{color:var(--muted);font-weight:600;font-size:14px;text-transform:uppercase;letter-spacing:.5px}
  .nav nav a:hover{color:var(--text)}
  .btn{display:inline-block;background:var(--red);color:#fff;font-weight:700;
    padding:10px 16px;border-radius:8px;border:0;cursor:pointer;font-size:14px}
  .btn:hover{background:var(--red2)}
  .btn.ghost{background:transparent;border:1px solid var(--line);color:var(--text)}
  h1,h2,h3{margin:0 0 .4em}
  h1{font-size:34px;font-weight:900;letter-spacing:.5px}
  h2{font-size:22px;font-weight:800;margin-top:8px}
  .section{padding:34px 0}
  .muted{color:var(--muted)}
  .hero{padding:64px 0 40px;background:
    radial-gradient(900px 360px at 70% -10%,rgba(225,29,42,.25),transparent),
    linear-gradient(180deg,#101015,#0a0a0c)}
  .hero h1{font-size:48px}
  .hero p{color:var(--muted);max-width:560px;font-size:17px}
  .grid{display:grid;gap:16px}
  .g3{grid-template-columns:repeat(3,1fr)}
  .g2{grid-template-columns:repeat(2,1fr)}
  @media(max-width:820px){.g3{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:560px){.g3,.g2{grid-template-columns:1fr}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
  .card .pad{padding:16px}
  .fighter-card{text-align:center}
  .fighter-card img{width:96px;height:96px;image-rendering:pixelated;border-radius:10px;
    background:var(--panel2);margin:16px auto 8px;display:block}
  .name{font-weight:800;font-size:17px}
  .record{color:var(--gold);font-weight:700;font-size:13px;letter-spacing:.5px}
  .pill{display:inline-block;background:var(--panel2);border:1px solid var(--line);
    color:var(--muted);font-size:12px;padding:3px 9px;border-radius:999px}
  .belt{display:flex;align-items:center;gap:14px;background:var(--panel);
    border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;padding:14px 16px}
  .belt img{width:48px;height:48px;image-rendering:pixelated;border-radius:8px;background:var(--panel2)}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600;text-transform:uppercase;font-size:12px;letter-spacing:.5px}
  .win{color:#3ddc84;font-weight:700}.loss{color:var(--red2);font-weight:700}
  .profile-head{display:flex;gap:24px;align-items:center;flex-wrap:wrap}
  .profile-head img{width:140px;image-rendering:pixelated}
  .news-item{padding:18px 0;border-bottom:1px solid var(--line)}
  .news-item h3{font-size:19px}
  input,select{width:100%;background:var(--panel2);border:1px solid var(--line);color:var(--text);
    padding:11px 12px;border-radius:8px;font-size:15px;margin-top:6px}
  label{font-size:13px;color:var(--muted);font-weight:600}
  .field{margin-bottom:14px}
  .memo{font-family:ui-monospace,Menlo,Consolas,monospace;background:#000;color:var(--gold);
    padding:14px;border-radius:8px;font-size:18px;word-break:break-all;border:1px solid var(--line)}
  .note{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}
  footer{border-top:1px solid var(--line);color:var(--muted);font-size:13px;padding:28px 0;margin-top:30px}
  .empty{color:var(--muted);padding:24px;text-align:center;border:1px dashed var(--line);border-radius:10px}
</style>
</head>
<body>
<header class="nav"><div class="wrap">
  <a class="brand" href="/">G<b>F</b>C</a>
  <nav>
    <a href="/fighters">Fighters</a>
    <a href="/champions">Champions</a>
    <a href="/news">News</a>
    <a href="/tickets">Tickets</a>
  </nav>
  <a class="btn" href="/tickets">Buy Premium</a>
</div></header>
${content}
<footer><div class="wrap">
  Global Fighting Championship · Democracy Craft · Premium tickets paid in-game via /pay.
</div></footer>
</body></html>`;
}

function fighterCard(f) {
  const a = db.avatarUrls(f.mc_username);
  return `<a class="card fighter-card" href="/fighter/${f.id}">
    <img src="${esc(a.face)}" alt="${esc(f.display_name)}" loading="lazy">
    <div class="pad">
      <div class="name">${esc(f.display_name)}</div>
      <div class="muted" style="font-size:13px">@${esc(f.mc_username)}</div>
      <div class="record">${f.wins}–${f.losses}${f.division ? " · " + esc(f.division) : ""}</div>
    </div>
  </a>`;
}

// ---------------------------------------------------------------------------
// pages
// ---------------------------------------------------------------------------
async function pageHome(env) {
  const [champs, news, fighters] = await Promise.all([
    db.getCurrentChampions(env.DB),
    db.listNews(env.DB, { limit: 3 }),
    db.listFighters(env.DB, { activeOnly: true }),
  ]);
  const featured = fighters.slice(0, 6);

  const champStrip = champs.length
    ? `<div class="grid g3">${champs
        .map((c) => {
          const a = db.avatarUrls(c.mc_username);
          return `<div class="belt"><img src="${esc(a.face)}" alt=""><div>
            <div class="pill">${esc(c.title)} Champion</div>
            <div class="name">${esc(c.display_name)}</div></div></div>`;
        })
        .join("")}</div>`
    : `<div class="empty">No champions crowned yet.</div>`;

  const newsList = news.length
    ? news
        .map(
          (n) => `<div class="news-item"><h3><a href="/news/${n.id}">${esc(n.title)}</a></h3>
        <div class="muted" style="font-size:13px">${esc((n.published_at || "").slice(0, 10))}${
            n.author ? " · " + esc(n.author) : ""
          }</div>
        <p class="muted">${esc((n.body || "").slice(0, 160))}${(n.body || "").length > 160 ? "…" : ""}</p></div>`
        )
        .join("")
    : `<div class="empty">No news yet.</div>`;

  const content = `
  <section class="hero"><div class="wrap">
    <h1>GLOBAL FIGHTING<br>CHAMPIONSHIP</h1>
    <p>The premier combat league of Democracy Craft. Structured, high-stakes PvP — fighters earn money and build legacies.</p>
    <div style="margin-top:22px;display:flex;gap:12px">
      <a class="btn" href="/tickets">Buy Premium Tickets</a>
      <a class="btn ghost" href="/fighters">Meet the Fighters</a>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <h2>Reigning Champions</h2>${champStrip}
  </div></section>

  <section class="section"><div class="wrap">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2>Featured Fighters</h2><a class="muted" href="/fighters">View all →</a></div>
    <div class="grid g3" style="margin-top:8px">${featured.map(fighterCard).join("")}</div>
  </div></section>

  <section class="section"><div class="wrap">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <h2>Latest News</h2><a class="muted" href="/news">All news →</a></div>
    ${newsList}
  </div></section>`;
  return html(layout("Home", content));
}

async function pageFighters(env) {
  const fighters = await db.listFighters(env.DB);
  const content = `<section class="section"><div class="wrap">
    <h1>Fighters</h1>
    ${
      fighters.length
        ? `<div class="grid g3" style="margin-top:18px">${fighters.map(fighterCard).join("")}</div>`
        : `<div class="empty">No fighters added yet. The Discord bot writes these in.</div>`
    }
  </div></section>`;
  return html(layout("Fighters", content));
}

async function pageFighter(env, id) {
  const f = await db.getFighter(env.DB, id);
  if (!f) return html(layout("Not found", `<section class="section"><div class="wrap"><h1>Fighter not found</h1><a class="muted" href="/fighters">← Back to fighters</a></div></section>`), 404);
  const a = db.avatarUrls(f.mc_username);
  const fights = await db.listFightsByFighter(env.DB, id);

  const rows = fights.length
    ? fights
        .map((ft) => {
          const isF1 = ft.fighter1_id === f.id;
          const opp = isF1 ? ft.fighter2_name : ft.fighter1_name;
          const oppId = isF1 ? ft.fighter2_id : ft.fighter1_id;
          let result = '<span class="muted">Draw</span>';
          if (ft.winner_id) result = ft.winner_id === f.id ? '<span class="win">WIN</span>' : '<span class="loss">LOSS</span>';
          return `<tr>
            <td>${esc((ft.fight_date || "").slice(0, 10) || "—")}</td>
            <td>${esc(ft.event || "—")}</td>
            <td><a href="/fighter/${oppId}">${esc(opp)}</a></td>
            <td>${result}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="muted">No recorded fights yet.</td></tr>`;

  const content = `<section class="section"><div class="wrap">
    <a class="muted" href="/fighters">← Fighters</a>
    <div class="profile-head" style="margin:16px 0 8px">
      <img src="${esc(a.body)}" alt="${esc(f.display_name)}">
      <div>
        <h1 style="margin-bottom:4px">${esc(f.display_name)}</h1>
        <div class="muted">@${esc(f.mc_username)} · <a href="${esc(a.namemc)}" target="_blank" rel="noopener">NameMC</a></div>
        <div class="record" style="font-size:18px;margin-top:8px">${f.wins} WINS · ${f.losses} LOSSES</div>
        ${f.division ? `<span class="pill" style="margin-top:8px;display:inline-block">${esc(f.division)}</span>` : ""}
      </div>
    </div>
    ${f.description ? `<p style="max-width:640px">${esc(f.description)}</p>` : ""}
    <h2 style="margin-top:26px">Fight History</h2>
    <div class="card"><table>
      <thead><tr><th>Date</th><th>Event</th><th>Opponent</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div></section>`;
  return html(layout(f.display_name, content));
}

async function pageChampions(env) {
  const [current, all] = await Promise.all([
    db.getCurrentChampions(env.DB),
    db.getAllChampionHistory(env.DB),
  ]);

  const currentBlock = current.length
    ? `<div class="grid g2">${current
        .map((c) => {
          const a = db.avatarUrls(c.mc_username);
          return `<div class="belt"><img src="${esc(a.face)}" alt="">
            <div><div class="pill">${esc(c.title)}</div>
            <div class="name"><a href="javascript:void(0)">${esc(c.display_name)}</a></div>
            <div class="muted" style="font-size:12px">Since ${esc((c.won_date || "").slice(0, 10))}</div></div></div>`;
        })
        .join("")}</div>`
    : `<div class="empty">No reigning champions yet.</div>`;

  // group history by title
  const byTitle = {};
  for (const c of all) (byTitle[c.title] ||= []).push(c);
  const historyBlock = Object.keys(byTitle).length
    ? Object.entries(byTitle)
        .map(
          ([title, list]) => `<h3 style="margin-top:22px">${esc(title)}</h3>
        <div class="card"><table><thead><tr><th>Champion</th><th>Won</th><th>Lost</th></tr></thead><tbody>
        ${list
          .map(
            (c) => `<tr><td>${esc(c.display_name)}</td>
            <td>${esc((c.won_date || "").slice(0, 10) || "—")}</td>
            <td>${c.lost_date ? esc(c.lost_date.slice(0, 10)) : '<span class="win">current</span>'}</td></tr>`
          )
          .join("")}
        </tbody></table></div>`
        )
        .join("")
    : "";

  const content = `<section class="section"><div class="wrap">
    <h1>Champions</h1>
    <h2 style="margin-top:16px">Current Belts</h2>${currentBlock}
    ${historyBlock ? `<h2 style="margin-top:34px">Title History</h2>${historyBlock}` : ""}
  </div></section>`;
  return html(layout("Champions", content));
}

async function pageNewsList(env) {
  const news = await db.listNews(env.DB, { limit: 50 });
  const content = `<section class="section"><div class="wrap">
    <h1>News</h1>
    ${
      news.length
        ? news
            .map(
              (n) => `<div class="news-item"><h3><a href="/news/${n.id}">${esc(n.title)}</a></h3>
        <div class="muted" style="font-size:13px">${esc((n.published_at || "").slice(0, 10))}${
                n.author ? " · " + esc(n.author) : ""
              }</div>
        <p class="muted">${esc((n.body || "").slice(0, 200))}${(n.body || "").length > 200 ? "…" : ""}</p></div>`
            )
            .join("")
        : `<div class="empty">No news yet.</div>`
    }
  </div></section>`;
  return html(layout("News", content));
}

async function pageNewsItem(env, id) {
  const n = await db.getNews(env.DB, id);
  if (!n) return html(layout("Not found", `<section class="section"><div class="wrap"><h1>Article not found</h1><a class="muted" href="/news">← News</a></div></section>`), 404);
  const content = `<section class="section"><div class="wrap" style="max-width:720px">
    <a class="muted" href="/news">← News</a>
    <h1 style="margin-top:14px">${esc(n.title)}</h1>
    <div class="muted">${esc((n.published_at || "").slice(0, 10))}${n.author ? " · " + esc(n.author) : ""}</div>
    <div style="margin-top:18px;white-space:pre-wrap">${esc(n.body)}</div>
  </div></section>`;
  return html(layout(n.title, content));
}

function pageTickets(message = "") {
  const options = UPCOMING_EVENTS.map(
    (e, i) => `<option value="${i}">${esc(e.name)} — ${e.price} · ${esc(e.date)}</option>`
  ).join("");
  const content = `<section class="section"><div class="wrap" style="max-width:640px">
    <h1>Premium Tickets</h1>
    <p class="muted">Premium seating, bought in advance. Regular seating is handled at the door.
    Pay in-game with <b>/pay</b> using the memo we generate — that's how we verify your purchase.</p>
    ${message}
    <div class="note" style="margin-top:18px">
      <form method="POST" action="/tickets/buy">
        <div class="field"><label>Event</label><select name="event" required>${options}</select></div>
        <div class="field"><label>Your Minecraft username</label>
          <input name="mc" placeholder="e.g. Steve" required maxlength="32"></div>
        <button class="btn" type="submit">Reserve Premium Ticket</button>
      </form>
    </div>
    <div class="note" style="margin-top:16px">
      <label>Already have a memo? Check your ticket status</label>
      <form method="GET" action="/tickets/status" style="display:flex;gap:10px;margin-top:8px">
        <input name="memo" placeholder="32-character memo" maxlength="32">
        <button class="btn ghost" type="submit">Check</button>
      </form>
    </div>
  </div></section>`;
  return html(layout("Tickets", content));
}

async function ticketBuy(env, request) {
  const form = await request.formData();
  const idx = parseInt(form.get("event"), 10);
  const mc = (form.get("mc") || "").trim();
  const ev = UPCOMING_EVENTS[idx];
  if (!ev || !mc) return pageTickets(`<div class="empty">Please pick an event and enter your username.</div>`);

  const t = await db.createTicket(env.DB, { eventName: ev.name, price: ev.price, buyerMcUsername: mc });
  const content = `<section class="section"><div class="wrap" style="max-width:640px">
    <h1>Almost there</h1>
    <p>Ticket reserved for <b>${esc(ev.name)}</b> — status <span class="pill">pending</span>.
    To confirm, run this in-game:</p>
    <div class="memo">/pay ${esc(PAY_TO)} ${ev.price} ${esc(t.memo)}</div>
    <p class="muted" style="margin-top:14px">The 32-character code is your unique memo. Include it exactly.
    Once the payment lands, your ticket is automatically marked <b>paid</b>.</p>
    <div style="display:flex;gap:10px;margin-top:18px">
      <a class="btn" href="/tickets/status?memo=${esc(t.memo)}">Check Status</a>
      <a class="btn ghost" href="/tickets">Back to Tickets</a>
    </div>
  </div></section>`;
  return html(layout("Confirm payment", content));
}

async function ticketStatus(env, memo) {
  memo = (memo || "").trim();
  let inner;
  if (!memo) {
    inner = `<div class="empty">Enter your memo to look up a ticket.</div>`;
  } else {
    const t = await db.getTicketByMemo(env.DB, memo);
    if (!t) inner = `<div class="empty">No ticket found for that memo.</div>`;
    else {
      const cls = t.status === "paid" ? "win" : t.status === "cancelled" ? "loss" : "";
      inner = `<div class="note">
        <div class="name">${esc(t.event_name)}</div>
        <div class="muted">${esc(t.tier)} · ${t.price}</div>
        <p>Status: <b class="${cls}">${esc(t.status.toUpperCase())}</b></p>
        ${t.status === "pending" ? `<div class="memo" style="font-size:15px">/pay ${esc(PAY_TO)} ${t.price} ${esc(t.memo)}</div>` : ""}
        ${t.paid_at ? `<div class="muted" style="margin-top:8px">Paid ${esc(t.paid_at)}</div>` : ""}
      </div>`;
    }
  }
  const content = `<section class="section"><div class="wrap" style="max-width:640px">
    <a class="muted" href="/tickets">← Tickets</a>
    <h1 style="margin-top:12px">Ticket Status</h1>${inner}
  </div></section>`;
  return html(layout("Ticket status", content));
}

// ---------------------------------------------------------------------------
// router
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "POST" && path === "/tickets/buy") return await ticketBuy(env, request);

      if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

      if (path === "/") return await pageHome(env);
      if (path === "/fighters") return await pageFighters(env);
      if (path === "/champions") return await pageChampions(env);
      if (path === "/news") return await pageNewsList(env);
      if (path === "/tickets") return pageTickets();
      if (path === "/tickets/status") return await ticketStatus(env, url.searchParams.get("memo"));

      let m;
      if ((m = path.match(/^\/fighter\/(\d+)$/))) return await pageFighter(env, parseInt(m[1], 10));
      if ((m = path.match(/^\/news\/(\d+)$/))) return await pageNewsItem(env, parseInt(m[1], 10));

      return html(layout("Not found", `<section class="section"><div class="wrap"><h1>404</h1><p class="muted">Page not found.</p><a class="btn ghost" href="/">Home</a></div></section>`), 404);
    } catch (err) {
      return html(layout("Error", `<section class="section"><div class="wrap"><h1>Something broke</h1><p class="muted">${esc(err.message)}</p></div></section>`), 500);
    }
  },
};
