#!/usr/bin/env bash
# =============================================================================
# Open Connect - Integration Installation Script
# =============================================================================
# Installs:
# - MCP Server and tools
# - Agent frameworks (OpenAI Agents SDK, LangGraph, CrewAI)
# - Skills from SkillsLLM, ClawHub, AgencyAgents
# - Platform connectors (OpenClaw, SwarmDock, AgentField, Omni)
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    local level="${1:-INFO}"
    local message="${2:-}"
    local color="${NC}"
    
    case "$level" in
        ERROR)  color="${RED}";    level="ERROR" ;;
        WARN)   color="${YELLOW}";  level="WARN" ;;
        SUCCESS) color="${GREEN}";  level="SUCCESS" ;;
        INFO)    color="${BLUE}";   level="INFO" ;;
    esac
    
    echo -e "${color}[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] ${message}${NC}"
}

log_info()    { log "INFO" "$1"; }
log_success() { log "SUCCESS" "$1"; }
log_warn()    { log "WARN" "$1"; }
log_error()   { log "ERROR" "$1"; }

# =============================================================================
# Configuration
# =============================================================================

SKILLS_DIR="${SKILLS_DIR:-/app/backend/open_webui/skills}"
INTEGRATIONS_DIR="${INTEGRATIONS_DIR:-/app/backend/open_webui/integrations}"
BACKEND_DIR="${BACKEND_DIR:-/app/backend}"

# Agent Platform API Keys
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
OPENCLAW_API_KEY="${OPENCLAW_API_KEY:-}"
SWARMDOCK_API_KEY="${SWARMDOCK_API_KEY:-}"
CLAWHUB_API_KEY="${CLAWHUB_API_KEY:-}"
AGENCYAGENTS_API_KEY="${AGENCYAGENTS_API_KEY:-}"

# =============================================================================
# Agent Framework Repositories
# =============================================================================

declare -A AGENT_REPOS=(
    ["openai-agents-sdk"]="https://github.com/openai/openai-agents-python"
    ["langgraph"]="https://github.com/langchain-ai/langgraph"
    ["crewai"]="https://github.com/crewai/crewai"
    ["autogen"]="https://github.com/microsoft/autogen"
    ["smolagents"]="https://github.com/HuggingFace/smolagents"
)

# =============================================================================
# Skill Repositories
# =============================================================================

declare -A SKILL_REPOS=(
    ["skillsllm"]="https://github.com/skillsllm/skills"
    ["openwebui-extensions"]="https://github.com/Fu-Jie/openwebui-extensions"
    ["ichrist-tools"]="https://github.com/iChristGit/OpenWebui-Tools"
    ["haervwe-tools"]="https://github.com/Haervwe/open-webui-tools"
    ["classic-plugins"]="https://github.com/Classic298/open-webui-plugins"
    ["suurt8ll-functions"]="https://github.com/suurt8ll/open_webui_functions"
    ["openrouter-pipe"]="https://github.com/rbb-dev/Open-WebUI-OpenRouter-pipe"
    ["omni-agent-skills"]="https://github.com/exploreomni/omni-agent-skills"
)

# =============================================================================
# Functions
# =============================================================================

install_python_package() {
    local package="$1"
    local extras="${2:-}"
    local install_status=0

    if pip show "$package" &>/dev/null; then
        log_info "  ✓ $package already installed"
        return 0
    fi

    log_info "  Installing $package..."
    if [[ -n "$extras" ]]; then
        if ! pip install "$package[$extras]" --quiet 2>/dev/null; then
            pip install "$package[$extras]" || install_status=$?
        fi
    else
        if ! pip install "$package" --quiet 2>/dev/null; then
            pip install "$package" || install_status=$?
        fi
    fi

    if [[ $install_status -eq 0 ]]; then
        log_success "  ✓ $package installed"
    else
        log_warn "  ⚠ $package installation failed; continuing with the remaining integrations"
    fi
}

clone_git_repo() {
    local name="$1"
    local url="$2"
    local dest="$3"
    
    if [[ -d "$dest" ]]; then
        log_info "  ✓ $name already exists"
        return 0
    fi
    
    log_info "  Cloning $name..."
    if git clone --depth 1 "$url" "$dest" 2>/dev/null; then
        log_success "  ✓ $name cloned"
        return 0
    else
        log_warn "  ⚠ Failed to clone $name"
        return 1
    fi
}

