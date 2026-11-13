import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCloudBrowserOverview } from "@/lib/cloud-browser.functions";
import { CloudBrowserProfiles } from "@/components/cloud-browser-profiles";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** All saved Browser Context Profiles, with sign-in setup for the selected one. */
export function CloudBrowserProfilesPanel() {
  const overviewFn = useServerFn(getCloudBrowserOverview);
  const overview = useQuery({
    queryKey: ["cloud-browser-overview"],
    queryFn: () => overviewFn(),
    retry: false,
  });
  const [selected, setSelected] = useState<string | undefined>(undefined);

  if (overview.isLoading) return <p role="status">Loading profiles…</p>;
  if (overview.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {overview.error.message}
      </p>
    );
  const data = overview.data;
  if (!data?.connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect TinyFish in Connections to manage saved sign-ins. Open the Agent section for setup
        steps.
      </p>
    );
  const current = selected ?? data.defaultProfile?.id;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved profiles</CardTitle>
        </CardHeader>
        <CardContent>
          {data.profiles.length ? (
            <ul className="divide-y rounded-md border text-sm" aria-label="Browser profiles">
              {data.profiles.map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    aria-pressed={current === profile.id}
                    className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted ${current === profile.id ? "bg-muted" : ""}`}
                    onClick={() => setSelected(profile.id)}
                  >
                    <span className="font-medium">{profile.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {profile.domain_count} saved sites
                      {profile.is_default ? <Badge variant="secondary">Default</Badge> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No profiles yet. Create one below to keep sign-ins between tasks.
            </p>
          )}
        </CardContent>
      </Card>
      <CloudBrowserProfiles profileId={current} onSelect={setSelected} />
    </div>
  );
}
