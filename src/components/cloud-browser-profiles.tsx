import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCloudBrowserProfile, saveCloudBrowserProfile } from "@/lib/cloud-browser.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CloudBrowserProfiles({
  profileId,
  onSelect,
}: {
  profileId?: string | undefined;
  onSelect: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const getProfile = useServerFn(getCloudBrowserProfile);
  const saveProfile = useServerFn(saveCloudBrowserProfile);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const profile = useQuery({
    queryKey: ["cloud-browser-profile", profileId],
    queryFn: () => getProfile({ data: { profileId: profileId! } }),
    enabled: Boolean(profileId),
    retry: false,
  });
  const save = useMutation({
    mutationFn: (update: boolean) =>
      saveProfile({
        data: {
          ...(update && profileId ? { profileId } : {}),
          name: name.trim(),
          set_as_default: makeDefault,
        },
      }),
    onSuccess: async (result) => {
      setName("");
      setMakeDefault(false);
      onSelect(result.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-browser-overview"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-browser-profile"] }),
      ]);
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Browser profiles and saved sign-ins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Create a named profile for an account or environment.</li>
          <li>Open its sign-in setup, sign in yourself, then save the session in TinyFish.</li>
          <li>Select that profile above for future tasks.</li>
        </ol>
        {profile.isLoading ? <p role="status">Loading saved sites…</p> : null}
        {profile.isError ? (
          <p role="alert">Could not load saved sites: {profile.error.message}</p>
        ) : null}
        {profile.data ? (
          <div className="space-y-2">
            <p className="font-medium">Selected: {profile.data.name}</p>
            {profile.data.domains.length ? (
              <ul className="divide-y rounded-md border">
                {profile.data.domains.map((site) => (
                  <li key={site.domain} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span>{site.domain}</span>
                    <span className="text-muted-foreground">{site.cookies} saved cookies</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No saved sites reported for this profile.</p>
            )}
          </div>
        ) : null}
        <Button asChild variant="outline">
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={
              profileId
                ? `https://agent.tinyfish.ai/profiles/${encodeURIComponent(profileId)}`
                : "https://agent.tinyfish.ai/profiles"
            }
          >
            Open sign-in setup in TinyFish ↗
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Sign-in setup opens in the provider's browser. Return here and refresh after saving.
          Cookies and web storage stay with TinyFish; passwords are not entered in task
          instructions.
        </p>
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor="cb-profile-name">New or updated profile name</Label>
          <Input
            id="cb-profile-name"
            maxLength={100}
            placeholder="Work account · Production"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={makeDefault}
              onChange={(event) => setMakeDefault(event.target.checked)}
            />
            Make this the default profile
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate(false)}>
              Create profile
            </Button>
            {profileId ? (
              <Button
                variant="outline"
                disabled={!name.trim() || save.isPending}
                onClick={() => save.mutate(true)}
              >
                Update selected profile
              </Button>
            ) : null}
          </div>
          {save.isError ? <p role="alert">{save.error.message}</p> : null}
          {save.isSuccess ? (
            <p role="status">
              Profile saved. Sign in through setup before using it for authenticated tasks.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
