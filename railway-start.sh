#!/usr/bin/env bash
# =============================================================================
# Open Connect - Railway Multi-Service Startup Script
# =============================================================================
# This script handles the startup of all services for Railway deployment:
# - Open Connect (main application)
# - Open WebUI Computer (cptr)
# - Open Terminal
#
# The script ensures all services are started in the correct order and
# provides health monitoring for the entire stack.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.railway.yaml}"

# =============================================================================
# Logging Functions
# =============================================================================

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $1" >&2
}

error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

# =============================================================================
# Environment Variables
# =============================================================================

# Main Open Connect
PORT="${PORT:-8080}"
ENV="${ENV:-prod}"
DOCKER="${DOCKER:-true}"

# Open WebUI Computer
CPTR_PORT="${CPTR_PORT:-8001}"
CPTR_SETUP_TOKEN="${CPTR_SETUP_TOKEN:-}"

# Open Terminal
OPEN_TERMINAL_PORT="${OPEN_TERMINAL_PORT:-8002}"
OPEN_TERMINAL_API_KEY="${OPEN_TERMINAL_API_KEY:-}"

# =============================================================================
# Health Check Functions
# =============================================================================

check_service_health() {
    local service_name="$1"
    local port="$2"
    local endpoint="$3"
    local max_retries="${4:-30}"
    local retry_interval="${5:-5}"
    local attempt=0

    while [ $attempt -lt $max_retries ]; do
        attempt=$((attempt + 1))
        if curl -sf "http://localhost:$port$endpoint" > /dev/null 2>&1; then
            log "Service '$service_name' is healthy on port $port"
            return 0
        fi
        log "Service '$service_name' not ready yet (attempt $attempt/$max_retries)..."
        sleep $retry_interval
    done

    warn "Service '$service_name' did not become healthy after $max_retries attempts"
    return 1
}

wait_for_services() {
    log "Waiting for all services to become healthy..."
    
    # Wait for Open Connect
    check_service_health "Open Connect" "$PORT" "/ready" 60 5 || warn "Open Connect health check failed"
    
    # Wait for Open WebUI Computer
    check_service_health "Open WebUI Computer" "$CPTR_PORT" "/health" 60 5 || warn "Open WebUI Computer health check failed"
    
    # Wait for Open Terminal
    check_service_health "Open Terminal" "$OPEN_TERMINAL_PORT" "/health" 60 5 || warn "Open Terminal health check failed"
    
    log "All services are ready!"
}

# =============================================================================
# Backup Restoration (for Open Connect)
# =============================================================================

restore_backups() {
    local DATA_DIR="${DATA_DIR:-/app/backend/data}"
    local RESTORE_DIR="${RESTORE_DIR:-/tmp/restore}"
    local ENABLE_BACKUP_RESTORE="${ENABLE_BACKUP_RESTORE_ON_STARTUP:-false}"
    local FORCE_RESTORE="${FORCE_BACKUP_RESTORE_ON_STARTUP:-false}"

    if [[ "${ENABLE_BACKUP_RESTORE,,}" != "true" ]]; then
        log "Backup restore is disabled, skipping..."
        return 0
    fi

    log "Checking for backup restoration..."
    
    # Only restore if forced or if no existing database
    if [[ "${FORCE_RESTORE,,}" == "true" ]] || [[ ! -s "${DATA_DIR}/webui.db" ]]; then
        log "Attempting backup restoration..."
        
        # Try local restore package first
        if [[ -f "${RESTORE_DIR}/latest.tar.gz" ]]; then
            log "Restoring from local package: ${RESTORE_DIR}/latest.tar.gz"
            mkdir -p "$RESTORE_DIR"
            tar -xzf "${RESTORE_DIR}/latest.tar.gz" -C "$RESTORE_DIR"
            
            # Copy restored files
            if [[ -f "${RESTORE_DIR}/database/webui.db" ]]; then
                cp "${RESTORE_DIR}/database/webui.db" "${DATA_DIR}/webui.db"
            elif [[ -f "${RESTORE_DIR}/webui.db" ]]; then
                cp "${RESTORE_DIR}/webui.db" "${DATA_DIR}/webui.db"
            fi
            
            # Copy other data
            for dir in uploads knowledge chat_history memories notes; do
                if [[ -d "${RESTORE_DIR}/${dir}" ]]; then
                    mkdir -p "${DATA_DIR}/${dir}"
                    cp -r "${RESTORE_DIR}/${dir}/." "${DATA_DIR}/${dir}/"
                fi
            done
            
            # Copy secret key if exists
            if [[ -f "${RESTORE_DIR}/.webui_secret_key" ]]; then
                cp "${RESTORE_DIR}/.webui_secret_key" "${SCRIPT_DIR}/.webui_secret_key"
                chmod 600 "${SCRIPT_DIR}/.webui_secret_key"
            fi
            
            log "Backup restored successfully"
            return 0
        fi
        
        # Try Supabase restore
        local SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
        local SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
        local SUPABASE_BUCKET="${SUPABASE_BUCKET:-open-connect-backups}"
        local BACKUP_PREFIX="${BACKUP_PREFIX:-backups}"
        
        if [[ -n "$SUPABASE_PROJECT_REF" && -n "$SUPABASE_ACCESS_TOKEN" ]]; then
            log "Attempting Supabase backup restore..."
            local archive_path="${RESTORE_DIR}/latest.tar.gz"
            mkdir -p "$RESTORE_DIR"
            
            # List backups
            local list_response
            list_response=$(curl -fsSL --max-time 30 \
                "https://api.supabase.com/v1/storage/${SUPABASE_BUCKET}/objects/list" \
                -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
                -H "Content-Type: application/json" \
                -d "{\"prefix\": \"${BACKUP_PREFIX}/\"}" 2>/dev/null || echo "")
            
            if [[ -n "$list_response" ]]; then
                local latest_backup
                latest_backup=$(printf '%s' "$list_response" | jq -r 'sort_by(.created_at) | last.name // empty')
                
                if [[ -n "$latest_backup" ]]; then
                    local download_url="https://api.supabase.com/v1/storage/${SUPABASE_BUCKET}/objects/download/${latest_backup}"
                    log "Downloading latest backup: ${latest_backup}"
                    curl -fsSL --max-time 120 \
                        "$download_url" \
                        -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
                        -o "$archive_path"
                    
                    # Extract and restore
                    if [[ -f "$archive_path" ]]; then
                        log "Extracting backup..."
                        tar -xzf "$archive_path" -C "$RESTORE_DIR"
                        
                        # Copy restored files (same logic as above)
                        if [[ -f "${RESTORE_DIR}/database/webui.db" ]]; then
                            cp "${RESTORE_DIR}/database/webui.db" "${DATA_DIR}/webui.db"
                        elif [[ -f "${RESTORE_DIR}/webui.db" ]]; then
                            cp "${RESTORE_DIR}/webui.db" "${DATA_DIR}/webui.db"
                        fi
                        
                        for dir in uploads knowledge chat_history memories notes; do
                            if [[ -d "${RESTORE_DIR}/${dir}" ]]; then
                                mkdir -p "${DATA_DIR}/${dir}"
                                cp -r "${RESTORE_DIR}/${dir}/." "${DATA_DIR}/${dir}/"
                            fi
                        done
                        
                        if [[ -f "${RESTORE_DIR}/.webui_secret_key" ]]; then
                            cp "${RESTORE_DIR}/.webui_secret_key" "${SCRIPT_DIR}/.webui_secret_key"
                            chmod 600 "${SCRIPT_DIR}/.webui_secret_key"
                        fi
                        
                        log "Supabase backup restored successfully"
                        return 0
                    fi
                fi
            fi
        fi
        
        warn "No backup found to restore"
    else
        log "Existing data found, skipping backup restore"
    fi
}

