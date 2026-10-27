/**
 * Cloud Computer (Zeabur-hosted Linux desktops) and Cloud Phone numbers (Twilio).
 * Server-only: provider credentials and desktop passwords must never reach logs or clients.
 */
import { parseTwilioBundle } from "./twilio.server.ts";

const ZEABUR_GRAPHQL = "https://api.zeabur.com/graphql";
export const DESKTOP_IMAGE = "lscr.io/linuxserver/webtop:ubuntu-xfce";
export const DESKTOP_PORT = 3000;
const PROJECT_NAME = "open-connect-computers";

type Fetch = typeof globalThis.fetch;

export class CloudResourceError extends Error {}

export type CloudComputerPlan = {
  id: "standard" | "advanced" | "performance";
  label: string;
  use: string;
  vcpu: number;
  memoryGb: number;
};

/**
 * Resource tiers follow the Zeabur plan the services run on; no billing is attached yet.
 * Zeabur's API does not set per-service CPU or memory limits, so tiers are guidance only.
 */
export const CLOUD_COMPUTER_PLANS: CloudComputerPlan[] = [
  {
    id: "standard",
    label: "Standard",
    use: "Personal projects: simple automated tools or a small script running 24/7.",
    vcpu: 2,
    memoryGb: 4,
  },
  {
    id: "advanced",
    label: "Advanced",
    use: "Browser automation, development tools and several apps at once.",
    vcpu: 4,
    memoryGb: 8,
  },
  {
    id: "performance",
    label: "Performance",
    use: "Heavy builds, data processing and multiple agents.",
    vcpu: 8,
    memoryGb: 16,
  },
];

/** Stable, non-reversible per-user prefix used to scope services in the shared project. */
export async function computerPrefix(userId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `oc-${hex.slice(0, 10)}`;
}

