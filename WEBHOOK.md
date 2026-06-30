# Payment webhook

How a premium ticket flips from **pending** to **paid** automatically.

```
buyer runs  /pay GFC <price> <memo>  in-game
        │
        ▼
your Discord bot detects that payment (memo + payer + amount)
        │  POST  https://gfc-site.iamahen-cock.workers.dev/webhook/payment
        │  header: x-gfc-secret: <WEBHOOK_SECRET>
        ▼
Worker verifies secret + memo + amount, calls markTicketPaid()
        │
        ▼
ticket = paid   (buyer sees it on /tickets/status)
```

The Worker side is **already built and deployed**. You just need to (1) set the
secret and (2) have the bot POST to it.

## 1. Set the shared secret (one time)

In the `gfc-site` folder:

```bash
npx wrangler secret put WEBHOOK_SECRET
# paste a long random string when prompted, e.g. from:  openssl rand -hex 24
```

Put that **same** string in your bot's environment (Railway → Variables) as
`GFC_WEBHOOK_SECRET`. That's the only shared piece.

## 2. Endpoint

```
POST https://gfc-site.iamahen-cock.workers.dev/webhook/payment
Headers:  x-gfc-secret: <the secret>
          content-type: application/json
Body:     { "memo": "<32-char memo>", "payer": "<mc username>", "amount": 5000 }
```

`amount` is optional — if you send it, the Worker rejects underpayments. If your
bot can't read the amount, just omit it and it'll mark paid on memo match alone.

### Responses

| Status | Body | Meaning |
|--------|------|---------|
| 200 | `{ ok:true, status:"paid", ticket_id, event, buyer }` | flipped to paid ✅ |
| 200 | `{ ok:true, status:"already_paid" }` | was already paid (safe to retry) |
| 401 | `{ ok:false, error:"unauthorized" }` | bad/missing secret |
| 402 | `{ ok:false, error:"amount too low", expected, got }` | underpaid |
| 404 | `{ ok:false, error:"no ticket for that memo" }` | memo not found |
| 409 | `{ ok:false, error:"ticket cancelled" }` | ticket was cancelled |

It's **idempotent** — calling it twice for the same memo won't double-anything,
so you can safely retry on network errors.

## 3. Bot side (discord.js / Node)

Drop this where your bot detects an in-game payment:

```js
async function confirmGfcTicket({ memo, payer, amount }) {
  const res = await fetch("https://gfc-site.iamahen-cock.workers.dev/webhook/payment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gfc-secret": process.env.GFC_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ memo, payer, amount }),
  });
  const data = await res.json();
  if (data.ok && data.status === "paid") {
    // e.g. DM the buyer / post in a channel: ticket confirmed for data.event
    console.log(`Ticket ${data.ticket_id} paid for ${data.buyer}`);
  } else if (!data.ok) {
    console.warn("Ticket webhook rejected:", data.error);
  }
  return data;
}
```

The one piece only you can fill in is **how the bot learns a `/pay` happened** —
whichever way your Revolution Realty bot reads Democracy Craft payments, reuse
that, pull the `memo` out of the payment message, and call `confirmGfcTicket`.

## Test it without a real payment

```bash
curl -X POST https://gfc-site.iamahen-cock.workers.dev/webhook/payment \
  -H "x-gfc-secret: <the secret>" \
  -H "content-type: application/json" \
  -d '{"memo":"<a real pending memo>","payer":"Steve","amount":5000}'
```

Make a pending memo first by reserving a ticket on `/tickets`, then paste that
memo into the command above — you should get `{"ok":true,"status":"paid",...}`.
