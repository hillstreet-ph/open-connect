# Railway Deployment with Open WebUI Computer & Open Terminal

This guide explains how to deploy Open Connect to Railway with **Open WebUI Computer** and **Open Terminal** automatically loaded on new deployments.

## Overview

This deployment configuration includes three services:

1. **Open Connect** (Main Application) - Port 8080
2. **Open WebUI Computer** (`cptr`) - Port 8001
   - Your computer in a browser tab with files, terminal, git, editor, and AI
   - Access your real files and workspaces from any device
3. **Open Terminal** - Port 8002
   - AI-driven terminal environment for code execution and automation
   - The AI can run commands, write code, debug, and iterate

## Quick Start

### 1. Deploy to Railway

1. **Push your code to GitHub** (if not already)
2. **Import the repository to Railway**
   - Go to [Railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
3. **Railway will automatically detect** the `docker-compose.railway.yaml` file and deploy all services

### 2. Configure Environment Variables

In the Railway project settings, add these environment variables:

#### Required for Open Connect
- `OPEN_CONNECT_BASE_URL` - Your Railway app URL (e.g., `https://your-app.up.railway.app`)
- `OPEN_CONNECT_API_KEY` - Your Open Connect API key
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Your Supabase service role key
- `DATABASE_URL` - Your database connection string
- `REDIS_URL` - Your Redis connection string

#### Required for Open WebUI Computer
- `CPTR_SETUP_TOKEN` - (Optional) Setup token for initial access. If not provided, one will be generated automatically.

#### Required for Open Terminal
- `OPEN_TERMINAL_API_KEY` - (Optional) API key for authentication. If not provided, one will be generated automatically.

### 3. Access Your Services

After deployment completes:

- **Open Connect**: `https://your-app.up.railway.app`
- **Open WebUI Computer**: `https://your-app.up.railway.app:8001` (or via Railway's internal networking)
- **Open Terminal**: `https://your-app.up.railway.app:8002` (or via Railway's internal networking)

## Configuration Files

### `docker-compose.railway.yaml`

This file defines all three services with:
- Proper port mappings
- Persistent volumes for data
- Health checks
- Service dependencies
- Network configuration

### `railway.toml`

Railway-specific configuration that:
- Uses the `docker-compose.railway.yaml` file
- Configures health checks
- Sets resource limits (2 CPUs, 4GB RAM)
- Defines persistent volumes
- Configures environment variables

### `railway-start.sh`

The main startup script that:
- Restores backups if enabled
- Generates setup tokens for Computer and Open Terminal
- Starts all services using docker compose
- Monitors service health
- Provides logging and debugging information

## Service Details

### Open WebUI Computer (`cptr`)

**What it is**: Your entire computer in a browser tab. Real files with a full editor. A shell that keeps running when you close the tab. Git integration without touching the command line. Workspaces for each project.

**Features**:
- Files, editor, terminal, git, and AI in a browser tab
- Accessible from any device (phone, tablet, computer)
- Real filesystem access
- Git operations (status, diffs, staging, commits, branches)
- AI assistance as an optional helper
- Multiple workspaces

**Documentation**: [https://docs.openwebui.com/ecosystem/computer/](https://docs.openwebui.com/ecosystem/computer/)

**Docker Image**: `ghcr.io/open-webui/computer:latest`

**Port**: 8001 (mapped to container port 8000)

**Volumes**:
- `computer-data:/data` - App state (database, config, uploads)
- `computer-workspace:/workspace` - Default workspace directory

**Environment Variables**:
- `CPTR_DATA_DIR=/data` - Data directory
- `CPTR_HOST=0.0.0.0` - Listen on all interfaces
- `CPTR_PORT=8000` - Internal port
- `CPTR_HEADLESS=true` - Don't open browser
- `CPTR_DEFAULT_WORKSPACE=/workspace` - Default workspace
- `CPTR_SETUP_TOKEN` - Initial setup token

### Open Terminal

**What it is**: A computing environment that connects to Open WebUI. The AI can write code, execute it, read the output, fix errors, and iterate, all without leaving the chat.

**Features**:
- Real command execution
- File browser
- Document reading (PDF, Word, Excel, etc.)
- Web development with live preview
- Software development (repos, tests, debugging)
- File and system automation
- Isolation via Docker container

**Documentation**: [https://docs.openwebui.com/features/open-terminal/](https://docs.openwebui.com/features/open-terminal/)

**Docker Image**: `ghcr.io/open-webui/open-terminal:latest`

**Port**: 8002 (mapped to container port 8000)

**Volumes**:
- `terminal-data:/home/user` - Persistent home directory
- `terminal-workspace:/workspace` - Working directory

**Environment Variables**:
- `OPEN_TERMINAL_API_KEY` - Authentication API key
- `OPEN_TERMINAL_HOST=0.0.0.0` - Listen on all interfaces
- `OPEN_TERMINAL_PORT=8000` - Internal port
- `OPEN_TERMINAL_CWD=/workspace` - Working directory
- `OPEN_TERMINAL_MULTI_USER=false` - Single-user mode

## Integration with Open Connect

The services are integrated with Open Connect through:

1. **Internal Networking**: All services are on the same Docker network (`railway-network`), so they can communicate using service names:
   - `http://open-webui-computer:8000`
   - `http://open-terminal:8000`

2. **Environment Variables**: Open Connect receives the URLs and API keys for the other services:
   - `CPTR_URL=http://open-webui-computer:8000`
   - `OPEN_TERMINAL_URL=http://open-terminal:8000`
   - `OPEN_TERMINAL_API_KEY`

3. **Health Checks**: Each service has health check endpoints that are monitored:
   - Open Connect: `/ready`
   - Open WebUI Computer: `/health`
   - Open Terminal: `/health`

## Customization

### Changing Ports

To change the ports, update the `docker-compose.railway.yaml` file:

```yaml
services:
  open-connect:
    ports:
      - "8080:8080"  # Change first number for external port
  open-webui-computer:
    ports:
      - "8001:8000"  # Change first number for external port
  open-terminal:
    ports:
      - "8002:8000"  # Change first number for external port
```

### Adding More Workspaces

To add additional workspace directories to Open WebUI Computer:

```yaml
services:
  open-webui-computer:
    volumes:
      - computer-data:/data
      - computer-workspace:/workspace
      - ~/projects:/projects  # Add your projects directory
      - ~/notes:/notes        # Add your notes directory
```

### Enabling Multi-User Mode for Open Terminal

To enable multi-user mode in Open Terminal:

```yaml
services:
  open-terminal:
    environment:
      - OPEN_TERMINAL_MULTI_USER=true
```

## Backup and Restore

The `railway-start.sh` script includes backup restoration functionality:

1. **Automatic Backup Restore**: If `ENABLE_BACKUP_RESTORE_ON_STARTUP=true`, the script will:
   - Check for local backup files in `/tmp/restore`
   - Download and restore from Supabase if configured
   - Only restore if no existing database is found (unless `FORCE_BACKUP_RESTORE_ON_STARTUP=true`)

2. **Backup Locations**:
   - Local: `/tmp/restore/latest.tar.gz`
   - Supabase: Configured via `SUPABASE_BUCKET` and `BACKUP_PREFIX`

3. **Environment Variables**:
   - `ENABLE_BACKUP_RESTORE_ON_STARTUP=true` - Enable backup restore
   - `FORCE_BACKUP_RESTORE_ON_STARTUP=true` - Force restore even if data exists
   - `SUPABASE_PROJECT_REF` - Supabase project reference
   - `SUPABASE_ACCESS_TOKEN` - Supabase access token
   - `SUPABASE_BUCKET=open-connect-backups` - Backup bucket name
   - `BACKUP_PREFIX=backups` - Backup prefix in bucket

## Troubleshooting

### Services Not Starting

1. **Check logs**:
   ```bash
   docker compose -f docker-compose.railway.yaml logs
   ```

2. **Check service status**:
   ```bash
   docker compose -f docker-compose.railway.yaml ps
   ```

3. **Check individual service logs**:
   ```bash
   docker compose -f docker-compose.railway.yaml logs open-connect
   docker compose -f docker-compose.railway.yaml logs open-webui-computer
   docker compose -f docker-compose.railway.yaml logs open-terminal
   ```

### Port Conflicts

If you get port conflict errors:
- Make sure the ports (8080, 8001, 8002) are not already in use
- Change the external ports in `docker-compose.railway.yaml`
- In Railway, check the "Ports" tab in your project settings

### Health Checks Failing

If health checks are failing:
- Check if the service is actually running
- Verify the health check endpoint is correct
- Increase the health check timeout in `railway.toml`

### Volume Permission Issues

If you get permission errors with volumes:
- Make sure the volume directories are writable
- In Railway, persistent volumes are automatically managed
- For local testing, ensure your user has write permissions

## Security Considerations

### Open WebUI Computer

- **Access Control**: The setup token provides initial access. Treat it like a password.
- **Filesystem Access**: Computer has access to the mounted volumes. Be careful what you mount.
- **Network Exposure**: By default, Computer is exposed on port 8001. Consider:
  - Using Railway's internal networking only
  - Adding authentication
  - Restricting access via firewall rules

### Open Terminal

- **API Key**: The API key controls access to the terminal. Keep it secret.
- **Command Execution**: Open Terminal can execute any command. Be careful with:
  - What models have access
  - What commands the model can run
  - The working directory and mounted volumes
- **Isolation**: Open Terminal runs in a Docker container, providing some isolation from the host.

## Updating Services

To update the services to the latest versions:

1. **Pull the latest images**:
   ```bash
   docker compose -f docker-compose.railway.yaml pull
   ```

2. **Recreate the containers**:
   ```bash
   docker compose -f docker-compose.railway.yaml up -d --force-recreate
   ```

3. **In Railway**:
   - Push a new commit to trigger a redeploy
   - Or manually trigger a redeploy in the Railway UI

## Local Development

To test the deployment locally:

1. **Start all services**:
   ```bash
   docker compose -f docker-compose.railway.yaml up -d
   ```

2. **View logs**:
   ```bash
   docker compose -f docker-compose.railway.yaml logs -f
   ```

3. **Access services**:
   - Open Connect: http://localhost:8080
   - Open WebUI Computer: http://localhost:8001
   - Open Terminal: http://localhost:8002

4. **Stop services**:
   ```bash
   docker compose -f docker-compose.railway.yaml down
   ```

## Additional Resources

- [Open WebUI Computer Documentation](https://docs.openwebui.com/ecosystem/computer/)
- [Open Terminal Documentation](https://docs.openwebui.com/features/open-terminal/)
- [Open WebUI GitHub](https://github.com/open-webui/open-webui)
- [Open WebUI Computer GitHub](https://github.com/open-webui/computer)
- [Open Terminal GitHub](https://github.com/open-webui/open-terminal)
- [Railway Documentation](https://docs.railway.app/)

## Support

If you encounter issues:

1. Check the [Open WebUI Discord](https://discord.com/invite/5rJgQTnV4s)
2. Check the [Railway Discord](https://discord.gg/railway)
3. Open an issue in the respective GitHub repositories

## License

This deployment configuration is provided as-is. The individual services have their own licenses:
- Open Connect: [License](LICENSE)
- Open WebUI Computer: [MIT License](https://github.com/open-webui/computer/blob/main/LICENSE)
- Open Terminal: [MIT License](https://github.com/open-webui/open-terminal/blob/main/LICENSE)
