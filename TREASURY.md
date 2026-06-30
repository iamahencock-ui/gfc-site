# Taking payment on the site (treasury verification)

Premium tickets are verified **by the website itself** — no Discord bot in the
loop. Same DC Treasury API your Revolution Realty bot uses: read the GFC firm
account's transactions, match payments by their 32-char memo, mark the ticket
paid when the total covers the price. Partial payments add up.

## Flow

```
buyer reserves a ticket on /tickets   ->  gets:  /pay <GFC account> <price> <memo>
buyer pays in-game
buyer clicks "I've paid — verify now"  ->  GET /tickets/verify?memo=...
   Worker -> treasury.js -> GET /api/v1/accounts/<firm>/transactions
   sums abs(amount) of txns whose memo/message contains the code
   total >= price  ->  ticket PAID  ->  "you're in!"
```

## What you set (two secrets + one name)

```bash
npx wrangler secret put DC_API_TOKEN       # the Bearer JWT for api.democracycraft.net
npx wrangler secret put VERIFY_ACCOUNT_ID  # the GFC firm account id that receives ticket money
```

Then in `src/index.js`, set `PAY_TO` (top of file) to whatever players type to
pay that account in-game — that's what shows in the `/pay …` line on the ticket
page. Everything else (host, endpoints, auth, field names) is already wired to
match the real API:

- Base `https://api.democracycraft.net/economy`, `Authorization: Bearer <token>`
- Ledger `GET /api/v1/accounts/{VERIFY_ACCOUNT_ID}/transactions?limit=100`
- Matches `memo` **or** `message` (case-insensitive), sums `abs(amount)`
- Resolves payer IGN from `initiatorUuid` via `/api/v1/accounts/by-player`

Override the host with a `DC_API_BASE` var if you ever need to.

Then deploy:

```bash
npx wrangler deploy
```

## Test without spending anything

Reserve a ticket on `/tickets`, grab its memo, then:

```bash
curl "https://gfc-site.iamahen-cock.workers.dev/tickets/verify?memo=<the-memo>"
```

- Before paying:  `{"ok":true,"status":"pending","paid_so_far":0,"needed":5000}`
- After paying:    `{"ok":true,"status":"paid",...}`
- Token/account not set:  `{"ok":false,"status":"unverified","error":"DC_API_TOKEN not set"}`

## Heads-up: reuse the same credentials as the realty bot

`DC_API_TOKEN` is the same JWT your bot uses. `VERIFY_ACCOUNT_ID` should be the
GFC firm's account (not the realty firm) so ticket payments land there. If GFC
and the realty firm share an account, the memo still keeps tickets separate, but
a dedicated GFC account is cleaner.

## The webhook still works too

`POST /webhook/payment` (see WEBHOOK.md) remains if you'd rather have a bot push
confirmations. Both paths call the same idempotent `markTicketPaid`, so they
don't conflict — but with site-side verification you don't need the bot at all.
