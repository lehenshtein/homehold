FROM node:20-alpine AS builder
WORKDIR /app
# Prisma's schema/query engine binaries need OpenSSL; Alpine doesn't ship it
# by default, which breaks `prisma generate`/`db push` with an unhelpful
# "Could not parse schema engine response" error.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev && npx prisma generate
EXPOSE 6101
# db push syncs the schema (no formal migration history yet — fine for this
# early scaffold stage, see CLAUDE.md), then seed the admin account if it
# doesn't exist yet, then start the server. Idempotent: safe on every deploy.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run seed:admin && node build/server.js"]
