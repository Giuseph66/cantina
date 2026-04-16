# Payment Security Improvements

## Priority 0

1. Prevent duplicate card charges.
   Reuse or block a pending card payment for the same order and stop creating multiple gateway charges for concurrent requests.

2. Lock payment initiation per order.
   Add a short-lived server-side lock so only one PIX or card initiation can run for the same order at a time.

3. Remove shared webhook secrets from callback URLs.
   Stop embedding secrets in query strings and rely on server-side validation for inbound webhooks.

## Priority 1

4. Require AbacatePay signature validation in production.

5. Harden Mercado Pago webhook validation beyond a shared secret.

6. Store and reject duplicate webhook events.

7. Enforce valid payment status transitions.

## Priority 2

8. Remove unused payer identity fields from payment DTOs where the backend already trusts the authenticated user.
   Status: completed on 2026-04-01.

9. Tighten CPF and phone ownership rules after the first approved payment.
   Status: completed on 2026-04-01.

10. Expand payment audit logging for attempts, approvals, refunds, and chargebacks.
    Status: completed on 2026-04-01.

11. Add operational alerts for duplicated approvals, mismatched amounts, invalid webhooks, and abnormal retry patterns.
    Status: completed on 2026-04-01.

## Priority 3

12. Add CSRF protection to authenticated payment and order creation endpoints.
    Status: completed on 2026-04-01.

13. Add a backend reconciliation job so payment state does not depend on the client polling.
    Status: completed on 2026-04-01.

14. Track payment attempt metadata such as attempt keys, gateway request IDs, and verified webhook timestamps.
    Status: completed on 2026-04-01.
