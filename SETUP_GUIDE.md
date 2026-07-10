# Open Connect - Setup Guide

## Overview

Open Connect is a powerful, self-hosted AI platform built on Open WebUI, deployed on Railway with enterprise-grade features:
- **AI Chat Interface**: Access to multiple AI models (OpenRouter, Ollama, etc.)
- **Knowledge Base**: RAG with vector database support (Qdrant, ChromaDB, etc.)
- **Code Execution**: Run Python code directly in chat
- **Web Search**: Search the web from within the chat interface
- **Skills & Tools**: Extensible system with custom skills and tools
- **Agents**: Create AI agents with custom instructions and tools
- **Mobile PWA**: Install as an app on Android and iOS
- **Google Vertex AI**: Support for Google Cloud AI services

---

## Quick Access

**Live URL**: https://open-connect-production.up.railway.app

---

## Authentication

| Setting | Value |
|---------|-------|
| Auth Enabled | Yes |
| Signups | Enabled |
| JWT Expiration | 4 weeks |

### Default Admin User
- **Username**: charles
- **Password**: (as configured during initial setup)

---

## Features Enabled

| Feature | Status | Description |
|---------|--------|-------------|
| Web Search | ✅ Enabled | Search the web from chat |
| Code Execution | ✅ Enabled | Run Python code in chat |
| Code Interpreter | ✅ Enabled | Advanced code execution with pyodide |
| Memories | ✅ Enabled | Persistent user memories |
| Notes | ✅ Enabled | Take notes |
| Automations | ✅ Enabled | Workflow automations |
| Message Rating | ✅ Enabled | Rate AI responses |
| API Keys | ✅ Enabled | Generate API keys for external use |
| User Signups | ✅ Enabled | Allow new user registrations |
| Folders | ✅ Enabled | Organize chats and files |
| Channels | ✅ Enabled | Multi-channel support |
| Hybrid Search | ✅ Enabled | Combined vector + keyword search |
| Direct Connections | ✅ Enabled | Connect to external model APIs |
| Model Caching | ✅ Enabled | Cache model lists |
| Speech-to-Text | ✅ Enabled | Whisper for voice input |
| Text-to-Speech | ✅ Enabled | Built-in TTS support |

---

## AI Models (Pre-configured)

Open Connect is pre-configured with these free OpenRouter models:

| Model | ID | Best For |
|-------|-----|----------|
| Gemma 3 4B | `google/gemma-3-4b-it` | Fast, efficient |
| Qwen 2.5 7B | `qwen/qwen-2.5-7b-instruct` | Coding, analysis |
| Phi-4 | `microsoft/phi-4` | Reasoning |
| DeepSeek R1 | `deepseek/deepseek-r1` | Deep reasoning, math |
| Claude 3.5 Haiku | `anthropic/claude-3.5-haiku` | Quick tasks |
| Llama 3.1 8B | `meta/llama-3.1-8b-instruct` | General use |

---

## API Providers Configured

| Provider | Status | Purpose |
|----------|--------|---------|
| OpenRouter | ✅ Configured | Primary AI API (with Google Vertex AI) |
| Hugging Face | ✅ Configured | Additional models |
| Groq | ✅ Configured | Fast inference |
| Supabase | ✅ Configured | External knowledge sources |
| Google Vertex AI | ✅ Configured | GCP AI services |

---

## Database Configuration

### Primary Database
**SQLite** (Default) - Built-in, reliable:
- User data storage
- Chat history
- Application metadata
- Skills, tools, prompts configuration

### External Databases (Configurable via Admin Panel)
- **Supabase PostgreSQL** - For external knowledge bases
- **Qdrant** - For vector search and RAG
- **ChromaDB** - Alternative vector database

---

## Environment Variables (Railway)

| Variable | Description | Status |
|----------|-------------|--------|
| `ENV` | Environment | ✅ Set to prod |
| `DOCKER` | Docker mode | ✅ Enabled |
| `PORT` | Application port | ✅ 8080 |
| `WEBUI_NAME` | App name | ✅ Open Connect |
| `WEBUI_SECRET_KEY` | Session encryption | ✅ Configured |
| `DEFAULT_MODELS` | Pre-selected models | ✅ Configured |
| `OPENAI_API_KEY` | OpenRouter API key | ✅ Configured |
| `OPENAI_API_BASE_URL` | OpenRouter endpoint | ✅ Configured |
| `HUGGINGFACE_TOKEN` | Hugging Face token | ✅ Configured |
| `GROQ_API_KEY` | Groq API key | ✅ Configured |
| `SUPABASE_URL` | Supabase project URL | ✅ Configured |
| `SUPABASE_ANON_KEY` | Supabase anon key | ✅ Configured |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | GCP credentials | ✅ Configured |

---

## Skills, Tools & Agents

### Skills
Skills are reusable prompt templates and workflows. Configure via:
- Admin Panel → Skills
- Import from Open WebUI Community

### Tools
Tools extend AI capabilities:
- Web Search
- Code Execution
- File Operations
- Custom MCP tools

### Agents
Agents are specialized AI configurations:
- Custom instructions
- Attached tools
- Knowledge base integration
- Per-user/group access control

---

## Backup & Migration

### Automated Backup
```bash
# Using backup scripts
./scripts/backup/auto-backup.sh
./scripts/backup/railway-backup.sh
```

### Manual Backup
```bash
# Backup SQLite database
sqlite3 data/webui.db ".backup 'backup.db'"

# Backup all data
tar -czf open-connect-backup.tar.gz data/
```

### Railway Volume Backup
Data is persisted in Railway volumes. To backup:
1. Go to Railway Dashboard
2. Select open-connect service
3. Navigate to Volumes
4. Create snapshot or download

---

## Mobile Installation

### Quick Install
1. Open https://open-connect-production.up.railway.app in mobile browser
2. Tap "Add to Home Screen" / "Install App"
3. The app will appear as a native-like application

### PWA Features
- Offline access
- Push notifications
- Native-like experience

---

## Troubleshooting

### Health Check Failures
1. Check health: `https://open-connect-production.up.railway.app/health`
2. Increase timeout in Railway settings (current: 300s)
3. Check logs in Railway dashboard

### Model Connection Issues
1. Verify API keys in Railway dashboard
2. Check OpenRouter quota at https://openrouter.ai/account
3. Review Railway deployment logs

### Database Issues
- SQLite: Check Railway volume is attached
- Supabase: Verify connection string format

---

## Support

- **GitHub**: https://github.com/OrgHide/open-connect
- **Documentation**: https://docs.openwebui.com/
- **Community**: https://openwebui.com/
