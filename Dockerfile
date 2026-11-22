# ---------- مرحلة التبعيات ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ---------- مرحلة البناء ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- مرحلة التشغيل ----------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN apk add --no-cache postgresql-client tini
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/db/schema.sql ./db/schema.sql
COPY --from=builder /app/db/seed.sql ./db/seed.sql
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.ts ./next.config.ts
# نقطة الدخول — نسخها إلزامي لأن CMD يشغّل server.ts
COPY --from=builder /app/server.ts ./server.ts
RUN mkdir -p /app/backups /app/db/pglite-data
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "server.ts"]
