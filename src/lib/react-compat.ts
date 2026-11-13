export type ProfileDraft = { userId: string; value: string } | null;

export function profileDraftValue(draft: ProfileDraft, userId: string | undefined, saved: string) {
  return draft && draft.userId === userId ? draft.value : saved;
}

type MediaQuerySubscription = Pick<MediaQueryList, "addEventListener" | "removeEventListener">;

export function subscribeToMediaQuery(query: MediaQuerySubscription, onChange: () => void) {
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

type CarouselSubscription = {
  on: (event: "reInit" | "select", listener: () => void) => unknown;
  off: (event: "reInit" | "select", listener: () => void) => unknown;
};

export function subscribeToCarousel(api: CarouselSubscription | undefined, onChange: () => void) {
  api?.on("reInit", onChange);
  api?.on("select", onChange);
  return () => {
    api?.off("reInit", onChange);
    api?.off("select", onChange);
  };
}
