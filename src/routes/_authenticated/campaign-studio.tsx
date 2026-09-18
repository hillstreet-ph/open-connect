import { FormEvent, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  ImageIcon,
  LoaderCircle,
  Megaphone,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { CampaignResult } from "@/lib/campaign-studio";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/campaign-studio")({
  head: () => ({
    meta: [
      { title: "Campaign Studio — Open-Connect" },
      {
        name: "description",
        content: "Turn a campaign brief into launch-ready creative direction.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CampaignStudioPage,
});

const CHANNELS = ["Instagram", "TikTok", "LinkedIn", "Email", "Web", "YouTube"];

function CampaignStudioPage() {
  const [selected, setSelected] = useState(["Instagram", "Email", "Web"]);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/campaign-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: data.get("brief"),
          audience: data.get("audience"),
          product: data.get("product"),
          tone: data.get("tone"),
          channels: selected,
        }),
      });
      const payload = (await response.json()) as CampaignResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Generation failed.");
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="campaign-canvas min-h-full px-4 py-8 sm:px-7 lg:px-10">
      <header className="mx-auto max-w-7xl border-b border-white/10 pb-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge className="mb-3 bg-amber-300 text-slate-950 hover:bg-amber-300">
              OPEN / CREATIVE LAB
            </Badge>
            <h1 className="font-display text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Campaign concept studio
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              One strategic brief in. A concept, channel-ready copy, launch plan, and visual
              direction out.
            </p>
          </div>
          <div className="hidden text-right font-mono text-[10px] uppercase tracking-[0.22em] text-slate-500 sm:block">
            Responses API
            <br />
            Image generation
            <br />
            Server secured
          </div>
        </div>
      </header>

      <div className="mx-auto mt-8 grid max-w-7xl gap-8 xl:grid-cols-[0.82fr_1.18fr]">
        <form onSubmit={submit} className="campaign-panel h-fit space-y-5 p-5 sm:p-7">
          <div className="flex items-center justify-between">
            <div>
              <p className="campaign-kicker">01 / THE INPUT</p>
              <h2 className="mt-1 text-xl font-semibold">Shape the assignment</h2>
            </div>
            <Megaphone className="size-5 text-teal-300" />
          </div>
          <Field label="Campaign brief">
            <Textarea
              name="brief"
              required
              minLength={12}
              rows={4}
              placeholder="Launch our new sustainable travel bag before summer…"
            />
          </Field>
          <Field label="Target audience">
            <Input name="audience" required placeholder="Design-aware urban travelers, 25–40" />
          </Field>
          <Field label="Product details">
            <Textarea
              name="product"
              required
              rows={3}
              placeholder="Price, differentiators, proof points, availability…"
            />
          </Field>
          <Field label="Tone">
            <Input name="tone" required defaultValue="Confident, warm, editorial" />
          </Field>
          <fieldset>
            <legend className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Channels
            </legend>
            <div className="flex flex-wrap gap-2">
              {CHANNELS.map((channel) => {
                const active = selected.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setSelected((old) =>
                        active ? old.filter((x) => x !== channel) : [...old, channel],
                      )
                    }
                    className={active ? "campaign-chip-active" : "campaign-chip"}
                  >
                    {active && <Check className="size-3" />}
                    {channel}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Couldn’t build the campaign</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            disabled={loading || selected.length === 0}
            className="h-12 w-full bg-teal-300 text-slate-950 hover:bg-teal-200"
          >
            {loading ? (
              <>
                <LoaderCircle className="animate-spin" />
                Building the direction…
              </>
            ) : (
              <>
                Generate campaign
                <ArrowRight />
              </>
            )}
          </Button>
          <p className="text-center text-[11px] text-slate-500">
            Your API key stays on the server. Generation can take up to two minutes.
          </p>
        </form>

        <section aria-live="polite">
          {loading ? (
            <LoadingState />
          ) : result ? (
            <CampaignBoard result={result} onReset={() => setResult(null)} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.16em] text-slate-400">{label}</Label>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="campaign-empty flex min-h-[560px] flex-col items-center justify-center p-10 text-center">
      <div className="campaign-orbit">
        <Sparkles className="size-7 text-amber-300" />
      </div>
      <p className="campaign-kicker mt-8">THE BOARD IS CLEAR</p>
      <h2 className="mt-2 max-w-md text-3xl font-semibold">
        Your campaign direction will assemble here.
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-6 text-slate-500">
        Complete the brief to generate strategy, copy variants, a launch checklist, and original
        campaign imagery.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="campaign-empty min-h-[560px] p-8">
      <div className="flex items-center gap-3">
        <LoaderCircle className="size-5 animate-spin text-teal-300" />
        <div>
          <p className="campaign-kicker">CREATIVE ENGINE RUNNING</p>
          <p className="mt-1 text-sm text-slate-400">
            Building strategy, copy, and visual direction…
          </p>
        </div>
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="campaign-shimmer h-52" />
        <div className="campaign-shimmer h-52" />
        <div className="campaign-shimmer h-40 sm:col-span-2" />
      </div>
    </div>
  );
}

function CampaignBoard({ result, onReset }: { result: CampaignResult; onReset: () => void }) {
  return (
    <div className="space-y-5 campaign-reveal">
      <div className="campaign-panel overflow-hidden">
        <div className="grid md:grid-cols-[1.05fr_.95fr]">
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <p className="campaign-kicker">02 / THE CONCEPT</p>
              <Button size="sm" variant="ghost" onClick={onReset}>
                <RotateCcw className="size-3.5" />
                New brief
              </Button>
            </div>
            <h2 className="mt-8 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
              {result.concept.name}
            </h2>
            <p className="mt-5 text-lg leading-7 text-teal-200">{result.concept.promise}</p>
            <p className="mt-4 text-sm leading-6 text-slate-400">{result.concept.direction}</p>
          </div>
          <div className="relative min-h-72 bg-slate-900">
            {result.images[0] ? (
              <img
                src={result.images[0].dataUrl}
                alt="Generated campaign visual direction"
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="flex size-full min-h-72 items-center justify-center">
                <ImageIcon className="size-8 text-slate-700" />
              </div>
            )}
            <span className="absolute bottom-3 right-3 bg-black/70 px-2 py-1 font-mono text-[9px] tracking-widest text-white">
              AI VISUAL / 01
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {result.variants.map((variant, index) => (
          <article key={`${variant.headline}-${index}`} className="campaign-panel p-5">
            <div className="flex justify-between">
              <span className="campaign-kicker">COPY / 0{index + 1}</span>
              <Badge variant="outline" className="text-[10px]">
                {variant.channel}
              </Badge>
            </div>
            <h3 className="mt-8 text-xl font-semibold leading-tight">{variant.headline}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">{variant.body}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="campaign-panel p-6">
          <p className="campaign-kicker">03 / LAUNCH CHECKLIST</p>
          <ul className="mt-5 space-y-3">
            {result.checklist.map((item) => (
              <li key={item} className="flex gap-3 text-sm text-slate-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-teal-300/40">
                  <Check className="size-3 text-teal-300" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </article>
        <article className="campaign-panel p-6">
          <p className="campaign-kicker">04 / VISUAL PROMPTS</p>
          <div className="mt-5 space-y-3">
            {result.imagePrompts.map((prompt, index) => (
              <div key={prompt} className="border-l border-amber-300/50 pl-4">
                <p className="font-mono text-[9px] text-amber-300">PROMPT {index + 1}</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">{prompt}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}
