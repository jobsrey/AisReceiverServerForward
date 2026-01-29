# ============================================
# AIS RECEIVER SERVER - DOCKERFILE FOR COOLIFY
# ============================================
# Optimized for Coolify deployment with health checks

FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (using npm install for flexibility with lock file)
RUN npm install --omit=dev

# ============================================
# PRODUCTION IMAGE
# ============================================
FROM node:20-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl tini

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aisserver -u 1001 -G nodejs

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source code
COPY --chown=aisserver:nodejs . .

# Set user
USER aisserver

# ============================================
# ENVIRONMENT VARIABLES (Coolify can override)
# ============================================
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT_START=4000
ENV PORT_END=5000
ENV HEALTH_PORT=3000
ENV VERBOSE_LOGGING=false
ENV STATS_INTERVAL=60
ENV LOG_LEVEL=info

# ============================================
# EXPOSE PORTS
# ============================================
# Health check port (required for Coolify)
EXPOSE 3000

# AIS TCP port range 4000-5000
# Note: In Coolify, you need to configure port mappings manually
# or use network_mode: host for the full range

# ============================================
# HEALTH CHECK (for Coolify/Docker)
# ============================================
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# ============================================
# LABELS (for Coolify)
# ============================================
LABEL org.opencontainers.image.title="AIS Receiver Server Forward"
LABEL org.opencontainers.image.description="AIS Multi-Port TCP Receiver & Forwarder Server"
LABEL org.opencontainers.image.vendor="WiWIT Project"
LABEL coolify.healthcheck.path="/health"
LABEL coolify.healthcheck.port="3000"

# ============================================
# START SERVER
# ============================================
# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
