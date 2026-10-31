import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { Check, GitBranch, Globe, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildConnectedAccounts,
  describeLinkError,
  describeAccountError,
  isProviderLinked,
  parseAuthCallbackError,
  providerLabel,
  type ConnectableProvider,
} from "@/lib/connected-accounts";

const PROVIDER_ICONS: Record<ConnectableProvider, React.ComponentType<{ className?: string }>> = {
  google: Globe,
  github: GitBranch,
};

/** Query param the provider redirect carries back so the callback is identifiable. */
const CALLBACK_PARAM = "linked";
const CALLBACK_PARAMS = ["error", "error_code", "error_description", CALLBACK_PARAM];

/** The identity shape the auth client accepts for unlinking, derived to avoid a cast. */
type IdentitiesResult = Awaited<ReturnType<typeof supabase.auth.getUserIdentities>>;
type UserIdentity = Extract<
  IdentitiesResult,
  { data: { identities: unknown[] } }
>["data"]["identities"][number];

function ProviderIcon({ provider }: { provider: ConnectableProvider }) {
  const Icon = PROVIDER_ICONS[provider];
  return (
    <span className="rounded-lg bg-primary/10 p-2 text-primary">
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Reports the result of a provider redirect and selects the Security tab.
 *
 * Rendered outside the tab panels so it runs on every callback. Waits for the
 * session to settle first, because Supabase consumes and clears the token
 * fragment while the client initializes. Success is confirmed against the
 * account's real identities, so a stale or shared callback URL cannot claim a
 * connection that never happened.
 */
export function AccountLinkCallbackNotice() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useRouteContext({ from: "/_authenticated" });
  useEffect(() => {
    void (async () => {
      await supabase.auth.getSession();
      const url = new URL(window.location.href);
      const error = parseAuthCallbackError(url.toString());
      const linked = url.searchParams.get(CALLBACK_PARAM);
      if (!error && !linked) return;
      for (const key of CALLBACK_PARAMS) url.searchParams.delete(key);
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}#security`,
      );
      void navigate({ hash: "security", replace: true });
      if (error) {
        toast.error(describeLinkError(error));
        return;
      }
      const { data, error: identitiesError } = await supabase.auth.getUserIdentities();
      void queryClient.invalidateQueries({ queryKey: ["connected-accounts", user.id] });
      if (identitiesError) {
        toast.error("Could not verify the connection. Refresh and check connected accounts.");
      } else if (linked && isProviderLinked(data?.identities, linked)) {
        toast.success(`${providerLabel(linked)} connected`);
      } else {
        toast.error("The connection did not complete. Please try again.");
      }
    })();
  }, [navigate, queryClient, user.id]);
  return null;
}

export function ConnectedAccountsPanel() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return <AccountIdentities key={user.id} userId={user.id} />;
}

function AccountIdentities({ userId }: { userId: string }) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["connected-accounts", userId],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) throw error;
      return data?.identities ?? [];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["connected-accounts", userId] });

  const connect = useMutation({
    mutationFn: async (provider: ConnectableProvider) => {
      const url = new URL(window.location.href);
      url.searchParams.set(CALLBACK_PARAM, provider);
      url.hash = "";
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: { redirectTo: url.toString() },
      });
      if (error) throw error;
    },
    onError: (error) =>
      toast.error(describeAccountError(error, "Could not start the provider connection")),
  });

  const disconnect = useMutation({
    mutationFn: async (provider: ConnectableProvider) => {
      const identity = (query.data ?? []).find(
        (candidate: UserIdentity) => candidate.provider === provider,
      );
      if (!identity) throw new Error("That connection is no longer available");
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
      return identity.identity_id;
    },
    onSuccess: async (identityId, provider) => {
      queryClient.setQueryData<UserIdentity[]>(["connected-accounts", userId], (identities) =>
        identities?.filter((identity) => identity.identity_id !== identityId),
      );
      await refresh();
      toast.success(`${providerLabel(provider)} disconnected`);
    },
    onError: (error) =>
      toast.error(describeAccountError(error, "Could not disconnect that account")),
  });

  const accounts = buildConnectedAccounts(query.data);

  return (
    <Card className="shadow-panel">
      <CardHeader>
        <CardTitle className="text-base">Connected accounts</CardTitle>
        <CardDescription>
          Connect Google or GitHub to sign in to this account without a password. A connected
          provider uses the same profile, roles, and data.
        </CardDescription>
        <p className="mt-2 text-xs text-muted-foreground">
          Connected means the provider is linked to this account. To test sign-in, open
          open-connect.site in a private browser window, choose the provider, and check that your
          usual profile and data appear. Your current session stays signed in.
        </p>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load your connected accounts. Try refreshing the connection status.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {accounts.map((account) => (
              <li
                key={account.provider}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderIcon provider={account.provider} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{account.label}</span>
                      {account.connected ? (
                        <Badge variant="outline" className="gap-1 text-[10px] uppercase">
                          <Check className="size-3" /> Connected
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {account.connected && account.accountLabel
                        ? account.accountLabel
                        : account.description}
                    </p>
                  </div>
                </div>
                {account.connected ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    // Serialize disconnects: a second request from this page could pass the
                    // server's last-identity check alongside the first and remove both.
                    disabled={!account.canDisconnect || disconnect.isPending || connect.isPending}
                    title={
                      account.canDisconnect
                        ? `Disconnect ${account.label}`
                        : "You cannot disconnect your only sign-in method"
                    }
                    onClick={() => disconnect.mutate(account.provider)}
                  >
                    {disconnect.isPending && disconnect.variables === account.provider ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Unlink className="mr-2 size-4" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={connect.isPending || disconnect.isPending}
                    onClick={() => connect.mutate(account.provider)}
                  >
                    {connect.isPending && connect.variables === account.provider ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 size-4" />
                    )}
                    Connect
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!query.isLoading ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={query.isFetching || connect.isPending || disconnect.isPending}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={query.isFetching ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
            {query.isFetching ? "Checking…" : "Refresh connection status"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
