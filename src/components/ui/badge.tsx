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
    return "border-destructive/30 bg-destructive/10 text-destructive";
  if (
    /verified|connected|approved|ready|complete/i.test(label) &&
    !/unverified|disconnected/.test(label)
  )
    return "border-success/30 bg-success/10 text-success";
  if (/pending|review|unverified|update|warning/i.test(label))
    return "border-warning/30 bg-warning/10 text-warning";
  const colors = [
    "border-chart-4/30 bg-chart-4/10 text-chart-4",
    "border-chart-1/30 bg-chart-1/10 text-chart-1",
    "border-chart-2/30 bg-chart-2/10 text-chart-2",
    "border-chart-3/30 bg-chart-3/10 text-chart-3",
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