export function generateDesktopPassword(bytes = 18) {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  // URL-safe base64 keeps full entropy and length (18 bytes -> 24 characters).
  return btoa(String.fromCharCode(...raw))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomSuffix() {
  return [...crypto.getRandomValues(new Uint8Array(3))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function desktopServiceSchema(name: string, password: string, timezone = "Asia/Manila") {
  if (!/^oc-[a-f0-9]{10}-[a-z0-9]{4,12}$/.test(name)) throw new CloudResourceError("Invalid name");
  // Browser-supplied; keep it to IANA zone characters before it reaches the container env.
  const tz = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(timezone) ? timezone : "UTC";
  return {
    id: name,
    name,
    description: "Open-Connect Cloud Computer (Ubuntu XFCE desktop in the browser)",
    tags: ["open-connect", "cloud-computer"],
    icon: "",
    docs: "",
    source: { image: DESKTOP_IMAGE, command: [], args: [] },
    ports: [{ id: "web", port: DESKTOP_PORT, type: "HTTP" }],
    volumes: [{ id: "config", dir: "/config" }],
    instructions: [],
    env: [
      { key: "PUID", required: false, default: "1000", expose: false, readonly: false },
      { key: "PGID", required: false, default: "1000", expose: false, readonly: false },
      { key: "TZ", required: false, default: tz, expose: false, readonly: false },
      { key: "CUSTOM_USER", required: true, default: "opc", expose: false, readonly: false },
      { key: "PASSWORD", required: true, default: password, expose: false, readonly: false },
    ],
    initRules: [],
    configs: [],
  };
}

export async function zeaburRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  request: Fetch = (input, init) => globalThis.fetch(input, init),
): Promise<T> {
  let response: Response;
  try {
    response = await request(ZEABUR_GRAPHQL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CloudResourceError("Zeabur could not be reached. Try again shortly.");
  }
  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    errors?: Array<{ message?: unknown }>;
  };
  if (!response.ok || payload.errors?.length || !payload.data) {
    const message = payload.errors?.[0]?.message;
    // Zeabur error text describes the operation, never echoes the bearer token.
    throw new CloudResourceError(
      typeof message === "string" && message.length < 300
        ? `Zeabur: ${message}`
        : `Zeabur returned HTTP ${response.status}`,
    );
  }
  return payload.data;
}

export type ZeaburRegion = { id: string; name: string; description: string };

export async function listZeaburRegions(token: string, request?: Fetch) {
  const data = await zeaburRequest<{
    regions: Array<ZeaburRegion & { available: boolean }>;
  }>(token, "query { regions { id name description available } }", {}, request);
  return data.regions
    .filter((region) => region.available)
    .map(({ id, name, description }) => ({ id, name, description }));
}

type ProjectNode = { _id: string; name: string; region: { id: string } };
const PAGE = 100;
const MAX_PAGES = 50;

/** Reads every page so ownership checks never miss items past the first page. */
async function listAllProjects(token: string, request?: Fetch): Promise<ProjectNode[]> {
  const all: ProjectNode[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await zeaburRequest<{
      projects: { edges: Array<{ node: ProjectNode }>; pageInfo?: { hasNextPage?: boolean } };
    }>(
      token,
      "query ($skip: Int!, $limit: Int!) { projects(skip: $skip, limit: $limit) { edges { node { _id name region { id } } } pageInfo { hasNextPage } } }",
      { skip: page * PAGE, limit: PAGE },
      request,
    );
    all.push(...data.projects.edges.map((edge) => edge.node));
    if (!data.projects.pageInfo?.hasNextPage) break;
  }
  return all;
}

async function ensureProject(token: string, region: string, request?: Fetch) {
  const projects = await listAllProjects(token, request);
  const name = `${PROJECT_NAME}-${region.replace(/[^a-z0-9-]/gi, "").toLowerCase()}`.slice(0, 60);
  const existing = projects.find((project) => project.name === name);
  if (existing) return existing._id;
  const created = await zeaburRequest<{ createProject: { _id: string } }>(
    token,
    "mutation ($region: String!, $name: String!) { createProject(region: $region, name: $name) { _id } }",
    { region, name },
    request,
  );
  return created.createProject._id;
}

async function environmentOf(token: string, projectId: string, request?: Fetch) {
  const data = await zeaburRequest<{ environments: Array<{ _id: string }> }>(
    token,
    "query ($projectID: ObjectID!) { environments(projectID: $projectID) { _id } }",
    { projectID: projectId },
    request,
  );
  const id = data.environments[0]?._id;
  if (!id) throw new CloudResourceError("Zeabur project has no environment");
  return id;
}

type ServiceNode = {
  _id: string;
  name: string;
  createdAt: string;
  status: string;
  domains: Array<{ domain: string }>;
};

async function listProjectServices(
  token: string,
  projectId: string,
  environmentId: string,
  request?: Fetch,
): Promise<ServiceNode[]> {
  const all: ServiceNode[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await zeaburRequest<{
      services: { edges: Array<{ node: ServiceNode }>; pageInfo?: { hasNextPage?: boolean } };
    }>(
      token,
      `query ($projectID: ObjectID!, $environmentID: ObjectID!, $skip: Int!, $limit: Int!) {
        services(projectID: $projectID, skip: $skip, limit: $limit) {
          edges { node { _id name createdAt status(environmentID: $environmentID)
            domains(environmentID: $environmentID) { domain } } }
          pageInfo { hasNextPage }
        }
      }`,
      { projectID: projectId, environmentID: environmentId, skip: page * PAGE, limit: PAGE },
      request,
    );
    all.push(...data.services.edges.map((edge) => edge.node));
    if (!data.services.pageInfo?.hasNextPage) break;
  }
  return all;
}

export type CloudComputer = {
  id: string;
  name: string;
  projectId: string;
  environmentId: string;
  region: string;
  status: string;
  url: string | null;
  createdAt: string;
};

export async function listCloudComputers(
  token: string,
  userId: string,
  request?: Fetch,
): Promise<CloudComputer[]> {
  const prefix = await computerPrefix(userId);
  const projects = await listAllProjects(token, request);
  const computers: CloudComputer[] = [];
  for (const node of projects) {
    if (!node.name.startsWith(PROJECT_NAME)) continue;
    const environmentId = await environmentOf(token, node._id, request);
    for (const service of await listProjectServices(token, node._id, environmentId, request)) {
      if (!service.name.startsWith(`${prefix}-`)) continue;
      const domain = service.domains[0]?.domain;
      computers.push({
        id: service._id,
        name: service.name,
        projectId: node._id,
        environmentId,
        region: node.region.id,
        status: service.status,
        url: domain ? `https://${domain}` : null,
        createdAt: service.createdAt,
      });
    }
  }
  return computers;
}

export async function createCloudComputer(
  token: string,
  userId: string,
  input: { region: string; timezone?: string | undefined; maxPerUser: number },
  request?: Fetch,
) {
  const existing = await listCloudComputers(token, userId, request);
  if (existing.length >= input.maxPerUser)
    throw new CloudResourceError(
      `You already have ${existing.length} Cloud Computer(s); the limit is ${input.maxPerUser}.`,
    );
  const prefix = await computerPrefix(userId);
  const name = `${prefix}-${randomSuffix()}`;
  const password = generateDesktopPassword();
  const projectId = await ensureProject(token, input.region, request);
  const created = await zeaburRequest<{ createPrebuiltService: { _id: string } }>(
    token,
    "mutation ($projectID: ObjectID!, $schema: ServiceSpecSchemaInput!) { createPrebuiltService(projectID: $projectID, schema: $schema) { _id } }",
    { projectID: projectId, schema: desktopServiceSchema(name, password, input.timezone) },
    request,
  );
  const serviceId = created.createPrebuiltService._id;
  try {
    // Concurrent requests can both pass the pre-check. Keep the oldest desktops up to the
    // limit so exactly the extra ones remove themselves.
    const after = await listCloudComputers(token, userId, request);
    if (!after.some((item) => item.id === serviceId))
      after.push({ id: serviceId, createdAt: new Date().toISOString() } as CloudComputer);
    const kept = after
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .slice(0, input.maxPerUser)
      .map((item) => item.id);
    if (!kept.includes(serviceId))
      throw new CloudResourceError(
        `Another Cloud Computer was created at the same time; the limit is ${input.maxPerUser}.`,
      );
    const environmentId = await environmentOf(token, projectId, request);
    const domain = await zeaburRequest<{ addDomain: { domain: string } }>(
      token,
      "mutation ($serviceID: ObjectID!, $environmentID: ObjectID!, $isGenerated: Boolean!, $domain: String!) { addDomain(serviceID: $serviceID, environmentID: $environmentID, isGenerated: $isGenerated, domain: $domain) { domain } }",
      { serviceID: serviceId, environmentID: environmentId, isGenerated: true, domain: name },
      request,
    );
    return {
      id: serviceId,
      name,
      url: `https://${domain.addDomain.domain}`,
      username: "opc",
      password,
    };
  } catch (error) {
    // Never leave a running desktop whose password was not delivered or saved.
    await zeaburRequest(
      token,
      "mutation ($id: ObjectID!) { deleteService(_id: $id) }",
      { id: serviceId },
      request,
    ).catch(() => undefined);
    throw error;
  }
}

/** Confirms the service belongs to this user before any state change. */
async function ownedComputer(token: string, userId: string, serviceId: string, request?: Fetch) {
  const computer = (await listCloudComputers(token, userId, request)).find(
    (item) => item.id === serviceId,
  );
  if (!computer) throw new CloudResourceError("Cloud Computer not found");
  return computer;
}

export async function controlCloudComputer(
  token: string,
  userId: string,
  serviceId: string,
  action: "restart" | "suspend" | "delete",
  request?: Fetch,
) {
  const computer = await ownedComputer(token, userId, serviceId, request);
  const ids = { serviceID: computer.id, environmentID: computer.environmentId };
  if (action === "delete") {
    await zeaburRequest(
      token,
      "mutation ($id: ObjectID!) { deleteService(_id: $id) }",
      { id: computer.id },
      request,
    );
  } else {
    const field = action === "restart" ? "restartService" : "suspendService";
    await zeaburRequest(
      token,
      `mutation ($serviceID: ObjectID!, $environmentID: ObjectID!) { ${field}(serviceID: $serviceID, environmentID: $environmentID) }`,
      ids,
      request,
    );
  }
  return { ok: true as const, name: computer.name };
}

// ---------------------------------------------------------------- Twilio phone numbers

export type PhoneNumberType = "Local" | "Mobile" | "TollFree";

async function twilioRequest(
  bundleValue: string,
  url: string,
  init: RequestInit = {},
  request: Fetch = (input, i) => globalThis.fetch(input, i),
) {
  const bundle = parseTwilioBundle(bundleValue);
  let response: Response;
  try {
    response = await request(url.replace("{AccountSid}", bundle.accountSid), {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Basic ${btoa(`${bundle.keySid}:${bundle.secret}`)}`,
        ...(init.body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new CloudResourceError("Twilio could not be reached. Try again shortly.");
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof payload["message"] === "string" ? payload["message"] : "";
    throw new CloudResourceError(
      `Twilio returned HTTP ${response.status}${message && message.length < 300 ? `: ${message}` : ""}`,
    );
  }
  return payload;
}

const API = "https://api.twilio.com/2010-04-01/Accounts/{AccountSid}";

export function validCountry(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) throw new CloudResourceError("Invalid country code");
  return code;
}

export async function searchPhoneNumbers(
  bundle: string,
  input: { country: string; type: PhoneNumberType; contains?: string | undefined },
  request?: Fetch,
) {
  const country = validCountry(input.country);
  const query = new URLSearchParams({ PageSize: "10" });
  if (input.contains && /^[0-9*]{2,10}$/.test(input.contains))
    query.set("Contains", input.contains);
  const [available, pricing] = await Promise.all([
    twilioRequest(
      bundle,
      `${API}/AvailablePhoneNumbers/${country}/${input.type}.json?${query}`,
      {},
      request,
    ),
    twilioRequest(
      bundle,
      `https://pricing.twilio.com/v1/PhoneNumbers/Countries/${country}`,
      {},
      request,
    ).catch(() => null),
  ]);
  const prices = Array.isArray(pricing?.["phone_number_prices"])
    ? (pricing["phone_number_prices"] as Array<Record<string, unknown>>)
    : [];
  const typeKey = { Local: "local", Mobile: "mobile", TollFree: "toll free" }[input.type];
  const price = prices.find((p) => String(p["number_type"]).toLowerCase() === typeKey);
  const numbers = Array.isArray(available["available_phone_numbers"])
    ? (available["available_phone_numbers"] as Array<Record<string, unknown>>)
    : [];
  return {
    monthlyPrice: price ? String(price["current_price"] ?? price["base_price"] ?? "") : null,
    currency: typeof pricing?.["price_unit"] === "string" ? pricing["price_unit"] : null,
    numbers: numbers.map((n) => ({
      phoneNumber: String(n["phone_number"] ?? ""),
      friendlyName: String(n["friendly_name"] ?? ""),
      locality: String(n["locality"] ?? n["region"] ?? ""),
      capabilities: (n["capabilities"] ?? {}) as Record<string, boolean>,
    })),
  };
}

export async function listOwnedPhoneNumbers(bundle: string, request?: Fetch) {
  const data = await twilioRequest(
    bundle,
    `${API}/IncomingPhoneNumbers.json?PageSize=50`,
    {},
    request,
  );
  const rows = Array.isArray(data["incoming_phone_numbers"])
    ? (data["incoming_phone_numbers"] as Array<Record<string, unknown>>)
    : [];
  return rows.map((n) => ({
    sid: String(n["sid"] ?? ""),
    phoneNumber: String(n["phone_number"] ?? ""),
    friendlyName: String(n["friendly_name"] ?? ""),
    capabilities: (n["capabilities"] ?? {}) as Record<string, boolean>,
  }));
}

export async function purchasePhoneNumber(bundle: string, phoneNumber: string, request?: Fetch) {
  if (!/^\+[1-9][0-9]{6,14}$/.test(phoneNumber))
    throw new CloudResourceError("Invalid phone number");
  const data = await twilioRequest(
    bundle,
    `${API}/IncomingPhoneNumbers.json`,
    { method: "POST", body: new URLSearchParams({ PhoneNumber: phoneNumber }) },
    request,
  );
  return { sid: String(data["sid"] ?? ""), phoneNumber: String(data["phone_number"] ?? "") };
}
