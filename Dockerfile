# Stage 1 — build the React frontend
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm cache clean --force
COPY . .
RUN npm run build

# Stage 2 — run the Express server
FROM node:20-alpine
WORKDIR /app
# ffmpeg: used by the offline-download route to remux Plex's H.264/AAC MKV stream into a
# Safari-playable fragmented MP4 (container copy only, no re-encode).
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js tv.js ./
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 6767
CMD ["node", "server.js"]
