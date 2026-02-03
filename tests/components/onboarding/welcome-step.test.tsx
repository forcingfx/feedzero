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
});
