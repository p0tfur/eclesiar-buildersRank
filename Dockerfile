# VER monorepo (API + web) Dockerfile

# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies using lockfile for reproducible builds
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/api/package.json ./packages/api/package.json
COPY packages/web/package.json ./packages/web/package.json

RUN npm ci

# Copy the rest of the repository
COPY . .

# Build both API and web via monorepo scripts
RUN npm run build

# --- Runtime stage ---
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV VER_PORT=4000

# Copy runtime dependencies and built artefacts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/web/dist ./packages/web/dist

# API (and static frontend) listen on VER_PORT
EXPOSE 4000

CMD ["node", "packages/api/dist/index.js"]
