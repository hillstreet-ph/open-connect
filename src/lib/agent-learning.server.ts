import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLearningRecord, redactEvidence } from "./autonomous-control.ts";
import { redactContext } from "./agent-team.ts";
function redactStrings(value: unknown): unknown {
  if (typeof value === "string") return redactContext(value);
  if (Array.isArray(value)) return value.map(redactStrings);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactStrings(item)]),
    );
  return value;
}
export function learningId(value: string) {
  const h = createHash("sha256").update(value).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/** Retry-safe owned learning. Frequency prepares drafts, never approval or publication. */
export async function saveRunLearning(
  db: SupabaseClient,
  input: {
    userId: string;
    runId: string;
    goal: string;
    status: "succeeded" | "failed" | "blocked";
    summary: string;
    capabilitySlugs: string[];
    evidence: unknown;
    createDraft: boolean;
  },
) {
  // New control tables are deployed but not yet represented in generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const store = db as any;
  const slugs = [...new Set(input.capabilitySlugs)].sort();
  const learning = buildLearningRecord({
    goal: redactContext(input.goal),
    status: input.status,
    summary: redactContext(input.summary),
    capabilitySlugs: slugs,
    evidence: redactStrings(input.evidence),
  });
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([input.userId, slugs]))
    .digest("hex");
  const evidence = {
    ...(learning.evidence &&
    typeof learning.evidence === "object" &&
    !Array.isArray(learning.evidence)
      ? learning.evidence
      : {}),
    learning_key: fingerprint,
  };
  const checked = async (result: PromiseLike<{ error: unknown }>, message: string) => {
    if ((await result).error) throw new Error(message);
  };
  await checked(
    store.from("autonomous_run_events").upsert(
      {
        id: learningId(`event:${input.userId}:${input.runId}:${input.status}`),
        user_id: input.userId,
        run_id: input.runId,
        event_type: input.status === "succeeded" ? "learned" : input.status,
        summary: learning.content,
        capability_slugs: slugs,
        evidence: redactEvidence(evidence),
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    "Run event could not be saved.",
  );
  await checked(
    db.from("memory_records").upsert(
      {
        id: learningId(`memory:${input.userId}:${input.runId}:${input.status}`),
        user_id: input.userId,
        title: learning.title,
        content: learning.content,
        memory_type: learning.memoryType as "summary" | "decision",
        importance: learning.importance,
        tags: learning.tags,
        metadata: {
          run_id: input.runId,
          source: "verified-run",
          evidence: redactEvidence(evidence) as never,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    ),
    "Run memory could not be saved.",
  );
  let knowledgePromoted = false;
  let draftId: string | null = null;
  if (input.status === "succeeded" && slugs.length) {
    const countResult = await store
      .from("autonomous_run_events")
      .select("id", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .eq("event_type", "learned")
      .eq("evidence->>learning_key", fingerprint);
    if (countResult.error) throw new Error("Learning frequency could not be verified.");
    if ((countResult.count ?? 0) >= 3) {
      const knowledgeId = learningId(`knowledge:${fingerprint}`);
      await checked(
        db.from("knowledge_items").upsert(
          {
            id: knowledgeId,
            user_id: input.userId,
            title: `Reusable procedure: ${slugs.join(", ")}`.slice(0, 240),
            content: learning.content,
            source_type: "api",
            status: "ready",
            tags: ["verified-procedure", ...slugs].slice(0, 20),
            metadata: { promoted_from_run: input.runId, verified_successes: countResult.count },
          },
          { onConflict: "id", ignoreDuplicates: true },
        ),
        "Reusable knowledge could not be saved.",
      );
      knowledgePromoted = true;
      if (input.createDraft) {
        draftId = learningId(`draft:${fingerprint}`);
        await checked(
          db.from("resources").upsert(
            {
              id: draftId,
              owner_id: input.userId,
              slug: `learned-${fingerprint.slice(0, 24)}`,
              name: `Reusable workflow: ${slugs.join(", ")}`.slice(0, 200),
              description: learning.content.slice(0, 1000),
              resource_type: "prompt",
              source: "user-upload",
              version: "0.1.0",
              installation_type: "prompt",
              installation_config: {
                prompt: learning.content,
                source_knowledge_id: knowledgeId,
                review_state: "pending_security_review",
                executable: false,
              },
              published: false,
              verified: false,
              featured: false,
              supported_clients: ["chatgpt", "claude", "codex", "custom"],
            },
            { onConflict: "id", ignoreDuplicates: true },
          ),
          "Private Studio draft could not be saved.",
        );
      }
    }
  }
  await checked(
    store
      .from("autonomous_runs")
      .update({
        state: input.status === "succeeded" ? "succeeded" : "failed",
        evidence: learning.evidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.runId)
      .eq("user_id", input.userId),
    "Run state could not be saved.",
  );
  return {
    memory_saved: true,
    knowledge_promoted: knowledgePromoted,
    studio_draft_id: draftId,
    published: false,
    verified: false,
    values_exposed: false,
  };
}
