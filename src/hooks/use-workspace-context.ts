import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "open-connect-active-workspace";
const EVENT_NAME = "open-connect-workspace-change";

export function useWorkspaceContext() {
  const [workspaceId, setWorkspaceIdState] = useState("");

  useEffect(() => {
    const sync = () => setWorkspaceIdState(window.localStorage.getItem(STORAGE_KEY) ?? "");
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setWorkspaceId = useCallback((value: string) => {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return { workspaceId, setWorkspaceId };
}
