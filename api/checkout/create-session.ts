// @ts-nocheck
// src/utils/trace-id.ts
function newTraceId() {
  return "req_" + crypto.randomUUID().split("-")[0];
}

// src/utils/log-error.ts
var ALLOWED_FIELDS = [
  "route",
  "method",
  "status",
  "traceId",
  "errClass",
  "errMsg"
];
function logError(fields) {
  const safe = {};
  for (const key of ALLOWED_FIELDS) {
    safe[key] = fields[key];
  }
  safe.ts = (/* @__PURE__ */ new Date()).toISOString();
  console.error(JSON.stringify(safe));
  if (fields.errClass === "AcceptedWithIssue") {
    const url = process.env.OPERATOR_ALERT_URL;
    if (url) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe)
      }).catch(() => {
      });
    }
  }
}

// src/core/stripe/checkout-handler.ts
var ROUTE = "/api/checkout/create-session";
var TRIAL_PERIOD_DAYS = 30;
var JSON_HEADERS = { "Content-Type": "application/json" };
function okResponse(body, status) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function clientError(message, status, traceId) {
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS }
  );
}
function serverError(message, errClass, status, traceId, method) {
  logError({ route: ROUTE, method, status, traceId, errClass, errMsg: message });
  return new Response(
    JSON.stringify({ ok: false, error: message, traceId }),
    { status, headers: JSON_HEADERS }
  );
}
async function parseBody(request, allowedPrices2) {
  let parsed;
  try {
    parsed = await request.json();
  } catch {
    return { ok: false, error: "invalid JSON body" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = parsed;
  const priceId = obj.priceId;
  if (typeof priceId !== "string" || priceId.length === 0) {
    return { ok: false, error: "missing or invalid 'priceId'" };
  }
  if (!allowedPrices2.includes(priceId)) {
    return { ok: false, error: "priceId not in allowlist" };
  }
  const successUrl = obj.successUrl;
  if (typeof successUrl !== "string" || !isHttpUrl(successUrl)) {
    return { ok: false, error: "'successUrl' must be an http(s) URL" };
  }
  const cancelUrl = obj.cancelUrl;
  if (typeof cancelUrl !== "string" || !isHttpUrl(cancelUrl)) {
    return { ok: false, error: "'cancelUrl' must be an http(s) URL" };
  }
  const customerEmail = obj.customerEmail;
  if (customerEmail !== void 0 && typeof customerEmail !== "string") {
    return { ok: false, error: "'customerEmail' must be a string if provided" };
  }
  const args = { priceId, successUrl, cancelUrl };
  if (typeof customerEmail === "string") args.customerEmail = customerEmail;
  return { ok: true, args };
}
function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
function deriveIdempotencyKey(args) {
  const bucket = Math.floor(Date.now() / (5 * 60 * 1e3));
  const email = args.customerEmail ?? "anon";
  return `cs:${args.priceId}:${email}:${bucket}`;
}
async function handleCreateCheckoutSession(request, options) {
  const traceId = newTraceId();
  const method = request.method;
  if (method !== "POST") {
    return clientError("method not allowed", 405, traceId);
  }
  if (options.killSignups?.()) {
    return clientError("signups disabled", 503, traceId);
  }
  const parsed = await parseBody(request, options.allowedPrices);
  if (!parsed.ok) {
    return clientError(parsed.error, 400, traceId);
  }
  let session;
  try {
    session = await options.client.create(
      {
        mode: "subscription",
        line_items: [{ price: parsed.args.priceId, quantity: 1 }],
        success_url: parsed.args.successUrl,
        cancel_url: parsed.args.cancelUrl,
        // Force the EU 14-day-withdrawal-waiver checkbox. See the
        // CheckoutClient.create JSDoc for the why; without this, the waiver
        // text in our Terms is unenforceable against an EU consumer.
        consent_collection: { terms_of_service: "required" },
        subscription_data: { trial_period_days: TRIAL_PERIOD_DAYS },
        ...parsed.args.customerEmail ? { customer_email: parsed.args.customerEmail } : {}
      },
      { idempotencyKey: deriveIdempotencyKey(parsed.args) }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return serverError(
      `stripe checkout failed: ${message}`,
      "StripeApiError",
      502,
      traceId,
      method
    );
  }
  if (!session.url) {
    return serverError(
      "stripe returned no checkout url",
      "StripeNoUrl",
      502,
      traceId,
      method
    );
  }
  return okResponse(
    { ok: true, url: session.url, sessionId: session.id },
    200
  );
}

// src/core/stripe/allowed-prices.ts
function resolveAllowedPrices(env = process.env) {
  const raw = env.STRIPE_ALLOWED_PRICES;
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// src/core/flags/flags.ts
function isFlagEnabled(name, env = process.env) {
  if (env.SELF_HOSTED === "1" && name === "LAUNCH_PAID_TIER") return false;
  return env[name] === "1";
}

// api/checkout/create-session.ts
var allowedPrices = resolveAllowedPrices();
async function POST(req) {
  return handleCreateCheckoutSession(req, {
    // Lazy: Stripe SDK constructed only if the handler reaches the API call
    // (i.e. after kill-switch, body validation, allowlist all pass). Lets
    // tests/dev hit 4xx/503 paths without needing STRIPE_SECRET_KEY set.
    client: {
      create: async (params, opts) => {
        const { default: Stripe } = await import("stripe");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
        const session = await stripe.checkout.sessions.create(params, opts);
        return { url: session.url, id: session.id };
      }
    },
    allowedPrices,
    killSignups: () => isFlagEnabled("KILL_SIGNUPS")
  });
}
export {
  POST
};
