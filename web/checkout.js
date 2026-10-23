(() => {
  'use strict';
  const cfg = window.FOP_CONFIG;
  const token = new URLSearchParams(location.search).get('token');
  const status = document.getElementById('status'), details = document.getElementById('details'), button = document.getElementById('payButton');
  const T = window.FOP_I18N.text;
  button.textContent = T.pay;
  document.getElementById('diagnostics-title').textContent = T.diagnostics;
  document.title = 'FileOrganizerPro — ' + T.pay;
  function closePage(key) {
    terminal = true; button.disabled = true; button.classList.add('hidden'); show(T[key]);
  }
  function showError(error) {
    const code = error?.code || error?.message;
    if (['session_expired','session_closed','session_not_found','invalid_token'].includes(code)) { closePage('closed'); return; }
    if (code === 'payment_cancelled') { closePage('cancelled'); return; }
    show(code === 'network_error' ? T.network : code === 'request_timeout' ? T.timeout : T.error, true);
  }
  const diagnosticRows = [];
  function trace(code) {
    // Only call with predefined stage codes; never log SDK payloads, tokens or raw errors.
    diagnosticRows.push(new Date().toISOString().slice(11,19) + ' ' + code);
    const panel = document.getElementById('payment-diagnostics');
    if (panel) panel.textContent = diagnosticRows.slice(-35).join('\n');
  }
  window.addEventListener('error', () => trace('BROWSER_SCRIPT_ERROR'));
  window.addEventListener('unhandledrejection', () => trace('UNHANDLED_ASYNC_ERROR'));
  trace('CHECKOUT_STATUS_6');
  trace(cfg?.PI_SANDBOX === true ? 'SDK_MODE_DESKTOP_SANDBOX' : 'SDK_MODE_PI_BROWSER');
  let busy = false, terminal = false, paymentInFlight = false, session, accessToken, recoveryPromise, incompleteSeen = false, incompletePayment;
  const show = (text, error = false) => { status.textContent = text; status.className = error ? 'error' : ''; };
  async function request(name, body) {
    trace('API_REQUEST_' + name.split('?')[0]);
    let response;
    try { response = await fetch(cfg.SUPABASE_URL + '/functions/v1/' + name, {
      method: body ? 'POST' : 'GET', headers: {apikey: cfg.SUPABASE_ANON_KEY, ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(25000), cache:'no-store'
    });
    } catch(error) {
      throw Object.assign(new Error('request_failed'), {code:['TimeoutError','AbortError'].includes(error?.name)?'request_timeout':'network_error'});
    }
    const data = await response.json().catch(() => ({}));
    trace(response.ok ? 'API_RESPONSE_OK' : 'API_RESPONSE_FAILED');
    if (!response.ok) { trace('HTTP_' + response.status); throw Object.assign(new Error('request_failed'), {code:data.error}); }
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
    show(data.subscriptionPendingSync ? T.syncPending : T.success);
  }
  function recover(payment) {
    trace('INCOMPLETE_PAYMENT_CALLBACK');
    incompleteSeen = true;
    incompletePayment = payment;
    // Authentication can deliver this callback before its promise resolves.
    // Process it after we have the verified Pi identity.
    if (!accessToken) return Promise.resolve();
    return reconcile(payment?.identifier);
  }
  async function reconcile(paymentId, allowReplacement = false) {
    if (recoveryPromise) return recoveryPromise;
    trace('RECOVERY_STARTED');
    show(T.checking);
    recoveryPromise = request('pi-complete', {recovery:true, sessionToken:token, ...(paymentId?{paymentId}:{}), accessToken})
      .then(result => {
        if (result.awaitingConfirmation) {
          if (allowReplacement && !session.hasLinkedPayment && session.status === 'pending') return true;
          terminal = true; button.disabled = true; button.classList.add('hidden');
          show(T.unfinished);
        } else if (result.cancelled) {
          terminal = true; button.disabled = true;
          closePage('cancelled');
        } else { finish(result); }
      }).catch(error => {
        trace('RECOVERY_FAILED');
        terminal = false;
        showError(error);
      }).finally(() => {
        recoveryPromise = null;
        if (!busy && !terminal && !paymentInFlight) button.disabled = false;
      });
    return recoveryPromise;
  }
  async function callback(name, body, success) {
    try { const result = await request(name, body); success?.(result); return result; }
    catch (error) { showError(error); throw error; }
  }
  button.addEventListener('click', async () => {
    if (busy || terminal || paymentInFlight) return;
    busy = true; button.disabled = true;
    try {
      incompleteSeen = false; incompletePayment = null; accessToken = null;
      session = await loadSession();
      if (session.status === 'completed') { finish(session); return; }
      if (!['pending','approved'].includes(session.status)) { terminal = true; closePage(session.status === 'cancelled' ? 'cancelled' : 'closed'); return; }
      if (!window.Pi) throw new Error('Open this link in Pi Browser.');
      trace('SDK_INIT_STARTED');
      await Pi.init({version:'2.0', sandbox:cfg.PI_SANDBOX === true});
      trace('SDK_INIT_RESOLVED');
      show(T.checking);
      trace('AUTHENTICATE_CALLED');
      // A slow wallet interaction must not be cancelled or followed by a second auth call.
      const waitingNotice = setTimeout(() => {
        if (!incompleteSeen && !terminal) {
          trace('AUTHENTICATE_STILL_PENDING_15S');
          show(T.follow);
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
      if (incompleteSeen && await reconcile(incompletePayment?.identifier, true) !== true) return;
      if (session.status === 'approved' || session.hasLinkedPayment) {
        await reconcile(); return;
      }
      const amount = Number(session.amountPi);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid payment amount.');
      show(T.checking);
      trace('CREATE_PAYMENT_CALLED');
      paymentInFlight = true;
      await Pi.createPayment({amount, memo:'FileOrganizerPro ' + session.plan, metadata:{sessionToken:token}}, {
        onReadyForServerApproval: id => callback('pi-approve',{sessionToken:token,paymentId:id,accessToken},() => show(T.follow)),
        onReadyForServerCompletion: (id,txId) => callback('pi-complete',{sessionToken:token,paymentId:id,txId,accessToken},finish),
        onCancel: async id => {
          terminal = true; button.disabled = true;
          try {
            const result = await request('pi-cancel',{sessionToken:token,paymentId:id,accessToken});
            if(result.alreadyCompleted) finish(await loadSession());
            else closePage('cancelled');
          } catch(error) { showError(error); }
        },
        onError: () => {
          // The SDK may deliver an incomplete-payment callback after onError.
          terminal = true; button.disabled = true;
          if (!incompleteSeen) show(T.error,true);
        }
      });
    } catch(error) { paymentInFlight = false; trace('PAYMENT_FLOW_FAILED'); showError(error); }
    finally { busy = false; if (!terminal && !paymentInFlight) button.disabled = false; }
  });
  (async () => {
    show(T.checking);
    try {
      if (!token || token.length > 512) throw Object.assign(new Error('invalid_token'), {code:'invalid_token'});
      if (!cfg?.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) throw new Error('Checkout configuration is missing.');
      session = await loadSession();
      if (session.status === 'completed') { finish(session); return; }
      if (!['pending','approved'].includes(session.status)) { terminal = true; closePage(session.status === 'cancelled' ? 'cancelled' : 'closed'); return; }
      details.textContent = (T[session.plan] || session.plan) + ' · ' + window.FOP_I18N.number(Number(session.amountPi)) + ' Pi';
      trace('SESSION_READY');
      show(T.ready); button.classList.remove('hidden');
    } catch(error) { showError(error); if (!terminal) { button.disabled = false; button.classList.remove('hidden'); } }
  })();
})();
