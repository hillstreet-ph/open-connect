import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageCircle,
  Send,
  X,
  History,
  Plus,
  Maximize2,
  Minimize2,
  Download,
  Wand2,
  Zap,
} from "lucide-react";
import { helperActionQueryKeys } from "@/lib/agent-helper-policy";
import { HelperCapabilities } from "@/components/helper-capabilities";
import { BrowserAgentChat } from "@/components/browser-agent-chat";
import { AgentAttachments } from "@/components/agent-attachments";
import { askAgentHelper, enhanceCopilotPrompt } from "@/lib/agent-helper.functions";
import {
  suggestCopilotNextSteps,
  suggestCopilotPrompts,
} from "@/lib/copilot-suggestions.functions";
import {
  listAgentChats,
  getAgentChat,
  saveAgentChat,
  deleteAgentChat,
  renameAgentChat,
} from "@/lib/agent-chat.functions";
import { type ChatAttachment, type ChatMessage } from "@/lib/agent-chat";
import { useAuth } from "@/hooks/use-auth";
import { redactDataText } from "@/lib/data-controls";

type Cursor = { at: string; id: string } | null;
type CopilotMode = "ask" | "work" | "browser";

export function AgentHelper() {
  const { user } = useAuth();
  return user && !user.is_anonymous ? <AgentHelperPanel key={user.id} user={user} /> : null;
}

export function CopilotChatPage() {
  const { user } = useAuth();
  return user && !user.is_anonymous ? (
    <AgentHelperPanel key={user.id} user={user} variant="page" />
  ) : (
    <p className="text-sm text-muted-foreground">Sign in to use Copilot.</p>
  );
}

