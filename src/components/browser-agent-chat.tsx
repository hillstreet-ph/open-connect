import { PlaywrightBrowser } from "@/components/playwright-browser";
/** Retain the helper's public props while using the same global browser surface. */
export function BrowserAgentChat(props: {
  runId?: string | undefined;
  onSelectRun: (id: string | undefined) => void;
  onActiveChange?: (active: boolean) => void;
  savedPrompt?: string | undefined;
}) {
  return (
    <PlaywrightBrowser
      initialGoal={props.savedPrompt}
      onActiveChange={props.onActiveChange}
      onTaskComplete={() => props.onSelectRun(undefined)}
    />
  );
}
