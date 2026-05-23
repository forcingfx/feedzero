import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { WelcomeStep } from "@/components/onboarding/steps/welcome-step";
import { useOnboardingStore } from "@/stores/onboarding-store";

function renderInDialog(ui: React.ReactNode) {
  return render(
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>{ui}</DialogContent>
    </Dialog>,
  );
}

describe("WelcomeStep", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      step: "welcome",
      storageMode: null,
      generatedPassphrase: "",
      confirmationInput: "",
      confirmationError: null,
    });
  });

  it("renders welcome heading", () => {
    renderInDialog(<WelcomeStep />);
    expect(screen.getByText("Welcome to FeedZero")).toBeInTheDocument();
  });

  it("shows the FeedZero brand mark above the heading", () => {
    renderInDialog(<WelcomeStep />);
    // Radix renders the dialog through a portal so the icon lives on document.body.
    const mark = document.body.querySelector("img[src='/icon-192.png']");
    expect(mark).not.toBeNull();
  });

  it("renders tagline about privacy", () => {
    renderInDialog(<WelcomeStep />);
    expect(screen.getByText(/your feeds, your privacy/i)).toBeInTheDocument();
  });

  it("renders numbered feature list with icons", () => {
    renderInDialog(<WelcomeStep />);
    expect(screen.getByText(/add your favorite/i)).toBeInTheDocument();
    expect(screen.getByText(/read distraction-free/i)).toBeInTheDocument();
    expect(
      screen.getByText(/what you read is your business/i),
    ).toBeInTheDocument();
  });

  it("renders Get Started button", () => {
    renderInDialog(<WelcomeStep />);
    expect(
      screen.getByRole("button", { name: /get started/i }),
    ).toBeInTheDocument();
  });

  it("advances to storage-choice step when Get Started clicked", async () => {
    const user = userEvent.setup();
    renderInDialog(<WelcomeStep />);

    await user.click(screen.getByRole("button", { name: /get started/i }));

    expect(useOnboardingStore.getState().step).toBe("storage-choice");
  });

  it("shows Enter kbd hint on Get Started button", () => {
    renderInDialog(<WelcomeStep />);
    const button = screen.getByRole("button", { name: /get started/i });
    expect(button.querySelector("kbd")).toHaveTextContent("Enter");
  });

  it("Get Started button has autoFocus", () => {
    renderInDialog(<WelcomeStep />);
    const button = screen.getByRole("button", { name: /get started/i });
    expect(button).toHaveFocus();
  });

  it("surfaces a restore-from-cloud affordance for users who already have a passphrase", async () => {
    // Closes the cross-device UX gap from feedback #98: a returning user on
    // a new device shouldn't have to discover the recovery flow through
    // Settings → Existing cloud account. The welcome step exposes it.
    renderInDialog(<WelcomeStep />);
    expect(
      screen.getByRole("button", { name: /restore from cloud|already have/i }),
    ).toBeInTheDocument();
  });

  it("jumps to the recovery step when the restore affordance is clicked", async () => {
    const user = userEvent.setup();
    renderInDialog(<WelcomeStep />);
    await user.click(
      screen.getByRole("button", { name: /restore from cloud|already have/i }),
    );
    expect(useOnboardingStore.getState().step).toBe("recovery");
  });

  it("surfaces a migration hint naming Pocket, Omnivore, and TT-RSS", () => {
    // Refugees from category-wide shutdowns (Pocket 2025-11, Omnivore
    // 2024-11, TT-RSS 2025-11) need to see the product recognises their
    // export type before they invest in setup. See strategy 001 + 003 §2.
    renderInDialog(<WelcomeStep />);
    expect(screen.getByText(/pocket/i)).toBeInTheDocument();
    expect(screen.getByText(/omnivore/i)).toBeInTheDocument();
    expect(screen.getByText(/tt-rss/i)).toBeInTheDocument();
  });
});
