# ============================================
# AIS RECEIVER SERVER - DOCKERFILE FOR COOLIFY
# ============================================

FROM node:20-alpine

WORKDIR /app

# Install tini for proper signal handling
RUN apk add --no-cache tini

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY . .

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

# Expose health check port and sample AIS ports
EXPOSE 3000

# No HEALTHCHECK - let Coolify handle it or disable
# Container starts 1001 TCP ports which takes time

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
