# LessonBloom Meta: one container, the API and the built web app. ffmpeg and Chromium render the
# lesson video (slides + narration from the server's voice engines).
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg chromium fonts-noto-core fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY samples/books/*.pdf ./samples/books/
COPY --from=web /app/web/dist ./web/dist
USER node
CMD ["./node_modules/.bin/tsx", "server/main.ts"]
