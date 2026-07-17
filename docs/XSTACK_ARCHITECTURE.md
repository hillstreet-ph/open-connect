# XStack Architecture: AI Resource Manager for Open-Connect

## 🎯 Vision & Key Concept

**XStack is the control plane of Open-Connect, not another plugin manager.**

The fundamental shift: **Users do not install Skills, Tools, Agents, or MCP servers into Open-Connect.** Instead, they connect them once, and every AI client consumes them through the Open-Connect Gateway.

This makes XStack closer to an **AI Resource Manager** than a traditional plugin manager.

### Core Principles
- ✅ **Connect Once, Use Everywhere**: Resources stay at their source
- ✅ **No Installation**: No downloading or copying into Open-Connect
- ✅ **Gateway-Centric**: All AI clients consume through a single gateway
- ✅ **Resource Discovery**: Find and connect resources from multiple sources
- ✅ **Unified Access**: Standardized interface for all resource types

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         XStack Control Plane                       │
├─────────────────────────────────────────────────────────────────┤
│  📦 Resources    🔗 Connections    🏪 Marketplace    🔑 Secrets  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Open-Connect Gateway                            │
├─────────────────────────────────────────────────────────────────┤
│  🔄 Resource Resolver  📚 Registry Index  🔀 MCP Router          │
│  🔐 Secret Broker      📋 Policy Engine    🔄 Sync Engine        │
│  🚀 Event Bus         📊 Cache             📝 Audit Logs         │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │  Claude  │    │  Codex   │    │Open WebUI│
   └──────────┘    └──────────┘    └──────────┘
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │OpenClaw  │    │SwarmClaw │    │SwarmDock │
   └──────────┘    └──────────┘    └──────────┘
```

## 📦 Resources

The inventory of everything available through your Gateway.

### Resource Types

| Category | Description | Examples |
|----------|-------------|----------|
| **🤖 Models** | AI models available for inference | OpenAI, Anthropic, Mistral, Ollama |
| **🧠 Agents** | Autonomous AI agents | Research Agent, GitHub Review |
| **⚡ Skills** | Specialized AI capabilities | Deploy Railway, Translate |
| **🛠️ Tools** | Utility functions and operations | Browser Tool, GitHub Tool |
| **🧩 Functions** | Individual function calls | API endpoints, utilities |
| **🔄 Pipelines** | Workflow orchestrations | Data processing pipelines |
| **🔌 Plugins** | Extensible components | Custom integrations |
| **📝 Prompts** | Pre-defined prompt templates | System prompts, templates |
| **📚 Knowledge** | Knowledge bases and documents | Vector databases, docs |
| **🧠 Memory** | Persistent memory systems | Conversation history, context |
| **🌐 MCP Servers** | Model Context Protocol servers | Filesystem, GitHub, Docker |

### Resource Status States
- **Available**: Resource is connected and ready to use
- **Connected**: Resource is linked to the gateway
- **Shared**: Resource is available to multiple users/workspaces
- **Default**: Resource is the default choice for its category
- **Disabled**: Resource is temporarily unavailable

## 🔗 Connections

This is where resources come from. Connections define the sources that provide resources to your Gateway.

### Connection Categories

#### 🏢 Providers
AI model providers that offer inference capabilities.

| Provider | Description | Connection Method |
|----------|-------------|------------------|
| OpenAI | OpenAI models and API | API Key |
| Anthropic | Anthropic models | API Key |
| Gemini | Google's AI models | API Key |
| OpenRouter | Model aggregator | API Key |
| Groq | High-performance models | API Key |
| Mistral | Mistral AI models | API Key |
| Ollama | Local model provider | Local endpoint |

#### 📁 Repositories
Source code and skill repositories.

| Repository | Description | Connection Method |
|------------|-------------|------------------|
| GitHub | Code repositories | OAuth / PAT |
| GitLab | GitLab instances | OAuth / PAT |
| Bitbucket | Bitbucket repositories | OAuth |
| Local Git | Local git repositories | File path |
| ZIP | Archived repositories | File upload |
| OCI | OCI registries | Registry URL |
| Docker | Docker images | Docker URL |

#### 💻 Platforms
AI platforms that can act as clients.

| Platform | Description | Connection Method |
|----------|-------------|------------------|
| OpenClaw | OpenClaw platform | OAuth |
| SwarmClaw | SwarmClaw platform | API Key |
| SwarmDock | SwarmDock platform | API Key |
| Open WebUI | Open WebUI interface | Local endpoint |
| Claude Desktop | Claude desktop app | Local endpoint |
| Cursor | Cursor IDE | Local endpoint |
| Codex | GitHub Codex | OAuth |
| VS Code | Visual Studio Code | Extension |
| LM Studio | LM Studio application | Local endpoint |

#### ☁️ Cloud
Cloud platforms and services.

| Service | Description | Connection Method |
|---------|-------------|------------------|
| Supabase | Database and auth | API Key / URL |
| Railway | Deployment platform | API Key |
| Cloudflare | CDN and services | API Key |
| Google Cloud | GCP services | Service Account |
| AWS | Amazon Web Services | IAM Credentials |
| Azure | Microsoft Azure | Service Principal |
| Redis | Redis databases | Connection URL |
| Docker | Docker services | API Key |
| Kubernetes | K8s clusters | Kubeconfig |

#### 🔌 MCP
Model Context Protocol servers.

| MCP Server | Description | Connection Method |
|------------|-------------|------------------|
| Filesystem | Local file access | Local path |
| GitHub | GitHub integration | OAuth |
| Docker | Docker container access | Docker socket |
| Browser | Web browsing | Local endpoint |
| Playwright | Browser automation | Local endpoint |
| Supabase | Supabase database | Connection URL |
| Redis | Redis database | Connection URL |
| Slack | Slack integration | OAuth |
| Notion | Notion integration | OAuth |
| Google Drive | Google Drive access | OAuth |
| MultiOn | MultiOn services | API Key |

**Key Benefit:** Gateway exposes `mcp://gateway` instead of managing 10-100 different MCP endpoints.

