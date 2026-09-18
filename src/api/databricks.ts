import { RestEndpoint } from "@data-client/rest";
import { BaseEndpoint } from "./BaseEndpoint";

export type DatabricksStatus = {
  configured: boolean;
  reachable: boolean | null;
  catalog: string | null;
  schema: string | null;
};

export const getDatabricksStatus = new BaseEndpoint({
  path: "/api/v1/databricks",
  schema: {} as DatabricksStatus,
});

export const syncDatabricks = new RestEndpoint({
  urlPrefix: "",
  path: "/api/v1/databricks",
  method: "POST",
  body: {} as { bootstrap?: boolean },
  schema: {} as {
    ok: boolean;
    memoryRecords: number;
    knowledgeItems: number;
    resources: number;
  },
});
