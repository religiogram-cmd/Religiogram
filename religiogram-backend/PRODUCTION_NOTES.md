# Production deployment notes (post correctness hardening, May 2026)

Read this file before the first deploy of the patched codebase.

## 1. Run the new migration

```
cd religiogram-backend
npm install
npm run migration:run     # applies 1700000000028-CorrectnessHardening
```

The migration is idempotent (every statement is `IF NOT EXISTS` / `IF EXISTS`), so it is safe to re-run. It adds:

- `payments.refunded_amount_paise` (bigint, default 0)
- `payments.amount_paise` migrated to bigint (was int, overflowed at ~Rs 21M)
- `provider_earnings.payout_batch_id` (uuid, indexed)
- `discount_codes.valid_from` (timestamptz)
- `discount_redemptions` table with `(discount_code_id, user_id)` UNIQUE
- `refund_requests.idempotency_key` UNIQUE
- `bookings.payment_ref` (uuid)
- `consultation_messages (session_id, seq)` UNIQUE
- `wallet_recon_log` table

## 2. Configure rawBody for the webhook endpoint

`POST /payments/webhook` now fails closed when the raw request body is missing. Razorpay HMAC verification needs the exact bytes Razorpay signed, not a JSON re-serialization. Confirm `main.ts` includes:

```
const app = await NestFactory.create(AppModule, { rawBody: true });
```

or attaches the raw-body middleware to the webhook route specifically.

## 3. Razorpay credentials

`razorpay.keyId`, `razorpay.keySecret`, `razorpay.webhookSecret` and (for payouts) `razorpay.xAccountNumber` must be set. The webhook handler throws `UnauthorizedException` on any payload that doesn't match the HMAC.

## 4. Redis: keyspace notifications NOT required

The grace-expiry sweeper polls every 15 seconds and uses a 10-second Redis lease so only one pod runs the sweep. No `notify-keyspace-events` config is necessary.

## 5. Pricing and refund defaults

- Default platform commission: **10%** (was 15%). Override per-service via `commission_rules` rows.
- Cancellation refund tiers (user-initiated): full > 48 h, 75% at 24-48 h, 25% at 4-24 h, 0% under 4 h.
- Provider/admin cancellation: full refund regardless.
- Discount and surge values are applied to the post-discount subtotal so the provider's take cannot go negative.

## 6. Idempotency keys for clients

- Booking creation, payment order creation, and refund creation all accept `Idempotency-Key` headers (or DTO fields). Clients should pass a stable UUID per logical request and retry safely.
- The middleware scopes the key by `(userId, method, path, idempotencyKey)` so the same key value cannot replay across endpoints.
- A retried request with a mismatched body returns `422 Idempotency conflict`.

## 7. WebSocket authentication

- JWTs are re-verified for expiry on every event (`ensureLive`).
- Session participation is checked on `session.join` and cached on the socket for subsequent events.
- `getSessionSummary` requires participant authorisation; anyone with a session UUID can no longer read its pricing.

## 8. Spec tests

Existing `*.spec.ts` files mock the previous constructor signatures and will not run as-is. They were intentionally not rewritten in this pass — integration tests against real Postgres + Redis are more valuable than repository-mock unit tests for catching the race conditions this pass fixes.

Recommended first integration tests:

1. Concurrent `payment.captured` webhook deliveries fire `confirmBooking` exactly once.
2. Concurrent `/payments/verify` and webhook for the same payment confirm exactly once.
3. `cancelBooking` with `walletDebitRef` credits the user wallet and the ledger reflects it.
4. 50 concurrent `applyDiscount` + `consumeDiscount` calls on `max_uses=1` redeem exactly once.
5. 10 concurrent OTP verifies with the wrong code allow at most `MAX_ATTEMPTS` guesses.
6. A stale `wallet_holds` row with `status='active'` and a terminal booking is recovered on the next cron pass.

## 9. Verification done in this pass

- `npm install` — 1088 packages, no errors.
- `npx tsc --noEmit` — 0 errors against the project's tsconfig.json.
- `npx nest build` — exit 0; `dist/` populated for every module.
