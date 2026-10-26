/** One engine, separate authenticated owner sessions. */
export const PLAYWRIGHT_TOOLS = new Set([
  "browser_navigate",
  "browser_navigate_back",
  "browser_snapshot",
  "browser_click",
  "browser_drag",
  "browser_hover",
  "browser_type",
  "browser_press_key",
  "browser_select_option",
  "browser_fill_form",
  "browser_handle_dialog",
  "browser_tabs",
  "browser_resize",
  "browser_take_screenshot",
  "browser_wait_for",
  "browser_console_messages",
  "browser_network_requests",
  "browser_close",
]);
export function assertPlaywrightTool(name: string) {
  if (!PLAYWRIGHT_TOOLS.has(name)) throw new Error("This tool is unavailable in Cloud Browser.");
}
export function retiredBrowserTool(name: string) {
  return (
    /^(?:cloud_browser_|browser_provider_|browser_verification_)/.test(name) &&
    name !== "cloud_browser_tools" &&
    name !== "cloud_browser_call" &&
    name !== "cloud_browser_cancel_task"
  );
}