#### 🗄️ Databases
Database connections for persistence and retrieval.

| Database | Description | Connection Method |
|----------|-------------|------------------|
| Postgres | PostgreSQL databases | Connection URL |
| Supabase | Supabase databases | Connection URL |
| Redis | Redis databases | Connection URL |
| Chroma | Vector database | Connection URL |
| Qdrant | Vector database | Connection URL |
| Pinecone | Vector database | API Key |
| SQLite | Local SQLite | File path |

## 🏪 Marketplace

The Marketplace is **not an installer** - it's a discovery platform, similar to GitHub Discover.

### Marketplace Sections

#### 🔍 Discover
Browse and discover new resources from various providers.

Example entries:
- **Research Agent** by OpenClaw - [Connect]
- **GitHub Review Skill** by SkillsLLM - [Connect]
- **Browser Tool** by MultiOn - [Connect]

#### ⭐ Featured
Curated selection of high-quality resources.

#### 🔥 Popular
Most commonly used resources across the community.

#### 📈 Updates
Recently updated resources and new versions.

#### 📚 My Library
Your connected resources organized by category.

**Current Library Stats:**
- Models: 12
- Agents: 8
- Skills: 55
- Tools: 90
- MCP: 18

**Important:** Pressing "Connect" registers the resource in your Gateway. Nothing is copied unless the provider requires it.

## 🔑 Secrets Management

One of the most important components of XStack. Secrets are centrally managed and never exposed directly to applications.

### Secret Categories

#### 🔐 API Keys
| Service | Description | Usage |
|---------|-------------|-------|
| OpenAI | OpenAI API key | Model inference |
| Gemini | Google AI API key | Model inference |
| OpenRouter | OpenRouter API key | Model aggregation |
| GitHub | GitHub personal access token | Repository access |
| Supabase | Supabase API keys | Database access |
| Redis | Redis connection URL | Cache/database |
| Railway | Railway API key | Deployment |
| Docker | Docker registry credentials | Container management |
| Cloudflare | Cloudflare API key | CDN services |

