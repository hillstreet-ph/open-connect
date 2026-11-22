// Read-only Supabase access for the E2E bootstrap endpoint.
// The control plane can not rely on the admin SDK when the Supabase data
// plane is returning HTTP 402, but the Supabase Management API read-only
// endpoint works with the project service-role key without triggering the
// storage/quota restriction.
import type { Database } from "../integrations/supabase/types";

const MANAGEMENT_API = "https://api.supabase.com/v1/projects";

export interface ReadonlyRows {
  rows?: Array<Record<string, unknown>>;
  error?: string;
}

const READONLY_COLUMNS = [
  "id",
  "user_id",
  "project_id",
  "title",
  "content",
  "memory_type",
  "importance",
  "pinned",
  "tags",
  "expires_at",
  "created_at",
  "updated_at",
  "source_type",
  "source_url",
  "mime_type",
  "status",
  "source",
  "license",
  "verified",
  "published",
].join(", ");

export async function fetchSupabaseReadonlyRows(
  table: string,
  limit = 1000,
): Promise<ReadonlyRows> {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return { error: "Missing SUPABASE_URL" };
  }

  const match = supabaseUrl.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  const projectRef = match?.[1];
  if (!projectRef) {
    return { error: "Could not parse Supabase project ref from SUPABASE_URL" };
  }

  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token) {
    return { error: "Missing SUPABASE_SERVICE_ROLE_KEY" };
  }

  const query = `SELECT ${READONLY_COLUMNS} FROM public."${table}" LIMIT ${limit}`;

  try {
    const response = await fetch(`${MANAGEMENT_API}/${projectRef}/database/query/read-only`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      return {
        error: `Management API ${response.status} when querying ${table}: ${body}`,
      };
    }

    const payload = (await response.json()) as
      Array<Record<string, unknown>> | Record<string, unknown>;
    const rows = (Array.isArray(payload) || payload.rows) ?? payload.results ?? payload.data ?? [];
    return { rows };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
