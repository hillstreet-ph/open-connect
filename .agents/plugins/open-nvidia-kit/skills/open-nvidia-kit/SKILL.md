---
name: open-nvidia-kit
description: Operate NVIDIA AI resources end to end, including discovering and installing NVIDIA agent skills (npx skills add NVIDIA/skills for Claude Code, Codex, and other agents), deploying NVIDIA NIM microservices, and using NVIDIA Build blueprints and playbooks for GPU-accelerated, Physical AI, robotics, simulation, CUDA, and RAG workflows. Use for any NVIDIA product, SDK, GPU, Jetson, CUDA, NIM, NeMo, Omniverse, Isaac, RAPIDS, or build.nvidia.com request.
---

# Open NVIDIA Kit

Route NVIDIA work to the official NVIDIA skill registry and NVIDIA Build, never guessing API details.

## Workflow

1. Detect the NVIDIA product area: NIM inference, CUDA, NeMo training, Physical AI, Isaac robotics, Omniverse simulation, RAPIDS data processing, or Jetson edge.
2. Discover the right skill in the live NVIDIA catalog before writing custom code; the registry holds hundreds of curated skills.
3. Install skills into the working agent with `npx skills add NVIDIA/skills`, or scoped per agent with `npx skills add NVIDIA/skills --agent codex` or `npx skills add NVIDIA/skills --agent claude-code`.
4. For solution-level starting points, use the NVIDIA Build blueprints at https://build.nvidia.com/blueprints and playbooks at https://build.nvidia.com/playbooks.
5. Run NVIDIA NIM and NVCHECK endpoints through the AI Gateway with a stored provider credential; never expose provider tokens.
6. Validate on real endpoints, record model or container versions, and keep GPU-specific flags documented.

## Capabilities

- NVIDIA skills registry discovery, installation, and updates for Claude Code, Codex, Cursor, and compatible agents.
- NIM microservice deployment, model catalogs, and OpenAI-compatible inference endpoints.
- NVIDIA Build blueprints (production-ready AI workflow templates) and playbooks (guided operational runbooks).
- CUDA, RAPIDS, NeMo, Isaac, Omniverse, and Jetson skill routing without vendoring NVIDIA source into this repository.

## Sources

- Skills registry: https://github.com/NVIDIA/skills (CC-BY-4.0 / Apache-2.0, authored by NVIDIA)
- Blueprints: https://build.nvidia.com/blueprints
- Playbooks: https://build.nvidia.com/playbooks

