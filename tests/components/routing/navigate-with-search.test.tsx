/**
 * <NavigateWithSearch> preserves the query string when redirecting.
 *
 * The fix targets a real production bug: clicking
 * https://my.feedzero.app/?subscribe=personal-monthly hit the catchall
 * `<Route path="*" element={<Navigate to="/feeds" replace />} />` which
 * dropped the search string. SubscribeDeeplink then ran at /explore with
 * no ?subscribe= param and silently no-op'd — zero Stripe Checkout
 * sessions created from any deeplink path.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router";
import { NavigateWithSearch } from "@/components/routing/navigate-with-search";

let capturedSearch = "";
let capturedPath = "";

function LocationCapture() {
  const loc = useLocation();
  capturedPath = loc.pathname;
  capturedSearch = loc.search;
  return null;
}

function renderAt(initialUrl: string) {
  capturedPath = "";
  capturedSearch = "";
  return render(
    <MemoryRouter initialEntries={[initialUrl]}>
      <Routes>
        <Route path="/feeds" element={<LocationCapture />} />
        <Route path="*" element={<NavigateWithSearch to="/feeds" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NavigateWithSearch", () => {
  it("preserves the search string when redirecting", () => {
    renderAt("/?subscribe=personal-monthly");

    expect(capturedPath).toBe("/feeds");
    expect(capturedSearch).toBe("?subscribe=personal-monthly");
  });

  it("redirects with an empty search string when there was none", () => {
    renderAt("/some-stale-bookmark");

    expect(capturedPath).toBe("/feeds");
    expect(capturedSearch).toBe("");
  });

  it("preserves multiple search params (forward-compatibility — e.g. ?subscribe=x&utm_source=y)", () => {
    renderAt("/?subscribe=personal-yearly&utm_source=newsletter");

    expect(capturedPath).toBe("/feeds");
    expect(capturedSearch).toBe("?subscribe=personal-yearly&utm_source=newsletter");
  });
});
