# ---- Base Node ----
# Use a specific Node.js version known to work, Alpine for smaller size
FROM node:23-alpine AS builder

WORKDIR /usr/src/app

# Enable corepack
RUN corepack enable

# Copy package.json and pnpm-lock.yaml
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application's source code
COPY . .

# Build the TypeScript code
RUN pnpm run build

# --- Release Stage ---
FROM node:23-alpine

WORKDIR /usr/src/app

# Enable corepack
RUN corepack enable

# Copy built code and dependencies from builder stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json .

ENV HASS_TOKEN
ARG HASS_TOKEN=${HASS_TOKEN}
ENV LOG_LEVEL
ARG LOG_LEVEL=${LOG_LEVEL}

RUN mkdir -p scripts

# Use pm2-runtime to run the compiled code
CMD ["pm2-runtime", "dist/jsengine.js", "scripts"]