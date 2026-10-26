import { PlaywrightBrowser } from "@/components/playwright-browser";
/** Retain the helper's public props while using the same global browser surface. */
export function BrowserAgentChat(_props: {
  runId?: string | undefined;
  onSelectRun: (id: string | undefined) => void;
  onActiveChange?: (active: boolean) => void;
  savedPrompt?: string | undefined;
}) {
  return <PlaywrightBrowser />;
}
