import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { appCategories } from "@/lib/nav";
import { useRoles } from "@/hooks/use-roles";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function WorkspaceSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { can } = useRoles();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Search pages">
        <Search className="size-4" />
        <span className="hidden sm:inline">Search pages</span>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Search workspace pages</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a page. Use its search field to filter resources.
        </DialogDescription>
        <CommandInput placeholder="Search pages and categories…" />
        <CommandList>
          <CommandEmpty>No matching pages.</CommandEmpty>
          {appCategories.map((group) => (
            <CommandGroup key={group.id} heading={group.label}>
              {group.items
                .filter((item) => !item.capability || can(item.capability))
                .map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`${group.label} ${item.label} ${item.to}`}
                    onSelect={() => {
                      setOpen(false);
                      void navigate({ to: item.to });
                    }}
                  >
                    {item.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
