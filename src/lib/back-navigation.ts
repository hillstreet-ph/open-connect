export type BackTarget =
  | {
      to: "/" | "/dashboard" | "/settings" | "/projects" | "/admin";
      hash?: string;
      label: string;
    }
  | { to: "/projects/$projectId"; params: { projectId: string }; label: string };
function canonical(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}
/** Main workspace destinations use the sidebar. Nested/utility pages have one parent link. */
export function workspaceBackTarget(pathname: string, hash = ""): BackTarget | null {
  const path = canonical(pathname);
  if (path === "/integrations")
    return { to: "/settings", hash: "integrations", label: "Back to settings" };
  if (path === "/settings")
    return hash && hash !== "profile" && hash !== "#profile"
      ? { to: "/settings", label: "Back to settings" }
      : { to: "/dashboard", label: "Back to workspace" };
  if (path.startsWith("/project-access/")) {
    const id = path.split("/")[2] || "";
    return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
      ? { to: "/projects/$projectId", params: { projectId: id }, label: "Back to project" }
      : { to: "/projects", label: "Back to projects" };
  }
  if (path.startsWith("/projects/")) return { to: "/projects", label: "Back to projects" };
  if (path.startsWith("/admin/")) return { to: "/admin", label: "Back to administration" };
  if (["/admin", "/guides", "/campaign-studio", "/api-keys"].includes(path))
    return { to: "/dashboard", label: "Back to workspace" };
  return null;
}
export function publicBackTarget(pathname: string): BackTarget | null {
  return ["/", "/dashboard"].includes(canonical(pathname))
    ? null
    : { to: "/", label: "Back to home" };
}
