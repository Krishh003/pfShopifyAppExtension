# Pristine Forests backend container for Fly.io / generic container runtimes.

ARG NODE_VERSION=22-alpine
FROM node:${NODE_VERSION} AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Strip dev/test artifacts that would otherwise bloat the image.
RUN rm -rf test .git .github .env .env.example fly.toml Dockerfile .dockerignore

EXPOSE 8081
USER node
CMD ["node", "index.js"]
