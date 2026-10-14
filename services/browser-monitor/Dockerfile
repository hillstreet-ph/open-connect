FROM python:3.12.14-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && python -m playwright install --with-deps chromium \
    && useradd --uid 10001 --create-home monitor \
    && mkdir /data && chown monitor:monitor /data
COPY core.py delivery.py source.py worker.py ./
USER monitor
VOLUME ["/data"]
# Container readiness includes explicit standby; monitoring readiness is `health` alone.
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s CMD ["python", "worker.py", "health", "--runtime-only"]
ENTRYPOINT ["python", "worker.py"]
CMD ["run"]
