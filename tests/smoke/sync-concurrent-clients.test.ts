// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { serve, type ServerType } from "@hono/node-server";
import { createApp } from "../../server";
import { createFilesystemAdapter } from "@/core/sync/adapters/filesystem-adapter";

/**
 * Multi-client smoke test against a real Hono server with the
 * filesystem adapter — the "system-wrong but unit-green" gap CLAUDE.md
 * SMOKE step exists to close.
 *
 * Unlike `tests/smoke/sync.test.ts` (sequential single-session
 * roundtrip), this test boots the actual server binary on an
 * ephemeral port, fires N parallel client connections that push and
 * pull the same vaultId, and asserts no client ever observes a torn
 * JSON body. This is the scenario issue #117 surfaced: device A's
 * debounced auto-push racing device B's pull caused
 * `JSON.parse: unterminated string` errors and silent corruption.
 *
 * Skipped by default. Enable with `SMOKE_TESTS=1`. Self-contained:
 * uses a tmpdir, no network, no external services — different from
 * the production-hitting smokes that need staging credentials.
 */

const SKIP = !process.env.SMOKE_TESTS;

function sentinelVaultId(): string {
  // 64 hex chars, deterministic per-run but unique-per-run. Mirrors
  // tests/smoke/sync.test.ts to keep the pattern consistent.
  const ts = Date.now().toString(16).padStart(16, "0");
  const rand = Math.random().toString(16).slice(2).padStart(16, "0");
  return (ts + rand + "0".repeat(64)).slice(0, 64);
}

interface PushPayload {
  ok: true;
  vault: { iv: number[]; ciphertext: string; client: number; round: number };
}

describe.skipIf(SKIP)("sync concurrent clients (filesystem adapter)", () => {
  it("no client observes a torn body during parallel push/pull", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fz-smoke-"));
    const adapter = createFilesystemAdapter(tmpDir);
    const app = createApp(adapter);

    let server: ServerType | null = null;
    const address: { port: number } = await new Promise((resolve) => {
      server = serve({ fetch: app.fetch, port: 0 }, (info) => {
        resolve({ port: info.port });
      });
    });
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const vaultId = sentinelVaultId();

      // Seed so initial reads aren't all 404s.
      const seed: PushPayload = {
        ok: true,
        vault: { iv: [0], ciphertext: "seed", client: 0, round: 0 },
      };
      const seedRes = await fetch(`${baseUrl}/api/sync`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, vault: seed.vault }),
      });
      expect(seedRes.status).toBe(200);

      // The exact bug from issue #117 reproduces here: a small PUT
      // response (~37 bytes) shared a Headers object with the
      // subsequent GET response, and the GET inherited the PUT's
      // Content-Length of 37 — truncating the (potentially MBs)
      // vault body at byte 37 on the wire. We assert that the GET
      // response is byte-equal to what the file on disk holds. If
      // the Content-Length leak ever regresses, this fails first
      // and loudly, before the harder-to-debug concurrent loop.
      const filePath = path.join(tmpDir, "vaults", `${vaultId}.json`);
      const onDiskAfterSeed = fs.readFileSync(filePath, "utf-8");
      const seedGetRes = await fetch(`${baseUrl}/api/sync?vaultId=${vaultId}`);
      const seedGetText = await seedGetRes.text();
      expect(seedGetRes.status).toBe(200);
      expect(seedGetText.length).toBe(onDiskAfterSeed.length);
      expect(seedGetText).toBe(onDiskAfterSeed);

      // Keep total request count under the server's 100 req/min/IP rate
      // limit so a 429 doesn't masquerade as a torn-body failure. The
      // bug under test is the response-truncation race; the rate
      // limiter is the subject of a separate smoke (rate-limiter.test).
      const CLIENTS = 2;
      const ROUNDS = 20;

      // Writers: each client pushes ROUNDS distinct payloads in a
      // tight loop. Distinct client/round tags let us verify a read's
      // body matches *some* legitimate writer's payload.
      const writers = Array.from({ length: CLIENTS }, (_, c) =>
        (async () => {
          for (let r = 0; r < ROUNDS; r++) {
            const vault = {
              iv: [c, r],
              ciphertext: `c${c}-r${r}-` + "x".repeat(64 * 1024),
              client: c,
              round: r,
            };
            const res = await fetch(`${baseUrl}/api/sync`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ vaultId, vault }),
            });
            expect(res.status).toBe(200);
          }
        })(),
      );

      // Readers: each client polls in a tight loop. Every response
      // body MUST be valid JSON. A torn body fails `await res.json()`.
      const readers = Array.from({ length: CLIENTS }, () =>
        (async () => {
          const observedClients: number[] = [];
          for (let i = 0; i < ROUNDS; i++) {
            const res = await fetch(`${baseUrl}/api/sync?vaultId=${vaultId}`);
            expect(res.status).toBe(200);
            const text = await res.text();
            try {
              const body = JSON.parse(text) as PushPayload;
              expect(body.ok).toBe(true);
              expect(body.vault).toBeTruthy();
              expect(typeof body.vault.ciphertext).toBe("string");
              observedClients.push(body.vault.client);
            } catch (e) {
              throw new Error(
                `Torn body (len=${text.length}, first 100 chars=${JSON.stringify(text.slice(0, 100))}): ${(e as Error).message}`,
              );
            }
          }
          return observedClients;
        })(),
      );

      await Promise.all([...writers, ...readers]);

      // Cleanup: explicit delete + verify 404 to assert the handler's
      // contract still works after concurrent abuse.
      const delRes = await fetch(`${baseUrl}/api/sync?vaultId=${vaultId}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      const getAfter = await fetch(`${baseUrl}/api/sync?vaultId=${vaultId}`);
      expect(getAfter.status).toBe(404);
    } finally {
      if (server) {
        await new Promise<void>((resolve) =>
          (server as ServerType).close(() => resolve()),
        );
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 60_000);
});
