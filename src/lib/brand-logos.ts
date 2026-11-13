/**
 * Official brand marks via Simple Icons (https://simpleicons.org).
 * Used for connections, models, and AI client integrations.
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
  | "ollama"
  | "mistral"
  | "pipedream"
  | "composio"
  | "onepassword"
  | "litellm"
  | "multion"
  | "railway"
  | "sentry"
  | "databricks"
  | "dockerhub"
  | "docker"
  | "google_sheets"
  | "google_docs"
  | "google_photos"
  | "google_gemini"
  | "googlegemini"
  | "google_super"
  | "cloudflare_api_key"
  | "cloudflare_browser_rendering"
  | "proton"
  | "proton_pass"
  | "proton_drive";

const ICON_SLUG: Record<string, string> = {
  huggingface: "huggingface",
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
  mistral: "mistral",
  pipedream: "pipedream",
  composio: "python",
  onepassword: "1password",
  "1password": "1password",
  litellm: "openai",
  multion: "googlechrome",
  railway: "railway",
  sentry: "sentry",
  databricks: "databricks",
  dockerhub: "docker",
  docker: "docker",
  google_sheets: "googlesheets",
  google_docs: "googledocs",
  google_photos: "googlephotos",
  google_super: "google",
  google_gemini: "googlegemini",
  googlegemini: "googlegemini",
  cloudflare_api_key: "cloudflare",
  cloudflare_browser_rendering: "cloudflare",
  proton: "proton",
  proton_pass: "proton",
  proton_drive: "protondrive",
};

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
  mistral: "#FF7000",
  pipedream: "#39C57D",
  composio: "#6366F1",
  onepassword: "#0095FF",
  litellm: "#0EA5E9",
  multion: "#4285F4",
  railway: "#0B0D0E",
  sentry: "#362D59",
  databricks: "#FF3621",
  dockerhub: "#2496ED",
  docker: "#2496ED",
  google_sheets: "#0F9D58",
  google_docs: "#4285F4",
  google_photos: "#4285F4",
  google_gemini: "#8E75B2",
  googlegemini: "#8E75B2",
  cloudflare_api_key: "#F38020",
  cloudflare_browser_rendering: "#F38020",
  proton: "#6D4AFF",
  proton_pass: "#6D4AFF",
  proton_drive: "#6D4AFF",
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
