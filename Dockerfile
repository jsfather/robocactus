# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY db ./db
COPY scripts ./scripts

# Only uploads need write access; avoid chown -R /app (node_modules has 10k+ files and stalls builds).
RUN mkdir -p /app/data/uploads && chown node:node /app/data/uploads
USER node

EXPOSE 3000
VOLUME ["/app/data/uploads"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["npm", "start"]
