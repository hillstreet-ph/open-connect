FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium \
    && apt-get update && apt-get install -y --no-install-recommends gosu xvfb x11vnc openbox \
    && rm -rf /var/lib/apt/lists/*
COPY . ./
RUN useradd --create-home browser && mkdir -p /data/profiles && chown -R browser:browser /app /data
RUN chmod 755 /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
