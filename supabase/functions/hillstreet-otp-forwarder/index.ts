import twilio from "npm:twilio@5.10.3";
import { createIngress } from "./platform.mjs";
import { createBackend } from "./backend.mjs";
const backend = createBackend({
  root: Deno.env.get("SUPABASE_URL"),
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  validate: twilio.validateRequest,
  background: (promise) => EdgeRuntime.waitUntil(promise),
});
Deno.serve(createIngress(backend.ingress));
