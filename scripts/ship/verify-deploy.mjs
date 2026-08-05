#!/usr/bin/env node
/**
 * Proves that a specific commit is live in production.
 *
 * `/ship` uses this as its last gate. Waiting a fixed interval and declaring
 * success is how a green deploy report ends up accompanying stale code; this
 * asks production which commit it is actually serving (via /api/health's
 * `commit` field) and only passes when that is the commit we merged.
 *
 * CLI: node scripts/ship/verify-deploy.mjs <baseUrl> <targetCommit> [timeoutSeconds]
 * Exit 0 once live, 1 on timeout. Narration on stderr; `live=`/`commit=` on
 * stdout so a workflow can redirect it into $GITHUB_OUTPUT.
 *
 * No process.env reads: scripts/ is scanned by `npm run check-env` against
 * expected-env.json, which is the deployment contract, not a place for
 * runner variables.
 */

const POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_SECONDS = 300;

/**
 * @param {{ health: { ok: boolean, commit: string } | null, targetCommit: string }} params
 * @returns {{ live: boolean, reason: string }}
 */
export function isDeployLive({ health, targetCommit }) {
  if (!health) {
    return { live: false, reason: "health unreachable — no response yet" };
  }
  if (!health.ok) {
    return {
      live: false,
      reason: `health reports not ok (maintenance or degraded), commit ${health.commit}`,
    };
  }
  if (!health.commit || health.commit === "unknown") {
    return {
      live: false,
      reason: "deployment cannot identify its commit (reports 'unknown')",
    };
  }
  // The served value is a short SHA; require it to PREFIX the full target so
  // a different commit sharing characters cannot pass.
  if (!targetCommit.startsWith(health.commit)) {
    return {
      live: false,
      reason: `serving ${health.commit}, waiting for ${targetCommit.slice(0, 7)}`,
    };
  }
  return { live: true, reason: `${health.commit} is live` };
}

async function fetchHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/health`, {
      headers: { "Cache-Control": "no-cache" },
    });
    // 503 is a maintenance response with a valid body; parse it either way.
    return await res.json();
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runCli() {
  const [baseUrl, targetCommit, timeoutArg] = process.argv.slice(2);
  if (!baseUrl || !targetCommit) {
    console.error(
      "usage: verify-deploy.mjs <baseUrl> <targetCommit> [timeoutSeconds]",
    );
    process.exit(2);
  }
  const timeoutMs =
    Number(timeoutArg ?? DEFAULT_TIMEOUT_SECONDS) * 1000 || Infinity;
  const startedAt = Date.now();

  let verdict = { live: false, reason: "not started" };
  while (Date.now() - startedAt < timeoutMs) {
    verdict = isDeployLive({
      health: await fetchHealth(baseUrl),
      targetCommit,
    });
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.error(`[${elapsed}s] ${verdict.reason}`);
    if (verdict.live) {
      console.log(`live=true`);
      console.log(`commit=${targetCommit.slice(0, 7)}`);
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  console.log(`live=false`);
  console.log(`commit=${targetCommit.slice(0, 7)}`);
  console.error(`::error::deploy not live within timeout: ${verdict.reason}`);
  process.exit(1);
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await runCli();
}
