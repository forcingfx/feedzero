import { describe, it, expect, vi, afterEach } from "vitest";
import http from "node:http";
import https from "node:https";

/**
 * The unit environment must never open a socket. happy-dom is a real
 * resource loader: a `<link rel="stylesheet">` or `<iframe src>` inserted
 * into the document makes it fetch the URL through node:http(s), which in
 * the suite meant connection attempts to localhost:3000 and to fixture
 * hosts (`https://evil.com/`) that showed up as ECONNREFUSED stack traces
 * in every run. Nothing awaited those fetches, so the suite stayed green
 * while doing real network I/O. Pinned here so the environment setting that
 * silences it cannot be dropped without this failing.
 */
describe("unit environment: no real network", () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("does not fetch a <link rel=stylesheet> inserted into the document", async () => {
    const request = vi.spyOn(http, "request").mockImplementation(() => {
      throw new Error("real network attempted");
    });

    document.body.innerHTML = '<link rel="stylesheet" href="/style.css">';
    await settle();

    expect(request).not.toHaveBeenCalled();
  });

  it("does not load the page of an <iframe src> inserted into the document", async () => {
    const request = vi.spyOn(https, "request").mockImplementation(() => {
      throw new Error("real network attempted");
    });

    document.body.innerHTML = '<iframe src="https://evil.com"></iframe>';
    await settle();

    expect(request).not.toHaveBeenCalled();
  });
});
