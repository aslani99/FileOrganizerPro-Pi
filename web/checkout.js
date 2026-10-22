(() => {
  'use strict';
  const cfg = window.FOP_CONFIG;
  const token = new URLSearchParams(location.search).get('token');
  const status = document.getElementById('status'), details = document.getElementById('details'), button = document.getElementById('payButton');
  let busy = false, terminal = false, session, accessToken, recoveryPromise, incompleteSeen = false;
  const show = (text, error = false) => { status.textContent = text; status.className = error ? 'error' : ''; };
  async function request(name, body) {
    const response = await fetch(cfg.SUPABASE_URL + '/functions/v1/' + name, {
      method: body ? 'POST' : 'GET', headers: {apikey: cfg.SUPABASE_ANON_KEY, ...(body ? {'Content-Type':'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(25000), cache:'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }
  async function loadSession() {
    const data = await request('payment-session-status?token=' + encodeURIComponent(token));
    if (!['pending','approved','completed','cancelled','error'].includes(data.status)) throw new Error('Invalid session response.');
    return data;
  }
  function finish(data) {
    terminal = true; button.disabled = true; button.classList.add('hidden');
    show(data.subscriptionPendingSync ? 'Payment received. Subscription activation is pending; return to the app to check its status.' : 'Payment completed. You can return to FileOrganizerPro.');
  }
  function recover(payment) {
    incompleteSeen = true;
    if (recoveryPromise) return recoveryPromise;
    if (!payment?.identifier || !payment.transaction?.txid) {
      terminal = true; button.disabled = true;
      show('A previous payment is unfinished. Check its status in Pi Wallet before starting another payment.', true);
      return Promise.resolve();
    }
    // The backend verifies the transaction and uses its metadata to recover the original session.
    // This can run before Pi.authenticate resolves; no browser-supplied identity is trusted.
    recoveryPromise = request('pi-complete', {paymentId:payment.identifier, txId:payment.transaction.txid, ...(accessToken?{accessToken}:{})})
      .then(finish).catch(error => { terminal = true; button.disabled = true; show('Recovery pending: ' + error.message + '. Reopen this link to retry.', true); });
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
      await Pi.init({version:'2.0', sandbox:cfg.PI_SANDBOX === true});
      show('Connecting to Pi…');
      const auth = await Pi.authenticate(['username','payments'], recover);
      accessToken = auth?.accessToken;
      if (!accessToken) throw new Error('Pi authentication was not completed.');
      if (incompleteSeen) { await recoveryPromise; return; }
      if (session.status === 'approved' || session.hasLinkedPayment) {
        terminal = true; show('A payment is already linked. Keep this page open for Pi recovery, or reopen it to retry.', true); return;
      }
      const amount = Number(session.amountPi);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid payment amount.');
      show('Creating payment…');
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
    } catch(error) { show(error.message || 'Unable to start payment.',true); }
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
      show('Ready. Continue in Pi Browser.'); button.classList.remove('hidden');
    } catch(error) { terminal = true; show(error.message || 'Unable to load checkout.',true); }
  })();
})();
