(() => {
  "use strict";

  const config = window.FOP_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const piStatus = $("piStatus");
  const piUser = $("piUser");
  const authButtons = [$("piAuthButton"), $("piAuthButtonSecondary")].filter(Boolean);
  let piReady = false;
  let piUserData = null;

  function setPiStatus(message, error = false) {
    if (!piStatus) return;
    piStatus.textContent = message;
    piStatus.classList.toggle("error", error);
  }

  function setAuthBusy(busy) {
    authButtons.forEach((button) => {
      button.disabled = busy;
      button.classList.toggle("is-loading", busy);
    });
  }

  async function initPi() {
    if (!window.Pi) {
      setPiStatus("برای استفاده از قابلیت Pi، این صفحه را داخل Pi Browser باز کنید.", true);
      return;
    }

    try {
      await window.Pi.init({
        version: "2.0",
        sandbox: Boolean(config.PI_SANDBOX),
      });
      piReady = true;
      setPiStatus(
        config.PI_SANDBOX
          ? "Pi SDK آماده است — محیط Testnet / Sandbox"
          : "Pi SDK آماده است — محیط Production"
      );
    } catch (error) {
      console.error("Pi.init failed", error);
      setPiStatus("راه‌اندازی Pi انجام نشد. دوباره صفحه را باز کنید.", true);
    }
  }

  async function authenticateWithPi() {
    if (!piReady || !window.Pi) {
      setPiStatus("این قابلیت فقط داخل Pi Browser در دسترس است.", true);
      return;
    }

    setAuthBusy(true);
    setPiStatus("در حال احراز هویت امن با Pi...");

    try {
      // Login only needs the username scope. Requesting the payments scope here
      // can trigger an unnecessary payment-related authorization flow and may leave
      // the login state waiting indefinitely inside Pi Browser. Payment authorization
      // should be requested only when the user actually starts a payment.
      const authPromise = window.Pi.authenticate(
        ["username"],
        (incompletePayment) => {
          // Payment recovery is intentionally not performed in this static frontend.
          // The authoritative recovery flow remains on the verified desktop checkout.
          console.info("Pi reported an incomplete payment:", incompletePayment?.identifier);
        }
      );

      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error("Pi authentication timed out"));
        }, 20000);
      });

      const auth = await Promise.race([authPromise, timeoutPromise]);

      piUserData = auth?.user || null;
      const username = piUserData?.username || "Pioneer";
      if (piUser) {
        piUser.textContent = `وارد شده‌اید: ${username}`;
        piUser.classList.remove("hidden");
      }

      authButtons.forEach((button) => {
        button.textContent = "متصل به Pi";
        button.classList.add("connected");
      });
      setPiStatus(`ورود با Pi موفق بود — ${username}`);
    } catch (error) {
      console.error("Pi.authenticate failed", error);
      if (error?.message === "Pi authentication timed out") {
        setPiStatus(
          "احراز هویت Pi پاسخ نداد. Pi Browser را باز نگه دارید و دوباره تلاش کنید.",
          true
        );
      } else {
        setPiStatus("ورود با Pi لغو شد یا با خطا مواجه شد.", true);
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function loadPlans() {
    const grid = $("pricingGrid");
    if (!grid) return;

    try {
      const response = await fetch(
        `${config.SUPABASE_URL}/rest/v1/plans?select=*&is_active=eq.true&order=display_order.asc`,
        {
          headers: {
            apikey: config.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
          },
        }
      );

      if (!response.ok) throw new Error(`plans HTTP ${response.status}`);
      const plans = await response.json();
      if (!Array.isArray(plans) || plans.length === 0) throw new Error("no plans");

      grid.replaceChildren();
      plans.forEach((plan) => {
        const card = document.createElement("article");
        card.className = "card plan-card";

        if (plan.badge) {
          const badge = document.createElement("span");
          badge.className = "badge";
          badge.textContent = plan.badge;
          card.appendChild(badge);
        }

        const title = document.createElement("h3");
        title.textContent = plan.name || "Plan";

        const price = document.createElement("div");
        price.className = "plan-price";
        const amount = Number(plan.price_usd || 0);
        price.textContent = amount > 0 ? `$${amount.toFixed(2)}` : "رایگان";

        if (plan.duration_days) {
          const duration = document.createElement("small");
          duration.textContent =
            plan.duration_days <= 31 ? " / ماه" :
            plan.duration_days <= 186 ? " / ۶ ماه" : " / سال";
          price.appendChild(duration);
        }

        const limit = document.createElement("p");
        limit.className = "plan-limit";
        const bytes = Number(plan.organization_limit_bytes || 0);
        limit.textContent = bytes > 0
          ? `تا ${(bytes / 1024 / 1024 / 1024).toFixed(1)} گیگابایت`
          : "بدون سقف حجمی";

        card.append(title, price, limit);
        grid.appendChild(card);
      });
    } catch (error) {
      console.error("loadPlans failed", error);
      grid.replaceChildren();
      const fallback = document.createElement("div");
      fallback.className = "card loading-card";
      fallback.textContent = "پلن‌ها در حال حاضر در دسترس نیستند. لطفاً دوباره تلاش کنید.";
      grid.appendChild(fallback);
    }
  }

  function wireDownload() {
    const url = config.DOWNLOAD_URL || "#";
    const button = $("downloadButton");
    const hero = $("heroDownload");
    if (button) button.href = url;
    if (hero && url !== "#") hero.href = "#download";
  }

  authButtons.forEach((button) => button.addEventListener("click", authenticateWithPi));
  $("year").textContent = new Date().getFullYear();
  wireDownload();
  initPi();
  loadPlans();
})();
