import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { RecoveryStep } from "@/components/onboarding/steps/recovery-step";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { useAppStore } from "@/stores/app-store";

// Mock the db module
vi.mock("@/core/storage/db", () => ({
  open: vi.fn(),
}));

import { open } from "@/core/storage/db";

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });

function renderInDialog(ui: React.ReactNode) {
  return render(
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent>{ui}</DialogContent>
    </Dialog>,
  );
}

describe("RecoveryStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.setState({
      step: "recovery",
      storageMode: null,
      generatedPassphrase: "",
      confirmationInput: "",
      confirmationError: null,
    });
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
    });
  });

  it("renders heading", () => {
    renderInDialog(<RecoveryStep />);
    expect(screen.getByText(/enter your recovery key/i)).toBeInTheDocument();
  });

  it("renders passphrase input", () => {
    renderInDialog(<RecoveryStep />);
    expect(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
    ).toBeInTheDocument();
  });

  it("renders Recover button that is disabled when input is empty", () => {
    renderInDialog(<RecoveryStep />);
    const button = screen.getByRole("button", { name: /recover/i });
    expect(button).toBeDisabled();
  });

  it("enables Recover button when passphrase is entered", async () => {
    const user = userEvent.setup();
    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "carbon mango velvet prism",
    );

    const button = screen.getByRole("button", { name: /recover/i });
    expect(button).toBeEnabled();
  });

  it("shows error when passphrase is invalid", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue({
      ok: false,
      error: "Invalid passphrase",
    });

    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "wrong passphrase here now",
    );
    await user.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(screen.getByText(/could not open database/i)).toBeInTheDocument();
    });
  });

  it("completes onboarding when passphrase is valid", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue({ ok: true, value: true });

    renderInDialog(<RecoveryStep />);

    await user.type(
      screen.getByPlaceholderText(/enter your 4-word passphrase/i),
      "carbon mango velvet prism",
    );
    await user.click(screen.getByRole("button", { name: /recover/i }));

    await waitFor(() => {
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });
  });

  it("renders Back button that returns to storage-choice", async () => {
    const user = userEvent.setup();
    renderInDialog(<RecoveryStep />);

    await user.click(screen.getByRole("button", { name: /back/i }));

    expect(useOnboardingStore.getState().step).toBe("storage-choice");
  });
});
