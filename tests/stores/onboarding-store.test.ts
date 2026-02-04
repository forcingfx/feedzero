import { describe, it, expect, beforeEach, vi } from "vitest";
import { useOnboardingStore } from "../../src/stores/onboarding-store";

vi.mock("../../src/core/crypto/passphrase-generator", () => ({
  generatePassphrase: vi.fn(() => "carbon mango velvet prism"),
}));

describe("onboarding-store", () => {
  beforeEach(() => {
    useOnboardingStore.setState({
      step: "welcome",
      storageMode: null,
      generatedPassphrase: "",
      confirmationInput: "",
      confirmationError: null,
    });
  });

  describe("initial state", () => {
    it("starts at welcome step", () => {
      const state = useOnboardingStore.getState();
      expect(state.step).toBe("welcome");
    });

    it("has no storage mode selected initially", () => {
      const state = useOnboardingStore.getState();
      expect(state.storageMode).toBeNull();
    });

    it("has empty passphrase initially", () => {
      const state = useOnboardingStore.getState();
      expect(state.generatedPassphrase).toBe("");
    });

    it("has empty confirmation input initially", () => {
      const state = useOnboardingStore.getState();
      expect(state.confirmationInput).toBe("");
    });

    it("has no confirmation error initially", () => {
      const state = useOnboardingStore.getState();
      expect(state.confirmationError).toBeNull();
    });
  });

  describe("step navigation", () => {
    it("setStep updates current step", () => {
      useOnboardingStore.getState().setStep("storage-choice");
      expect(useOnboardingStore.getState().step).toBe("storage-choice");
    });
  });

  describe("storage mode selection", () => {
    it("chooseStorageMode('local') sets mode to local", () => {
      useOnboardingStore.getState().chooseStorageMode("local");
      expect(useOnboardingStore.getState().storageMode).toBe("local");
    });

    it("chooseStorageMode('local') generates a random passphrase", () => {
      useOnboardingStore.getState().chooseStorageMode("local");
      expect(useOnboardingStore.getState().generatedPassphrase).toBe(
        "carbon mango velvet prism",
      );
    });

    it("chooseStorageMode('local') goes to initializing step", () => {
      useOnboardingStore.getState().chooseStorageMode("local");
      expect(useOnboardingStore.getState().step).toBe("initializing");
    });

    it("chooseStorageMode('sync') sets mode to sync", () => {
      useOnboardingStore.getState().chooseStorageMode("sync");
      expect(useOnboardingStore.getState().storageMode).toBe("sync");
    });

    it("chooseStorageMode('sync') generates a passphrase", () => {
      useOnboardingStore.getState().chooseStorageMode("sync");
      expect(useOnboardingStore.getState().generatedPassphrase).toBe(
        "carbon mango velvet prism",
      );
    });

    it("chooseStorageMode('sync') goes to passphrase-display step", () => {
      useOnboardingStore.getState().chooseStorageMode("sync");
      expect(useOnboardingStore.getState().step).toBe("passphrase-display");
    });
  });

  describe("passphrase generation", () => {
    it("generateNewPassphrase creates a passphrase", () => {
      useOnboardingStore.getState().generateNewPassphrase();
      expect(useOnboardingStore.getState().generatedPassphrase).toBe(
        "carbon mango velvet prism",
      );
    });
  });

  describe("confirmation input", () => {
    it("setConfirmationInput updates the input value", () => {
      useOnboardingStore.getState().setConfirmationInput("test input");
      expect(useOnboardingStore.getState().confirmationInput).toBe(
        "test input",
      );
    });

    it("setConfirmationInput clears any existing error", () => {
      useOnboardingStore.setState({ confirmationError: "Previous error" });
      useOnboardingStore.getState().setConfirmationInput("new input");
      expect(useOnboardingStore.getState().confirmationError).toBeNull();
    });
  });

  describe("confirmation validation", () => {
    beforeEach(() => {
      useOnboardingStore.setState({
        generatedPassphrase: "carbon mango velvet prism",
      });
    });

    it("validateConfirmation returns true when input matches exactly", () => {
      useOnboardingStore.setState({
        confirmationInput: "carbon mango velvet prism",
      });
      const result = useOnboardingStore.getState().validateConfirmation();
      expect(result).toBe(true);
    });

    it("validateConfirmation returns true when input matches case-insensitively", () => {
      useOnboardingStore.setState({
        confirmationInput: "Carbon Mango Velvet Prism",
      });
      const result = useOnboardingStore.getState().validateConfirmation();
      expect(result).toBe(true);
    });

    it("validateConfirmation returns true when input has leading/trailing whitespace", () => {
      useOnboardingStore.setState({
        confirmationInput: "  carbon mango velvet prism  ",
      });
      const result = useOnboardingStore.getState().validateConfirmation();
      expect(result).toBe(true);
    });

    it("validateConfirmation returns false when input does not match", () => {
      useOnboardingStore.setState({
        confirmationInput: "wrong passphrase here now",
      });
      const result = useOnboardingStore.getState().validateConfirmation();
      expect(result).toBe(false);
    });

    it("validateConfirmation sets error when input does not match", () => {
      useOnboardingStore.setState({
        confirmationInput: "wrong passphrase here now",
      });
      useOnboardingStore.getState().validateConfirmation();
      expect(useOnboardingStore.getState().confirmationError).toBe(
        "That doesn't match. Try again.",
      );
    });

    it("validateConfirmation clears error when input matches", () => {
      useOnboardingStore.setState({
        confirmationInput: "carbon mango velvet prism",
        confirmationError: "Previous error",
      });
      useOnboardingStore.getState().validateConfirmation();
      expect(useOnboardingStore.getState().confirmationError).toBeNull();
    });
  });

  describe("reset", () => {
    it("reset restores initial state", () => {
      useOnboardingStore.setState({
        step: "passphrase-confirm",
        storageMode: "sync",
        generatedPassphrase: "some passphrase here now",
        confirmationInput: "some input",
        confirmationError: "Some error",
      });

      useOnboardingStore.getState().reset();

      const state = useOnboardingStore.getState();
      expect(state.step).toBe("welcome");
      expect(state.storageMode).toBeNull();
      expect(state.generatedPassphrase).toBe("");
      expect(state.confirmationInput).toBe("");
      expect(state.confirmationError).toBeNull();
    });
  });
});
