---
name: open-databricks-kit
description: Operate authorized Databricks workspaces across SQL warehouses, Unity Catalog, notebooks, jobs, pipelines, clusters, model serving, files, secret references, permissions, and monitoring. Use for data or AI setup, deployment, repair, governance, or verification.
---

# Open Databricks Kit

Use the connected API, CLI, or SDK. Confirm workspace host and cloud before every write.

## Workflow

1. Identify account, workspace, metastore, catalog/schema, compute policy, environment, and data class.
2. Inventory warehouses, clusters, jobs, pipelines, notebooks, repos, models, principals, grants, and monitors.
3. Prefer version-controlled bundles and least-privilege principals; reuse governed resources.
4. Validate code and SQL in development, then deploy a reviewed bundle.
5. Start or change paid compute only with explicit authorization and bounded configuration.
6. Verify deployment, runs, quality, lineage, permissions, endpoints, logs, and cost controls.

## Guardrails

Never expose tokens, secret scopes, credentials, customer data, or sensitive notebook outputs. Do not grant broad catalog privileges, modify production tables, terminate compute, delete resources, or change security without approval. Never bypass Unity Catalog, policies, or promotion gates. Avoid duplicate resources.
