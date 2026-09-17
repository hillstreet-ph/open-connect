FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
ENV NODE_ENV=production PORT=8080 MCP_UPSTREAM_PORT=8001
EXPOSE 8080
USER node
CMD ["npm", "start"]