#### 🔗 OAuth
| Service | Description | Usage |
|---------|-------------|-------|
| GitHub | GitHub OAuth | Repository access |
| Google | Google OAuth | Drive, services |
| Slack | Slack OAuth | Team communication |
| Discord | Discord OAuth | Community access |
| Notion | Notion OAuth | Documentation |
| Microsoft | Microsoft OAuth | Office 365 |
| Dropbox | Dropbox OAuth | File storage |

#### 🔑 SSH Keys
| Key Type | Description | Usage |
|----------|-------------|-------|
| GitHub Deploy Key | SSH key for GitHub | Repository deployment |
| Railway | SSH key for Railway | Platform access |
| Production | Production server keys | Server management |
| Servers | Various server SSH keys | Remote access |

#### 📜 Certificates
| Certificate Type | Description | Usage |
|------------------|-------------|-------|
| TLS | SSL/TLS certificates | Secure connections |
| JWT | JSON Web Tokens | Authentication |
| Signing Keys | Code signing keys | Security |
| mTLS | Mutual TLS certificates | Service authentication |
| Custom CA | Custom certificate authorities | Trust management |

#### ⚙️ Environment Variables
Common environment variables used across applications:

```bash
OPENAI_API_KEY
SUPABASE_URL
SUPABASE_KEY
REDIS_URL
DATABASE_URL
LANGFUSE_KEY
GITHUB_TOKEN
```

**Key Principle:** Applications never read these directly. Instead, they request temporary credentials from the Gateway.

## 🔄 Resource Flow

```
Marketplace
    ↓
Connect
    ↓
Gateway
    ↓
Registry
    ↓
Available Everywhere

No downloading into Open-Connect.
```

## 🔗 Connection Flow

```
GitHub
    ↓
Gateway
    ↓
Resources
    ↓
Visible to
Claude, Codex, OpenClaw, Open WebUI, SwarmClaw, SwarmDock
```

## 🤖 AI Runtime Flow

```
User
    ↓
Open WebUI
    ↓
Open-Connect Gateway
    ↓
XStack
    ↓
Resource Resolver
    ↓
GitHub, OpenClaw, SkillsLLM, MultiOn, SwarmDock, MCP
    ↓
Result
```

**Resource Resolver Workflow:**
1. Client requests /xstack/research
2. Resolver determines resource location (OpenClaw, SkillsLLM, MCP server, GitHub, etc.)
3. Authenticates using Secret Manager
4. Invokes resource remotely
5. Returns result
6. **Resource remains hosted at original source**

## 🏛️ Internal Architecture

### Gateway Services (Hidden from UI)

```
XStack
├── 📦 Resources
│   ├── Models
│   ├── Agents
│   ├── Skills
│   ├── Tools
│   ├── Functions
│   ├── Pipelines
│   ├── Plugins
│   ├── Prompts
│   ├── Knowledge
│   ├── Memory
│   └── MCP Servers
│
├── 🔗 Connections
│   ├── Providers
│   ├── Repositories
│   ├── Platforms
│   ├── Cloud
│   ├── MCP
│   └── Databases
│
├── 🏪 Marketplace
│   ├── Discover
│   ├── Featured
│   ├── Popular
│   ├── Updates
│   └── My Library
│
├── 🔑 Secrets
│   ├── API Keys
│   ├── OAuth
│   ├── SSH Keys
│   ├── Certificates
│   └── Environment Variables
│
└── ⚙ Gateway Services (Hidden)
    ├── Resource Resolver
    ├── Registry Index
    ├── MCP Router
    ├── Connection Manager
    ├── Secret Broker
    ├── Policy Engine
    ├── Sync Engine
    ├── Cache
    ├── Event Bus
    └── Audit Logs
```

