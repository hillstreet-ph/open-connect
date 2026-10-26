import { CloudWorkspacePage } from "./cloud-workspace-page";
import { BROWSER_WORKERS } from "@/lib/browser-provider-selection";
import { useAuth } from "@/hooks/use-auth";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  BROWSER_ADAPTER_CAPABILITIES,
  BROWSER_PROVIDERS,
  BROWSER_PRIMARY_PROVIDERS,
  browserProviderSurface,
  browserToolFamily,
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
  const surface = browserProviderSurface(selected);
  const family = browserToolFamily(selected);
  const worker =
    selected in BROWSER_WORKERS ? BROWSER_WORKERS[selected as keyof typeof BROWSER_WORKERS] : null;
  const read = useServerFn(getBrowserProviderAvailability);
  const availability = useQuery({
    queryKey: ["browser-provider-availability", user?.id],
    enabled: Boolean(user),
    queryFn: () => read(),
    retry: false,
    staleTime: 15000,
  });
  const status = (id: BrowserProviderId) => {
    if (id === "external" || id === "tinyfish_tools" || id === "verification")
      return "Discover tools";
    if (id === "playwright" || id === "stagehand" || id === "chrome_devtools")
      return "Worker tools · discovery required";
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
        <div
          role="tablist"
          aria-label="Browser provider"
          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          {BROWSER_PRIMARY_PROVIDERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              tabIndex={surface === item.id ? 0 : -1}
              onKeyDown={(event) => {
                const index = BROWSER_PRIMARY_PROVIDERS.findIndex((entry) => entry.id === item.id);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? BROWSER_PRIMARY_PROVIDERS.length - 1
                      : ["ArrowRight", "ArrowDown"].includes(event.key)
                        ? (index + 1) % BROWSER_PRIMARY_PROVIDERS.length
                        : ["ArrowLeft", "ArrowUp"].includes(event.key)
                          ? (index + BROWSER_PRIMARY_PROVIDERS.length - 1) %
                            BROWSER_PRIMARY_PROVIDERS.length
                          : -1;
                if (next < 0) return;
                event.preventDefault();
                const target = BROWSER_PRIMARY_PROVIDERS[next]!;
                onSelect(target.id);
                document.getElementById(`browser-tab-${target.id}`)?.focus();
              }}
              id={`browser-tab-${item.id}`}
              aria-selected={surface === item.id}
              aria-controls={`browser-panel-${item.id}`}
              className={`rounded-lg border p-3 text-left ${surface === item.id ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
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
        hidden={surface !== "external"}
        className="space-y-4"
      >
        <div className="space-y-2 rounded-lg border p-4">
          <label htmlFor="browser-tool-adapter" className="text-sm font-medium">
            Connected tool adapter
          </label>
          <select
            id="browser-tool-adapter"
            value={
              selected === "tinyfish" || selected === "browser_use" || selected === "browserbase"
                ? "external"
                : selected
            }
            onChange={(event) => onSelect(event.target.value as BrowserProviderId)}
            className="block w-full rounded-md border bg-background p-2 text-sm"
          >
            {BROWSER_PROVIDERS.filter(
              (item) =>
                browserProviderSurface(item.id) === "external" && item.id !== "verification",
            ).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          {worker ? (
            <>
              <p className="text-sm text-muted-foreground">{worker.setup}</p>
              <a
                href={worker.source}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline"
              >
                Official source
              </a>
            </>
          ) : null}
          {selected === "browseract" || selected === "multion" ? (
            <p className="text-sm text-muted-foreground">
              {status(selected)}. Discover an authenticated worker's tools before running a task. A
              saved account does not verify browser execution.
            </p>
          ) : null}
        </div>
        {family ? <CloudWorkspacePage kind="browser" embedded browserFamily={family} /> : external}
      </div>
    </div>
  );
}
