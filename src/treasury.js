// treasury.js — verify in-game ticket payments via the DC Treasury (economy) API
// ---------------------------------------------------------------------------
// Same API + approach as the Revolution Realty bot's verify.js, adapted for a
// Cloudflare Worker. Reads the GFC firm account's recent transactions, finds
// the ones whose memo (or message) carries the ticket's 32-char code, and sums
// abs(amount). Partial/installment payments add up.
//
// >>> THE ONLY THINGS YOU SET (as secrets / vars) <<<
//   npx wrangler secret put DC_API_TOKEN        # the Bearer JWT for the API
//   npx wrangler secret put VERIFY_ACCOUNT_ID   # the GFC firm account id that
//                                               # receives ticket payments
//   (optional)  DC_API_BASE  to override the default host below.
// ---------------------------------------------------------------------------

const DEFAULT_BASE = "https://api.democracycraft.net/economy";

function apiBase(env) {
  return env.DC_API_BASE || DEFAULT_BASE;
}

async function apiGet(env, path) {
  const jwt = env.DC_API_TOKEN;
  if (!jwt) throw new Error("DC_API_TOKEN not set");
  const res = await fetch(`${apiBase(env)}${path}`, {
    headers: { Authorization: `Bearer ${jwt}`, accept: "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `treasury HTTP ${res.status}`);
  return data;
}

// Resolve a player UUID -> current IGN (best-effort; never throws).
async function ignForUuid(env, uuid) {
  if (!uuid) return null;
  try {
    const d = await apiGet(env, `/api/v1/accounts/by-player?uuid=${encodeURIComponent(uuid)}`);
    return d.playerName ?? null;
  } catch {
    return null;
  }
}

// Fetch the firm account's recent transactions.
export async function fetchLedger(env, limit = 100) {
  const acct = env.VERIFY_ACCOUNT_ID;
  if (!acct) throw new Error("VERIFY_ACCOUNT_ID not set");
  const d = await apiGet(env, `/api/v1/accounts/${encodeURIComponent(acct)}/transactions?limit=${limit}`);
  return d.items || [];
}

// Verify a single ticket against the ledger.
// Returns { paid, paidSoFar, needed, payer }.
export async function verifyTicketPayment(env, ticket) {
  const items = await fetchLedger(env);
  const needle = String(ticket.memo).toLowerCase();
  const has = (s) => (s || "").toLowerCase().includes(needle);

  let total = 0;
  let uuid = null;
  for (const t of items) {
    if (has(t.memo) || has(t.message)) {
      const amt = Math.abs(Number(t.amount)) || 0;
      if (amt <= 0) continue;
      total += amt;
      if (!uuid && t.initiatorUuid) uuid = t.initiatorUuid;
    }
  }

  const payer = uuid ? await ignForUuid(env, uuid) : null;
  return { paid: total >= ticket.price, paidSoFar: total, needed: ticket.price, payer };
}
