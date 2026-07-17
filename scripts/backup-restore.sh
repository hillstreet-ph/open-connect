#!/bin/bash
# Simple Backup Script
mkdir -p backups
cp -r config backups/ 2>/dev/null || true
cp railway.json backups/ 2>/dev/null || true
echo "Backup created in backups/"