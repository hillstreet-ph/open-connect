import { BaseEndpoint } from "./BaseEndpoint";

export type DatabricksStatus = {
  configured: boolean;
  sourceOfTruth: "supabase";
};

export const getDatabricksStatus = new BaseEndpoint({
  path: "/api/v1/databricks",
  schema: {} as DatabricksStatus,
});
