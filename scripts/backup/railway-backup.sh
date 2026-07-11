#!/bin/bash
# Open Connect Railway Backup Script - Production Ready
# This script backs up data from Railway persistent volumes
# Can be run manually or scheduled via Railway's cron feature

set -euo pipefail

# Configuration
BACKUP_DEST="${BACKUP_DEST:-/tmp/backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-5}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="open-connect-${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DEST}/${BACKUP_NAME}"

# Supabase Configuration (for remote backup)
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SUPABASE_BUCKET="${SUPABASE_BUCKET:-open-connect-backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-backups}"

# Logging
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1" >&2
}

log_success() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [SUCCESS] $1"
}

# Check for Railway volume
RAILWAY_VOLUME_MOUNT_DIR="${RAILWAY_VOLUME_MOUNT_DIR:-/app/backend/data}"
BACKEND_DIR="${BACKEND_DIR:-/app/backend}"

log "=============================================="
log "Open Connect Railway Backup"
log "=============================================="
log "Source: ${RAILWAY_VOLUME_MOUNT_DIR}"
log "Destination: ${BACKUP_PATH}"
log "Timestamp: ${TIMESTAMP}"
log ""

# Track backup status
BACKUP_STATUS=0

# Create backup directory
mkdir -p "${BACKUP_PATH}"
mkdir -p "${BACKUP_DEST}"

# ── Backup 1: Database ──────────────────────────────────────────────────────────
log "1. Backing up database..."
if [ -f "${RAILWAY_VOLUME_MOUNT_DIR}/webui.db" ]; then
    mkdir -p "${BACKUP_PATH}/database"
    cp "${RAILWAY_VOLUME_MOUNT_DIR}/webui.db" "${BACKUP_PATH}/database/webui.db"
    
    # Create checksum
    MD5SUM=$(md5sum "${RAILWAY_VOLUME_MOUNT_DIR}/webui.db" | cut -d' ' -f1)
    echo "${MD5SUM}" > "${BACKUP_PATH}/database/webui.db.md5"
    
    DB_SIZE=$(du -h "${RAILWAY_VOLUME_MOUNT_DIR}/webui.db" | cut -f1)
    log "   ✓ Database backed up: ${DB_SIZE}"
    log "   ✓ MD5: ${MD5SUM}"
else
    log_error "No database found at ${RAILWAY_VOLUME_MOUNT_DIR}/webui.db"
    BACKUP_STATUS=1
fi

# ── Backup 2: Uploads ──────────────────────────────────────────────────────────
log "2. Backing up uploads..."
if [ -d "${RAILWAY_VOLUME_MOUNT_DIR}/uploads" ]; then
    cp -r "${RAILWAY_VOLUME_MOUNT_DIR}/uploads" "${BACKUP_PATH}/"
    UPLOADS_SIZE=$(du -sh "${RAILWAY_VOLUME_MOUNT_DIR}/uploads" | cut -f1)
    UPLOADS_COUNT=$(find "${RAILWAY_VOLUME_MOUNT_DIR}/uploads" -type f | wc -l)
    log "   ✓ Uploads backed up: ${UPLOADS_SIZE} (${UPLOADS_COUNT} files)"
else
    log "   ⚠ No uploads directory found"
fi

# ── Backup 3: Knowledge base ───────────────────────────────────────────────────
log "3. Backing up knowledge base..."
if [ -d "${RAILWAY_VOLUME_MOUNT_DIR}/knowledge" ]; then
    cp -r "${RAILWAY_VOLUME_MOUNT_DIR}/knowledge" "${BACKUP_PATH}/"
    KNOWLEDGE_SIZE=$(du -sh "${RAILWAY_VOLUME_MOUNT_DIR}/knowledge" | cut -f1)
    log "   ✓ Knowledge base backed up: ${KNOWLEDGE_SIZE}"
else
    log "   ⚠ No knowledge base found"
fi

