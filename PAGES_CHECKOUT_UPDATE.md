# GitHub Pages checkout update — 2026-10-22

Target repository: aslani99/FileOrganizerPro-Pi (not the desktop repository).
The existing .github/workflows/static.yml publishes ./web at the domain root.
Checkout URL: https://fileorganizerpro.mohammadaslanidev.ir/checkout.html

Changes:
- web/config.js now uses the current Supabase project mjkjmwgjtnuvnedvtgqo and its public publishable key already used by AdminDashboard. No privileged credentials are added.
- checkout.html loads config.js and checkout.js; no separate stale project configuration or payment-token debug panel.
- Root links containing ?token= redirect to checkout.html on the same site. New links should use /checkout.html directly.
- Completion, pending activation, confirmed/unconfirmed cancellation and incomplete-payment recovery match the payment lifecycle backend. Linked sessions cannot create a second payment.
- Obsolete GitHub rate schedule targeting the retired Supabase project is disabled. The working cron-job.org schedule remains the owner of current rate refresh. Manual invocation of the old workflow only displays a notice.
- Pi.init sandbox:false is for direct Pi Browser use. Testnet is selected by the registered Pi app/network and checked by the backend. Keep Supabase PI_SANDBOX=true and the Testnet application's PI_SERVER_API_KEY. The similarly named frontend setting controls desktop Sandbox embedding, not the backend network gate.

Install from a Git clone of FileOrganizerPro-Pi on main, matching the uploaded ZIP:

```bash
git apply --check --ignore-whitespace FileOrganizerPro-Pi-pages-2026-10-22.patch
git apply --ignore-whitespace FileOrganizerPro-Pi-pages-2026-10-22.patch
git diff --check
node --check web/checkout.js
node --check web/config.js
git add web/config.js web/checkout.html web/checkout.js web/index.html .github/workflows/refresh-pi-rate.yml PAGES_CHECKOUT_UPDATE.md
git commit -m "Align hosted Pi checkout with current payment backend"
git push origin main
```

Stop on an error; never force-apply or force-push. If the clone differs from the supplied ZIP, send the apply-check output.

In GitHub Settings > Pages, keep the existing custom domain and use GitHub Actions as the source for the provided workflow. Wait for Actions > Deploy static content to Pages to succeed. Keep the existing Cloudflare CNAME unchanged.

In Supabase Edge Functions > Secrets, set APP_PUBLIC_CHECKOUT_URL to the checkout URL above. No SQL migration or Edge Function redeploy is included in this patch. The previously supplied payment lifecycle migration/functions must already be deployed.

In Pi Developer Portal, use the Testnet application whose API key is on the server. Your App's URL remains https://fileorganizerpro.mohammadaslanidev.ir/ . Do not switch it to localhost for this phone test.

First open /checkout.html without a token: Checkout version: 2026-10-22 and a missing-link message confirm the new static page loaded (not that payment works). Then generate a fresh link/QR from the desktop app. Open the complete link including ?token=... inside Pi Browser on the phone. A real pending session should show its plan and amount. Complete a Test-Pi payment and verify status=completed, subscription_synced=true and the desktop subscription. Never share full token links, API keys, wallet phrases or access tokens.

Local verification: six Chromium tests with mocked Pi/Supabase: correct backend+amount+Pi Browser mode; root redirect; cancellation success/failure; pending activation; incomplete callback before authentication resolves; linked-session duplicate prevention. Actual GitHub deployment and real Testnet payment remain pending.

References:
https://github.com/pi-apps/pi-platform-docs/blob/master/SDK_reference.md
https://github.com/pi-apps/pi-platform-docs/blob/master/developer_portal.md
