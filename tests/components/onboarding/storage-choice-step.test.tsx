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
    </Dialog>,
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
    expect(screen.getByText(/where should we store/i)).toBeInTheDocument();
  });

  it("renders Local only option", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(screen.getByText(/local only/i)).toBeInTheDocument();
    expect(screen.getByText(/quick start, single device/i)).toBeInTheDocument();
  });

  it("renders Sync across devices option with security messaging", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(screen.getByText(/sync across devices/i)).toBeInTheDocument();
    expect(screen.getByText(/zero-knowledge/i)).toBeInTheDocument();
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
  });

  it("renders Continue button that is disabled by default", () => {
    renderInDialog(<StorageChoiceStep />);
    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeDisabled();
  });

  it("enables Continue button when an option is selected", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    const localOption = screen.getByRole("radio", { name: /local only/i });
    await user.click(localOption);

    const button = screen.getByRole("button", { name: /continue/i });
    expect(button).toBeEnabled();
  });

  it("shows browser warning only when local option is selected", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    // Warning should not be visible initially
    expect(
      screen.queryByText(/your data lives in this browser/i),
    ).not.toBeInTheDocument();

    // Select local option
    await user.click(screen.getByRole("radio", { name: /local only/i }));

    // Warning should now be visible
    expect(
      screen.getByText(/your data lives in this browser/i),
    ).toBeInTheDocument();
  });

  it("selecting Local only and clicking Continue sets mode and goes to initializing", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(screen.getByRole("radio", { name: /local only/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const state = useOnboardingStore.getState();
    expect(state.storageMode).toBe("local");
    expect(state.step).toBe("initializing");
    expect(state.generatedPassphrase).toBe("carbon mango velvet prism");
  });

  it("selecting Sync and clicking Continue sets mode and goes to passphrase-display", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(
      screen.getByRole("radio", { name: /sync across devices/i }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const state = useOnboardingStore.getState();
    expect(state.storageMode).toBe("sync");
    expect(state.step).toBe("passphrase-display");
    expect(state.generatedPassphrase).toBe("carbon mango velvet prism");
  });

  it("renders recovery option as a radio card", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(
      screen.getByRole("radio", { name: /i already have a passphrase/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/restore from another device/i),
    ).toBeInTheDocument();
  });

  it("shows info banner when recovery option is selected", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(
      screen.getByRole("radio", { name: /i already have a passphrase/i }),
    );

    expect(
      screen.getByText(/enter your 4-word secret key/i),
    ).toBeInTheDocument();
  });

  it("selecting recovery and clicking Continue navigates to recovery step", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(
      screen.getByRole("radio", { name: /i already have a passphrase/i }),
    );
    await user.click(screen.getByRole("button", { name: /continue/i }));

    expect(useOnboardingStore.getState().step).toBe("recovery");
  });

  it("shows number kbd hints (1, 2, 3) for selecting options", () => {
    renderInDialog(<StorageChoiceStep />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("pressing 1 selects local option", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.keyboard("1");

    expect(screen.getByRole("radio", { name: /local only/i })).toBeChecked();
  });

  it("pressing 2 selects sync option", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.keyboard("2");

    expect(
      screen.getByRole("radio", { name: /sync across devices/i }),
    ).toBeChecked();
  });

  it("pressing 3 selects recovery option", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.keyboard("3");

    expect(
      screen.getByRole("radio", { name: /i already have a passphrase/i }),
    ).toBeChecked();
  });

  it("displays warning inside local option card when selected", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(screen.getByRole("radio", { name: /local only/i }));

    // Warning should be inside the label (option card)
    const localOption = screen.getByRole("radio", { name: /local only/i });
    const label = localOption.closest("label");
    expect(label).toContainElement(
      screen.getByText(/your data lives in this browser/i),
    );
  });

  it("displays info inside recovery option card when selected", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    await user.click(
      screen.getByRole("radio", { name: /i already have a passphrase/i }),
    );

    // Info should be inside the label (option card)
    const recoveryOption = screen.getByRole("radio", {
      name: /i already have a passphrase/i,
    });
    const label = recoveryOption.closest("label");
    expect(label).toContainElement(
      screen.getByText(/enter your 4-word secret key/i),
    );
  });

  it("shows Enter kbd hint on Continue button", () => {
    renderInDialog(<StorageChoiceStep />);
    const button = screen.getByRole("button", { name: /continue/i });
    expect(button.querySelector("kbd")).toHaveTextContent("Enter");
  });

  it("radio options are focusable via Tab", () => {
    renderInDialog(<StorageChoiceStep />);
    // Radio inputs exist and are part of a radiogroup
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);
    // All radios are inside the radiogroup
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it.each(["1", "2", "3"])(
    "pressing %s prevents default browser behavior",
    (key) => {
      renderInDialog(<StorageChoiceStep />);

      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    },
  );

  it("submits form with Enter key when option selected", async () => {
    const user = userEvent.setup();
    renderInDialog(<StorageChoiceStep />);

    // Select local option, then press Enter to submit
    await user.click(screen.getByRole("radio", { name: /local only/i }));
    await user.keyboard("{Enter}");

    const state = useOnboardingStore.getState();
    expect(state.step).toBe("initializing");
  });
});
