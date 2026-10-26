import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { browserVerificationRequestId } from "@/lib/browser-verification-dom";
import type { BrowserController } from "@/lib/browser-control";
import {
  getGlobalBrowserAutomation,
  startBrowserVerification,
  getBrowserVerification,
} from "@/lib/browser-verification.functions";

/** At most one submission per widget/revision; proofs remain in memory and on the same CDP target. */
export function DirectBrowserVerification({
  controller,
  sessionId,
  ready,
}: {
  controller: RefObject<BrowserController | null>;
  sessionId: string | undefined;
  ready: boolean;
}) {
  const { user } = useAuth();
  const readPolicy = useServerFn(getGlobalBrowserAutomation),
    start = useServerFn(startBrowserVerification),
    poll = useServerFn(getBrowserVerification);
  const policy = useQuery({
    queryKey: ["global-browser-automation", user?.id],
    queryFn: () => readPolicy(),
    enabled: !!user,
  });
  const attempts = useRef(new Set<string>());
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (
      !ready ||
      !sessionId ||
      !policy.data?.preferences.external_assistance ||
      policy.data.external.credential_state !== "saved"
    )
      return;
    let cancelled = false,
      busy = false;
    const run = async () => {
      const client = controller.current;
      if (busy || cancelled || !client) return;
      busy = true;
      try {
        const revision = client.inputRevision;
        const widget = await client.verificationWidget();
        if (
          !widget ||
          cancelled ||
          client !== controller.current ||
          revision !== client.inputRevision
        )
          return;
        const key = `${sessionId}:${client.activeTabId}:${widget.origin}:${widget.type}:${widget.siteKey}`;
        if (attempts.current.has(key)) return;
        attempts.current.add(key);
        if (attempts.current.size > 200) {
          setMessage(
            "Verification attempt limit reached for this view. Use the same-session handoff.",
          );
          return;
        }
        const requestId = await browserVerificationRequestId(key);
        setMessage("Shared verification resolver is processing this widget…");
        const attempt = await start({
          data: {
            requestId,
            browser: "tinyfish",
            browserRef: sessionId,
            pageUrl: widget.pageUrl,
            type: widget.type,
            siteKey: widget.siteKey,
            spendApproved: true,
          },
        });
        for (let index = 0; index < 24; index++) {
          if (cancelled || controller.current !== client || revision !== client.inputRevision) {
            if (!cancelled)
              setMessage(
                `Browser changed. Attempt ${attempt.id} remains bound to its original page; do not resubmit.`,
              );
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
          if (cancelled || controller.current !== client || revision !== client.inputRevision)
            return;
          const result = await poll({ data: { id: attempt.id } });
          if (result.state === "ready" && "proof" in result && typeof result.proof === "string") {
            if (
              result.browserRef !== sessionId ||
              result.origin !== widget.origin ||
              cancelled ||
              revision !== client.inputRevision
            )
              return;
            await client.applyVerificationProof(widget, result.proof, revision);
            setMessage(
              "Proof applied to the original widget. Website acceptance is unverified; continue or complete the same-session handoff.",
            );
            return;
          }
          if (result.state !== "processing") {
            setMessage(
              `Verification: ${result.state}. Use this session's handoff; do not duplicate the attempt.`,
            );
            return;
          }
        }
        setMessage(
          `Verification attempt ${attempt.id} is still pending. Check it before retrying.`,
        );
      } catch (error) {
        if (!cancelled)
          setMessage(
            error instanceof Error
              ? error.message
              : "Verification could not be confirmed. Use the same-session handoff.",
          );
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void run(), 5000);
    void run();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [ready, sessionId, controller, policy.data, start, poll]);
  return message ? (
    <p role="status" className="rounded border p-2 text-xs">
      {message}
    </p>
  ) : null;
}
