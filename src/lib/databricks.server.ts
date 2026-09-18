import { createHmac } from "node:crypto";

type StatementParameter = { name: string; value: string; type?: string };
type StatementResponse = {
  statement_id?: string;
  status?: { state?: string; error?: { message?: string } };
  result?: { data_array?: unknown[][] };
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function databricksConfig() {
  const host = env("DATABRICKS_HOST").replace(/\/+$/, "");
  const token = env("DATABRICKS_TOKEN");
  const warehouseId = env("DATABRICKS_WAREHOUSE_ID");
  const catalog = env("DATABRICKS_CATALOG") || "open_connect";
  const schema = env("DATABRICKS_SCHEMA") || "production";
  if (host && !host.startsWith("https://")) throw new Error("DATABRICKS_HOST must use HTTPS");
  if (!IDENTIFIER.test(catalog) || !IDENTIFIER.test(schema)) {
    throw new Error("Databricks catalog and schema must be simple SQL identifiers");
  }
  return {
    host,
    token,
    warehouseId,
    catalog,
    schema,
    configured: Boolean(host && token && warehouseId),
  };
}

export async function executeDatabricksStatement(
  statement: string,
  parameters: StatementParameter[] = [],
): Promise<StatementResponse> {
  const config = databricksConfig();
  if (!config.configured) throw new Error("Databricks is not configured");
  const response = await fetch(`${config.host}/api/2.0/sql/statements`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      warehouse_id: config.warehouseId,
      statement,
      parameters,
      wait_timeout: "30s",
      on_wait_timeout: "CANCEL",
      format: "JSON_ARRAY",
      disposition: "INLINE",
    }),
    signal: AbortSignal.timeout(35_000),
  });
  const payload = (await response.json().catch(() => ({}))) as StatementResponse;
  if (!response.ok || payload.status?.state === "FAILED") {
    throw new Error(
      payload.status?.error?.message || `Databricks SQL returned HTTP ${response.status}`,
    );
  }
  return payload;
}

export async function databricksReachable(): Promise<boolean> {
  if (!databricksConfig().configured) return false;
  try {
    await executeDatabricksStatement("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

export async function ensureOpenConnectLakehouse() {
  const { catalog, schema } = databricksConfig();
  const namespace = `${catalog}.${schema}`;
  const statements = [
    `CREATE SCHEMA IF NOT EXISTS ${namespace} COMMENT 'Governed Open-Connect analytics and knowledge mirror'`,
    `CREATE TABLE IF NOT EXISTS ${namespace}.memory_records (id STRING, user_key STRING, project_id STRING, title STRING, content STRING, memory_type STRING, importance INT, pinned BOOLEAN, tags ARRAY<STRING>, expires_at TIMESTAMP, created_at TIMESTAMP, updated_at TIMESTAMP, synced_at TIMESTAMP) USING DELTA`,
    `CREATE TABLE IF NOT EXISTS ${namespace}.knowledge_items (id STRING, user_key STRING, project_id STRING, title STRING, content STRING, source_type STRING, source_url STRING, mime_type STRING, status STRING, tags ARRAY<STRING>, created_at TIMESTAMP, updated_at TIMESTAMP, synced_at TIMESTAMP) USING DELTA`,
    `CREATE TABLE IF NOT EXISTS ${namespace}.resources (id STRING, slug STRING, name STRING, description STRING, resource_type STRING, category_slug STRING, license STRING, verified BOOLEAN, published BOOLEAN, source STRING, updated_at TIMESTAMP, synced_at TIMESTAMP) USING DELTA`,
    `ALTER TABLE ${namespace}.memory_records SET TBLPROPERTIES ('open_connect.classification'='SENSITIVE','open_connect.retention_days'='365')`,
    `ALTER TABLE ${namespace}.knowledge_items SET TBLPROPERTIES ('open_connect.classification'='SENSITIVE','open_connect.retention_days'='365')`,
    `ALTER TABLE ${namespace}.resources SET TBLPROPERTIES ('open_connect.classification'='INTERNAL','open_connect.retention_days'='1825')`,
  ];
  for (const statement of statements) await executeDatabricksStatement(statement);
}

function userKey(userId: string): string {
  const key = env("DATABRICKS_PSEUDONYMIZATION_KEY");
  if (!key) throw new Error("DATABRICKS_PSEUDONYMIZATION_KEY is required for private data sync");
  return createHmac("sha256", key).update(userId).digest("hex");
}

function value(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

type SyncDefinition = {
  table: "memory_records" | "knowledge_items" | "resources";
  columns: string[];
  privateRows?: boolean;
};

export async function upsertDatabricksRows(
  definition: SyncDefinition,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return 0;
  const { catalog, schema } = databricksConfig();
  let count = 0;
  for (const [batchIndex, batch] of Array.from({ length: Math.ceil(rows.length / 50) }, (_, i) =>
    rows.slice(i * 50, i * 50 + 50),
  ).entries()) {
    const columns = definition.privateRows
      ? definition.columns.map((column) => (column === "user_id" ? "user_key" : column))
      : definition.columns;
    const parameters: StatementParameter[] = [];
    const tuples = batch.map((row, rowIndex) => {
      const cells = definition.columns.map((column, columnIndex) => {
        const name = `b${batchIndex}_r${rowIndex}_c${columnIndex}`;
        const raw = column === "user_id" ? userKey(value(row[column])) : value(row[column]);
        parameters.push({ name, value: raw, type: "STRING" });
        return `:${name}`;
      });
      return `(${cells.join(", ")}, current_timestamp())`;
    });
    const projected = columns
      .map((column) =>
        column === "importance"
          ? `try_cast(${column} AS INT) AS ${column}`
          : column === "pinned" || column === "verified" || column === "published"
            ? `try_cast(${column} AS BOOLEAN) AS ${column}`
            : column === "tags"
              ? `from_json(tags, 'ARRAY<STRING>') AS tags`
              : ["expires_at", "created_at", "updated_at"].includes(column)
                ? `try_cast(${column} AS TIMESTAMP) AS ${column}`
                : column,
      )
      .concat("synced_at")
      .join(", ");
    const sourceColumns = columns.concat("synced_at").join(", ");
    const updates = columns
      .filter((column) => column !== "id")
      .map((column) => `target.${column} = source.${column}`)
      .concat("target.synced_at = source.synced_at")
      .join(", ");
    await executeDatabricksStatement(
      `MERGE INTO ${catalog}.${schema}.${definition.table} AS target
       USING (SELECT ${projected} FROM VALUES ${tuples.join(", ")} AS incoming(${sourceColumns})) AS source
       ON target.id = source.id
       WHEN MATCHED THEN UPDATE SET ${updates}
       WHEN NOT MATCHED THEN INSERT (${sourceColumns}) VALUES (${sourceColumns
         .split(", ")
         .map((column) => `source.${column.trim()}`)
         .join(", ")})`,
      parameters,
    );
    count += batch.length;
  }
  return count;
}
