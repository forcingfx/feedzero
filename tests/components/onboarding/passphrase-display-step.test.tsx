import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PassphraseDisplayStep } from "@/components/onboarding/steps/passphrase-display-step";
import { useOnboardingStore } from "@/stores/onboarding-store";

function renderInDialog(ui: React.ReactNode) {
  return render(
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>{ui}</DialogContent>
    </Dialog>,
  );
}

describe("PassphraseDisplayStep", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      step: "passphrase-display",
      storageMode: "sync",
      generatedPassphrase: "carbon mango velvet prism",
      confirmationInput: "",
      confirmationError: null,
    });
    vi.clearAllMocks();
  });

  it("renders heading", () => {
    renderInDialog(<PassphraseDisplayStep />);
    expect(screen.getByText(/your secret key/i)).toBeInTheDocument();
  });

  it("renders instructions to save the key", () => {
    renderInDialog(<PassphraseDisplayStep />);
    expect(screen.getByText(/save this somewhere safe/i)).toBeInTheDocument();
  });

  it("displays the generated passphrase", () => {
    renderInDialog(<PassphraseDisplayStep />);
    expect(screen.getByText("carbon mango velvet prism")).toBeInTheDocument();
  });

  it("has a copy button", () => {
    renderInDialog(<PassphraseDisplayStep />);
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("copy button is clickable", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseDisplayStep />);
    const copyButton = screen.getByRole("button", { name: /copy/i });

    // Clicking should not throw - actual clipboard API tested in e2e
    await user.click(copyButton);

    expect(copyButton).toBeInTheDocument();
  });

  it("renders checkbox for saved confirmation", () => {
    renderInDialog(<PassphraseDisplayStep />);
    expect(
      screen.getByRole("checkbox", { name: /i've saved my secret key/i }),
    ).toBeInTheDocument();
  });

  it("Continue button is disabled by default", () => {
    renderInDialog(<PassphraseDisplayStep />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button is enabled after checkbox checked", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseDisplayStep />);

    await user.click(
      screen.getByRole("checkbox", { name: /i've saved my secret key/i }),
    );

    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("advances to passphrase-confirm step when Continue clicked", async () => {
    const user = userEvent.setup();
    renderInDialog(<PassphraseDisplayStep />);

    await user.click(
      screen.getByRole("checkbox", { name: /i've saved my secret key/i }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(useOnboardingStore.getState().step).toBe("passphrase-confirm");
  });
});
