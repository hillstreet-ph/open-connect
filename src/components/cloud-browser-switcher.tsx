import { useAuth } from "@/hooks/use-auth";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  BROWSER_ADAPTER_CAPABILITIES,
  BROWSER_PROVIDERS,
  type BrowserProviderId,
} from "@/lib/browser-provider-selection";
import { getBrowserProviderAvailability } from "@/lib/browser-providers.functions";
import { AdditionalBrowserProviders } from "./additional-browser-providers";

export function CloudBrowserSwitcher({
  selected,
  onSelect,
  tinyfish,
  external,
}: {
  selected: BrowserProviderId;
  onSelect: (provider: BrowserProviderId) => void;
  tinyfish: ReactNode;
  external: ReactNode;
}) {
  const { user } = useAuth();
  const read = useServerFn(getBrowserProviderAvailability);
  const availability = useQuery({
    queryKey: ["browser-provider-availability", user?.id],
    enabled: Boolean(user),
    queryFn: () => read(),
    retry: false,
    staleTime: 15000,
  });
  const status = (id: BrowserProviderId) => {
    if (id === "external") return "Discover tools";
    if (id === "browseract" || id === "multion")
      return availability.data?.[id].saved
        ? "Account saved · execution unverified"
        : "Setup / verification needed";
    if (availability.isError) return "Status unavailable";
    if (!availability.data) return "Checking connection…";
    const item = availability.data[id];
    const vault = id === "tinyfish" ? null : availability.data.vault[id];
    if (!item.configured && vault === "ambiguous")
      return "Several saved keys · choose in Credentials";
    if (!item.configured && vault === "unavailable") return "Saved key could not be verified";
    return item.configured
      ? "Connection saved"
      : item.brokered
        ? "Broker account saved · native key needed"
        : "Connect API key";
  };
  const capabilities =
    selected === "tinyfish" || selected === "browser_use" || selected === "browserbase"
      ? BROWSER_ADAPTER_CAPABILITIES[selected]
      : null;
  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border p-4" aria-label="Cloud browser providers">
        <h2 className="font-semibold">Choose a browser provider</h2>
        <div role="tablist" aria-label="Browser provider" className="grid gap-2 sm:grid-cols-3">
          {BROWSER_PROVIDERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              tabIndex={selected === item.id ? 0 : -1}
              onKeyDown={(event) => {
                const index = BROWSER_PROVIDERS.findIndex((entry) => entry.id === item.id);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? BROWSER_PROVIDERS.length - 1
                      : ["ArrowRight", "ArrowDown"].includes(event.key)
                        ? (index + 1) % BROWSER_PROVIDERS.length
                        : ["ArrowLeft", "ArrowUp"].includes(event.key)
                          ? (index + BROWSER_PROVIDERS.length - 1) % BROWSER_PROVIDERS.length
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                const target = BROWSER_PROVIDERS[next]!;
                onSelect(target.id);
                document.getElementById(`browser-tab-${target.id}`)?.focus();
              }}
              id={`browser-tab-${item.id}`}
              aria-selected={selected === item.id}
              aria-controls={`browser-panel-${item.id}`}
              className={`rounded-lg border p-3 text-left ${selected === item.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="block text-sm font-medium">{item.name}</span>
              <span className="block text-xs text-muted-foreground">{status(item.id)}</span>
            </button>
          ))}
        </div>
        <p className="text-sm">
          {BROWSER_PROVIDERS.find((item) => item.id === selected)?.description}
        </p>
        <p className="text-xs text-muted-foreground">
          Switching changes the controls shown here. Each provider keeps its own task, profile and
          sign-in state. Existing sessions keep running; stop unused browsers. Tasks, cookies and
          passwords are not transferred, and switching never starts a paid run.
        </p>
        {capabilities ? (
          <div className="space-y-2 rounded-md border p-3">
            <h3 className="text-sm font-medium">Available controls</h3>
            <div className="flex flex-wrap gap-2">
              {capabilities.available.map((label) => (
                <span key={label} className="rounded bg-muted px-2 py-1 text-xs">
                  {label}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{capabilities.setup}</p>
          </div>
        ) : null}
        <div className="flex gap-3 text-sm">
          <Link to="/connections" className="underline">
            Manage connections
          </Link>
          <button type="button" className="underline" onClick={() => void availability.refetch()}>
            Refresh connection status
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Browser Use and Browserbase automatically reuse a single API key saved in Credentials with
          their exact HTTPS website or provider:browser_use / provider:browserbase tag. Validation
          reads account details only. Multiple matching keys require selection in Connections.
        </p>
        {availability.isError ? (
          <p role="alert" className="text-sm">
            Connection status could not be checked. Your existing session references are preserved.
          </p>
        ) : null}
      </section>
      <div
        role="tabpanel"
        id="browser-panel-tinyfish"
        aria-labelledby="browser-tab-tinyfish"
        hidden={selected !== "tinyfish"}
      >
        {tinyfish}
      </div>
      <div
        role="tabpanel"
        id="browser-panel-browser_use"
        aria-labelledby="browser-tab-browser_use"
        hidden={selected !== "browser_use"}
      >
        <AdditionalBrowserProviders
          provider="browser_use"
          configured={availability.data?.browser_use.configured ?? false}
        />
      </div>
      <div
        role="tabpanel"
        id="browser-panel-browserbase"
        aria-labelledby="browser-tab-browserbase"
        hidden={selected !== "browserbase"}
      >
        <AdditionalBrowserProviders
          provider="browserbase"
          configured={availability.data?.browserbase.configured ?? false}
        />
      </div>
      <div
        role="tabpanel"
        id="browser-panel-external"
        aria-labelledby="browser-tab-external"
        hidden={selected !== "external"}
      >
        {external}
      </div>
      {(["browseract", "multion"] as const).map((id) => (
        <div
          key={id}
          role="tabpanel"
          id={`browser-panel-${id}`}
          aria-labelledby={`browser-tab-${id}`}
          hidden={selected !== id}
          className="space-y-3 rounded-lg border p-4 text-sm"
        >
          <h2 className="font-semibold">
            {id === "browseract" ? "BrowserAct setup" : "MultiOn setup"}
          </h2>
          <p>
            {id === "browseract"
              ? "The local BrowserAct CLI is installed, but its daemon did not pass verification in this environment. A saved broker connection is separate from a working cloud worker. Connect a verified browser MCP worker under Connected tools to use it here."
              : "MultiOn SDK references are available, but a current working API and account have not been verified. Connect a verified provider MCP endpoint under Connected tools before enabling execution."}
          </p>
          <button type="button" className="underline" onClick={() => onSelect("external")}>
            Open connected browser tools
          </button>
          <p>No task has been started by selecting this provider.</p>
        </div>
      ))}
    </div>
  );
}
