FROM node:24-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium
COPY . ./
RUN useradd --create-home browser && chown -R browser:browser /app
USER browser
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
