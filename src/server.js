/**
 * AIS Multi-Port TCP Receiver & Forwarder Server
 * 
 * Flow:
 * 1. AIS Device connects to Server:PORT and sends data
 * 2. Clients (OpenCPN, etc.) connect to same Server:PORT
 * 3. Server forwards AIS data from sender to all connected receivers on-the-fly
 * 
 * Each port represents a different AIS stream/identity
 * Data is NOT stored - pure forwarding/streaming
 */

import net from 'net';
import http from 'http';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

// ============================================
// LOGGER SETUP
// ============================================
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined,
  formatters: {
    level: (label) => ({ level: label })
  }
});

// ============================================
// CONFIGURATION
// ============================================
const PORT_START = parseInt(process.env.PORT_START) || 4000;
const PORT_END = parseInt(process.env.PORT_END) || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT) || 3000;
const VERBOSE_LOGGING = process.env.VERBOSE_LOGGING === 'true';
const STATS_INTERVAL = parseInt(process.env.STATS_INTERVAL) || 60;

// ============================================
// PORT MANAGER - Manages all port channels
// ============================================
class PortChannel {
  constructor(port) {
    this.port = port;
    this.sender = null;           // The AIS device sending data
    this.receivers = new Set();   // Clients receiving data (OpenCPN, etc.)
    this.lastData = null;         // Last received data (for new connections)
    this.lastDataTime = null;
    this.messageCount = 0;
    this.bytesReceived = 0;
    this.bytesSent = 0;
  }

  setSender(socket) {
    if (this.sender && this.sender !== socket) {
      logger.warn({ port: this.port }, 'Replacing existing sender');
      try {
        this.sender.destroy();
      } catch (e) {}
    }
    this.sender = socket;
    logger.info({ port: this.port, remoteAddress: socket.remoteAddress, remotePort: socket.remotePort }, 'AIS Sender connected');
  }

  addReceiver(socket) {
    this.receivers.add(socket);
    logger.info({ port: this.port, remoteAddress: socket.remoteAddress, remotePort: socket.remotePort, totalReceivers: this.receivers.size }, 'Receiver connected');
    
    // Send last data to new receiver if available
    if (this.lastData) {
      try {
        socket.write(this.lastData);
        socket.uncork && socket.uncork(); // Force flush
      } catch (e) {}
    }
  }

  removeReceiver(socket) {
    this.receivers.delete(socket);
    logger.info({ port: this.port, remainingReceivers: this.receivers.size }, 'Receiver disconnected');
  }

  removeSender() {
    this.sender = null;
    logger.info({ port: this.port }, 'AIS Sender disconnected');
  }

  // Forward data from sender to all receivers
  forwardData(data) {
    this.lastData = data;
    this.lastDataTime = new Date();
    this.messageCount++;
    this.bytesReceived += data.length;

    if (VERBOSE_LOGGING) {
      const preview = data.toString().trim().substring(0, 80);
      logger.debug({ port: this.port, preview, receivers: this.receivers.size }, 'Data forwarded');
    }

    // Forward to all receivers immediately
    const deadReceivers = [];
    for (const receiver of this.receivers) {
      try {
        // Check if socket is still writable
        if (receiver.writable && !receiver.destroyed) {
          receiver.write(data);
          this.bytesSent += data.length;
        } else {
          deadReceivers.push(receiver);
        }
      } catch (e) {
        logger.error({ port: this.port, error: e.message }, 'Error sending to receiver');
        deadReceivers.push(receiver);
      }
    }
    
    // Clean up dead receivers
    for (const dead of deadReceivers) {
      this.removeReceiver(dead);
      try { dead.destroy(); } catch (e) {}
    }
  }

  getStats() {
    return {
      port: this.port,
      hasSender: !!this.sender,
      receiverCount: this.receivers.size,
      messageCount: this.messageCount,
      bytesReceived: this.bytesReceived,
      bytesSent: this.bytesSent,
      lastDataTime: this.lastDataTime
    };
  }
}

