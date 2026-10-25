import {
  describeAgentHelperToolResult,
  AGENT_HELPER_WRITE_TOOLS,
  parseAgentHelperArguments,
  type AgentHelperToolCall,
  type AgentHelperToolName,
} from "./agent-helper-policy.ts";

const READS = new Set([
  "search_saved_context",
  "inspect_helper_capabilities",
  "list_connectors",
  "search_marketplace",
  "list_projects",
  "list_tasks",
  "list_schedules",
  "list_automations",
]);
const WRITES = AGENT_HELPER_WRITE_TOOLS;
type Reply = {
  message?: Record<string, unknown> | undefined;
  content: string;
  toolCalls: AgentHelperToolCall[];
};

/** Bounded lookups followed by at most one write. Never retry a completed action. */
export async function runAgentHelper(options: {
  first: Reply;
  messages: Record<string, unknown>[];
  requestNext: (messages: Record<string, unknown>[], includeTools: boolean) => Promise<Reply>;
  execute: (
    name: AgentHelperToolName,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
}) {
  let reply = options.first;
  const messages = [...options.messages];
  let action: { name: AgentHelperToolName; result: Record<string, unknown> } | null = null;
  let wrote = false;
  const fallback = () => ({
    reply: action
      ? describeAgentHelperToolResult(action.name, action.result)
      : "I couldn't complete that request. Please ask for one internal action at a time.",
    action,
  });
  for (let step = 0; step <= 4; step++) {
    if (!reply.toolCalls.length)
      return reply.content ? { reply: reply.content.slice(0, 5000), action } : fallback();
    if (step === 4 || wrote || reply.toolCalls.length !== 1) return fallback();
    const call = reply.toolCalls[0]!;
    const name = call?.function?.name as AgentHelperToolName;
    if (!READS.has(name) && !WRITES.has(name)) return fallback();
    let result: Record<string, unknown>;
    try {
      result = await options.execute(name, parseAgentHelperArguments(call.function.arguments));
    } catch (error) {
      result = {
        error:
          error instanceof Error &&
          /required|too long|valid|cron|timezone|project|priority|Marketplace|schedule/i.test(
            error.message,
          )
            ? error.message
            : "This action did not complete because of an access or system validation error.",
      };
    }
    action = { name, result };
    // A model must never turn a failed or ambiguous action into a success claim.
    if (result["error"]) return fallback();
    // Even a failed write consumes this turn's write allowance.
    wrote = WRITES.has(name);
    // A completed write is reported from its receipt, never rewritten by a model.
    if (wrote) return fallback();
    messages.push(reply.message ?? { role: "assistant", tool_calls: [call] }, {
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result),
    });
    try {
      reply = await options.requestNext(messages, !wrote && !result["error"] && step < 3);
    } catch {
      return fallback();
    }
    if (result["error"] && reply.toolCalls.length) return fallback();
  }
  return fallback();
}
