/** Reject runs that cannot dispatch instead of recording a false success. */
export function assertAutomationRunnable(automation: { enabled: boolean; action_type: string }) {
  if (!automation.enabled) throw new Error("Enable this automation before running it.");
  if (!["agent", "pipeline"].includes(automation.action_type)) {
    throw new Error(`The ${automation.action_type} executor is not configured. No action was run.`);
  }
}
