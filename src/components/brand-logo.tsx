import { brandColor, brandLogoUrl } from "@/lib/brand-logos";
import { cn } from "@/lib/utils";

type Props = {
  provider: string;
  name?: string;
  /** Official app mark (for example the Composio catalog logo). Falls back to the brand set. */
  logoUrl?: string | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = { sm: "size-7", md: "size-9", lg: "size-11" } as const;
const IMG = { sm: "size-3.5", md: "size-4.5", lg: "size-5" } as const;

/** Official catalog marks must be public http(s) images; anything else is ignored. */
function officialLogoUrl(value: string | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return /^https?:\/\//i.test(trimmed) && trimmed.length <= 512 ? trimmed : "";
}

/** Official brand mark with neutral tile (SVG inverted for dark UI). */
export function BrandLogo({ provider, name, logoUrl, size = "md", className }: Props) {
  const official = officialLogoUrl(logoUrl);
  const src = official || brandLogoUrl(provider);
  const color = brandColor(provider);
  const label = name ?? provider;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background",
        SIZE[size],
        className,
      )}
      style={{ boxShadow: `inset 0 0 0 1px ${color}22` }}
      title={label}
      aria-label={label}
    >
      <img
        src={src}
        alt=""
        className={cn(IMG[size], "opacity-90", official ? "" : "dark:invert")}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(event) => {
          event.currentTarget.hidden = true;
          event.currentTarget.nextElementSibling?.classList.remove("hidden");
        }}
      />
      <span className="hidden text-[10px] font-semibold uppercase text-muted-foreground">
        {label.slice(0, 2)}
      </span>
    </span>
  );
}
