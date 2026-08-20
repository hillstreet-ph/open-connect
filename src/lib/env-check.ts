/** Browser-safe env presence flags (values never logged). */
export function clientEnvStatus() {
  return {
    supabaseUrl: Boolean(import.meta.env.VITE_SUPABASE_URL),
    supabaseKey: Boolean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    appUrl: Boolean(import.meta.env.VITE_APP_URL),
  };
}
