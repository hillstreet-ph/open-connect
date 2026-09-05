/**
 * Official brand marks via Simple Icons (https://simpleicons.org).
 * Used for connections, models, and AI client integrations.
 * SVG icons are the public brand assets maintained for each product mark.
 */
const SI = "https://cdn.jsdelivr.net/npm/simple-icons@v13/icons";

export type BrandKey =
  | "github"
  | "gitlab"
  | "linear"
  | "jira"
  | "telegram"
  | "slack"
  | "discord"
  | "gmail"
  | "google"
  | "google_drive"
  | "google_calendar"
  | "chatgpt"
  | "openai"
  | "claude"
  | "anthropic"
  | "grok"
  | "xai"
  | "hermes"
  | "openrouter"
  | "notion"
  | "cloudflare"
  | "supabase"
  | "stripe"
  | "hubspot"
  | "airtable"
  | "openwebui"
  | "cursor"
  | "azure"
  | "groq"
  | "ollama";

/** Map internal provider id → Simple Icons slug */
const ICON_SLUG: Record<string, string> = {
  github: "github",
  gitlab: "gitlab",
  linear: "linear",
  jira: "jira",
  telegram: "telegram",
  slack: "slack",
  discord: "discord",
  gmail: "gmail",
  google: "google",
  google_drive: "googledrive",
  google_calendar: "googlecalendar",
  chatgpt: "openai",
  openai: "openai",
  claude: "anthropic",
  anthropic: "anthropic",
  grok: "x",
  xai: "x",
  hermes: "openai",
  openrouter: "openrouter",
  notion: "notion",
  cloudflare: "cloudflare",
  supabase: "supabase",
  stripe: "stripe",
  hubspot: "hubspot",
  airtable: "airtable",
  openwebui: "ollama",
  open_webui: "ollama",
  cursor: "cursor",
  azure: "microsoftazure",
  groq: "groq",
  ollama: "ollama",
};

/** Brand hex colors (Simple Icons defaults) for tinted backgrounds */
export const BRAND_COLOR: Record<string, string> = {
  github: "#181717",
  gitlab: "#FC6D26",
  linear: "#5E6AD2",
  jira: "#0052CC",
  telegram: "#26A5E4",
  slack: "#4A154B",
  discord: "#5865F2",
  gmail: "#EA4335",
  google: "#4285F4",
  google_drive: "#4285F4",
  google_calendar: "#4285F4",
  chatgpt: "#412991",
  openai: "#412991",
  claude: "#D97757",
  anthropic: "#D97757",
  grok: "#000000",
  hermes: "#0EA5E9",
  openrouter: "#6366F1",
  notion: "#000000",
  cloudflare: "#F38020",
  supabase: "#3FCF8E",
  stripe: "#635BFF",
  hubspot: "#FF7A59",
  airtable: "#18BFFF",
  openwebui: "#000000",
  cursor: "#000000",
  azure: "#0078D4",
  groq: "#F55036",
  ollama: "#000000",
};

export function brandLogoUrl(provider: string): string {
  const key = provider.toLowerCase().replace(/\s+/g, "_");
  const slug = ICON_SLUG[key] ?? ICON_SLUG[key.replace(/-/g, "_")] ?? "circle";
  return `${SI}/${slug}.svg`;
}

export function brandColor(provider: string): string {
  const key = provider.toLowerCase().replace(/\s+/g, "_");
  return BRAND_COLOR[key] ?? "#6366F1";
}
