FROM node:22-alpine
WORKDIR /app
COPY services/zeabur-mcp-bridge/package.json services/zeabur-mcp-bridge/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY services/zeabur-mcp-bridge/server.js ./
ENV NODE_ENV=production PORT=8080 MCP_UPSTREAM_PORT=8001
EXPOSE 8080
USER node
CMD ["npm", "start"]