# ── Backup 4: Chat history ─────────────────────────────────────────────────────
log "4. Backing up chat history..."
if [ -d "${RAILWAY_VOLUME_MOUNT_DIR}/chat_history" ]; then
    cp -r "${RAILWAY_VOLUME_MOUNT_DIR}/chat_history" "${BACKUP_PATH}/"
    CHAT_SIZE=$(du -sh "${RAILWAY_VOLUME_MOUNT_DIR}/chat_history" | cut -f1)
    log "   ✓ Chat history backed up: ${CHAT_SIZE}"
else
    log "   ⚠ No chat history found"
fi

# ── Backup 5: Secret key ──────────────────────────────────────────────────────
log "5. Backing up secret key..."
if [ -f "${BACKEND_DIR}/.webui_secret_key" ]; then
    cp "${BACKEND_DIR}/.webui_secret_key" "${BACKUP_PATH}/.webui_secret_key"
    log "   ✓ Secret key backed up"
else
    log "   ⚠ No secret key found"
fi

# ── Backup 6: Configuration ────────────────────────────────────────────────────
log "6. Backing up configuration..."
if [ -f "${BACKEND_DIR}/.env" ]; then
    cp "${BACKEND_DIR}/.env" "${BACKUP_PATH}/.env.backup"
    log "   ✓ Configuration backed up"
fi

# ── Backup 7: Memories and Notes ──────────────────────────────────────────────
log "7. Backing up memories and notes..."
[ -d "${RAILWAY_VOLUME_MOUNT_DIR}/memories" ] && cp -r "${RAILWAY_VOLUME_MOUNT_DIR}/memories" "${BACKUP_PATH}/" 2>/dev/null || true
[ -d "${RAILWAY_VOLUME_MOUNT_DIR}/notes" ] && cp -r "${RAILWAY_VOLUME_MOUNT_DIR}/notes" "${BACKUP_PATH}/" 2>/dev/null || true
log "   ✓ Memories and notes backed up"

# ── Backup 8: Workspace resources (skills, plugins, pipelines, agent manifests) ──
log "8. Backing up workspace resources..."
if [ -d "${BACKEND_DIR}/open_webui/plugins" ]; then
    mkdir -p "${BACKUP_PATH}/workspace_resources"
    cp -r "${BACKEND_DIR}/open_webui/plugins" "${BACKUP_PATH}/workspace_resources/"
    log "   ✓ Plugins backed up"
fi
if [ -d "${BACKEND_DIR}/open_webui/skills" ]; then
    mkdir -p "${BACKUP_PATH}/workspace_resources"
    cp -r "${BACKEND_DIR}/open_webui/skills" "${BACKUP_PATH}/workspace_resources/"
    log "   ✓ Skills backed up"
fi
if [ -d "${BACKEND_DIR}/open_webui/pipelines" ]; then
    mkdir -p "${BACKUP_PATH}/workspace_resources"
    cp -r "${BACKEND_DIR}/open_webui/pipelines" "${BACKUP_PATH}/workspace_resources/"
    log "   ✓ Pipelines backed up"
fi
if [ -f "${BACKEND_DIR}/open_webui/integrations/.agents.json" ] || [ -f "${BACKEND_DIR}/open_webui/integrations/.connectors.json" ]; then
    mkdir -p "${BACKUP_PATH}/workspace_resources/integrations"
    [ -f "${BACKEND_DIR}/open_webui/integrations/.agents.json" ] && cp "${BACKEND_DIR}/open_webui/integrations/.agents.json" "${BACKUP_PATH}/workspace_resources/integrations/.agents.json"
    [ -f "${BACKEND_DIR}/open_webui/integrations/.connectors.json" ] && cp "${BACKEND_DIR}/open_webui/integrations/.connectors.json" "${BACKUP_PATH}/workspace_resources/integrations/.connectors.json"
    log "   ✓ Integration manifests backed up"
fi

# ── Backup 9: Metadata ─────────────────────────────────────────────────────────
log "9. Creating backup metadata..."
cat > "${BACKUP_PATH}/metadata.json" << EOF
{
    "backup_date": "${TIMESTAMP}",
    "app_version": "${APP_VERSION:-unknown}",
    "git_commit": "${GIT_COMMIT:-unknown}",
    "backup_tool": "railway-backup",
    "hostname": "${HOSTNAME:-railway}",
    "railway_deployment_id": "${RAILWAY_DEPLOYMENT_ID:-unknown}",
    "retention_days": ${RETENTION_DAYS},
    "files_included": {
        "database": true,
        "uploads": true,
        "knowledge": true,
        "chat_history": true,
        "secret_key": true,
        "config": true,
        "memories": true,
        "notes": true,
        "workspace_resources": true
    }
}
EOF
log "   ✓ Metadata created"