// ============================================
// AIS RECEIVER SERVER
// ============================================
class AISReceiverServer {
  constructor() {
    this.channels = new Map();  // port -> PortChannel
    this.servers = new Map();   // port -> TCP Server
    this.healthServer = null;   // HTTP server for health check
    this.startTime = Date.now();
    this.isHealthy = true;
  }

  getOrCreateChannel(port) {
    if (!this.channels.has(port)) {
      this.channels.set(port, new PortChannel(port));
    }
    return this.channels.get(port);
  }

  // Handle incoming connection
  handleConnection(socket, port) {
    const channel = this.getOrCreateChannel(port);
    const clientInfo = `${socket.remoteAddress}:${socket.remotePort}`;
    
    // Buffer for incomplete data
    let dataBuffer = '';
    let isSender = false;
    let isIdentified = false;

    // Disable Nagle's algorithm for real-time data
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 30000);
    socket.setTimeout(300000); // 5 minutes timeout

    // Determine if this is a sender or receiver based on first data
    socket.on('data', (data) => {
      const strData = data.toString();
      
      // First data determines role
      if (!isIdentified) {
        isIdentified = true;
        
        // If data starts with AIS message pattern, it's a sender
        if (strData.includes('!AIVDM') || strData.includes('!AIVDO') || 
            strData.includes('$GPGGA') || strData.includes('$GPRMC') ||
            strData.startsWith('\\')) {
          isSender = true;
          channel.setSender(socket);
        } else {
          // Otherwise, treat as receiver (or could be receiver query)
          isSender = false;
          channel.addReceiver(socket);
          
          // If there's existing data, receiver might be sending a query
          // Just ignore it, they're here to receive
          return;
        }
      }

      if (isSender) {
        // Forward data to all receivers
        channel.forwardData(data);
      }
      // If receiver sends data, ignore it (they're just listeners)
    });

    socket.on('close', () => {
      if (isSender) {
        channel.removeSender();
      } else if (isIdentified) {
        channel.removeReceiver(socket);
      }
    });

    socket.on('error', (err) => {
      if (VERBOSE_LOGGING) {
        logger.warn({ port, clientInfo, error: err.message }, 'Socket error');
      }
    });

    socket.on('timeout', () => {
      logger.info({ port, clientInfo }, 'Socket timeout');
      socket.destroy();
    });

