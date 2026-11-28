FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
COPY src ./src

RUN useradd --system --no-create-home --uid 10001 snagurl \
 && mkdir -p /var/lib/snagurl-worker \
 && chown snagurl /var/lib/snagurl-worker

USER snagurl
ENV NODE_ENV=production \
    WORKER_TMP_DIR=/var/lib/snagurl-worker \
    PORT=8080

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/main.ts"]
