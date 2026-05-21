import { describe, it, expect } from "vitest";
import { handleMessage } from "../../extension/src/handlers.ts";

describe("extension/handlers", () => {
  describe("handleMessage", () => {
    it("responds to a valid ping with the extension version", () => {
      const response = handleMessage(
        {
          type: "feedzero/ping",
          requestId: "abc-123",
          protocolVersion: 1,
        },
        { extensionVersion: "0.1.0" },
      );
      expect(response).toEqual({
        type: "feedzero/ping-response",
        requestId: "abc-123",
        extensionVersion: "0.1.0",
      });
    });

    it("returns null for non-FeedZero messages", () => {
      const response = handleMessage(
        { type: "other/thing", requestId: "x", protocolVersion: 1 },
        { extensionVersion: "0.1.0" },
      );
      expect(response).toBeNull();
    });

    it("returns null for response-typed messages (avoids echo loops)", () => {
      const response = handleMessage(
        {
          type: "feedzero/ping-response",
          requestId: "abc",
          extensionVersion: "0.1.0",
        },
        { extensionVersion: "0.1.0" },
      );
      expect(response).toBeNull();
    });

    it("returns null for messages with the wrong protocol version", () => {
      const response = handleMessage(
        { type: "feedzero/ping", requestId: "x", protocolVersion: 999 },
        { extensionVersion: "0.1.0" },
      );
      expect(response).toBeNull();
    });

    it("returns null for malformed messages", () => {
      expect(handleMessage(null, { extensionVersion: "0.1.0" })).toBeNull();
      expect(handleMessage(undefined, { extensionVersion: "0.1.0" })).toBeNull();
      expect(handleMessage("ping", { extensionVersion: "0.1.0" })).toBeNull();
      expect(handleMessage({}, { extensionVersion: "0.1.0" })).toBeNull();
      expect(
        handleMessage(
          { type: "feedzero/ping" },
          { extensionVersion: "0.1.0" },
        ),
      ).toBeNull();
    });

    it("echoes the requestId on the response (caller correlation)", () => {
      const response = handleMessage(
        {
          type: "feedzero/ping",
          requestId: "unique-id-42",
          protocolVersion: 1,
        },
        { extensionVersion: "0.1.0" },
      );
      expect(response?.requestId).toBe("unique-id-42");
    });
  });
});
