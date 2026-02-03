import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PassphraseConfirmStep } from "@/components/onboarding/steps/passphrase-confirm-step";
import { useOnboardingStore } from "@/stores/onboarding-store";

function renderInDialog(ui: React.ReactNode) {
  return render(
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>{ui}</DialogContent>
    </Dialog>
  );
}

describe("PassphraseConfirmStep", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      step: "passphrase-confirm",
      storageMode: "sync",
      generatedPassphrase: "carbon mango velvet prism",
      confirmationInput: "",
      confirmationError: null,
    });
  });

  it("renders heading", () => {
    renderInDialog(<PassphraseConfirmStep />);
    expect(screen.getByText(/confirm your secret key/i)).toBeInTheDocument();
  });

  it("renders instructions", () => {
    renderInDialog(<PassphraseConfirmStep />);
    expect(
      screen.getByText(/enter your secret key to confirm/i)
    ).toBeInTheDocument();
  });

  it("renders input field", () => {
    renderInDialog(<PassphraseConfirmStep />);
    expect(
      screen.getByPlaceholderText(/enter your secret key/i)
    ).toBeInTheDocument();
  });

  it("renders Back button", () => {
    renderInDialog(<PassphraseConfirmStep />);
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("renders Confirm button", () => {
    renderInDialog(<PassphraseConfirmStep />);
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("Back button returns to passphrase-display step", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseConfirmStep />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(useOnboardingStore.getState().step).toBe("passphrase-display");
  });

  it("updates confirmationInput when typing", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseConfirmStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your secret key/i),
      "test input"
    );

    expect(useOnboardingStore.getState().confirmationInput).toBe("test input");
  });

  it("shows error when confirmation fails", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseConfirmStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your secret key/i),
      "wrong passphrase"
    );
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(screen.getByText(/doesn't match/i)).toBeInTheDocument();
  });

  it("advances to initializing on successful confirmation", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseConfirmStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your secret key/i),
      "carbon mango velvet prism"
    );
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(useOnboardingStore.getState().step).toBe("initializing");
  });

  it("confirmation is case-insensitive", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseConfirmStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your secret key/i),
      "CARBON MANGO VELVET PRISM"
    );
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(useOnboardingStore.getState().step).toBe("initializing");
  });

  it("clears error when user starts typing again", async () => {
    const user = userEvent.setup();
    useOnboardingStore.setState({
      confirmationError: "Previous error",
    });
    renderInDialog(<PassphraseConfirmStep />);

    expect(screen.getByText(/previous error/i)).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/enter your secret key/i),
      "a"
    );

    expect(screen.queryByText(/previous error/i)).not.toBeInTheDocument();
  });
});
