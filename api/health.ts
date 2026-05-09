// @ts-nocheck
// api/health.ts
function isFlagEnabled(name, env = process.env) {
  return env[name] === "1";
}
function resolveVersion() {
  const viteVersion = readViteAppVersion();
  if (viteVersion) return viteVersion;
  return process.env.APP_VERSION ?? "unknown";
}
function readViteAppVersion() {
  try {
    const env = import.meta.env;
    return env?.VITE_APP_VERSION;
  } catch {
    return void 0;
  }
}
function jsonHealthResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}
function handleHealthRequest(_request) {
  const body = {
    ok: true,
    version: resolveVersion(),
    time: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (isFlagEnabled("MAINTENANCE_MODE")) {
    return jsonHealthResponse(
      { ...body, ok: false, maintenance: true },
      503
    );
  }
  return jsonHealthResponse(body, 200);
}
function GET(req) {
  return handleHealthRequest(req);
}
export {
  GET
};
