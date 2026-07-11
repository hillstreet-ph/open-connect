# Open Connect - Railway Deployment Guide

## Overview

This guide covers the complete deployment of Open Connect to Railway with:
- **Automatic backups** before every deployment
- **Data persistence** across deployments
- **Plugin installation** from multiple repositories
- **Version tagging** for releases
- **Health monitoring** and self-healing

## Files Created/Modified

### New Files
| File | Description |
|------|-------------|
| `railway-start.sh` | Production startup script with backup restore |
| `Dockerfile.railway` | Railway-optimized Dockerfile with plugins |
| `scripts/install-plugins.sh` | Plugin installation script |
| `.github/workflows/deploy-railway.yml` | Manual fallback deploy workflow |
| `.github/workflows/deploy-railway-full.yml` | Canonical production deploy workflow |
| `.github/workflows/backup-railway.yml` | Backup & restore workflow |
| `AGENTS.md` | Knowledge base for AI agents |

### Modified Files
| File | Changes |
|------|---------|
| `railway.toml` | Updated for Railway Dockerfile, backup settings |
| `backend/start.sh` | Enhanced with health monitoring |
| `scripts/backup/*.sh` | Added Supabase integration, checksum verification |
| `docker-compose.yaml` | Enhanced configuration |

## Quick Start

### 1. Configure GitHub Secrets

Add these secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

```bash
# Railway
RAILWAY_TOKEN=your_railway_token
RAILWAY_PROJECT_ID=your_project_id
RAILWAY_ENVIRONMENT_ID=your_environment_id
RAILWAY_SERVICE_ID=your_service_id

# Database
DATABASE_URL=postgresql://...  # Optional: for PostgreSQL

# Security
WEBUI_SECRET_KEY=your_secret_key

# AI Providers
OPENAI_API_KEY=your_openrouter_key
GROQ_API_KEY=your_groq_key
HUGGINGFACE_TOKEN=your_hf_token

# Supabase (for backups)
SUPABASE_PROJECT_REF=your_project_ref
SUPABASE_ACCESS_TOKEN=your_access_token
```

### 2. Configure GitHub Variables

Add these variables to your GitHub repository (`Settings > Variables`):

```bash
RAILWAY_APP_URL=https://your-app.railway.app
```

### 3. Push to GitHub

```bash
git add .
git commit -m "feat: Add Railway deployment configuration"
git push origin main
```

## Deployment Workflow

### Automatic Deployment (on push to main)

1. **Pre-deployment backup** - Creates backup before deployment
2. **Build Docker image** - Builds with all plugins
3. **Deploy to Railway** - Updates variables and triggers deployment
4. **Health check** - Waits for application to be healthy
5. **Post-deployment verification** - Runs smoke tests

### Version Tagging

```bash
# Create a version tag
git tag v1.0.0
git push origin v1.0.0
```

This creates a GitHub release and triggers deployment.

### Manual Deployment

1. Go to **Actions** tab in GitHub
2. Select **Deploy to Railway** workflow
3. Click **Run workflow**
4. Optionally skip backup with `skip_backup: true`

## Backup & Restore

### Automatic Backups

Backups run automatically:
- Every 4 hours
- Daily at midnight UTC
- Weekly on Sunday at 2 AM
- Before every deployment

Restore flow on new deployments:
1. Railway starts `railway-start.sh`
2. The script restores the latest local package if present
3. If no local package exists, it restores from Supabase Storage
4. The app then launches via `backend/start.sh`

### Manual Backup

```bash
# Via GitHub Actions
gh workflow run backup-railway.yml -f action=backup
```

### Restore from Backup

```bash
# Via GitHub Actions
gh workflow run backup-railway.yml -f action=restore-latest
```

### Local Backup Script

```bash
# Create backup
./scripts/backup/backup.sh

# Restore from backup
./scripts/backup/restore.sh ./backups/latest.tar.gz

# Download from Supabase and restore
./scripts/backup/restore.sh --from-supabase
```

## Plugin Installation

### Pre-installed Plugins (in Dockerfile)

The `Dockerfile.railway` automatically installs these plugins:
- Fu-Jie/openwebui-extensions
- iChristGit/OpenWebui-Tools
- Haervwe/open-webui-tools
- Classic298/open-webui-plugins
- suurt8ll/open_webui_functions
- rbb-dev/Open-WebUI-OpenRouter-pipe

### Runtime Installation

```bash
./scripts/install-plugins.sh
```

## Startup Script Features

The `railway-start.sh` bootstrap includes:

1. **Backup Restoration** - Restores the latest local or Supabase backup on startup when needed
2. **Startup Handoff** - Delegates to `backend/start.sh` for secret key setup, database checks, and server launch
3. **Secret Key Management** - Generates/loads JWT secret in the backend startup path
4. **Database Verification** - Checks integrity in the backend startup path
5. **Health Monitoring** - `/health` remains the Railway health check endpoint
6. **Graceful Shutdown** - Handled by the backend startup script

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | prod | Environment |
| `PORT` | 8080 | Server port |
| `DOCKER` | true | Docker mode |
| `UVICORN_WORKERS` | 1 | Worker count |
| `LOG_LEVEL` | info | Log level |
| `ENABLE_BACKUP_RESTORE_ON_STARTUP` | true | Auto-restore from local/Supabase backup on startup |
| `SUPABASE_PROJECT_REF` | — | Supabase project reference for remote restore |
| `SUPABASE_ACCESS_TOKEN` | — | Supabase token for backup upload/restore |
| `SUPABASE_BUCKET` | open-connect-backups | Supabase Storage bucket for backups |
| `BACKUP_PREFIX` | backups | Supabase object prefix for backup archives |
| `HEALTH_CHECK_INTERVAL` | 30 | Health check interval (seconds) |
| `RETENTION_DAYS` | 14 | Backup retention |

## Troubleshooting

### Container Crashes on Startup

1. Check logs: `railway logs`
2. Verify environment variables are set
3. Check health endpoint: `/health`
4. Verify database is accessible

### Data Loss After Deployment

1. Check if persistent disk is enabled in Railway
2. Verify backup was created before deployment
3. Restore from latest backup:
   ```bash
   gh workflow run backup-railway.yml -f action=restore-latest
   ```

### Plugin Installation Fails

1. Check if git is installed in container
2. Verify GitHub network access
3. Install plugins manually:
   ```bash
   ./scripts/install-plugins.sh
   ```

### Health Check Fails

1. Check application logs
2. Verify port configuration
3. Check database connectivity:
   ```bash
   curl https://your-app.railway.app/health/db
   ```

## Monitoring

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Basic health check |
| `/ready` | Readiness (includes DB) |
| `/health/db` | Database health |

### Log Access

```bash
# Via Railway CLI
railway logs

# Stream logs
railway logs --follow
```

## Security

### Secret Management

- All secrets stored in GitHub Actions
- Railway variables set via API
- WEBUI_SECRET_KEY generated on first run

### Data Protection

- 14-day backup retention
- Checksum verification for backups
- Automatic rollback on restore failure