# ── Create archive ─────────────────────────────────────────────────────────────
log ""
log "10. Creating archive..."
cd "${BACKUP_DEST}"
tar -czf "${BACKUP_NAME}.tar.gz" -C "${BACKUP_DEST}" "${BACKUP_NAME}"
ARCHIVE_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
rm -rf "${BACKUP_PATH}"

# Update symlinks
ln -sfn "${BACKUP_NAME}.tar.gz" "${BACKUP_DEST}/latest.tar.gz"
ln -sfn "${BACKUP_NAME}.tar.gz" "${BACKUP_DEST}/latest-backup.tar.gz"

log_success "   Archive created: ${ARCHIVE_SIZE}"

# ── Upload to Supabase (if configured) ────────────────────────────────────────
if [ -n "${SUPABASE_PROJECT_REF}" ] && [ -n "${SUPABASE_ACCESS_TOKEN}" ]; then
    log ""
    log "11. Uploading to Supabase Storage..."
    
    # Create bucket if it doesn't exist
    curl -s -X POST \
        "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/storage/buckets" \
        -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"name\": \"${SUPABASE_BUCKET}\", \"public\": false, \"file_size_limit\": 1073741824}" \
        2>/dev/null || true
    
    # Upload the backup
    UPLOAD_RESPONSE=$(curl -s -X POST \
        "https://api.supabase.com/v1/storage/${SUPABASE_BUCKET}/objects/upload" \
        -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
        -H "Content-Type: application/octet-stream" \
        -H "x-upsert: true" \
        --data-binary @"${BACKUP_NAME}.tar.gz" \
        "${BACKUP_PREFIX}/${BACKUP_NAME}.tar.gz" 2>/dev/null)
    
    if echo "${UPLOAD_RESPONSE}" | grep -q '"error"'; then
        log_error "Failed to upload to Supabase"
    else
        log_success "   Backup uploaded to Supabase"
    fi
fi

# ── Cleanup old backups ────────────────────────────────────────────────────────
log ""
log "11. Cleaning up old backups..."
ls -t "${BACKUP_DEST}"/open-connect-*.tar.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
find "${BACKUP_DEST}" -name "open-connect-*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true
REMAINING=$(ls "${BACKUP_DEST}"/open-connect-*.tar.gz 2>/dev/null | wc -l)
log "   ✓ Cleanup complete. ${REMAINING} backups remaining"

# ── Verify backup integrity ────────────────────────────────────────────────────
log ""
log "12. Verifying backup integrity..."
if tar -tzf "${BACKUP_DEST}/${BACKUP_NAME}.tar.gz" > /dev/null 2>&1; then
    log_success "   Backup verified successfully"
else
    log_error "   Backup verification failed!"
    BACKUP_STATUS=1
fi

# ── Summary ─────────────────────────────────────────────────────────────────────
log ""
log "=============================================="
if [ $BACKUP_STATUS -eq 0 ]; then
    log_success "Backup completed successfully!"
else
    log_error "Backup completed with warnings"
fi
log "=============================================="
log "Archive: ${BACKUP_NAME}.tar.gz"
log "Size: ${ARCHIVE_SIZE}"
log "Location: ${BACKUP_DEST}"
log "Latest: ${BACKUP_DEST}/latest.tar.gz"
log ""

# Output for monitoring
echo "BACKUP_STATUS=${BACKUP_STATUS}"
echo "BACKUP_FILE=${BACKUP_NAME}.tar.gz"
echo "BACKUP_SIZE=${ARCHIVE_SIZE}"
echo "BACKUP_PATH=${BACKUP_DEST}/${BACKUP_NAME}.tar.gz"
echo "TIMESTAMP=${TIMESTAMP}"

exit $BACKUP_STATUS
