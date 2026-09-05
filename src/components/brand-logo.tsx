import { brandColor, brandLogoUrl } from "@/lib/brand-logos";
import { cn } from "@/lib/utils";

type Props = {
  provider: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE = { sm: "size-7", md: "size-9", lg: "size-11" } as const;
const IMG = { sm: "size-3.5", md: "size-4.5", lg: "size-5" } as const;

/** Official brand mark with neutral tile (SVG inverted for dark UI). */
export function BrandLogo({ provider, name, size = "md", className }: Props) {
  const src = brandLogoUrl(provider);
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
        className={cn(IMG[size], "opacity-90 dark:invert")}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </span>
  );
}
