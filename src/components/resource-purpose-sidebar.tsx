import { FolderKanban, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";

type PurposeGroup = {
  type: string;
  label: string;
  items: unknown[];
};

export function ResourcePurposeSidebar({
  groups,
  activePurpose,
  allCount,
  onSelect,
  ariaLabel,
}: {
  groups: PurposeGroup[];
  activePurpose: string;
  allCount: number;
  onSelect: (purpose: string) => void;
  ariaLabel: string;
}) {
  return (
    <aside className="min-w-0" aria-label={ariaLabel}>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Browse by purpose
      </h2>
      <nav
        aria-label={ariaLabel}
        className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
      >
        <button
          type="button"
          aria-pressed={activePurpose === "all"}
          onClick={() => onSelect("all")}
          className={cn(
            "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors lg:w-full",
            activePurpose === "all"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Layers3 className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">All</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {allCount}
          </span>
        </button>
        {groups.map((group) => (
          <button
            key={group.type}
            type="button"
            aria-pressed={activePurpose === group.type}
            onClick={() => onSelect(group.type)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors lg:w-full",
              activePurpose === group.type
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <FolderKanban className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 capitalize">{group.label}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {group.items.length}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
