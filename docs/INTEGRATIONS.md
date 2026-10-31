# Integrations: webhooks, API keys and POS

Everything here is per business. The owner sets it up in **Dashboard → Settings → Connect other systems**.

## Events (the names)

`membership.created`, `membership.updated`, `membership.suspended`, `points.earned`, `points.redeemed`,
`points.expired`, `points.adjusted`, `points.reversed`, `reward.created`, `reward.updated`, `reward.redeemed`,
`reward.expired`, `qr.issued`, `qr.revoked`, `qr.validation_failed`, `consent.granted`, `consent.withdrawn`,
`campaign.sent`, `campaign.suppressed`, `staff.invited`, `staff.role_changed`, `tenant.suspended`,
`data_export.created` (plus `webhook.test`, sent by the "Send a test event" button).

Not yet raised as events: `wallet.*` (wallet passes are not built).

## Receiving webhooks

Each delivery is a `POST` with a JSON body:

```json
{ "id": "…event id…", "type": "points.earned", "created": "2026-11-01T10:00:00.000Z", "tenantId": "…", "data": { … } }
```

Headers:

| Header | Meaning |
|---|---|
| `X-Loyalty-Event` | the event name |
| `X-Loyalty-Event-Id` | the same as `id` in the body |
| `X-Loyalty-Signature` | `t=<unix seconds>,v1=<hex>` |

### Check the signature

`v1` is `HMAC-SHA256(secret, "<t>.<raw request body>")` in hex, using the `whsec_…` secret shown once when you added the webhook.

```js
const [, t, v1] = /t=(\d+),v1=([0-9a-f]+)/.exec(req.headers["x-loyalty-signature"]);
const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
const ok = crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
```

### Be replay-safe

1. Reject the request if `t` is more than 5 minutes from your clock.
2. Remember the `id` of every event you have handled and ignore one you have seen, because a delivery can arrive more than once.
3. Answer with any `2xx` within 8 seconds. Anything else is retried.

### Retries

If your server answers anything other than 2xx (or doesn't answer), we retry after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours,
then give up and show the delivery as "Gave up". Deliveries are not sent to private network addresses, and redirects are not followed.

### Catching up after an outage

`GET /api/v1/integrations/events?after=<last event id>` with a key that has the `events:read` scope returns the next events, oldest first
(up to 100), and a `next` value to ask from next time.

## Reporting sales from a till or POS

`POST /api/v1/integrations/earn` with `Authorization: Bearer lk_live_…` (a key with the `earn:write` scope):

```json
{ "memberNumber": "ABCD1234", "locationId": "…", "amountMinor": 2500, "tipMinor": 0, "externalRef": "RECEIPT-1001" }
```

Use `qrToken` instead of `memberNumber` to send the customer's scanned QR code.

* Points always come from the business's own earning rules; the till can't choose them.
* `externalRef` is the sale's own number. Sending the same one again returns the first result with `"duplicate": true` and does not pay twice.
* Limited to 120 requests a minute per key.

## Bulk import

See **Customers → Import customers** in the dashboard. The CSV template is versioned (`loyalty_import_v1`); a validation report shows every row
that was skipped and why before anything is imported.