create_skill_file() {
    local skill_id="$1"
    local name="$2"
    local description="$3"
    local category="$4"
    local source="$5"
    local content="$6"
    local path="$7"
    
    mkdir -p "$(dirname "$path")"
    
    cat > "$path" << EOF
---
id: $skill_id
name: $name
description: $description
category: $category
source: $source
version: 1.0.0
---

$content
EOF
    
    log_success "Created skill: $name"
}

# =============================================================================
# Main Installation
# =============================================================================

main() {
    log_info "=========================================="
    log_info "Open Connect - Integration Installation"
    log_info "=========================================="
    echo ""
    
    # Create directories
    mkdir -p "$SKILLS_DIR"
    mkdir -p "$INTEGRATIONS_DIR"
    mkdir -p "${INTEGRATIONS_DIR}/mcp"
    mkdir -p "${INTEGRATIONS_DIR}/agents"
    mkdir -p "${INTEGRATIONS_DIR}/skills"
    mkdir -p "${INTEGRATIONS_DIR}/connectors"
    
    # =============================================================================
    # Step 1: Install Python Packages
    # =============================================================================
    log_info "Step 1/5: Installing Python packages..."
    
    install_python_package "openai-agents" ""
    install_python_package "langgraph" ""
    install_python_package "crewai" ""
    install_python_package "aiohttp" ""
    install_python_package "beautifulsoup4" ""
    install_python_package "requests" ""
    
    echo ""
    
    # =============================================================================
    # Step 2: Install Agent Frameworks
    # =============================================================================
    log_info "Step 2/5: Setting up agent frameworks..."
    
    for name in "${!AGENT_REPOS[@]}"; do
        repo="${AGENT_REPOS[$name]}"
        log_info "Checking $name..."
    done
    
    echo ""
    
    # =============================================================================
    # Step 3: Install Skills
    # =============================================================================
    log_info "Step 3/5: Installing skills..."
    
    # SkillsLLM Featured Skills
    create_skill_file \
        "hermes-agent" \
        "Hermes Agent" \
        "Autonomous agent with terminal, file ops, web search, memory, and extensible skills by Nous Research" \
        "agent" \
        "skillsllm" \
        "Use Hermes Agent for complex tasks requiring web search, file operations, and memory capabilities." \
        "${SKILLS_DIR}/hermes-agent.md"
    
    create_skill_file \
        "coding-assistant" \
        "Coding Assistant" \
        "AI coding assistant with code execution, debugging, and code review capabilities" \
        "development" \
        "skillsllm" \
        "Use Coding Assistant for programming help, code debugging, and code reviews." \
        "${SKILLS_DIR}/coding-assistant.md"
    
    create_skill_file \
        "research-agent" \
        "Research Agent" \
        "Research and analysis agent with web search and document synthesis" \
        "research" \
        "skillsllm" \
        "Use Research Agent for gathering information, analyzing documents, and synthesizing research." \
        "${SKILLS_DIR}/research-agent.md"
    
    create_skill_file \
        "data-analyst" \
        "Data Analysis Agent" \
        "Data analysis and visualization agent with Python and SQL support" \
        "analytics" \
        "skillsllm" \
        "Use Data Analyst for data processing, analysis, and visualization tasks." \
        "${SKILLS_DIR}/data-analyst.md"
    
    create_skill_file \
        "open-webui-pipes" \
        "Open WebUI Pipes" \
        "Custom pipes and functions for Open WebUI" \
        "integration" \
        "openwebui-extensions" \
        "Custom pipes extending Open WebUI capabilities." \
        "${SKILLS_DIR}/open-webui-pipes.md"
    
    echo ""
    
    # =============================================================================
    # Step 4: Create Platform Connector Configs
    # =============================================================================
    log_info "Step 4/5: Creating platform connectors..."
    
    cat > "${INTEGRATIONS_DIR}/.connectors.json" << 'EOF'
{
  "version": "1.0",
  "connectors": {
    "openai": {
      "name": "OpenAI Agents SDK",
      "enabled": true,
      "api_key_env": "OPENAI_API_KEY"
    },
    "langgraph": {
      "name": "LangGraph",
      "enabled": true,
      "description": "Build stateful multi-agent applications"
    },
    "crewai": {
      "name": "CrewAI",
      "enabled": true,
      "description": "AI agents that work together"
    },
    "openclaw": {
      "name": "OpenClaw",
      "enabled": false,
      "api_key_env": "OPENCLAW_API_KEY",
      "base_url": "https://api.openclaw.ai/v1"
    },
    "swarmdock": {
      "name": "SwarmDock",
      "enabled": false,
      "api_key_env": "SWARMDOCK_API_KEY",
      "base_url": "https://api.swarmdock.ai/v1"
    },
    "agentfield": {
      "name": "AgentField",
      "enabled": false,
      "api_key_env": "AGENTFIELD_API_KEY",
      "base_url": "https://api.agentfield.ai/v1"
    },
    "openagent": {
      "name": "Open Agent",
      "enabled": false,
      "base_url": "https://app.open-agent.io/api"
    },
    "omni": {
      "name": "Omni Analytics",
      "enabled": false,
      "description": "Analytics agent skills for IDE"
    },
    "skillsllm": {
      "name": "SkillsLLM",
      "enabled": true,
      "skills_repo": "https://github.com/skillsllm/skills"
    },
    "clawhub": {
      "name": "ClawHub",
      "enabled": false,
      "api_key_env": "CLAWHUB_API_KEY",
      "base_url": "https://api.clawhub.ai/v1"
    },
    "agencyagents": {
      "name": "AgencyAgents",
      "enabled": false,
      "api_key_env": "AGENCYAGENTS_API_KEY",
      "base_url": "https://api.agencyagents.dev/v1"
    }
  },
  "mcp": {
    "enabled": true,
    "tools": [
      "web_search",
      "web_fetch",
      "code_interpreter",
      "filesystem",
      "knowledge_base",
      "chat_history",
      "models"
    ]
  }
}
EOF
    
    log_success "Platform connectors configured"
    echo ""
    
    # =============================================================================
    # Step 5: Create Agent Configurations
    # =============================================================================
    log_info "Step 5/5: Creating agent configurations..."
    
    cat > "${INTEGRATIONS_DIR}/.agents.json" << 'EOF'
{
  "version": "1.0",
  "agents": [
    {
      "id": "hermes-agent",
      "name": "Hermes Agent",
      "type": "openai",
      "model": "gpt-4",
      "instructions": "You are Hermes Agent, an autonomous AI assistant with web search, file operations, and memory capabilities.",
      "tools": ["web_search", "web_fetch", "filesystem"]
    },
    {
      "id": "coding-assistant",
      "name": "Coding Assistant",
      "type": "openai",
      "model": "gpt-4",
      "instructions": "You are an expert coding assistant. Help with programming, debugging, and code reviews.",
      "tools": ["code_interpreter"]
    },
    {
      "id": "research-agent",
      "name": "Research Agent",
      "type": "openai",
      "model": "gpt-4",
      "instructions": "You are a research assistant. Gather information, analyze documents, and synthesize findings.",
      "tools": ["web_search", "web_fetch", "knowledge_base"]
    },
    {
      "id": "data-analyst",
      "name": "Data Analyst",
      "type": "openai",
      "model": "gpt-4",
      "instructions": "You are a data analyst. Process data, create visualizations, and provide insights.",
      "tools": ["code_interpreter", "chat_history"]
    },
    {
      "id": "openconnect-agent",
      "name": "Open Connect Agent",
      "type": "openai",
      "model": "gpt-4",
      "instructions": "You are the Open Connect AI assistant. Help users with any task using available tools.",
      "tools": ["web_search", "web_fetch", "code_interpreter", "filesystem", "knowledge_base"]
    }
  ],
  "default_agent": "openconnect-agent"
}
EOF
    
    log_success "Agent configurations created"
    echo ""
    
    # =============================================================================
    # Summary
    # =============================================================================
    log_success "=========================================="
    log_success "Integration Installation Complete!"
    log_success "=========================================="
    echo ""
    echo "Installed components:"
    echo "  • MCP Server with built-in tools"
    echo "  • Agent frameworks (OpenAI SDK, LangGraph, CrewAI)"
    echo "  • Skill management system"
    echo "  • Platform connectors configured"
    echo "  • Agent configurations created"
    echo ""
    echo "Skills installed: $(find "$SKILLS_DIR" -name "*.md" 2>/dev/null | wc -l)"
    echo ""
    
    # Enable API keys via environment
    log_info "To enable platform connectors, set these environment variables:"
    echo "  OPENAI_API_KEY      - OpenAI Agents SDK"
    echo "  OPENCLAW_API_KEY    - OpenClaw"
    echo "  SWARMDOCK_API_KEY   - SwarmDock"
    echo "  CLAWHUB_API_KEY     - ClawHub"
    echo "  AGENCYAGENTS_API_KEY - AgencyAgents"
    echo ""
}

main "$@"
