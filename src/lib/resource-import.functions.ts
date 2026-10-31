import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prepareImportedDocument } from "./website-text";
import { publicText } from "./public-fetch.server";
import { scanResourceBytes } from "./resource-safety.server";
import { detectResourceMeta } from "./resource-detect";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp";

type ImportSource = {
  url: string;
  identity?: string;
  filename: string;
  version?: string;
  repository?: string;
  license?: string | undefined;
};

const RESOURCE_FILE_PATTERN =
  /(?:^|\/)(?:skill\.md|agent\.md|agents\.md|prompt\.md|guide\.md|tool\.md|plugin\.json|ai-plugin\.json|openapi\.json|mcp\.json)$/i;
const MAX_IMPORT_SOURCES = 100;

async function expandGitHubUrl(url: URL): Promise<ImportSource[]> {
  const segments = url.pathname.split("/").filter(Boolean);
  const [owner, repo] = segments;
  if (!owner || !repo || !/^[a-zA-Z0-9_.-]+$/.test(owner + repo))
    throw new Error("Use a GitHub repository or file URL");
  const sources: ImportSource[] = [];
  if (segments[2] === "blob" && segments.length >= 5) {
    const ref = segments[3]!;
    const filePath = segments.slice(4).join("/");
    const commit = JSON.parse(
      await publicText(
        `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
      ),
    ) as { sha: string };
    if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("Source commit could not be pinned");
    sources.push({
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${filePath}`,
      identity: `github:${owner}/${repo}/${filePath}`,
      filename: segments[segments.length - 1]!,
      version: `0.0.0+${commit.sha.slice(0, 12)}`,
      repository: `https://github.com/${owner}/${repo}`,
    });
    return sources;
  }
  if (segments[2] === "tree" && segments.length >= 4) {
    const ref = segments[3]!;
    const dirPath = segments.slice(4).join("/");
    const commit = JSON.parse(
      await publicText(
        `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`,
      ),
    ) as { sha: string };
    if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("Source commit could not be pinned");
    const pin = commit.sha;
    const repository = JSON.parse(
      await publicText(`https://api.github.com/repos/${owner}/${repo}`),
    ) as { license?: { spdx_id?: string } };
    const tree = JSON.parse(
      await publicText(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${pin}?recursive=1`,
      ),
    ) as { truncated?: boolean; tree: Array<{ path: string; type: string }> };
    if (tree.truncated)
      throw new Error(
        "Repository tree is truncated. Import a specific resource file or a smaller directory.",
      );
    const prefix = dirPath ? `${dirPath.replace(/\/*$/, "")}/` : "";
    const candidates = tree.tree.filter(
      (t) =>
        t.type === "blob" &&
        (!prefix || t.path.startsWith(prefix)) &&
        RESOURCE_FILE_PATTERN.test(t.path),
    );
    if (!candidates.length)
      throw new Error(
        "No supported resource files found in that directory. Supported files: skill.md, agent.md, agents.md, prompt.md, guide.md, tool.md, plugin.json, ai-plugin.json, openapi.json, mcp.json.",
      );
    if (candidates.length > 25)
      throw new Error("Directory has more than 25 candidates. Import a smaller directory.");
    for (const item of candidates)
      sources.push({
        url: `https://raw.githubusercontent.com/${owner}/${repo}/${pin}/${item.path}`,
        identity: `github:${owner}/${repo}/${item.path}`,
        filename: item.path.split("/").pop()!,
        version: `0.0.0+${pin.slice(0, 12)}`,
        repository: `https://github.com/${owner}/${repo}`,
        license: repository.license?.spdx_id,
      });
    return sources;
  }
  if (segments.length !== 2) throw new Error("Use a repository root or a GitHub blob URL");
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
    await publicText(`https://api.github.com/repos/${owner}/${repo}/git/trees/${pin}?recursive=1`),
  ) as { truncated?: boolean; tree: Array<{ path: string; type: string }> };
  if (tree.truncated)
    throw new Error(
      "Repository tree is truncated. Import a specific resource file or a smaller repository.",
    );
  const candidates = tree.tree.filter(
    (t) => t.type === "blob" && RESOURCE_FILE_PATTERN.test(t.path),
  );
  if (candidates.length > 25)
    throw new Error(
      "Repository has more than 25 candidates. Import a specific directory's resource file.",
    );
  if (!candidates.length)
    candidates.push(
      ...tree.tree.filter((t) => t.type === "blob" && /^readme\.md$/i.test(t.path)).slice(0, 1),
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
  return sources;
}

function collectPageLinks(html: string, base: URL): URL[] {
  const links: URL[] = [];
  const seen = new Set<string>();
  const pattern = /href\s*=\s*["']([^"'#\s]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const href = match[1]!;
    if (seen.has(href)) continue;
    seen.add(href);
    try {
      const resolved = new URL(href, base);
      if (resolved.protocol === "https:") links.push(resolved);
    } catch {
      // skip malformed links
    }
  }
  return links;
}

async function expandWebsiteUrl(url: URL): Promise<ImportSource[]> {
  const html = await publicText(url.href);
  const links = collectPageLinks(html, url);
  const sources: ImportSource[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (!RESOURCE_FILE_PATTERN.test(link.pathname) || seen.has(link.href)) continue;
    seen.add(link.href);
    sources.push({
      url: link.href,
      filename: link.pathname.split("/").pop() || "resource.md",
    });
  }
  for (const link of links) {
    const segments = link.pathname.split("/").filter(Boolean);
    const [owner, repo] = segments;
    const key = `github:${owner}/${repo}`;
    if (
      link.hostname !== "github.com" ||
      segments.length !== 2 ||
      !owner ||
      !repo ||
      !/^[a-zA-Z0-9_.-]+$/.test(owner + repo) ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    try {
      sources.push(...(await expandGitHubUrl(link)));
    } catch {
      // skip repositories that cannot be inspected
    }
  }
  return sources;
}

const SKILLS_SH_RESERVED = new Set([
  "site",
  "agent",
  "agents",
  "packs",
  "pack",
  "topic",
  "topics",
  "official",
  "audits",
  "docs",
  "doc",
  "trending",
  "hot",
  "about",
  "api",
  "login",
  "settings",
]);

async function expandSkillsShUrl(url: URL): Promise<ImportSource[] | null> {
  const segments = url.pathname.split("/").filter(Boolean);
  const [owner, repo, skill] = segments;
  if (!owner || !repo || !/^[a-zA-Z0-9_.-]+$/.test(owner + repo)) return null;
  if (SKILLS_SH_RESERVED.has(owner)) return null;
  if (!skill) return expandGitHubUrl(new URL(`https://github.com/${owner}/${repo}`));
  return expandSkillSources(owner, repo, skill);
}

async function expandSkillSources(
  owner: string,
  repo: string,
  skill: string,
): Promise<ImportSource[]> {
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
    await publicText(`https://api.github.com/repos/${owner}/${repo}/git/trees/${pin}?recursive=1`),
  ) as { truncated?: boolean; tree: Array<{ path: string; type: string }> };
  if (tree.truncated)
    throw new Error(
      "Repository tree is truncated. Import the GitHub repository URL directly instead.",
    );
  const slug = skill.replace(/[^a-zA-Z0-9_-]/g, "");
  const nested = new RegExp(`(?:^|/)${slug}/skill[.]md$`, "i");
  const flat = new RegExp(`^${slug}[.]md$`, "i");
  let candidates = tree.tree.filter(
    (t) => t.type === "blob" && (nested.test(t.path) || flat.test(t.path)),
  );
  if (!candidates.length) {
    const allSkills = tree.tree.filter(
      (t) => t.type === "blob" && (t.path.split("/").pop() ?? "").toLowerCase() === "skill.md",
    );
    if (allSkills.length === 1) candidates = allSkills;
  }
  if (!candidates.length)
    throw new Error(
      "Skill not found in that repository. Import the repository page or the GitHub repository URL instead.",
    );
  if (candidates.length > 25)
    throw new Error("Skill matched more than 25 files. Import the repository page instead.");
  const sources: ImportSource[] = [];
  for (const item of candidates)
    sources.push({
      url: `https://raw.githubusercontent.com/${owner}/${repo}/${pin}/${item.path}`,
      identity: `github:${owner}/${repo}/${item.path}`,
      filename: item.path.split("/").pop()!,
      version: `0.0.0+${pin.slice(0, 12)}`,
      repository: `https://github.com/${owner}/${repo}`,
      license: repository.license?.spdx_id,
    });
  return sources;
}

function parseSkillsInstallCommand(raw: string): { url: string; skill: string | null } | null {
  const tokens = raw.trim().split(" ").filter(Boolean);
  if (tokens.length < 4) return null;
  if ((tokens[0] || "").toLowerCase() !== "npx") return null;
  if ((tokens[1] || "").toLowerCase() !== "skills") return null;
  if ((tokens[2] || "").toLowerCase() !== "add") return null;
  const url = tokens[3] ?? "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null;
  let skill: string | null = null;
  for (let i = 4; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    const next = tokens[i + 1] ?? "";
    if (token === "--skill" || token === "--agent") {
      if (next && !next.startsWith("--")) {
        skill = next;
      }
    } else if (token.startsWith("--skill=") || token.startsWith("--agent=")) {
      const value = token.slice(token.indexOf("=") + 1);
      if (value) skill = value;
    }
  }
  return { url, skill };
}

async function expandImportUrl(url: URL, skill?: string | null): Promise<ImportSource[]> {
  if (skill) {
    const segments = url.pathname.split("/").filter(Boolean);
    const isGithub = url.hostname === "github.com";
    const isSkillsSh = url.hostname === "skills.sh" || url.hostname === "www.skills.sh";
    const [owner, repo] = segments;
    if ((isGithub || isSkillsSh) && owner && repo && /^[a-zA-Z0-9_.-]+$/.test(owner + repo)) {
      return expandSkillSources(owner, repo, skill);
    }
    throw new Error("Skill selection is supported for GitHub and skills.sh repository URLs only.");
  }
  if (url.hostname === "github.com") {
    return expandGitHubUrl(url);
  }
  if (url.hostname === "skills.sh" || url.hostname === "www.skills.sh") {
    const expanded = await expandSkillsShUrl(url);
    if (expanded) return expanded;
  }
  return expandWebsiteUrl(url);
}

export const importResourceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string }) => {
    const command = parseSkillsInstallCommand(input.url);
    if (command) return { url: command.url, skill: command.skill };
    return {
      url: normalizeRemoteMcpEndpoint("custom_mcp", input.url),
      skill: null as string | null,
    };
  })
  .handler(async ({ data, context }) => {
    const url = new URL(data.url);
    if (
      [...url.searchParams.keys()].some((k) =>
        /token|secret|key|password|signature|authorization/i.test(k),
      )
    )
      throw new Error("Use a public source URL without credentials; upload private files instead");
    const sources = await expandImportUrl(url, data.skill);
    const db = context.supabase as SupabaseClient;
    const results: Array<{
      name: string;
      status: string;
      id?: string;
      detail?: string | undefined;
    }> = [];
    if (sources.length > MAX_IMPORT_SOURCES) {
      results.push({
        name: `${sources.length - MAX_IMPORT_SOURCES} additional resource(s)`,
        status: "deferred",
        detail: `Import caps at ${MAX_IMPORT_SOURCES} sources per URL.`,
      });
    }
    const importSources = sources.slice(0, MAX_IMPORT_SOURCES);
    if (!importSources.length)
      importSources.push({
        url: url.href,
        filename: url.pathname.split("/").pop() || "website.md",
      });
    const deadline = Date.now() + 40000;
    let publishedCount = 0;
    for (const source of importSources) {
      if (Date.now() > deadline) {
        results.push({
          name: source.filename,
          status: "deferred",
          detail: "Import time budget reached. Import this file URL separately.",
        });
        continue;
      }
      try {
        const document = prepareImportedDocument(source.filename, await publicText(source.url));
        const text = document.text;
        const bytes = new TextEncoder().encode(text);
        const scan = scanResourceBytes(document.filename, bytes);
        if (scan.state === "blocked") {
          results.push({
            name: source.filename,
            status: "blocked",
            detail: scan.findings.join("; "),
          });
          continue;
        }
        const detected = detectResourceMeta({ filename: document.filename, contentText: text });
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
        const config = {
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
        };
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
            installation_config: config,
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
        let status = previous.data ? "update-candidate" : "draft";
        let detail: string | undefined;
        if (scan.findings.length === 0) {
          const publication = await db
            .from("resources")
            .update({
              verified: true,
              published: true,
              installation_config: {
                ...config,
                review_state: "approved",
                labels: [
                  detected.resource_type,
                  "imported",
                  "auto-published",
                  ...(previous.data ? ["update-candidate"] : []),
                ],
              },
            })
            .eq("id", inserted.data.id)
            .select("id")
            .maybeSingle();
          if (publication.error) {
            detail = "Auto-publish was rejected. The draft stays private for review.";
          } else {
            status = "published";
            detail = "Live in Marketplace for all signed-in users.";
            publishedCount += 1;
          }
        }
        results.push({ name, status, id: inserted.data.id, detail });
      } catch (error) {
        results.push({
          name: source.filename,
          status: "failed",
          detail: error instanceof Error ? error.message : "Import failed",
        });
      }
    }
    return { results, publication_performed: publishedCount > 0, antivirus: "not_run" };
  });
