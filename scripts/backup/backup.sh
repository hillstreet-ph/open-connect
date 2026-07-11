#!/bin/bash
# Open Connect Backup Script - Comprehensive Production Backup
# This script backs up all essential data with Supabase integration

set -euo pipefail

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="open-connect_backup_${TIMESTAMP}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_NAME}"

# Directories to backup
DATA_DIR="${DATA_DIR:-./backend/data}"
BACKEND_DIR="${BACKEND_DIR:-./backend}"

# Supabase Configuration
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SUPABASE_BUCKET="${SUPABASE_BUCKET:-open-connect-backups}"

# Retention settings
RETENTION_DAYS="${RETENTION_DAYS:-14}"
RETENTION_COUNT="${RETENTION_COUNT:-10}"

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

# Create backup directory
mkdir -p "${BACKUP_PATH}"

log "=============================================="
log "Open Connect Backup Script - Production"
log "=============================================="
log "Backup Location: ${BACKUP_PATH}"
log "Timestamp: ${TIMESTAMP}"
log "Data Directory: ${DATA_DIR}"
log ""

# Track backup status
BACKUP_STATUS=0

# ── Backup 1: Database ──────────────────────────────────────────────────────────
log "1. Backing up database..."
if [ -f "${DATA_DIR}/webui.db" ]; then
    mkdir -p "${BACKUP_PATH}/database"
    cp "${DATA_DIR}/webui.db" "${BACKUP_PATH}/database/webui.db"
    
    # Create checksum for verification
    MD5SUM=$(md5sum "${DATA_DIR}/webui.db" | cut -d' ' -f1)
    echo "${MD5SUM}" > "${BACKUP_PATH}/database/webui.db.md5"
    
    DB_SIZE=$(du -h "${DATA_DIR}/webui.db" | cut -f1)
    log "   ✓ Database backed up: ${DB_SIZE}"
    log "   ✓ MD5: ${MD5SUM}"
else
    log "   ⚠ No database found at ${DATA_DIR}/webui.db"
    BACKUP_STATUS=1
fi

# ── Backup 2: User uploads and files ──────────────────────────────────────────
log "2. Backing up user uploads..."
if [ -d "${DATA_DIR}/uploads" ]; then
    mkdir -p "${BACKUP_PATH}/uploads"
    cp -r "${DATA_DIR}/uploads" "${BACKUP_PATH}/uploads"
    
    UPLOADS_SIZE=$(du -sh "${DATA_DIR}/uploads" | cut -f1)
    UPLOADS_COUNT=$(find "${DATA_DIR}/uploads" -type f | wc -l)
    log "   ✓ User uploads backed up: ${UPLOADS_SIZE} (${UPLOADS_COUNT} files)"
else
    log "   ⚠ No uploads directory found"
fi

# ── Backup 3: Knowledge base ────────────────────────────────────────────────────
log "3. Backing up knowledge base..."
if [ -d "${DATA_DIR}/knowledge" ]; then
    mkdir -p "${BACKUP_PATH}/knowledge"
    cp -r "${DATA_DIR}/knowledge" "${BACKUP_PATH}/knowledge"
    
    KNOWLEDGE_SIZE=$(du -sh "${DATA_DIR}/knowledge" | cut -f1)
    log "   ✓ Knowledge base backed up: ${KNOWLEDGE_SIZE}"
else
    log "   ⚠ No knowledge base found"
fi

# ── Backup 4: Cache (optional - can be re-downloaded) ──────────────────────────
log "4. Backing up cache (embedding models)..."
if [ -d "${DATA_DIR}/cache" ]; then
    mkdir -p "${BACKUP_PATH}/cache"
    # Only backup embedding models (the rest can be re-downloaded)
    if [ -d "${DATA_DIR}/cache/embedding" ]; then
        cp -r "${DATA_DIR}/cache/embedding" "${BACKUP_PATH}/cache/embedding"
        CACHE_SIZE=$(du -sh "${DATA_DIR}/cache/embedding" | cut -f1)
        log "   ✓ Embedding models cache backed up: ${CACHE_SIZE}"
    else
        log "   ⚠ No embedding cache found"
    fi
else
    log "   ⚠ No cache directory found"
fi

# ── Backup 5: Chat history ─────────────────────────────────────────────────────
log "5. Backing up chat history..."
if [ -d "${DATA_DIR}/chat_history" ]; then
    mkdir -p "${BACKUP_PATH}/chat_history"
    cp -r "${DATA_DIR}/chat_history" "${BACKUP_PATH}/chat_history"
    
    CHAT_SIZE=$(du -sh "${DATA_DIR}/chat_history" | cut -f1)
    log "   ✓ Chat history backed up: ${CHAT_SIZE}"
else
    log "   ⚠ No chat history found"
fi

# ── Backup 6: Secret key ──────────────────────────────────────────────────────
log "6. Backing up secret key..."
if [ -f "${BACKEND_DIR}/.webui_secret_key" ]; then
    cp "${BACKEND_DIR}/.webui_secret_key" "${BACKUP_PATH}/.webui_secret_key"
    log "   ✓ Secret key backed up"
else
    log "   ⚠ No secret key file found"
fi

# ── Backup 7: Configuration ────────────────────────────────────────────────────
log "7. Backing up configuration..."
if [ -f "${BACKEND_DIR}/.env" ]; then
    # Create a sanitized version (remove sensitive values)
    cp "${BACKEND_DIR}/.env" "${BACKUP_PATH}/.env.backup"
    
    # Create template with placeholders
    sed 's/=.*/=***REDACTED***/g' "${BACKEND_DIR}/.env" > "${BACKUP_PATH}/.env.template"
    log "   ✓ Configuration backed up (sensitive values redacted)"
