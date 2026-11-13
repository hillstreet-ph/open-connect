import { createFileRoute } from "@tanstack/react-router";
import { CopilotChatPage } from "@/components/agent-helper";

function CopilotPage() {
  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-[32rem] w-full flex-col p-4">
      <CopilotChatPage />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/copilot")({
  head: () => ({
    meta: [{ title: "Copilot — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: CopilotPage,
});
