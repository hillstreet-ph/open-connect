# Autonomous agent loop

Open-Connect uses one governed loop for ChatGPT, Open-System, TinyFish-compatible browser agents,
plugins, skills, MCP servers, and developer tools.

## Flow

1. `recommend_toolchain` ranks published capabilities against the goal.
2. `resolve_capability` confirms the smallest approved match.
3. `plan_goal` classifies risk and builds a bounded plan.
4. `execute_plan` records the plan and requests approval for protected work.
5. If nothing matches, Open-Connect creates a non-executable capability draft with the contracts,
   credential reference, health probe, approval policy, and tests that a future implementation needs.
6. The executor runs only installed capabilities through scoped connections and the credential broker.
7. `record_run_outcome` stores redacted evidence and working memory. Three verified successes for the
   same capability set promote the procedure into durable knowledge.

## Safety boundary

- Missing capabilities become specifications, not automatically executed code.
- Self-improvement changes rankings, memory, knowledge, and queued repair work. It does not rewrite
  production code, permissions, credentials, DNS, billing, or authorization policy by itself.
- Login, MFA, CAPTCHA, payment, public posting, exports, destructive actions, and production
  promotion retain their approval gates.
- Agents receive capability handles and `credential://` references. They never receive vault
  exports or provider master credentials.

## MCP calls

```json
{ "name": "recommend_toolchain", "arguments": { "goal": "extract product data with TinyFish" } }
```

```json
{
  "name": "execute_plan",
  "arguments": { "goal": "extract product data with TinyFish", "environment": "development" }
}
```

After the executor verifies the result:

```json
{
  "name": "record_run_outcome",
  "arguments": {
    "correlation_id": "run-correlation-id",
    "status": "succeeded",
    "summary": "Extraction completed and schema validation passed.",
    "capability_slugs": ["tinyfish-agent-browser"],
    "evidence": { "schema_valid": true, "record_count": 42 }
  }
}
```

## Operational requirement

The published TinyFish resource is connector-compatible metadata. It becomes live only after the
corresponding provider connection passes its health check and the credential broker can resolve
`credential://tinyfish/browser-agent` without revealing the value.
