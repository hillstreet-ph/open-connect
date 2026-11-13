import { createClient } from "@supabase/supabase-js";
import {
  PLATFORM_SUPABASE_URL,
  PLATFORM_SUPABASE_PUBLIC_KEY,
} from "@/integrations/supabase/public-config";
export function oauthDatabase() {
  return createClient(PLATFORM_SUPABASE_URL, PLATFORM_SUPABASE_PUBLIC_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