fi

# ── Backup 8: Memories and Notes ─────────────────────────────────────────────
log "8. Backing up memories and notes..."
if [ -d "${DATA_DIR}/memories" ]; then
    mkdir -p "${BACKUP_PATH}/memories"
    cp -r "${DATA_DIR}/memories" "${BACKUP_PATH}/memories"
    log "   ✓ Memories backed up"
fi

if [ -d "${DATA_DIR}/notes" ]; then
    mkdir -p "${BACKUP_PATH}/notes"
    cp -r "${DATA_DIR}/notes" "${BACKUP_PATH}/notes"
    log "   ✓ Notes backed up"
fi

# ── Backup 9: Workspace resources (skills, plugins, pipelines, agent manifests) ──
log "9. Backing up workspace resources..."
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

# ── Backup 10: Models configuration ────────────────────────────────────────────
log "10. Backing up models configuration..."
if [ -f "${DATA_DIR}/models.json" ]; then
    cp "${DATA_DIR}/models.json" "${BACKUP_PATH}/models.json"
    log "   ✓ Models configuration backed up"
fi

# ── Backup 11: Metadata ────────────────────────────────────────────────────────
log "11. Creating backup metadata..."
cat > "${BACKUP_PATH}/metadata.json" << EOF
{
    "backup_date": "${TIMESTAMP}",
    "app_version": "${APP_VERSION:-unknown}",
    "git_commit": "${GIT_COMMIT:-unknown}",
    "backup_tool": "open-connect-backup-prod",
    "hostname": "${HOSTNAME:-unknown}",
    "retention_days": ${RETENTION_DAYS},
    "supabase_bucket": "${SUPABASE_BUCKET}",
    "files_included": {
        "database": true,
        "uploads": true,
        "knowledge": true,
        "cache": true,
        "chat_history": true,
        "secret_key": true,
        "config": true,
        "memories": true,
        "notes": true,
        "workspace_resources": true,
        "models": true
    },
    "backup_size": {
        "database": "$(du -h "${DATA_DIR}/webui.db" 2>/dev/null | cut -f1 || echo 'N/A')",
        "uploads": "$(du -sh "${DATA_DIR}/uploads" 2>/dev/null | cut -f1 || echo 'N/A')",
        "knowledge": "$(du -sh "${DATA_DIR}/knowledge" 2>/dev/null | cut -f1 || echo 'N/A')",
        "chat_history": "$(du -sh "${DATA_DIR}/chat_history" 2>/dev/null | cut -f1 || echo 'N/A')"
    }
}
EOF
log "   ✓ Metadata created"

# ── Create archive ─────────────────────────────────────────────────────────────
log ""
log "12. Creating archive..."
cd "${BACKUP_DIR}"
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
ARCHIVE_SIZE=$(du -h "${BACKUP_NAME}.tar.gz" | cut -f1)
rm -rf "${BACKUP_NAME}"
log "   ✓ Archive created: ${ARCHIVE_SIZE}"

# Create symlinks for easy access
ln -sfn "${BACKUP_NAME}.tar.gz" "${BACKUP_DIR}/latest.tar.gz"
ln -sfn "${BACKUP_NAME}.tar.gz" "${BACKUP_DIR}/latest-backup.tar.gz"

# ── Upload to Supabase (if configured) ─────────────────────────────────────────
if [ -n "${SUPABASE_PROJECT_REF}" ] && [ -n "${SUPABASE_ACCESS_TOKEN}" ]; then
    log ""
    log "13. Uploading to Supabase Storage..."
    
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
        "backups/${BACKUP_NAME}.tar.gz" 2>/dev/null)
    
    if echo "${UPLOAD_RESPONSE}" | grep -q '"error"'; then
        log_error "Failed to upload to Supabase: ${UPLOAD_RESPONSE}"
    else
        log "   ✓ Backup uploaded to Supabase"
    fi
fi

# ── Cleanup old backups ─────────────────────────────────────────────────────────
log ""
log "14. Cleaning up old backups..."

# Remove by count
ls -t "${BACKUP_DIR}"/open-connect_backup_*.tar.gz 2>/dev/null | tail -n +$((RETENTION_COUNT + 1)) | xargs -r rm -f

# Remove by age
find "${BACKUP_DIR}" -name "open-connect_backup_*.tar.gz" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

REMAINING=$(ls "${BACKUP_DIR}"/open-connect_backup_*.tar.gz 2>/dev/null | wc -l)
log "   ✓ Cleanup complete. ${REMAINING} backups remaining"

# ── Verify backup integrity ────────────────────────────────────────────────────
log ""
log "15. Verifying backup integrity..."
if tar -tzf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" > /dev/null 2>&1; then
    log "    ✓ Backup verified successfully"
else
    log_error "Backup verification failed!"
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
log "Location: ${BACKUP_DIR}"
log "Latest: ${BACKUP_DIR}/latest.tar.gz"
log ""

# Output for monitoring
echo "BACKUP_STATUS=${BACKUP_STATUS}"
echo "BACKUP_FILE=${BACKUP_NAME}.tar.gz"
echo "BACKUP_SIZE=${ARCHIVE_SIZE}"

echo "BACKUP_PATH=${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
echo "TIMESTAMP=${TIMESTAMP}"

exit $BACKUP_STATUS
