import { createFileRoute } from "@tanstack/react-router";
import { CloudPhoneNumbers } from "@/components/cloud-phone-numbers";
import { CloudWorkspacePage } from "@/components/cloud-workspace-page";

export const Route = createFileRoute("/_authenticated/cloud-phone")({
  head: () => ({
    meta: [{ title: "Cloud Phone — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: () => (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-6">
      <CloudPhoneNumbers />
      <CloudWorkspacePage kind="phone" embedded />
    </div>
  ),
});
