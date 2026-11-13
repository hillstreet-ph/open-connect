import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  configureTelegramIntegration,
  deleteInboundIntegration,
  listInboundIntegrations,
} from "@/lib/inbound-integrations.functions";

/** Account-owned Telegram bot used for notifications and alerts. */
export function TelegramIntegrationCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listInboundIntegrations);
  const configureFn = useServerFn(configureTelegramIntegration);
  const disconnectFn = useServerFn(deleteInboundIntegration);
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [botLabel, setBotLabel] = useState("");
  const [botToken, setBotToken] = useState("");

  const connections = useQuery({
    queryKey: ["inbound-integrations"],
    queryFn: () => listFn({}),
    enabled: Boolean(user),
  });

  const telegramItems = (connections.data ?? []).filter((item) => item.provider === "telegram");

  const saveTelegram = useMutation({
    mutationFn: () =>
      configureFn({
        data: {
          display_name: botLabel.trim() || "Telegram bot",
          token: botToken,
        },
      }),
    onSuccess: () => {
      toast.success("Telegram bot verified and saved securely");
      setBotLabel("");
      setBotToken("");
      setTelegramOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["inbound-integrations"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not set up Telegram"),
  });

  const removeTelegram = useMutation({
    mutationFn: (id: string) => disconnectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Telegram integration removed");
      void queryClient.invalidateQueries({ queryKey: ["inbound-integrations"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove Telegram"),
  });

  return (
    <>
      <Card id="telegram-bot" className="shadow-panel scroll-mt-6">
        <CardHeader className="p-5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MessageCircle className="size-5" />
          </div>
          <CardTitle className="mt-3 text-base">Telegram bot</CardTitle>
          <CardDescription>
            Your bot token is stored securely for your account and is never displayed to
            collaborators.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-5 pb-5">
          <div className="space-y-2">
            {telegramItems.length ? (
              telegramItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <span>
                    {item.display_name || "Telegram"} · {item.status.replaceAll("_", " ")}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={removeTelegram.isPending}
                    onClick={() => removeTelegram.mutate(item.id)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No Telegram bot is connected to this account.
              </p>
            )}
          </div>
          {user ? (
            <Button size="sm" onClick={() => setTelegramOpen(true)}>
              <MessageCircle className="mr-2 size-4" />
              Set up Telegram
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={telegramOpen}
        onOpenChange={(open) => {
          setTelegramOpen(open);
          if (!open) {
            setBotToken("");
            setBotLabel("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set up Telegram</DialogTitle>
            <DialogDescription>
              Create a bot with Telegram’s BotFather, then add its token here. The token is stored
              in the secure credential vault.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-label">Bot name</Label>
              <Input
                id="telegram-label"
                value={botLabel}
                onChange={(event) => setBotLabel(event.target.value)}
                placeholder="Support bot"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Bot token</Label>
              <Input
                id="telegram-token"
                type="password"
                value={botToken}
                onChange={(event) => setBotToken(event.target.value)}
                placeholder="Paste token from BotFather"
                autoComplete="new-password"
              />
            </div>
            <Button
              className="w-full"
              disabled={saveTelegram.isPending || botToken.trim().length < 8}
              onClick={() => saveTelegram.mutate()}
            >
              {saveTelegram.isPending ? "Verifying and saving…" : "Save Telegram integration"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