### Service Descriptions

#### 🔍 Resource Resolver
- **Purpose**: Core service that routes resource requests to their actual locations
- **Function**: Maps resource identifiers to their source endpoints
- **Key Feature**: Maintains mapping of what's available where

#### 📚 Registry Index
- **Purpose**: Central catalog of all connected resources
- **Function**: Indexes and searches available resources
- **Key Feature**: Fast lookup and discovery

#### 🔀 MCP Router
- **Purpose**: Manages Model Context Protocol connections
- **Function**: Routes MCP requests to appropriate servers
- **Key Feature**: Single endpoint (`mcp://gateway`) for all MCP access

#### 🔗 Connection Manager
- **Purpose**: Manages all external connections
- **Function**: Handles authentication, connection health, and reconnection
- **Key Feature**: Centralized connection management

#### 🔐 Secret Broker
- **Purpose**: Securely manages and distributes secrets
- **Function**: Provides temporary credentials to services
- **Key Feature**: Never exposes raw secrets to applications

#### 📋 Policy Engine
- **Purpose**: Enforces access control and usage policies
- **Function**: Manages permissions, rate limiting, and resource access
- **Key Feature**: Fine-grained access control

#### 🔄 Sync Engine
- **Purpose**: Keeps resources synchronized across sources
- **Function**: Handles updates, versioning, and change detection
- **Key Feature**: Automatic resource updates

#### 🚀 Cache
- **Purpose**: Improves performance through intelligent caching
- **Function**: Caches frequently accessed resources and results
- **Key Feature**: Configurable cache policies

#### 📢 Event Bus
- **Purpose**: Handles event distribution and notifications
- **Function**: Manages real-time updates and notifications
- **Key Feature**: Pub/sub architecture for system events

#### 📝 Audit Logs
- **Purpose**: Maintains comprehensive audit trail
- **Function**: Logs all resource access and system changes
- **Key Feature**: Full traceability and compliance

## 🎨 UI Structure

### Global Header (All Pages)
Every XStack page should have:
- 🔍 **Search Resources** - Global resource search
- 🔔 **Notifications** - System alerts and updates
- 🔄 **Sync** - Manual sync trigger
- 🟢 **Gateway Status** - Current gateway health
- 🏠 **Current Workspace** - Active workspace indicator

## 🚀 Benefits

1. **Simplified User Experience**: No installation headaches, single point of connection
2. **Reduced Complexity**: No version conflicts, no duplicate installations  
3. **Improved Security**: Centralized secret management, controlled access
4. **Better Performance**: Intelligent caching, resource reuse across clients
5. **Scalability**: Handles many resource types, supports multiple clients
6. **Maintainability**: Clear separation of concerns, modular service design

## 📋 Implementation Roadmap

### Phase 1: Core Gateway Services
- [ ] Resource Resolver implementation
- [ ] Registry Index service
- [ ] Connection Manager
- [ ] Secret Broker
- [ ] Basic UI framework

### Phase 2: Resource Integration
- [ ] Model provider connections
- [ ] Repository integrations
- [ ] MCP server routing
- [ ] Database connections

### Phase 3: Advanced Features
- [ ] Policy Engine
- [ ] Sync Engine
- [ ] Cache implementation
- [ ] Event Bus
- [ ] Audit Logs

### Phase 4: Marketplace & Discovery
- [ ] Marketplace UI
- [ ] Resource discovery
- [ ] Popular/Featured sections
- [ ] My Library management

### Phase 5: Optimization & Polish
- [ ] Performance optimization
- [ ] Error handling
- [ ] Documentation
- [ ] Testing

## 🔗 Related Documents

- [AGENTS.md](../AGENTS.md)
- [DEPLOYMENT.md](../DEPLOYMENT.md)  
- [SECURITY.md](../SECURITY.md)
- [canonical-workflow.md](./canonical-workflow.md)

---

*Document Version: 1.0.0*  
*Last Updated: July 17, 2026*  
*Status: Proposal*