import { websiteText } from "./website-text";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicText } from "./public-fetch.server";
import { scanResourceBytes } from "./resource-safety.server";
import { detectResourceMeta } from "./resource-detect";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp";
export const importResourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string }) => ({
    url: normalizeRemoteMcpEndpoint("custom_mcp", input.url),
  }))
  .handler(async ({ data, context }) => {
    const url = new URL(data.url);
    if (
      [...url.searchParams.keys()].some((k) =>
        /token|secret|key|password|signature|authorization/i.test(k),
      )
    )
      throw new Error("Use a public source URL without credentials; upload private files instead");
    const sources: Array<{
      url: string;
      identity?: string;
      filename: string;
      version?: string;
      repository?: string;
      license?: string | undefined;
    }> = [];
    if (url.hostname === "github.com") {
      const segments = url.pathname.split("/").filter(Boolean);
      const [owner, repo] = segments;
      if (!owner || !repo || !/^[a-zA-Z0-9_.-]+$/.test(owner + repo))
        throw new Error("Use a GitHub repository or file URL");
      if (segments[2] === "blob" && segments.length >= 5) {
        const ref = segments[3]!;
        const filePath = segments.slice(4).join("/");
        const commit = JSON.parse(
          await publicText(
            `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
          ),
        ) as { sha: string };
        if (!/^[a-f0-9]{40}$/.test(commit.sha))
          throw new Error("Source commit could not be pinned");
        sources.push({
          url: `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${filePath}`,
          identity: `github:${owner}/${repo}/${filePath}`,
          filename: segments[segments.length - 1]!,
          version: `0.0.0+${commit.sha.slice(0, 12)}`,
          repository: `https://github.com/${owner}/${repo}`,
        });
      } else if (segments.length === 2) {
        const repository = JSON.parse(
          await publicText(`https://api.github.com/repos/${owner}/${repo}`),
        ) as { default_branch: string; license?: { spdx_id?: string } };
        const branch = JSON.parse(
          await publicText(
            `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(repository.default_branch)}`,
          ),
        ) as { commit: { sha: string } };
        const pin = branch.commit.sha;
        const tree = JSON.parse(
          await publicText(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${pin}?recursive=1`,
          ),
        ) as { truncated?: boolean; tree: Array<{ path: string; type: string; size?: number }> };
        if (tree.truncated)
          throw new Error(
            "Repository tree is truncated. Import a specific resource file or a smaller repository.",
          );
        const candidates = tree.tree.filter(
          (t) =>
            t.type === "blob" &&
            /(?:^|\/)(?:skill\.md|plugin\.json|ai-plugin\.json|openapi\.json|agents\.md)$/i.test(
              t.path,
            ),
        );
        if (candidates.length > 25)
          throw new Error(
            "Repository has more than 25 candidates. Import a specific directory's resource file.",
          );
        if (!candidates.length)
          candidates.push(
            ...tree.tree
              .filter((t) => t.type === "blob" && /^readme\.md$/i.test(t.path))
              .slice(0, 1),
          );
        for (const item of candidates)
          sources.push({
            url: `https://raw.githubusercontent.com/${owner}/${repo}/${pin}/${item.path}`,
            identity: `github:${owner}/${repo}/${item.path}`,
            filename: item.path.split("/").pop()!,
            version: `0.0.0+${pin.slice(0, 12)}`,
            repository: `https://github.com/${owner}/${repo}`,
            license: repository.license?.spdx_id,
          });
      } else throw new Error("Use a repository root or a GitHub blob URL");
    } else sources.push({ url: url.href, filename: url.pathname.split("/").pop() || "website.md" });
    if (!sources.length) throw new Error("No supported resource documents were found");
    const db = context.supabase as SupabaseClient;
    const results: Array<{ name: string; status: string; id?: string; detail?: string }> = [];
    const deadline = Date.now() + 40000;
    for (const source of sources) {
      if (Date.now() > deadline) {
        results.push({
          name: source.filename,
          status: "deferred",
          detail: "Import time budget reached. Import this file URL separately.",
        });
        continue;
      }
      try {
        let text = await publicText(source.url);
        if (/<!doctype html|<html[\s>]/i.test(text)) {
          text = websiteText(text);
          source.filename = "website.md";
        }
        const bytes = new TextEncoder().encode(text);
        const scan = scanResourceBytes(source.filename, bytes);
        if (scan.state === "blocked") {
          results.push({
            name: source.filename,
            status: "blocked",
            detail: scan.findings.join("; "),
          });
          continue;
        }
        const detected = detectResourceMeta({ filename: source.filename, contentText: text });
        let name = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || detected.name;
        let description = detected.description;
        let version = source.version || "0.1.0";
        if (source.filename.endsWith(".json")) {
          try {
            const doc = JSON.parse(text);
            name = String(doc.name_for_human || doc.name || doc.info?.title || name).slice(0, 200);
            description = String(
              doc.description_for_human || doc.description || doc.info?.description || description,
            ).slice(0, 1000);
            version = String(doc.version || doc.info?.version || version).slice(0, 80);
          } catch {
            results.push({
              name: source.filename,
              status: "blocked",
              detail: "Invalid JSON resource",
            });
            continue;
          }
        }
        const existing = await db
          .from("resources")
          .select("id,name")
          .eq("owner_id", context.userId)
          .eq("resource_type", detected.resource_type)
          .eq("installation_config->>content_sha256", scan.sha256)
          .maybeSingle();
        if (existing.error) throw new Error("Could not check duplicates");
        if (existing.data) {
          results.push({ name: existing.data.name, status: "duplicate", id: existing.data.id });
          continue;
        }
        const previous = await db
          .from("resources")
          .select("id,version")
          .eq("owner_id", context.userId)
          .eq("installation_config->>source_identity", source.identity || source.url)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (previous.error) throw new Error("Could not check previous versions");
        const inserted = await db
          .from("resources")
          .insert({
            owner_id: context.userId,
            slug: `import-${detected.resource_type}-${scan.sha256.slice(0, 24)}-${context.userId.slice(0, 8)}`,
            name: name.slice(0, 200),
            description: description.slice(0, 1000),
            resource_type: detected.resource_type,
            source: "url-import",
            source_url: source.url,
            repository_url: source.repository || null,
            version,
            license: source.license && source.license !== "NOASSERTION" ? source.license : null,
            installation_type: "document",
            installation_config: {
              draft_markdown: text,
              content_sha256: scan.sha256,
              scan_report: scan,
              review_state: "pending_security_review",
              detection: detected.signals,
              source_pin: source.version || null,
              source_identity: source.identity || source.url,
              supersedes_resource_id: previous.data?.id || null,
              labels: [
                detected.resource_type,
                "imported",
                scan.findings.length ? "attention" : "review-required",
                ...(previous.data ? ["update-candidate"] : []),
              ],
            },
            verified: false,
            published: false,
          })
          .select("id")
          .single();
        if (inserted.error) {
          if (inserted.error.code === "23505") {
            results.push({
              name,
              status: "duplicate",
              detail: "The same content was imported concurrently",
            });
            continue;
          }
          throw new Error("Private draft could not be saved");
        }
        results.push({
          name,
          status: previous.data ? "update-candidate" : "draft",
          id: inserted.data.id,
        });
      } catch (error) {
        results.push({
          name: source.filename,
          status: "failed",
          detail: error instanceof Error ? error.message : "Import failed",
        });
      }
    }
    return { results, publication_performed: false, antivirus: "not_run" };
  });
