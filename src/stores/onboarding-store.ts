import { create } from "zustand";
import { generatePassphrase } from "../core/crypto/passphrase-generator";

type OnboardingStep =
  | "welcome"
  | "storage-choice"
  | "passphrase-display"
  | "passphrase-confirm"
  | "initializing";

type StorageMode = "local" | "sync";

interface OnboardingStore {
  step: OnboardingStep;
  storageMode: StorageMode | null;
  generatedPassphrase: string;
  confirmationInput: string;
  confirmationError: string | null;

  setStep: (step: OnboardingStep) => void;
  chooseStorageMode: (mode: StorageMode) => void;
  generateNewPassphrase: () => void;
  setConfirmationInput: (value: string) => void;
  validateConfirmation: () => boolean;
  reset: () => void;
}

const initialState = {
  step: "welcome" as OnboardingStep,
  storageMode: null as StorageMode | null,
  generatedPassphrase: "",
  confirmationInput: "",
  confirmationError: null as string | null,
};

export const useOnboardingStore = create<OnboardingStore>((set, get) => ({
  ...initialState,

  setStep: (step) => set({ step }),

  chooseStorageMode: (mode) => {
    const passphrase = generatePassphrase();
    if (mode === "local") {
      set({
        storageMode: mode,
        generatedPassphrase: passphrase,
        step: "initializing",
      });
    } else {
      set({
        storageMode: mode,
        generatedPassphrase: passphrase,
        step: "passphrase-display",
      });
    }
  },

  generateNewPassphrase: () => {
    set({ generatedPassphrase: generatePassphrase() });
  },

  setConfirmationInput: (value) => {
    set({ confirmationInput: value, confirmationError: null });
  },

  validateConfirmation: () => {
    const { generatedPassphrase, confirmationInput } = get();
    const normalizedGenerated = generatedPassphrase.toLowerCase().trim();
    const normalizedInput = confirmationInput.toLowerCase().trim();

    if (normalizedGenerated === normalizedInput) {
      set({ confirmationError: null });
      return true;
    } else {
      set({ confirmationError: "That doesn't match. Try again." });
      return false;
    }
  },

  reset: () => set(initialState),
}));
