import { describe, expect, test } from "bun:test";
import { extractLiveViewUrls } from "./cloud-live-view";
import {
  EXECUTABLE_MCP_PROVIDERS,
  HOSTED_MCP_PRESETS,
  cloudKindsForProvider,
  isExecutableMcpProvider,
  isRemoteMcpProvider,
} from "./remote-mcp";

describe("extractLiveViewUrls", () => {
  test("finds viewer links inside MCP text content", () => {
    const result = {
      content: [
        {
          type: "text",
          text: JSON.stringify({ session_id: "s1", viewer_url: "https://view.example.com/s1" }),
        },
      ],
    };
    expect(extractLiveViewUrls(result)).toEqual(["https://view.example.com/s1"]);
  });

  test("ignores CDP websockets, insecure and credentialed links", () => {
    expect(
      extractLiveViewUrls({
        cdp_url: "wss://cdp.example.com/x",
        live_url: "http://insecure.example.com",
        stream_url: "https://user:pass@example.com",
      }),
    ).toEqual([]);
  });
});

describe("hosted MCP presets", () => {
  test("TinyFish is executable, browser-only and pinned to the vendor endpoint", () => {
    expect(isExecutableMcpProvider("custom_tinyfish_mcp")).toBe(true);
    expect(isRemoteMcpProvider("custom_tinyfish_mcp")).toBe(false);
    expect(cloudKindsForProvider("custom_tinyfish_mcp")).toEqual(["browser"]);
    expect(HOSTED_MCP_PRESETS.custom_tinyfish_mcp.endpoint).toBe("https://agent.tinyfish.ai/mcp");
    expect(EXECUTABLE_MCP_PROVIDERS).toContain("custom_mcp");
  });

  test("brokered Zeabur and Open custom providers are executable, unknown ones stay non-executable", () => {
    expect(isExecutableMcpProvider("custom_zeabur")).toBe(true);
    expect(isExecutableMcpProvider("custom_zeabur_mcp")).toBe(true);
    expect(isExecutableMcpProvider("custom_zeabur_bridge")).toBe(true);
    expect(isExecutableMcpProvider("custom_open_teleset")).toBe(true);
    expect(isExecutableMcpProvider("custom_unknown_thing")).toBe(false);
    expect(cloudKindsForProvider("custom_mcp")).toHaveLength(4);
  });
});

test("native browser previews reject arbitrary or insecure iframe origins", async () => {
  const { browserPreviewUrl } = await import("./cloud-live-view");
  expect(browserPreviewUrl("https://stream.tinyfish.io/stream/0")).toBe(
    "https://stream.tinyfish.io/stream/0",
  );
  for (const value of [
    "javascript:alert(1)",
    "https://tinyfish.io.evil.test",
    "http://stream.tinyfish.io",
    "https://user:secret@stream.tinyfish.io",
  ])
    expect(browserPreviewUrl(value)).toBeNull();
});
