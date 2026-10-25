import { useId, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Paperclip, X } from "lucide-react";
import { prepareAgentAttachment } from "@/lib/agent-attachment.functions";
import { attachmentContext, type ChatAttachment } from "@/lib/agent-chat";
export function AgentAttachments({
  files,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  files: ChatAttachment[];
  onChange: (files: ChatAttachment[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const prepare = useServerFn(prepareAgentAttachment);
  return (
    <div className="space-y-2">
      <input
        id={id}
        ref={input}
        type="file"
        multiple
        hidden
        accept=".txt,.md,.csv,.json,.log,.pdf"
        disabled={disabled || loading}
        onChange={async (event) => {
          const selected = [...(event.target.files ?? [])];
          event.target.value = "";
          setError("");
          if (files.length + selected.length > 3) {
            setError("Attach at most three files.");
            return;
          }
          setLoading(true);
          onBusyChange?.(true);
          try {
            const next = [...files];
            for (const file of selected) {
              if (file.size > 4 * 1024 * 1024) throw new Error("Each file must be at most 4 MB.");
              const data = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result).split(",")[1]!);
                reader.onerror = () => reject(new Error("File could not be read."));
                reader.readAsDataURL(file);
              });
              next.push(await prepare({ data: { name: file.name, data } }));
            }
            attachmentContext(next);
            onChange(next);
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "File could not be attached.");
          } finally {
            setLoading(false);
            onBusyChange?.(false);
          }
        }}
      />
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        disabled={disabled || loading}
        onClick={() => input.current?.click()}
      >
        <Paperclip className="size-4" />
        {loading ? "Reading file…" : "Attach files"}
      </button>
      {files.map((file, index) => (
        <span
          key={`${file.name}-${index}`}
          className="ml-2 inline-flex max-w-full items-center gap-1 rounded border px-2 py-1 text-xs"
        >
          <span className="truncate">{file.name}</span>
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <p className="text-[10px] text-muted-foreground">
        Text and text-based PDF · 3 files, 4 MB each, 24,000 extracted characters total. Extracted
        text is saved with the chat; originals are not stored.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
