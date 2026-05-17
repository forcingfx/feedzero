/**
 * <ContactSupport> — shared widget used in Recovery + Help.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactSupport } from "@/components/settings/contact-support";

describe("<ContactSupport>", () => {
  it("renders the support email prominently", () => {
    render(<ContactSupport />);
    expect(screen.getByText("support@feedzero.app")).toBeInTheDocument();
  });

  it("hides 'Email my license to me' when no token is provided", () => {
    render(<ContactSupport />);
    expect(screen.queryByRole("link", { name: /email my license/i })).toBeNull();
  });

  it("shows 'Email my license to me' when a token is present", () => {
    render(<ContactSupport token="fz_abc.def" customerId="cus_x" />);
    expect(
      screen.getByRole("link", { name: /email my license/i }),
    ).toBeInTheDocument();
  });

  it("encodes customer id and a masked token into the support mailto", () => {
    render(<ContactSupport token="fz_abcdef.ghijkl" customerId="cus_42" />);
    const link = screen.getByRole("link", { name: /contact support/i });
    const href = link.getAttribute("href") ?? "";
    expect(decodeURIComponent(href)).toContain("Customer ID: cus_42");
    expect(decodeURIComponent(href)).toContain("License token: fz_");
    expect(decodeURIComponent(href)).toContain("••••");
  });

  it("appends diagnostic context entries to the support body", () => {
    render(
      <ContactSupport diagnosticContext={{ Source: "settings-help" }} />,
    );
    const link = screen.getByRole("link", { name: /contact support/i });
    const href = link.getAttribute("href") ?? "";
    expect(decodeURIComponent(href)).toContain("Source: settings-help");
  });
});
