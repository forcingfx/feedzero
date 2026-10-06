// @vitest-environment node
import { describe, it, expect } from "vitest";
import { serviceWorkerPlugin, buildIdFor } from "../../scripts/service-worker/vite-plugin.mjs";

/**
 * The Vite plugin is what turns "a worker template in src/" into "a /sw.js
 * in the build output". The worker was dead for eight months precisely
 * because nothing did this: the file sat in src/workers/ and no build step
 * emitted it.
 */

interface EmittedFile {
  type: string;
  fileName: string;
  source: string;
}

function runGenerateBundle(bundle: Record<string, unknown>): EmittedFile[] {
  const emitted: EmittedFile[] = [];
  const plugin = serviceWorkerPlugin();
  plugin.generateBundle.call({ emitFile: (file: EmittedFile) => emitted.push(file) }, {}, bundle);
  return emitted;
}

describe("serviceWorkerPlugin", () => {
  const bundle = {
    "assets/index-AAAA.js": { type: "chunk" },
    "assets/index-BBBB.css": { type: "asset" },
    "index.html": { type: "asset" },
  };

  it("emits the worker at /sw.js, the only path that lets it control the whole app", () => {
    const [file] = runGenerateBundle(bundle);

    expect(file.fileName).toBe("sw.js");
    expect(file.type).toBe("asset");
  });

  it("lists every file under /assets/ and nothing else", () => {
    const [file] = runGenerateBundle(bundle);

    expect(file.source).toContain('"/assets/index-AAAA.js"');
    expect(file.source).toContain('"/assets/index-BBBB.css"');
    expect(file.source).not.toContain('"/index.html"]');
    expect(file.source).not.toContain("__BUILD_MANIFEST__");
  });
});

describe("buildIdFor", () => {
  it("is the same for the same assets regardless of order", () => {
    expect(buildIdFor(["/assets/a.js", "/assets/b.js"])).toBe(
      buildIdFor(["/assets/b.js", "/assets/a.js"]),
    );
  });

  it("changes when any asset changes", () => {
    expect(buildIdFor(["/assets/a-1111.js"])).not.toBe(buildIdFor(["/assets/a-2222.js"]));
  });
});
