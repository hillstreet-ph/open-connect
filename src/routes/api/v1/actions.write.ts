import { createFileRoute } from "@tanstack/react-router";
import { chatGptActionOptions, forwardChatGptAction } from "@/lib/chatgpt-action.server";

export const Route = createFileRoute("/api/v1/actions/write")({
  server: {
    handlers: {
      OPTIONS: async () => chatGptActionOptions(),
      POST: async ({ request }) => forwardChatGptAction(request, "write"),
    },
  },
});
