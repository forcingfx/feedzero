import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog.tsx";

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToast.success(...args),
    error: (...args: unknown[]) => mockToast.error(...args),
  },
  Toaster: () => null,
}));

describe("FeedbackDialog", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockToast.success.mockReset();
    mockToast.error.mockReset();
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits the message to /api/feedback as JSON POST", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const onOpenChange = vi.fn();
    render(<FeedbackDialog open={true} onOpenChange={onOpenChange} />);

    const textarea = screen.getByPlaceholderText("What's on your mind?");
    await userEvent.type(textarea, "I love this app");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/feedback",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ message: "I love this app" }),
      }),
    );
  });

  it("shows success toast and closes the dialog when submission succeeds", async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const onOpenChange = vi.fn();
    render(<FeedbackDialog open={true} onOpenChange={onOpenChange} />);

    await userEvent.type(
      screen.getByPlaceholderText("What's on your mind?"),
      "great",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await vi.waitFor(() => {
      expect(mockToast.success).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("surfaces server-provided error messages on failure", async () => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "Feedback is not configured" }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

    await userEvent.type(
      screen.getByPlaceholderText("What's on your mind?"),
      "hello",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Feedback is not configured");
    });
  });

  it("falls back to a connection error toast when fetch throws", async () => {
    mockFetch.mockRejectedValue(new TypeError("network down"));

    render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

    await userEvent.type(
      screen.getByPlaceholderText("What's on your mind?"),
      "hello",
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await vi.waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(
        expect.stringMatching(/connection/i),
      );
    });
  });

  it("does not submit empty/whitespace-only messages", async () => {
    render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

    await userEvent.type(
      screen.getByPlaceholderText("What's on your mind?"),
      "   ",
    );

    // Submit button should be disabled for whitespace-only.
    const button = screen.getByRole("button", { name: /send/i });
    expect(button).toBeDisabled();

    // Even if the user attempts to submit via Enter or other path,
    // no fetch should fire.
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe("keyboard submit (GitLab #13)", () => {
    it("submits on Cmd+Enter inside the textarea", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

      const textarea = screen.getByPlaceholderText("What's on your mind?");
      await userEvent.type(textarea, "shipped via Cmd+Enter");
      await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "shipped via Cmd+Enter" }),
        }),
      );
    });

    it("submits on Ctrl+Enter inside the textarea", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

      const textarea = screen.getByPlaceholderText("What's on your mind?");
      await userEvent.type(textarea, "shipped via Ctrl+Enter");
      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "shipped via Ctrl+Enter" }),
        }),
      );
    });

    it("does not submit on plain Enter (newline only)", async () => {
      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

      const textarea = screen.getByPlaceholderText("What's on your mind?");
      await userEvent.type(textarea, "first line");
      await userEvent.keyboard("{Enter}");
      await userEvent.type(textarea, "second line");

      expect(mockFetch).not.toHaveBeenCalled();
      expect((textarea as HTMLTextAreaElement).value).toBe(
        "first line\nsecond line",
      );
    });

    it("does not submit on Cmd+Enter with empty/whitespace message", async () => {
      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);

      const textarea = screen.getByPlaceholderText("What's on your mind?");
      await userEvent.type(textarea, "   ");
      await userEvent.keyboard("{Meta>}{Enter}{/Meta}");

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