    // Initially, add as receiver (most common case)
    // Role will be determined on first data
    if (!isIdentified) {
      // Wait a short moment to see if they send data (reduced from 1000ms to 100ms)
      setTimeout(() => {
        if (!isIdentified && !socket.destroyed) {
          isIdentified = true;
          isSender = false;
          channel.addReceiver(socket);
        }
      }, 100);
    }
  }

  // Start a single port server
  startPortServer(port) {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.handleConnection(socket, port);
      });

      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn({ port }, 'Port already in use, skipping');
          resolve(false);
        } else {
          logger.error({ port, error: err.message }, 'Server error');
          reject(err);
        }
      });

      server.listen(port, HOST, () => {
        this.servers.set(port, server);
        resolve(true);
      });
    });
  }

  // Start HTTP health check server
  startHealthServer() {
    return new Promise((resolve, reject) => {
      this.healthServer = http.createServer((req, res) => {
        const stats = this.getHealthStats();
        
        if (req.url === '/health' || req.url === '/healthz') {
          if (this.isHealthy) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy', ...stats }));
          } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'unhealthy', ...stats }));
          }
        } else if (req.url === '/ready') {
          if (this.servers.size > 0) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ready', activePorts: this.servers.size }));
          } else {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'not_ready' }));
          }
        } else if (req.url === '/metrics' || req.url === '/stats') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(stats, null, 2));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found', endpoints: ['/health', '/ready', '/metrics'] }));
        }
      });

      this.healthServer.on('error', (err) => {
        logger.error({ port: HEALTH_PORT, error: err.message }, 'Health server error');
        reject(err);
      });

      this.healthServer.listen(HEALTH_PORT, HOST, () => {
        logger.info({ port: HEALTH_PORT, host: HOST }, 'Health check server started');
        resolve(true);
      });
    });
  }

  getHealthStats() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const activeChannels = Array.from(this.channels.values())
      .filter(ch => ch.sender || ch.receivers.size > 0);
    
    let totalMessages = 0;
    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    let totalSenders = 0;
    let totalReceivers = 0;

    for (const ch of this.channels.values()) {
      totalMessages += ch.messageCount;
      totalBytesReceived += ch.bytesReceived;
      totalBytesSent += ch.bytesSent;
      if (ch.sender) totalSenders++;
      totalReceivers += ch.receivers.size;
    }

    return {
      uptime,
      uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${uptime % 60}s`,
      activePorts: this.servers.size,
      activeChannels: activeChannels.length,
      totalSenders,
      totalReceivers,
      totalMessages,
      totalBytesReceived,
      totalBytesSent,
      portRange: { start: PORT_START, end: PORT_END },
      timestamp: new Date().toISOString()
    };
  }

  // Start all port servers in range
  async start() {
    logger.info({ host: HOST, portStart: PORT_START, portEnd: PORT_END, totalPorts: PORT_END - PORT_START + 1, healthPort: HEALTH_PORT }, 'AIS Multi-Port Receiver & Forwarder Server starting');
    
    // Start health check server first
    await this.startHealthServer();
    
    logger.info('Starting port servers...');

    let successCount = 0;
    let failCount = 0;

    // Start servers in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let startPort = PORT_START; startPort <= PORT_END; startPort += batchSize) {
      const endPort = Math.min(startPort + batchSize - 1, PORT_END);
      const promises = [];
      
      for (let port = startPort; port <= endPort; port++) {
        promises.push(
          this.startPortServer(port)
            .then(success => success ? successCount++ : failCount++)
            .catch(() => failCount++)
        );
      }
      
      await Promise.all(promises);
      
      // Progress update
      const progress = Math.round(((endPort - PORT_START + 1) / (PORT_END - PORT_START + 1)) * 100);
      logger.debug({ progress, successCount, failCount }, 'Port startup progress');
    }

    logger.info({ activePorts: successCount, failedPorts: failCount }, 'Server started successfully');
    logger.info({ healthEndpoints: [`http://${HOST}:${HEALTH_PORT}/health`, `http://${HOST}:${HEALTH_PORT}/ready`, `http://${HOST}:${HEALTH_PORT}/metrics`] }, 'Health check endpoints available');
    logger.info('Waiting for connections...');

    // Start stats interval
    setInterval(() => this.showStats(), STATS_INTERVAL * 1000);
  }

  showStats() {
    const stats = this.getHealthStats();
    const activeChannels = Array.from(this.channels.values())
      .filter(ch => ch.sender || ch.receivers.size > 0);

    if (activeChannels.length === 0) return;

    const channelDetails = activeChannels.map(ch => {
      const chStats = ch.getStats();
      return {
        port: chStats.port,
        hasSender: chStats.hasSender,
        receivers: chStats.receiverCount,
        messages: chStats.messageCount,
        lastData: chStats.lastDataTime ? new Date(chStats.lastDataTime).toISOString() : null
      };
    });

    logger.info({ 
      uptime: stats.uptimeHuman, 
      activeChannels: stats.activeChannels,
      totalSenders: stats.totalSenders,
      totalReceivers: stats.totalReceivers,
      totalMessages: stats.totalMessages,
      channels: channelDetails
    }, 'Statistics');
  }

  // Graceful shutdown
  shutdown() {
    logger.info('Shutting down...');
    this.isHealthy = false;
    
    for (const [port, server] of this.servers) {
      server.close();
    }
    
    for (const channel of this.channels.values()) {
      if (channel.sender) {
        try { channel.sender.destroy(); } catch (e) {}
      }
      for (const receiver of channel.receivers) {
        try { receiver.destroy(); } catch (e) {}
      }
    }
    
    if (this.healthServer) {
      this.healthServer.close();
    }
    
    this.showStats();
    logger.info('Goodbye!');
    process.exit(0);
  }
}

// ============================================
// MAIN
// ============================================
const server = new AISReceiverServer();

process.on('SIGINT', () => server.shutdown());
process.on('SIGTERM', () => server.shutdown());

server.start().catch(err => {
  logger.error({ error: err.message }, 'Failed to start server');
  process.exit(1);
});
