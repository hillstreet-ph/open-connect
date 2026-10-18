import { createBackend } from "./backend.mjs";
const backend = createBackend({
  root: Deno.env.get("SUPABASE_URL"),
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  background: (p) => EdgeRuntime.waitUntil(p),
});
Deno.serve(backend.worker);
