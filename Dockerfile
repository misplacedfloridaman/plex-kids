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
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js .
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 6767
CMD ["node", "server.js"]