function AgentHelperPanel({
  user,
  variant = "bubble",
}: {
  user: { id: string };
  variant?: "bubble" | "page";
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false);
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const [mode, setMode] = useState<CopilotMode>("ask");
  const [autoExecute, setAutoExecute] = useState(true);
  const [openers, setOpeners] = useState<string[]>([]);
  const [nextSteps, setNextSteps] = useState<string[]>([]);
  const [enhancing, setEnhancing] = useState(false);
  const [browserOpened, setBrowserOpened] = useState(false),
    [browserRunId, setBrowserRunId] = useState<string>();
  const [savedBrowserPrompt, setSavedBrowserPrompt] = useState<string>();
  const [browserActive, setBrowserActive] = useState(false),
    [browserKey, setBrowserKey] = useState(0);
  const [fileBusy, setFileBusy] = useState(false);
  const [draft, setDraft] = useState(""),
    [files, setFiles] = useState<ChatAttachment[]>([]),
    [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string>(),
    [title, setTitle] = useState("New chat"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [renameId, setRenameId] = useState<string>(),
    [renameTitle, setRenameTitle] = useState("");
  const revision = useRef<number | null>(null),
    sending = useRef(false),
    openersLoaded = useRef(false),
    transcript = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    launcher = useRef<HTMLButtonElement>(null);
  const account = useRef<string | undefined>(user.id);
  const listFn = useServerFn(listAgentChats),
    loadFn = useServerFn(getAgentChat),
    saveFn = useServerFn(saveAgentChat),
    deleteFn = useServerFn(deleteAgentChat),
    renameFn = useServerFn(renameAgentChat);
  const suggestOpeners = useServerFn(suggestCopilotPrompts),
    suggestNext = useServerFn(suggestCopilotNextSteps),
    enhanceFn = useServerFn(enhanceCopilotPrompt);
  const history = useInfiniteQuery({
    queryKey: ["agent-chat-history", user?.id, search],
    enabled: Boolean(user && open && historyOpen),
    initialPageParam: null as Cursor,
    queryFn: ({ pageParam }) =>
      listFn({ data: { query: search, ...(pageParam ? { before: pageParam } : {}) } }),
    getNextPageParam: (page) => page.next ?? undefined,
    retry: false,
  });
  const refreshHistory = () =>
    void queryClient.invalidateQueries({ queryKey: ["agent-chat-history"] });
  const newChat = () => {
    setChatId(undefined);
    revision.current = null;
    setMessages([]);
    setTitle("New chat");
    setDraft("");
    setFiles([]);
    setError("");
    setNextSteps([]);
    setHistoryOpen(false);
    if (mode === "browser" && !browserActive) {
      setBrowserRunId(undefined);
      setSavedBrowserPrompt(undefined);
      setBrowserKey((key) => key + 1);
    }
  };
  useEffect(() => {
    account.current = user.id;
    return () => {
      account.current = undefined;
    };
  }, [user.id]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("copilot-auto-execute");
      if (saved !== null) setAutoExecute(saved === "on");
    } catch {
      /* preferences stay local when storage is unavailable */
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("copilot-auto-execute", autoExecute ? "on" : "off");
    } catch {
      /* preferences stay local when storage is unavailable */
    }
  }, [autoExecute]);

  useEffect(() => {
    if (!open || mode === "browser" || historyOpen || openersLoaded.current) return;
    openersLoaded.current = true;
    suggestOpeners({ data: {} })
      .then((result) => setOpeners((result.suggestions ?? []).slice(0, 4)))
      .catch(() => setOpeners([]));
  }, [open, mode, historyOpen]);

  useEffect(() => {
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, busy, open]);
  useEffect(() => {
    if (open && mode !== "browser" && !historyOpen) composer.current?.focus();
  }, [open, mode, historyOpen]);
  const report = (failure: unknown) =>
    setError(failure instanceof Error ? failure.message : "Action could not be completed.");
  async function enhance() {
    const prompt = draft.trim();
    if (prompt.length < 3 || busy || fileBusy || enhancing) return;
    setEnhancing(true);
    setError("");
    try {
      const result = await enhanceFn({
        data: { prompt, mode: mode === "work" ? "work" : "ask" },
      });
      if (result.prompt) setDraft(result.prompt);
    } catch (failure) {
      report(failure);
    } finally {
      setEnhancing(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim() || (files.length ? "Summarize the attached files." : "");
    if (!content || sending.current || fileBusy || !user) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNextSteps([]);
    const owner = user.id,
      id = chatId ?? crypto.randomUUID();
    const next = [
      ...messages,
      { role: "user" as const, content, ...(files.length ? { attachments: files } : {}) },
    ];
    const nextTitle = chatId ? title : content.slice(0, 120);
    try {
      const saved = await saveFn({
        data: {
          id,
          revision: revision.current,
          title: nextTitle,
          messages: next,
          mode: "workspace",
          browser_run_id: null,
        },
      });
      if (account.current !== owner) return;
      setChatId(id);
      revision.current = saved.revision;
      setTitle(nextTitle);
      setMessages(next);
      setDraft("");
      setFiles([]);
      refreshHistory();
      let reply: string;
      let performedAction = "";
      try {
        const askData =
          mode === "work"
            ? { messages: next.slice(-10), mode: "work", auto_execute: autoExecute }
            : { messages: next.slice(-10) };
        const response = await askAgentHelper({ data: askData });
        reply = response.reply;
        performedAction = response.action?.name ?? "";
        if (account.current !== owner) return;
        if (response.action && !(response.action.result as Record<string, unknown>)["error"]) {
          for (const key of helperActionQueryKeys(response.action.name)) {
            void queryClient.invalidateQueries({ queryKey: [key] });
          }
        }
      } catch (failure) {
        reply =
          failure instanceof Error
            ? failure.message
            : "The assistant could not complete this request.";
      }
      if (account.current !== owner) return;
      const finished = [...next, { role: "assistant" as const, content: reply }];
      setMessages(finished);
      suggestNext({ data: { reply, action: performedAction } })
        .then((result) => setNextSteps((result.suggestions ?? []).slice(0, 3)))
        .catch(() => setNextSteps([]));
      const final = await saveFn({
        data: {
          id,
          revision: revision.current,
          title: nextTitle,
          messages: finished,
          mode: "workspace",
          browser_run_id: null,
        },
      });
      if (account.current !== owner) return;
      revision.current = final.revision;
      refreshHistory();
    } catch (failure) {
      if (account.current === owner) report(failure);
    } finally {
      sending.current = false;
      if (account.current === owner) setBusy(false);
    }
  }
  async function selectChat(id: string) {
    setBusy(true);
    setError("");
    try {
      const row = await loadFn({ data: { id } });
      if (row.mode === "browser") {
        if (browserActive && browserRunId !== row.browser_run_id)
          throw new Error("Stop the active browser task before opening another browser run.");
        setMode("browser");
        setBrowserOpened(true);
        setBrowserRunId(row.browser_run_id ?? undefined);
        setSavedBrowserPrompt(
          (row.messages as ChatMessage[]).find((message) => message.role === "user")?.content,
        );
      } else {
        setMode("ask");
        setChatId(row.id);
        revision.current = row.revision;
        setMessages(row.messages as ChatMessage[]);
        setTitle(row.title);
        setDraft("");
        setFiles([]);
        setNextSteps([]);
      }
      setHistoryOpen(false);
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  const sectionClass =
    variant === "page"
      ? "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
      : "mb-3 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl " +
        (expanded
          ? "h-[min(48rem,calc(100dvh-6rem))] w-[min(56rem,calc(100vw-2rem))]"
          : "h-[min(40rem,calc(100dvh-6rem))] w-[min(26rem,calc(100vw-2rem))]");
  return (
    <div
      className={
        variant === "page"
          ? "flex h-full min-h-0 flex-col"
          : "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 sm:right-5"
      }
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          launcher.current?.focus();
        }
      }}
    >
      <section
        hidden={!open && variant === "bubble"}
        style={!open && variant === "bubble" ? { display: "none" } : undefined}
        id="agent-helper-chat"
        role="dialog"
        aria-label="Copilot chat"
        className={sectionClass}
      >
        <header className="flex items-center gap-1 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Copilot</h2>
            <p className="truncate text-xs text-muted-foreground">
              {mode === "browser"
                ? "Browser task"
                : mode === "work"
                  ? "Work mode" + (autoExecute ? " · Auto execute" : "")
                  : title}
              {busy ? " · Working…" : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="Chat history"
            title="History"
            className="rounded p-2 hover:bg-muted"
            disabled={busy || fileBusy}
            onClick={() => setHistoryOpen((value) => !value)}
          >
            <History className="size-4" />
          </button>
          <button
            type="button"
            aria-label="New chat"
            title="New chat"
            className="rounded p-2 hover:bg-muted"
            disabled={busy || fileBusy || (mode === "browser" && browserActive)}
            onClick={newChat}
          >
            <Plus className="size-4" />
          </button>
          {variant === "bubble" ? (
            <button
              type="button"
              aria-label={expanded ? "Reduce chat" : "Expand chat"}
              className="rounded p-2 hover:bg-muted"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Close Copilot"
            className="rounded p-2 hover:bg-muted"
            onClick={() => {
              setOpen(false);
              launcher.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        </header>
        <nav className="flex flex-wrap gap-2 border-b px-3 py-2" aria-label="Copilot mode">
          {["ask", "work", "browser"].map((item) => (
            <button
              key={item}
              type="button"
              disabled={busy || fileBusy}
              aria-pressed={mode === item}
              className={
                "rounded border px-3 py-1 text-xs " +
                (mode === item ? "bg-primary text-primary-foreground" : "hover:bg-muted")
              }
              onClick={() => {
                setMode(item as CopilotMode);
                setHistoryOpen(false);
                if (item === "browser") setBrowserOpened(true);
              }}
            >
              {item === "ask" ? "Ask" : item === "work" ? "Work" : "Browser task"}
            </button>
          ))}
          {mode === "work" ? (
            <button
              type="button"
              aria-pressed={autoExecute}
              title="Execute requested actions without asking for confirmation"
              className={
                "ml-auto flex items-center gap-1 rounded border px-2 py-1 text-xs " +
                (autoExecute ? "bg-primary text-primary-foreground" : "hover:bg-muted")
              }
              disabled={busy || fileBusy}
              onClick={() => setAutoExecute((value) => !value)}
            >
              <Zap className="size-3" />
              Auto execute
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={capabilitiesOpen}
            disabled={busy || fileBusy}
            className="ml-auto rounded border px-2 py-1 text-xs hover:bg-muted"
            onClick={() => setCapabilitiesOpen((value) => !value)}
          >
            Capabilities
          </button>
        </nav>
        {capabilitiesOpen ? (
          <HelperCapabilities
            onPrompt={(prompt) => {
              setMode("ask");
              setHistoryOpen(false);
              setDraft(prompt);
              setCapabilitiesOpen(false);
            }}
          />
        ) : null}
        {error ? (
          <p role="alert" className="border-b px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {historyOpen ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <h3 className="font-medium">Chat history</h3>
            <input
              aria-label="Search chat history"
              placeholder="Search chats…"
              className="w-full rounded border bg-background p-2 text-sm"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {history.isPending ? <p role="status">Loading chats…</p> : null}
            {history.isError ? (
              <p role="alert">
                {history.error.message}
                <button
                  type="button"
                  className="ml-2 underline"
                  onClick={() => void history.refetch()}
                >
                  Retry
                </button>
              </p>
            ) : null}
            {history.data?.pages
              .flatMap((page) => page.chats)
              .map((row) => (
                <article key={row.id} className="space-y-1 rounded border p-2">
                  <button
                    type="button"
                    disabled={busy || fileBusy}
                    className="w-full text-left text-sm font-medium"
                    onClick={() => void selectChat(row.id)}
                  >
                    {row.title}
                  </button>
                  <p className="text-[10px] text-muted-foreground">
                    {row.mode === "browser" ? "Browser task" : "Workspace chat"} ·{" "}
                    {new Date(row.updated_at).toLocaleString()}
                  </p>
                  {renameId === row.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        try {
                          const result = await renameFn({
                            data: { id: row.id, revision: row.revision, title: renameTitle },
                          });
                          if (chatId === row.id) {
                            setTitle(renameTitle.trim());
                            revision.current = result.revision;
                          }
                          setRenameId(undefined);
                          refreshHistory();
                        } catch (failure) {
                          report(failure);
                        }
                      }}
                    >
                      <input
                        aria-label="Chat title"
                        maxLength={120}
                        required
                        className="min-w-0 flex-1 rounded border bg-background p-1"
                        value={renameTitle}
                        onChange={(event) => setRenameTitle(event.target.value)}
                      />
                      <button type="submit">Save</button>
                    </form>
                  ) : null}
                  <div className="flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setRenameId(row.id);
                        setRenameTitle(row.title);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={busy || (browserActive && row.browser_run_id === browserRunId)}
                      onClick={async () => {
                        try {
                          await deleteFn({ data: { id: row.id } });
                          if (chatId === row.id) newChat();
                          refreshHistory();
                        } catch (failure) {
                          report(failure);
                        }
                      }}
                    >
                      Delete chat
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const chat = await loadFn({ data: { id: row.id } });
                          const url = URL.createObjectURL(
                            new Blob([JSON.stringify(chat, null, 2)], { type: "application/json" }),
                          );
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = "chat-" + row.id + ".json";
                          link.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        } catch (failure) {
                          report(failure);
                        }
                      }}
                    >
                      <Download className="inline size-3" /> Export
                    </button>
                  </div>
                </article>
              ))}
            {history.data?.pages.every((page) => !page.chats.length) ? (
              <p className="text-sm text-muted-foreground">No saved chats yet.</p>
            ) : null}
            {history.hasNextPage ? (
              <button
                type="button"
                disabled={history.isFetchingNextPage}
                onClick={() => void history.fetchNextPage()}
              >
                Load older chats
              </button>
            ) : null}
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 flex-col"
          style={{ display: !historyOpen && mode !== "browser" ? "flex" : "none" }}
        >
          <div
            ref={transcript}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3"
            aria-live="polite"
            aria-busy={busy}
          >
            {!messages.length ? (
              <div className="rounded-xl border bg-muted p-4 text-sm">
                <h3 className="font-medium">What would you like to do?</h3>
                <p className="mt-2 text-muted-foreground">
                  Ask a question, search saved memory and knowledge, or attach documents. Switch to
                  Work for autonomous multi-step execution, or Browser task to run a website prompt.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(openers.length
                    ? openers
                    : [
                        "What can you do in this workspace?",
                        "Find an Airtable skill",
                        "List my recent tasks",
                        "Search my saved context for Open-Connect",
                      ]
                  ).map((starter) => (
                    <button
                      type="button"
                      key={starter}
                      className="rounded border bg-background p-2 text-left text-xs"
                      onClick={() => setDraft(starter)}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((message, index) => (
              <div
                key={index}
                className={"flex " + (message.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={
                    "max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm " +
                    (message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")
                  }
                >
                  {message.content}
                  {message.attachments?.map((file, i) => (
                    <details key={i} className="mt-2 text-xs">
                      <summary>{file.name}</summary>
                      <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{file.text}</pre>
                    </details>
                  ))}
                </div>
              </div>
            ))}
            {busy ? (
              <p role="status" className="text-sm text-muted-foreground">
                Working…
              </p>
            ) : null}
            {!busy && nextSteps.length ? (
              <div className="space-y-1 rounded-xl border bg-muted p-3">
                <p className="text-xs font-medium">Suggested next steps</p>
                {nextSteps.map((step) => (
                  <button
                    key={step}
                    type="button"
                    className="block w-full rounded border bg-background p-2 text-left text-xs"
                    onClick={() => {
                    setDraft(step);
                    composer.current?.focus();
                  }}
                  >
                    {step}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <form onSubmit={(event) => void send(event)} className="space-y-2 border-t p-3">
            {redactDataText(draft) !== draft && (
              <p role="status" className="rounded-lg border p-3 text-sm">
                Possible credential detected. Use the secure{" "}
                <a className="underline" href="/secrets">
                  Credentials form
                </a>{" "}
                for storage and reuse. Chat capture redacts common secrets; it does not import them
                into the vault or verify that they work. Remove secret values before sending.
              </p>
            )}
            <AgentAttachments
              files={files}
              onChange={setFiles}
              disabled={busy}
              onBusyChange={setFileBusy}
            />
            <div className="flex items-end gap-2">
              <textarea
                ref={composer}
                rows={2}
                maxLength={2000}
                disabled={busy || fileBusy}
                value={draft}
                aria-label="Message Copilot"
                placeholder={
                  mode === "work"
                    ? "Describe the task for Copilot to execute…"
                    : "Ask anything about your workspace…"
                }
                className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border bg-background p-2 text-sm"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="button"
                aria-label="Enhance prompt"
                title="Enhance prompt with more detail"
                disabled={busy || fileBusy || enhancing || draft.trim().length < 3}
                className="rounded-xl border p-3 hover:bg-muted disabled:opacity-50"
                onClick={() => void enhance()}
              >
                <Wand2 className="size-4" />
              </button>
              <button
                type="submit"
                disabled={busy || fileBusy || (!draft.trim() && !files.length)}
                aria-label="Send message"
                className="rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Saved privately to your account. Work mode executes your requested actions
              automatically when Auto execute is on. Delete chats from History.
            </p>
          </form>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto p-3"
          style={{ display: !historyOpen && mode === "browser" ? "block" : "none" }}
        >
          {browserOpened ? (
            <BrowserAgentChat
              key={browserKey}
              runId={browserRunId}
              savedPrompt={savedBrowserPrompt}
              onSelectRun={(id) => {
                setBrowserRunId(id);
                setSavedBrowserPrompt(undefined);
                refreshHistory();
              }}
              onActiveChange={setBrowserActive}
            />
          ) : null}
        </div>
      </section>
      {variant === "bubble" ? (
        <button
          type="button"
          ref={launcher}
          onClick={() => setOpen(!open)}
          aria-label={open ? "Close Copilot chat" : "Open Copilot chat"}
          aria-expanded={open}
          aria-controls="agent-helper-chat"
          title="Copilot"
          className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition hover:scale-105"
        >
          <MessageCircle className="size-6" />
          <span
            aria-hidden="true"
            className="absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-background bg-emerald-500"
          />
        </button>
      ) : null}
    </div>
  );
}
