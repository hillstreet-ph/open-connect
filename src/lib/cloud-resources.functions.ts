import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRole, type AppRole } from "@/lib/rbac";

type AuthContext = {
  userId: string;
  supabase: {
    from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
    rpc: (fn: string, args?: Record<string, unknown>) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
};

async function isAdmin(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error("Roles could not be checked");
  const roles = ((data ?? []) as Array<{ role: AppRole }>).map((row) => row.role);
  return hasRole(roles.length ? roles : ["user"], "admin");
}

async function requireAdmin(context: AuthContext) {
  if (!(await isAdmin(context)))
    throw new Error("Only admins and owners can create or change cloud resources.");
}

/** Reads the caller's own connected provider credential from the vault. */
async function providerCredential(userId: string, provider: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("app_connections")
    .select("credential_reference")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("status", "connected")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load the ${provider} connection.`);
  for (const row of rows ?? []) {
    const match = row.credential_reference?.match(/^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i);
    if (!match) continue;
    const { data } = await supabaseAdmin.rpc("resolve_connection_credential", {
      p_user_id: userId,
      p_credential_id: match[1]!,
    });
    if (typeof data !== "string" || !data) continue;
    try {
      const parsed = JSON.parse(data) as Record<string, unknown>;
      if (typeof parsed["credential"] === "string") return parsed["credential"].trim();
    } catch {
      // Plain token value.
    }
    return data.trim();
  }
  return null;
}

async function zeaburToken(userId: string) {
  const token =
    (await providerCredential(userId, "zeabur")) || process.env["ZEABUR_API_TOKEN"]?.trim();
  if (!token)
    throw new Error(
      "Zeabur is not connected. Add a Zeabur API token under Connectors (provider Zeabur), or set the ZEABUR_API_TOKEN server secret.",
    );
  return token;
}

async function twilioBundle(userId: string) {
  const bundle = await providerCredential(userId, "twilio");
  if (!bundle)
    throw new Error("Twilio is not connected. Connect Twilio under Connectors to add numbers.");
  return bundle;
}

const maxPerUser = () =>
  Math.min(Math.max(Number(process.env["CLOUD_COMPUTER_MAX_PER_USER"] ?? 1) || 1, 1), 5);

export const getCloudComputerSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const server = await import("@/lib/cloud-resources.server");
    const admin = await isAdmin(context as unknown as AuthContext);
    let token: string;
    try {
      token = await zeaburToken(context.userId);
    } catch (error) {
      return {
        configured: false as const,
        admin,
        error: error instanceof Error ? error.message : "Zeabur unavailable",
        plans: server.CLOUD_COMPUTER_PLANS,
        regions: [],
        computers: [],
        maxPerUser: maxPerUser(),
      };
    }
    const [regions, computers] = await Promise.all([
      server.listZeaburRegions(token),
      server.listCloudComputers(token, context.userId),
    ]);
    return {
      configured: true as const,
      admin,
      error: null,
      plans: server.CLOUD_COMPUTER_PLANS,
      regions,
      computers,
      maxPerUser: maxPerUser(),
    };
  });

export const createCloudComputer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      region: z.string().min(2).max(64),
      plan: z.enum(["standard", "advanced", "performance"]),
      timezone: z.string().max(64).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AuthContext);
    const server = await import("@/lib/cloud-resources.server");
    const token = await zeaburToken(context.userId);
    const computer = await server.createCloudComputer(token, context.userId, {
      region: data.region,
      timezone: data.timezone,
      maxPerUser: maxPerUser(),
    });
    // Desktop sign-in is stored encrypted in the caller's own vault, never returned twice.
    const { error } = await context.supabase.rpc("create_credential_item", {
      p_name: `Cloud Computer · ${computer.name}`,
      p_secret_type: "password",
      p_scopes: [],
      p_secret_value: computer.password,
      p_email_address: "",
      p_username: computer.username,
      p_website: computer.url,
      p_notes: `Zeabur service ${computer.id}. Plan: ${data.plan}.`,
      p_totp_secret: "",
    });
    return {
      id: computer.id,
      name: computer.name,
      url: computer.url,
      username: computer.username,
      password: computer.password,
      savedToVault: !error,
    };
  });

export const controlCloudComputer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().regex(/^[a-f0-9]{24}$/),
      action: z.enum(["restart", "suspend", "delete"]),
      confirm: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AuthContext);
    if (data.action === "delete" && !data.confirm)
      throw new Error("Confirm deletion: the desktop and its files are removed permanently.");
    const server = await import("@/lib/cloud-resources.server");
    return server.controlCloudComputer(
      await zeaburToken(context.userId),
      context.userId,
      data.id,
      data.action,
    );
  });

export const getCloudPhoneSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await isAdmin(context as unknown as AuthContext);
    const bundle = await providerCredential(context.userId, "twilio").catch(() => null);
    if (!bundle)
      return {
        configured: false as const,
        admin,
        numbers: [],
        error: "Twilio is not connected. Connect Twilio under Connectors to add numbers.",
      };
    const server = await import("@/lib/cloud-resources.server");
    try {
      return {
        configured: true as const,
        admin,
        numbers: await server.listOwnedPhoneNumbers(bundle),
        error: null,
      };
    } catch (error) {
      return {
        configured: true as const,
        admin,
        numbers: [],
        error: error instanceof Error ? error.message : "Twilio unavailable",
      };
    }
  });

export const searchCloudPhoneNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      country: z.string().regex(/^[A-Z]{2}$/),
      type: z.enum(["Local", "Mobile", "TollFree"]),
      contains: z.string().max(10).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const server = await import("@/lib/cloud-resources.server");
    return server.searchPhoneNumbers(await twilioBundle(context.userId), data);
  });

export const purchaseCloudPhoneNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      phoneNumber: z.string().regex(/^\+[1-9][0-9]{6,14}$/),
      confirm: z.literal(true),
    }),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context as unknown as AuthContext);
    const server = await import("@/lib/cloud-resources.server");
    return server.purchasePhoneNumber(await twilioBundle(context.userId), data.phoneNumber);
  });
