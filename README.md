# GFC website — Cloudflare Worker

The full Global Fighting Championship site. Server-rendered, dynamic, reading
from your live D1 database (`gfc-db`). The Discord bot writes the data; this
site displays it and takes premium ticket reservations.

## What's in here

```
gfc-site/
  src/index.js     the whole site (routing + every page + ticket flow)
  src/db.js        the database functions (same module the bot uses)
  wrangler.toml    config — already bound to your gfc-db database
  package.json
```

Pages: `/` home · `/fighters` · `/fighter/:id` (profile + NameMC render + fight
history) · `/champions` (current belts + title lineage) · `/news` + `/news/:id`
· `/tickets` (buy premium + status lookup).

## Deploy it (5 steps)

You need [Node.js](https://nodejs.org) installed. Then, in this folder:

```bash
npm install                  # 1. gets wrangler (Cloudflare's CLI)
npx wrangler login           # 2. log into the SAME Cloudflare account that has gfc-db
npx wrangler dev             # 3. test locally -> http://localhost:8787
npx wrangler deploy          # 4. go live -> prints your https://gfc-site.<you>.workers.dev URL
```

That's it — the database is already created and bound in `wrangler.toml`, so
there's no DB setup. Step 4 gives you a public URL you can drop in the Discord.

5. (optional) Custom domain: in the Cloudflare dashboard → Workers & Pages →
   gfc-site → Settings → Domains & Routes → add your domain.

## Two things to edit before launch

In `src/index.js`, top of the file:

- `UPCOMING_EVENTS` — your real upcoming cards (name, price, date). This is what
  shows in the ticket dropdown.
- `PAY_TO` — the in-game account buyers `/pay`. Currently `"GFC"`.

Also, clear the sample fighters/news I seeded when you're ready (snippet in the
DB README), or just let the bot overwrite with real data.

## How the premium ticket flow works

1. Buyer picks an event + enters their MC name on `/tickets`.
2. Site creates a **pending** ticket and shows: `/pay GFC <price> <32-char memo>`.
3. Buyer runs that in-game. The memo is unique per ticket — that's the
   verification (Hen's 32-char memo string).
4. **The Discord bot confirms it.** When your payment-watcher sees a `/pay` with
   that memo, it calls `markTicketPaid(env.DB, memo, buyer)` from `db.js`. The
   ticket flips to **paid** and the buyer sees it on `/tickets/status`.

So the site never touches money — it just issues memos and reads status. The bot
does the actual payment matching. Same `db.js` is shared by both, so you write
those bot functions once.

## Local dev note

`wrangler dev` connects to your real remote D1 by default. To use a throwaway
local copy instead, run `npx wrangler dev --local`.
