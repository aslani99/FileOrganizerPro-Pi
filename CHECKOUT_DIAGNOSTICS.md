# Checkout authentication diagnosis — 2026-10-22

Based on PI_PAYMENT_INTEGRATION_GUIDE.md sections 9–10. A stall at Connecting to Pi occurs while awaiting Pi.authenticate; its live cause is not yet established.

This patch restores an on-page stage trace without capturing raw SDK objects, URLs, tokens, API keys or transaction IDs. After 15 seconds it reports an outstanding authentication request without cancelling it, retrying it, or creating a second request. Late authentication still proceeds normally. The complete payment flow has no new timeout.

Deploy web/checkout.html and web/checkout.js through the existing Pages workflow. Look for Checkout version: 2026-10-22-diag1. Repeat with a valid checkout link in Pi Browser and report the Payment diagnostics lines after 15 seconds. Do not include the token-bearing address bar.

- AUTHENTICATE_PROMISE_RETURNED then AUTHENTICATE_STILL_PENDING_15S: SDK returned a promise but has neither resolved nor rejected it; inspect the Pi permission window/app association.
- AUTHENTICATE_REJECTED: authentication explicitly failed; inspect the visible error locally, removing secrets before sharing.
- INCOMPLETE_PAYMENT_CALLBACK / RECOVERY_STARTED: an earlier payment was found and server recovery began.
- INCOMPLETE_WITHOUT_TRANSACTION: prior payment has no transaction ID; no new payment is created.
- AUTHENTICATE_RESOLVED / AUTH_TOKEN_PRESENT / CREATE_PAYMENT_CALLED: authentication succeeded and the next stage began.

Do not change the Testnet network, server key, or sandbox settings solely because authentication is pending. This is a diagnostic improvement, not proof of the root cause or of a successful real payment.

Local QA: seven browser tests, including a pending authentication promise, 15-second notice, no sensitive values in trace, and successful late resolution. Actual Pi Browser verification remains pending.
