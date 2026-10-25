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
} from "lucide-react";
import { BrowserAgentChat } from "@/components/browser-agent-chat";
import { AgentAttachments } from "@/components/agent-attachments";
import { askAgentHelper } from "@/lib/agent-helper.functions";
import {
  listAgentChats,
  getAgentChat,
  saveAgentChat,
  deleteAgentChat,
  renameAgentChat,
} from "@/lib/agent-chat.functions";
import { type ChatAttachment, type ChatMessage } from "@/lib/agent-chat";
import { useAuth } from "@/hooks/use-auth";

type Cursor = { at: string; id: string } | null;
export function AgentHelper() {
  const { user } = useAuth();
  return user && !user.is_anonymous ? <AgentHelperPanel key={user.id} user={user} /> : null;
}
function AgentHelperPanel({ user }: { user: { id: string } }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false),
    [expanded, setExpanded] = useState(false),
    [historyOpen, setHistoryOpen] = useState(false);
  const [mode, setMode] = useState<"workspace" | "browser">("workspace");
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
    transcript = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null),
    launcher = useRef<HTMLButtonElement>(null);
  const account = useRef<string | undefined>(user.id);
  const listFn = useServerFn(listAgentChats),
    loadFn = useServerFn(getAgentChat),
    saveFn = useServerFn(saveAgentChat),
    deleteFn = useServerFn(deleteAgentChat),
    renameFn = useServerFn(renameAgentChat);
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
    if (transcript.current) transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [messages, busy, open]);
  useEffect(() => {
    if (open && mode === "workspace" && !historyOpen) composer.current?.focus();
  }, [open, mode, historyOpen]);
  const report = (failure: unknown) =>
    setError(failure instanceof Error ? failure.message : "Action could not be completed.");
  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim() || (files.length ? "Summarize the attached files." : "");
    if (!content || sending.current || fileBusy || !user) return;
    sending.current = true;
    setBusy(true);
    setError("");
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
      try {
        reply = (await askAgentHelper({ data: { messages: next.slice(-10) } })).reply;
      } catch (failure) {
        reply =
          failure instanceof Error
            ? failure.message
            : "The assistant could not complete this request.";
      }
      if (account.current !== owner) return;
      const finished = [...next, { role: "assistant" as const, content: reply }];
      setMessages(finished);
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
        setMode("workspace");
        setChatId(row.id);
        revision.current = row.revision;
        setMessages(row.messages as ChatMessage[]);
        setTitle(row.title);
        setDraft("");
        setFiles([]);
      }
      setHistoryOpen(false);
    } catch (failure) {
      report(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-30 sm:right-5"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          launcher.current?.focus();
        }
      }}
    >
      <section
        hidden={!open}
        style={!open ? { display: "none" } : undefined}
        id="agent-helper-chat"
        role="dialog"
        aria-label="Agent-Helper chat"
        className={`mb-3 flex flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl ${expanded ? "h-[min(48rem,calc(100dvh-6rem))] w-[min(56rem,calc(100vw-2rem))]" : "h-[min(40rem,calc(100dvh-6rem))] w-[min(26rem,calc(100vw-2rem))]"}`}
      >
        <header className="flex items-center gap-1 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Agent-Helper</h2>
            <p className="truncate text-xs text-muted-foreground">
              {mode === "browser" ? "Browser task" : title}
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
          <button
            type="button"
            aria-label={expanded ? "Reduce chat" : "Expand chat"}
            className="rounded p-2 hover:bg-muted"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button
            type="button"
            aria-label="Close Agent-Helper"
            className="rounded p-2 hover:bg-muted"
            onClick={() => {
              setOpen(false);
              launcher.current?.focus();
            }}
          >
            <X className="size-4" />
          </button>
        </header>
        <nav className="flex gap-2 border-b px-3 py-2" aria-label="Agent mode">
          {(["workspace", "browser"] as const).map((item) => (
            <button
              key={item}
              type="button"
              disabled={busy || fileBusy}
              aria-pressed={mode === item}
              className={`rounded border px-3 py-1 text-xs ${mode === item ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              onClick={() => {
                setMode(item);
                setHistoryOpen(false);
                if (item === "browser") setBrowserOpened(true);
              }}
            >
              {item === "workspace" ? "Workspace" : "Browser task"}
            </button>
          ))}
        </nav>
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
                          link.download = `chat-${row.id}.json`;
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
          style={{ display: !historyOpen && mode === "workspace" ? "flex" : "none" }}
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
                  Ask a question, attach reference documents, or manage workspace tasks. Select
                  Browser task to execute a website prompt.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {["Find an Airtable skill", "List my recent tasks"].map((starter) => (
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
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
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
          </div>
          <form onSubmit={(event) => void send(event)} className="space-y-2 border-t p-3">
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
                aria-label="Message Agent-Helper"
                placeholder="Ask anything about your workspace…"
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
                type="submit"
                disabled={busy || fileBusy || (!draft.trim() && !files.length)}
                aria-label="Send message"
                className="rounded-xl bg-primary p-3 text-primary-foreground disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Saved privately to your account. Replies use your connected free models and the latest
              10 messages. Delete chats from History.
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
      <button
        type="button"
        ref={launcher}
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close Agent-Helper chat" : "Open Agent-Helper chat"}
        aria-expanded={open}
        aria-controls="agent-helper-chat"
        className="flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg"
      >
        <MessageCircle className="size-5" />
        Agent-Helper
      </button>
    </div>
  );
}
