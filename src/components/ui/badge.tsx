import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function labelTone(label: unknown) {
  if (typeof label !== "string") return "";
  if (/blocked|failed|malware|quarantin|broken/i.test(label))
    return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
  if (
    /verified|connected|approved|ready|complete/i.test(label) &&
    !/unverified|disconnected/.test(label)
  )
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (/pending|review|unverified|update|warning/i.test(label))
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  const colors = [
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  ];
  return colors[
    [...label.toLowerCase()].reduce((sum, c) => sum + c.charCodeAt(0), 0) % colors.length
  ];
}
function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        badgeVariants({ variant }),
        variant === "destructive" ? "" : labelTone(props.children),
        className,
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
