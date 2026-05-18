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

  describe("channel surfaces (issue #102)", () => {
    it("links out to the public GitHub issues page", () => {
      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      const link = screen.getByRole("link", { name: /browse on github/i });
      expect(link.getAttribute("href")).toBe(
        "https://github.com/forcingfx/feedzero/issues",
      );
      expect(link.getAttribute("target")).toBe("_blank");
    });

    it("exposes a mailto link to support", () => {
      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      const link = screen.getByRole("link", { name: /email support/i });
      expect(link.getAttribute("href")).toBe("mailto:support@feedzero.app");
    });

    it("warns that a provided email becomes visible on the public GitHub issue", () => {
      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      expect(
        screen.getByText(/email will be visible on the public github issue/i),
      ).toBeInTheDocument();
    });
  });

  describe("submission payload", () => {
    it("submits message-only when no email is provided", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      await userEvent.type(
        screen.getByPlaceholderText("What's on your mind?"),
        "I love this app",
      );
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ message: "I love this app" }),
        }),
      );
    });

    it("includes the email in the payload when the user provides one", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      await userEvent.type(
        screen.getByPlaceholderText("What's on your mind?"),
        "Found a bug",
      );
      await userEvent.type(
        screen.getByLabelText(/email/i),
        "alice@example.com",
      );
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            message: "Found a bug",
            email: "alice@example.com",
          }),
        }),
      );
    });

    it("trims whitespace from the email before sending", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      await userEvent.type(
        screen.getByPlaceholderText("What's on your mind?"),
        "hello",
      );
      await userEvent.type(
        screen.getByLabelText(/email/i),
        "  bob@example.com  ",
      );
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({
          body: JSON.stringify({
            message: "hello",
            email: "bob@example.com",
          }),
        }),
      );
    });

    it("omits the email key entirely when only whitespace is entered", async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<FeedbackDialog open={true} onOpenChange={vi.fn()} />);
      await userEvent.type(
        screen.getByPlaceholderText("What's on your mind?"),
        "hello",
      );
      await userEvent.type(screen.getByLabelText(/email/i), "   ");
      await userEvent.click(screen.getByRole("button", { name: /send/i }));

      // No email field in the body — server should treat as anonymous.
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/feedback",
        expect.objectContaining({
          body: JSON.stringify({ message: "hello" }),
        }),
      );
    });
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