# =============================================================================
# Generate Setup Tokens
# =============================================================================

generate_tokens() {
    log "Generating setup tokens for services..."
    
    # Generate Computer setup token if not provided
    if [[ -z "$CPTR_SETUP_TOKEN" ]]; then
        CPTR_SETUP_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -d '/+' | head -c 32)
        log "Generated Computer setup token"
        export CPTR_SETUP_TOKEN
    fi
    
    # Generate Open Terminal API key if not provided
    if [[ -z "$OPEN_TERMINAL_API_KEY" ]]; then
        OPEN_TERMINAL_API_KEY=$(head -c 32 /dev/urandom | base64 | tr -d '/+' | head -c 32)
        log "Generated Open Terminal API key"
        export OPEN_TERMINAL_API_KEY
    fi
    
    # Display connection information
    log ""
    log "========================================"
    log "Service Connection Information"
    log "========================================"
    log "Open Connect: http://localhost:$PORT"
    log "Open WebUI Computer: http://localhost:$CPTR_PORT"
    log "  Setup Token: $CPTR_SETUP_TOKEN"
    log "Open Terminal: http://localhost:$OPEN_TERMINAL_PORT"
    log "  API Key: $OPEN_TERMINAL_API_KEY"
    log "========================================"
    log ""
}

# =============================================================================
# Main Startup Logic
# =============================================================================

log "=========================================="
log "Open Connect - Railway Multi-Service Startup"
log "=========================================="
log "Environment: $ENV"
log "Docker Mode: $DOCKER"
log "Project Directory: $PROJECT_DIR"
log "Compose File: $COMPOSE_FILE"
log "=========================================="

# Step 1: Restore backups if enabled
restore_backups

# Step 2: Generate tokens for services
generate_tokens

# Step 3: Start all services using docker compose
log "Starting all services with docker compose..."

if command -v docker &> /dev/null; then
    # Check if we're running in Railway
    if [[ -n "${RAILWAY_ENVIRONMENT:-}" ]]; then
        log "Detected Railway environment"
        
        # In Railway, the compose file should be used directly
        # Railway will handle the service deployment
        if [[ -f "$COMPOSE_FILE" ]]; then
            log "Using compose file: $COMPOSE_FILE"
            
            # Start services in detached mode
            if docker compose -f "$COMPOSE_FILE" up -d; then
                log "Services started successfully"
                
                # Wait for services to become healthy
                wait_for_services
                
                # Display service status
                log ""
                log "Service Status:"
                docker compose -f "$COMPOSE_FILE" ps
                log ""
                
                # Tail logs for debugging
                log "Following logs (press Ctrl+C to stop)..."
                docker compose -f "$COMPOSE_FILE" logs -f &
                
                # Keep the container running
                tail -f /dev/null
            else
                error "Failed to start services with docker compose"
                exit 1
            fi
        else
            error "Compose file not found: $COMPOSE_FILE"
            exit 1
        fi
    else
        # Local development or other environments
        log "Not in Railway environment, starting services directly..."
        
        if [[ -f "$SCRIPT_DIR/start.sh" ]]; then
            log "Starting Open Connect with backend/start.sh..."
            exec bash "$SCRIPT_DIR/start.sh" "$@"
        else
            error "Backend start script not found"
            exit 1
        fi
    fi
else
    error "Docker is not available"
    exit 1
fi
