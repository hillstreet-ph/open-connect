#!/bin/bash
# Auto-Healing Script
SERVICES=("open-connect-backend" "open-connect-frontend" "open-connect-langfuse")

for service in "${SERVICES[@]}"; do
  url="http://${service}.up.railway.app/health"
  if ! curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
    echo "ERROR: ${service} is unhealthy"
    railway restart "$service"
  else
    echo "OK: ${service} is healthy"
  fi
done
