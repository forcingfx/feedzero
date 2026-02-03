import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StorageChoiceStep } from "@/components/onboarding/steps/storage-choice-step";
import { useOnboardingStore } from "@/stores/onboarding-store";

vi.mock("@/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn(() => "carbon mango velvet prism"),
}));

function renderInDialog(ui: React.ReactNode) {
  return render(
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>{ui}</DialogContent>
    </Dialog>
  );
}

describe("StorageChoiceStep", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      step: "storage-choice",
      storageMode: null,
      generatedPassphrase: "",
      confirmationInput: "",
      confirmationError: null,
    });
  });

  it("renders heading", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(
      screen.getByText(/where should we store/i)
    ).toBeInTheDocument();
  });

  it("renders browser storage warning", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(
      screen.getByText(/your data lives in this browser/i)
    ).toBeInTheDocument();
  });

  it("renders Local only option", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(screen.getByText(/local only/i)).toBeInTheDocument();
    expect(screen.getByText(/quick start, single device/i)).toBeInTheDocument();
  });

  it("renders Set up sync option", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(screen.getByText(/set up sync/i)).toBeInTheDocument();
    expect(screen.getByText(/access from any device/i)).toBeInTheDocument();
  });

  it("choosing Local only sets mode and goes to initializing", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(screen.getByRole("button", { name: /local only/i }));

    const state = useOnboardingStore.getState();
    expect(state.storageMode).toBe("local");
    expect(state.step).toBe("initializing");
    expect(state.generatedPassphrase).toBe("carbon mango velvet prism");
  });

  it("choosing Set up sync sets mode and goes to passphrase-display", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(screen.getByRole("button", { name: /set up sync/i }));

    const state = useOnboardingStore.getState();
    expect(state.storageMode).toBe("sync");
    expect(state.step).toBe("passphrase-display");
    expect(state.generatedPassphrase).toBe("carbon mango velvet prism");
  });
});
