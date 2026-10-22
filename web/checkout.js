(() => {
  'use strict';
  const cfg = window.FOP_CONFIG;
  const token = new URLSearchParams(location.search).get('token');
  const status = document.getElementById('status'), details = document.getElementById('details'), button = document.getElementById('payButton');
  const diagnosticRows = [];
  function trace(code) {
    // Only call with predefined stage codes; never log SDK payloads, tokens or raw errors.
    diagnosticRows.push(new Date().toISOString().slice(11,19) + ' ' + code);
    const panel = document.getElementById('payment-diagnostics');
    if (panel) panel.textContent = diagnosticRows.slice(-35).join('\n');
  }
  window.addEventListener('error', () => trace('BROWSER_SCRIPT_ERROR'));
  window.addEventListener('unhandledrejection', () => trace('UNHANDLED_ASYNC_ERROR'));
  trace('CHECKOUT_DIAG_2');
  trace(cfg?.PI_SANDBOX === true ? 'SDK_MODE_DESKTOP_SANDBOX' : 'SDK_MODE_PI_BROWSER');
  let busy = false, terminal = false, session, accessToken, recoveryPromise, incompleteSeen = false;
  const show = (text, error = false) => { status.textContent = text; status.className = error ? 'error' : ''; };
  async function request(name, body) {
    trace('API_REQUEST_' + name.split('?')[0]);
    const response = await fetch(cfg.SUPABASE_URL + '/functions/v1/' + name, {
      method: body ? 'POST' : 'GET', headers: {apikey: cfg.SUPABASE_ANON_KEY, ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(25000), cache:'no-store'
    });
    const data = await response.json().catch(() => ({}));
    trace(response.ok ? 'API_RESPONSE_OK' : 'API_RESPONSE_FAILED');
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function loadSession() {
    const data = await request('payment-session-status?token=' + encodeURIComponent(token));
    if (!['pending','approved','completed','cancelled','error'].includes(data.status)) throw new Error('Invalid session response.');
    return data;
  }
  function finish(data) {
    trace(data.subscriptionPendingSync ? 'PAYMENT_SYNC_PENDING' : 'PAYMENT_COMPLETED');
    terminal = true; button.disabled = true; button.classList.add('hidden');
    show(data.subscriptionPendingSync ? 'Payment received. Subscription activation is pending; return to the app to check its status.' : 'Payment completed. You can return to FileOrganizerPro.');
  }
  function recover(payment) {
    trace('INCOMPLETE_PAYMENT_CALLBACK');
    // A payment identifier is not a session capability or credential. Display only this allowlisted field.
    const callbackId = payment?.identifier;
    trace(typeof callbackId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(callbackId) ? 'INCOMPLETE_PAYMENT_ID: ' + callbackId : 'INVALID_CALLBACK_PAYMENT_ID');
    trace(payment?.transaction?.txid ? 'CALLBACK_HAS_TRANSACTION' : 'CALLBACK_NO_TRANSACTION');
    incompleteSeen = true;
    if (recoveryPromise) return recoveryPromise;
    if (!payment?.identifier || !payment.transaction?.txid) {
      trace('INCOMPLETE_WITHOUT_TRANSACTION');
      terminal = true; button.disabled = true;
      show('A previous payment is unfinished. Check its status in Pi Wallet before starting another payment.', true);
      return Promise.resolve();
    }
    // The backend verifies the transaction and uses its metadata to recover the original session.
    // This can run before Pi.authenticate resolves; no browser-supplied identity is trusted.
    trace('RECOVERY_STARTED');
    show('Recovering an earlier payment…');
    recoveryPromise = request('pi-complete', {paymentId:payment.identifier, txId:payment.transaction.txid, ...(accessToken?{accessToken}:{})})
      .then(finish).catch(error => { trace('RECOVERY_FAILED'); terminal = true; button.disabled = true; show('Recovery pending: ' + error.message + '. Reopen this link to retry.', true); });
    return recoveryPromise;
  }
  async function callback(name, body, success) {
    try { const result = await request(name, body); success?.(result); return result; }
    catch (error) { show('Payment needs attention: ' + error.message + '. Keep this page open for retry.', true); throw error; }
  }
  button.addEventListener('click', async () => {
    if (busy || terminal) return;
    busy = true; button.disabled = true;
    try {
      session = await loadSession();
      if (session.status === 'completed') { finish(session); return; }
      if (!['pending','approved'].includes(session.status)) { terminal = true; throw new Error('This link is closed. Create a new checkout in the desktop app.'); }
      if (!window.Pi) throw new Error('Open this link in Pi Browser.');
      trace('SDK_INIT_STARTED');
      await Pi.init({version:'2.0', sandbox:cfg.PI_SANDBOX === true});
      trace('SDK_INIT_RESOLVED');
      show('Connecting to Pi…');
      trace('AUTHENTICATE_CALLED');
      // A slow wallet interaction must not be cancelled or followed by a second auth call.
      const waitingNotice = setTimeout(() => {
        if (!incompleteSeen && !terminal) {
          trace('AUTHENTICATE_STILL_PENDING_15S');
          show('Pi authentication has not responded yet. Check the Pi permission window. See diagnostics below; no new payment has been created.', true);
        }
      }, 15000);
      let auth;
      try {
        const result = Pi.authenticate(['username','payments'], recover);
        trace(result && typeof result.then === 'function' ? 'AUTHENTICATE_PROMISE_RETURNED' : 'AUTHENTICATE_NO_PROMISE');
        auth = await result;
        trace('AUTHENTICATE_RESOLVED');
      } catch(error) { trace('AUTHENTICATE_REJECTED'); throw error; }
      finally { clearTimeout(waitingNotice); }
      accessToken = auth?.accessToken;
      trace(accessToken ? 'AUTH_TOKEN_PRESENT' : 'AUTH_TOKEN_MISSING');
      if (!accessToken) throw new Error('Pi authentication was not completed.');
      if (incompleteSeen) { await recoveryPromise; return; }
      if (session.status === 'approved' || session.hasLinkedPayment) {
        terminal = true; show('A payment is already linked. Keep this page open for Pi recovery, or reopen it to retry.', true); return;
      }
      const amount = Number(session.amountPi);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid payment amount.');
      show('Creating payment…');
      trace('CREATE_PAYMENT_CALLED');
      await Pi.createPayment({amount, memo:'FileOrganizerPro ' + session.plan, metadata:{sessionToken:token}}, {
        onReadyForServerApproval: id => callback('pi-approve',{sessionToken:token,paymentId:id,accessToken},() => show('Approved. Confirm the payment in Pi.')),
        onReadyForServerCompletion: (id,txId) => callback('pi-complete',{sessionToken:token,paymentId:id,txId,accessToken},finish),
        onCancel: async id => {
          terminal = true; button.disabled = true;
          try {
            const result = await request('pi-cancel',{sessionToken:token,paymentId:id,accessToken});
            if(result.alreadyCompleted) finish(await loadSession());
            else show('Payment cancelled. Create a new checkout in the desktop app.');
          } catch(error) { show('Cancellation not confirmed: ' + error.message + '. Reopen this link to check the payment.',true); }
        },
        onError: () => {
          // The SDK may deliver an incomplete-payment callback after onError.
          terminal = true; button.disabled = true;
          if (!incompleteSeen) show('Pi could not finish the payment. Keep this page open for recovery, or reopen it to retry.',true);
        }
      });
    } catch(error) { trace('PAYMENT_FLOW_FAILED'); show(error.message || 'Unable to start payment.',true); }
    finally { busy = false; if (!terminal) button.disabled = false; }
  });
  (async () => {
    try {
      if (!token || token.length > 512) throw new Error('Missing or invalid payment link. Generate a new QR code in FileOrganizerPro.');
      if (!cfg?.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) throw new Error('Checkout configuration is missing.');
      session = await loadSession();
      if (session.status === 'completed') { finish(session); return; }
      if (!['pending','approved'].includes(session.status)) throw new Error('This payment link is closed or expired. Generate a new QR code.');
      details.textContent = 'Plan: ' + session.plan + ' · Amount: ' + session.amountPi + ' Pi';
      trace('SESSION_READY');
      show('Ready. Continue in Pi Browser.'); button.classList.remove('hidden');
    } catch(error) { terminal = true; show(error.message || 'Unable to load checkout.',true); }
  })();
})();
