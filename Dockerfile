# ============================================
# AIS RECEIVER SERVER - DOCKERFILE
# ============================================
# Multi-stage build for smaller image size

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# ============================================
# PRODUCTION IMAGE
# ============================================
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aisserver -u 1001 -G nodejs

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY --chown=aisserver:nodejs . .

# Set user
USER aisserver

# Default environment variables
ENV HOST=0.0.0.0
ENV PORT_START=5300
ENV PORT_END=12000
ENV VERBOSE_LOGGING=false
ENV STATS_INTERVAL=60

# Note: Port range is exposed dynamically
# Docker must be run with --network host or specific port mappings

# Start the server
CMD ["node", "src/server.js"]
