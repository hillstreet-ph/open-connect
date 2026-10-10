/** Runtime-only virtual module supplied by Cloudflare Pages/Workers. */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
