import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Phone, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  getCloudPhoneSetup,
  purchaseCloudPhoneNumber,
  searchCloudPhoneNumbers,
} from "@/lib/cloud-resources.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const COUNTRIES: Array<[string, string]> = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["AU", "Australia"],
  ["PH", "Philippines"],
  ["SG", "Singapore"],
  ["HK", "Hong Kong"],
  ["JP", "Japan"],
  ["DE", "Germany"],
  ["FR", "France"],
  ["NL", "Netherlands"],
  ["SE", "Sweden"],
];

type NumberType = "Local" | "Mobile" | "TollFree";

export function CloudPhoneNumbers() {
  const queryClient = useQueryClient();
  const setupFn = useServerFn(getCloudPhoneSetup);
  const searchFn = useServerFn(searchCloudPhoneNumbers);
  const purchaseFn = useServerFn(purchaseCloudPhoneNumber);
  const setup = useQuery({ queryKey: ["cloud-phone"], queryFn: () => setupFn(), retry: false });
  const [country, setCountry] = useState("US");
  const [type, setType] = useState<NumberType>("Local");
  const [contains, setContains] = useState("");
  const [chosen, setChosen] = useState("");

  const search = useMutation({
    mutationFn: () => searchFn({ data: { country, type, contains: contains.trim() || undefined } }),
    onSuccess: () => setChosen(""),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Search failed"),
  });
  const purchase = useMutation({
    mutationFn: () => purchaseFn({ data: { phoneNumber: chosen, confirm: true } }),
    onSuccess: (result) => {
      toast.success(`${result.phoneNumber} added to your Twilio account`);
      setChosen("");
      search.reset();
      void queryClient.invalidateQueries({ queryKey: ["cloud-phone"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Purchase failed"),
  });

  const data = setup.data;
  const price =
    search.data?.monthlyPrice && search.data.currency
      ? `${search.data.monthlyPrice} ${search.data.currency}`
      : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="items-center text-center">
          <Phone className="h-10 w-10 text-primary" aria-hidden />
          <CardTitle className="font-serif text-3xl">Add phone number</CardTitle>
          <CardDescription>
            Choose a location and a real number from your Twilio account for SMS and calls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {setup.isLoading && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking Twilio…
            </p>
          )}
          {data?.error && (
            <p role="alert" className="rounded-md border p-3 text-sm">
              {data.error}
            </p>
          )}
          <div className="space-y-4 rounded-2xl border p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="phone-country" className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" /> Location
                </Label>
                <select
                  id="phone-country"
                  className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                >
                  {COUNTRIES.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone-type">Number type</Label>
                <select
                  id="phone-type"
                  className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                  value={type}
                  onChange={(event) => setType(event.target.value as NumberType)}
                >
                  <option value="Local">Local</option>
                  <option value="Mobile">Mobile</option>
                  <option value="TollFree">Toll-free</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone-contains">Contains digits (optional)</Label>
                <Input
                  id="phone-contains"
                  inputMode="numeric"
                  value={contains}
                  onChange={(event) => setContains(event.target.value.replace(/[^0-9*]/g, ""))}
                  placeholder="e.g. 415"
                />
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              disabled={!data?.configured || search.isPending}
              onClick={() => search.mutate()}
            >
              {search.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Find available numbers
            </Button>
            <div className="border-t pt-3">
              <p className="text-sm">Phone number</p>
              <p className="text-2xl font-semibold">
                {price ?? "—"}{" "}
                <span className="text-base font-normal text-muted-foreground">/ month</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Price from Twilio, charged to your Twilio account. Some countries require regulatory
                documents before a number can be bought.
              </p>
            </div>
            {search.data && search.data.numbers.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No numbers available for that search. Try another type or location.
              </p>
            )}
            {search.data && search.data.numbers.length > 0 && (
              <div className="space-y-2" role="radiogroup" aria-label="Available numbers">
                {search.data.numbers.map((n) => (
                  <button
                    key={n.phoneNumber}
                    type="button"
                    role="radio"
                    aria-checked={chosen === n.phoneNumber}
                    onClick={() => setChosen(n.phoneNumber)}
                    className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm ${
                      chosen === n.phoneNumber ? "border-primary ring-1 ring-primary" : ""
                    }`}
                  >
                    <span>
                      <span className="font-medium">{n.friendlyName || n.phoneNumber}</span>
                      {n.locality && (
                        <span className="ml-2 text-muted-foreground">{n.locality}</span>
                      )}
                    </span>
                    <span className="flex gap-1">
                      {Object.entries(n.capabilities)
                        .filter(([, on]) => on)
                        .map(([cap]) => (
                          <Badge key={cap} variant="secondary">
                            {cap.toUpperCase()}
                          </Badge>
                        ))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Renews monthly with Twilio. Release the number in Twilio to cancel.
          </p>
          <Button
            className="w-full rounded-full"
            size="lg"
            disabled={!chosen || !data?.admin || purchase.isPending}
            onClick={() => purchase.mutate()}
          >
            {purchase.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {chosen ? `Buy ${chosen}` : "Choose a number"}
          </Button>
          {data && !data.admin && (
            <p className="text-center text-xs text-muted-foreground">
              Only admins and owners can buy numbers.
            </p>
          )}
        </CardContent>
      </Card>

      {(data?.numbers.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data!.numbers.map((n) => (
              <div key={n.sid} className="flex items-center justify-between rounded-xl border p-3">
                <span className="font-medium">{n.friendlyName || n.phoneNumber}</span>
                <span className="flex gap-1">
                  {Object.entries(n.capabilities)
                    .filter(([, on]) => on)
                    .map(([cap]) => (
                      <Badge key={cap} variant="secondary">
                        {cap.toUpperCase()}
                      </Badge>
                    ))}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-4 w-4" /> Android device
          </CardTitle>
          <CardDescription>
            An always-on Android phone needs a device provider (for example Genymotion SaaS or
            Limrun). Connect one under Connectors and its device tools appear below.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
