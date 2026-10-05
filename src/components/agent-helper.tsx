import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { askAgentHelper } from "@/lib/agent-helper.functions";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "How do I add a Marketplace plugin to my Library?",
  "Help me set up an automation",
  "Where do I connect OpenRouter?",
];

export function AgentHelper() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi, I’m Agent-Helper. Ask me about setting up Open-Connect.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) composerRef.current?.focus();
  }, [open]);

  async function sendMessage(value: string) {
    const content = value.trim().slice(0, 2000);
    if (!content || busy) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    try {
      const result = await askAgentHelper({
        data: { messages: next.filter((_, index) => index > 0).slice(-10) },
      });
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : "I couldn’t get a reply just now. Please try again.";
      setMessages((current) => [...current, { role: "assistant", content: message }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault();
      void sendMessage(draft);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 sm:bottom-5 sm:right-5">
      {open ? (
        <section
          aria-label="Agent-Helper chat"
          className="mb-3 flex h-[min(34rem,calc(100dvh-7rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        >
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Agent-Helper</h2>
              <p className="text-xs text-muted-foreground">Open-Connect setup support</p>
            </div>
            <button
              type="button"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => {
                setOpen(false);
                launcherRef.current?.focus();
              }}
              aria-label="Close Agent-Helper"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4" aria-live="polite">
            {messages.map((message, index) => (
              <div
                key={index}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <p
                  className={
                    message.role === "user"
                      ? "max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm text-foreground"
                  }
                >
                  {message.content}
                </p>
              </div>
            ))}
            {messages.length === 1 && !busy ? (
              <div className="space-y-2 pt-1">
                {STARTERS.map((starter) => (
                  <button
                    type="button"
                    key={starter}
                    onClick={() => void sendMessage(starter)}
                    className="block w-full rounded-xl border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : null}
            {busy ? (
              <p className="w-fit rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Agent-Helper is thinking…
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <p className="px-4 pb-2 text-[10px] leading-4 text-muted-foreground">
            Prompts go to OpenRouter for model processing. No external tools or actions run.
          </p>
          <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onInputKeyDown}
              maxLength={2000}
              rows={1}
              disabled={busy}
              aria-label="Message Agent-Helper"
              placeholder="Ask about setting up Open-Connect…"
              className="max-h-24 min-h-10 flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send message"
            >
              <Send className="size-4" />
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        ref={launcherRef}
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={open ? "Close Agent-Helper chat" : "Open Agent-Helper chat"}
        aria-expanded={open}
      >
        {open ? <X className="size-4" /> : <MessageCircle className="size-5" />}
        <span>Agent-Helper</span>
      </button>
    </div>
  );
}
