// db.js — Global Fighting Championship database layer
// ---------------------------------------------------------------------------
// Basic functions over the Cloudflare D1 `gfc-db` database.
// The Worker (this site) and the Discord bot both call these.
// Every function takes the D1 binding (env.DB) as its first arg.
// All writes use prepared statements (.bind) — no SQL injection.
// ---------------------------------------------------------------------------

// ----- avatar helper -------------------------------------------------------
// We don't store images. Store the Minecraft username, build the avatar URL.
export function avatarUrls(mcUsername) {
  const u = encodeURIComponent(mcUsername);
  return {
    face: `https://mc-heads.net/avatar/${u}/128`,
    body: `https://mc-heads.net/body/${u}`,
    bust: `https://mc-heads.net/head/${u}`,
    namemc: `https://namemc.com/profile/${u}`,
  };
}

// ----- 32-char memo for /pay verification ----------------------------------
export function generateMemo() {
  const bytes = new Uint8Array(16); // 16 bytes -> 32 hex chars
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// =========================== FIGHTERS ======================================
export async function addFighter(db, { mcUsername, displayName, description = null, division = null }) {
  const r = await db
    .prepare(`INSERT INTO fighters (mc_username, display_name, description, division) VALUES (?, ?, ?, ?)`)
    .bind(mcUsername, displayName, description, division)
    .run();
  return r.meta.last_row_id;
}

export async function updateFighter(db, id, fields = {}) {
  const allowed = ["mc_username", "display_name", "description", "division", "wins", "losses", "active"];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (keys.length === 0) return false;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  await db.prepare(`UPDATE fighters SET ${setClause} WHERE id = ?`).bind(...values, id).run();
  return true;
}

export async function getFighter(db, id) {
  return await db.prepare(`SELECT * FROM fighters WHERE id = ?`).bind(id).first();
}

export async function getFighterByUsername(db, mcUsername) {
  return await db.prepare(`SELECT * FROM fighters WHERE mc_username = ?`).bind(mcUsername).first();
}

export async function listFighters(db, { activeOnly = false } = {}) {
  const sql = activeOnly
    ? `SELECT * FROM fighters WHERE active = 1 ORDER BY display_name`
    : `SELECT * FROM fighters ORDER BY display_name`;
  const { results } = await db.prepare(sql).all();
  return results;
}

export async function deleteFighter(db, id) {
  await db.prepare(`DELETE FROM fighters WHERE id = ?`).bind(id).run();
}

// =========================== FIGHTS ========================================
export async function addFight(db, { fighter1Id, fighter2Id, winnerId = null, event = null, fightDate = null, notes = null }) {
  const r = await db
    .prepare(`INSERT INTO fights (fighter1_id, fighter2_id, winner_id, event, fight_date, notes) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(fighter1Id, fighter2Id, winnerId, event, fightDate, notes)
    .run();
  if (winnerId) {
    const loserId = winnerId === fighter1Id ? fighter2Id : fighter1Id;
    await db.prepare(`UPDATE fighters SET wins = wins + 1 WHERE id = ?`).bind(winnerId).run();
    await db.prepare(`UPDATE fighters SET losses = losses + 1 WHERE id = ?`).bind(loserId).run();
  }
  return r.meta.last_row_id;
}

export async function listFightsByFighter(db, fighterId) {
  const { results } = await db
    .prepare(
      `SELECT f.*, a.display_name AS fighter1_name, b.display_name AS fighter2_name, w.display_name AS winner_name
       FROM fights f
       JOIN fighters a ON a.id = f.fighter1_id
       JOIN fighters b ON b.id = f.fighter2_id
       LEFT JOIN fighters w ON w.id = f.winner_id
       WHERE f.fighter1_id = ? OR f.fighter2_id = ?
       ORDER BY f.fight_date DESC, f.id DESC`
    )
    .bind(fighterId, fighterId)
    .all();
  return results;
}

export async function listFights(db, { limit = 50 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT f.*, a.display_name AS fighter1_name, b.display_name AS fighter2_name, w.display_name AS winner_name
       FROM fights f
       JOIN fighters a ON a.id = f.fighter1_id
       JOIN fighters b ON b.id = f.fighter2_id
       LEFT JOIN fighters w ON w.id = f.winner_id
       ORDER BY f.fight_date DESC, f.id DESC
       LIMIT ?`
    )
    .bind(limit)
    .all();
  return results;
}

// =========================== CHAMPIONS =====================================
export async function setChampion(db, { fighterId, title, wonDate = null, endPrevious = true }) {
  const won = wonDate || new Date().toISOString().slice(0, 10);
  if (endPrevious) {
    await db.prepare(`UPDATE champions SET lost_date = ? WHERE title = ? AND lost_date IS NULL`).bind(won, title).run();
  }
  const r = await db.prepare(`INSERT INTO champions (fighter_id, title, won_date) VALUES (?, ?, ?)`).bind(fighterId, title, won).run();
  return r.meta.last_row_id;
}

export async function getCurrentChampions(db) {
  const { results } = await db
    .prepare(
      `SELECT c.*, f.display_name, f.mc_username FROM champions c
       JOIN fighters f ON f.id = c.fighter_id
       WHERE c.lost_date IS NULL ORDER BY c.title`
    )
    .all();
  return results;
}

export async function getChampionHistory(db, title) {
  const { results } = await db
    .prepare(
      `SELECT c.*, f.display_name, f.mc_username FROM champions c
       JOIN fighters f ON f.id = c.fighter_id
       WHERE c.title = ? ORDER BY c.won_date DESC, c.id DESC`
    )
    .bind(title)
    .all();
  return results;
}

// All titles + their full lineage (used by the champions page).
export async function getAllChampionHistory(db) {
  const { results } = await db
    .prepare(
      `SELECT c.*, f.display_name, f.mc_username FROM champions c
       JOIN fighters f ON f.id = c.fighter_id
       ORDER BY c.title, c.won_date DESC, c.id DESC`
    )
    .all();
  return results;
}

// =========================== NEWS ==========================================
export async function addNews(db, { title, body, author = null, publishedAt = null }) {
  const r = await db
    .prepare(`INSERT INTO news (title, body, author, published_at) VALUES (?, ?, ?, COALESCE(?, datetime('now')))`)
    .bind(title, body, author, publishedAt)
    .run();
  return r.meta.last_row_id;
}

export async function listNews(db, { limit = 20 } = {}) {
  const { results } = await db.prepare(`SELECT * FROM news ORDER BY published_at DESC, id DESC LIMIT ?`).bind(limit).all();
  return results;
}

export async function getNews(db, id) {
  return await db.prepare(`SELECT * FROM news WHERE id = ?`).bind(id).first();
}

export async function deleteNews(db, id) {
  await db.prepare(`DELETE FROM news WHERE id = ?`).bind(id).run();
}

// =========================== TICKETS =======================================
export async function createTicket(db, { eventName, price, tier = "premium", buyerMcUsername = null }) {
  const memo = generateMemo();
  const r = await db
    .prepare(`INSERT INTO tickets (event_name, tier, price, memo, buyer_mc_username) VALUES (?, ?, ?, ?, ?)`)
    .bind(eventName, tier, price, memo, buyerMcUsername)
    .run();
  return { id: r.meta.last_row_id, memo, eventName, tier, price, status: "pending" };
}

export async function getTicketByMemo(db, memo) {
  return await db.prepare(`SELECT * FROM tickets WHERE memo = ?`).bind(memo).first();
}

export async function markTicketPaid(db, memo, buyerMcUsername = null) {
  const r = await db
    .prepare(
      `UPDATE tickets SET status = 'paid', paid_at = datetime('now'),
       buyer_mc_username = COALESCE(?, buyer_mc_username)
       WHERE memo = ? AND status = 'pending'`
    )
    .bind(buyerMcUsername, memo)
    .run();
  return r.meta.changes > 0;
}

export async function listTickets(db, { status = null, eventName = null } = {}) {
  let sql = `SELECT * FROM tickets`;
  const conds = [];
  const params = [];
  if (status) { conds.push(`status = ?`); params.push(status); }
  if (eventName) { conds.push(`event_name = ?`); params.push(eventName); }
  if (conds.length) sql += ` WHERE ` + conds.join(" AND ");
  sql += ` ORDER BY created_at DESC`;
  const { results } = await db.prepare(sql).bind(...params).all();
  return results;
}

export async function cancelTicket(db, memo) {
  await db.prepare(`UPDATE tickets SET status = 'cancelled' WHERE memo = ?`).bind(memo).run();
}
