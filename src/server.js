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
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION
// ============================================
const PORT_START = parseInt(process.env.PORT_START) || 5300;
const PORT_END = parseInt(process.env.PORT_END) || 12000;
const HOST = process.env.HOST || '0.0.0.0';
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
      console.log(`[Port ${this.port}] ⚠️  Replacing existing sender`);
      try {
        this.sender.destroy();
      } catch (e) {}
    }
    this.sender = socket;
    console.log(`[Port ${this.port}] 📡 AIS Sender connected: ${socket.remoteAddress}:${socket.remotePort}`);
  }

  addReceiver(socket) {
    this.receivers.add(socket);
    console.log(`[Port ${this.port}] 👁️  Receiver connected: ${socket.remoteAddress}:${socket.remotePort} (Total: ${this.receivers.size})`);
    
    // Send last data to new receiver if available
    if (this.lastData) {
      try {
        socket.write(this.lastData);
      } catch (e) {}
    }
  }

  removeReceiver(socket) {
    this.receivers.delete(socket);
    console.log(`[Port ${this.port}] 👋 Receiver disconnected (Remaining: ${this.receivers.size})`);
  }

  removeSender() {
    this.sender = null;
    console.log(`[Port ${this.port}] 📡 AIS Sender disconnected`);
  }

  // Forward data from sender to all receivers
  forwardData(data) {
    this.lastData = data;
    this.lastDataTime = new Date();
    this.messageCount++;
    this.bytesReceived += data.length;

    if (VERBOSE_LOGGING) {
      const preview = data.toString().trim().substring(0, 80);
      console.log(`[Port ${this.port}] 📨 Data: ${preview}... -> ${this.receivers.size} receivers`);
    }

    // Forward to all receivers
    for (const receiver of this.receivers) {
      try {
        receiver.write(data);
        this.bytesSent += data.length;
      } catch (e) {
        console.log(`[Port ${this.port}] ❌ Error sending to receiver: ${e.message}`);
        this.removeReceiver(receiver);
      }
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
    this.startTime = Date.now();
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
        console.log(`[Port ${port}] ❌ Socket error (${clientInfo}): ${err.message}`);
      }
    });

    socket.on('timeout', () => {
      console.log(`[Port ${port}] ⏰ Socket timeout: ${clientInfo}`);
      socket.destroy();
    });

    // Initially, add as receiver (most common case)
    // Role will be determined on first data
    if (!isIdentified) {
      // Wait a moment to see if they send data
      setTimeout(() => {
        if (!isIdentified) {
          isIdentified = true;
          isSender = false;
          channel.addReceiver(socket);
        }
      }, 1000);
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
          console.log(`[Port ${port}] ⚠️  Port already in use, skipping`);
          resolve(false);
        } else {
          console.error(`[Port ${port}] ❌ Server error: ${err.message}`);
          reject(err);
        }
      });

      server.listen(port, HOST, () => {
        this.servers.set(port, server);
        resolve(true);
      });
    });
  }

  // Start all port servers in range
  async start() {
    console.log('='.repeat(70));
    console.log('🚢 AIS MULTI-PORT RECEIVER & FORWARDER SERVER');
    console.log('='.repeat(70));
    console.log(`Host          : ${HOST}`);
    console.log(`Port Range    : ${PORT_START} - ${PORT_END}`);
    console.log(`Total Ports   : ${PORT_END - PORT_START + 1}`);
    console.log(`Verbose       : ${VERBOSE_LOGGING}`);
    console.log('='.repeat(70));
    console.log('\n📡 Starting port servers...\n');

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
      process.stdout.write(`\r🔄 Progress: ${progress}% (${successCount} active, ${failCount} failed)`);
    }

    console.log('\n');
    console.log('='.repeat(70));
    console.log(`✅ Server started successfully!`);
    console.log(`   Active ports: ${successCount}`);
    console.log(`   Failed ports: ${failCount}`);
    console.log('='.repeat(70));
    console.log('\n📋 Usage:');
    console.log('   AIS Device → connect & send to any port in range');
    console.log('   OpenCPN/Client → connect to same port to receive data');
    console.log('   Each port is an independent AIS channel');
    console.log('='.repeat(70));
    console.log('\n⏳ Waiting for connections...\n');

    // Start stats interval
    setInterval(() => this.showStats(), STATS_INTERVAL * 1000);
  }

  showStats() {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);
    const activeChannels = Array.from(this.channels.values())
      .filter(ch => ch.sender || ch.receivers.size > 0);

    if (activeChannels.length === 0) return;

    console.log('\n' + '='.repeat(70));
    console.log('📊 STATISTICS');
    console.log('='.repeat(70));
    console.log(`Uptime: ${Math.floor(uptime / 60)}m ${uptime % 60}s`);
    console.log(`Active Channels: ${activeChannels.length}`);
    console.log('-'.repeat(70));
    console.log('Port\t\tSender\tReceivers\tMessages\tLast Data');
    console.log('-'.repeat(70));

    for (const ch of activeChannels) {
      const stats = ch.getStats();
      const lastTime = stats.lastDataTime 
        ? new Date(stats.lastDataTime).toLocaleTimeString() 
        : 'Never';
      console.log(`${stats.port}\t\t${stats.hasSender ? '✓' : '-'}\t${stats.receiverCount}\t\t${stats.messageCount}\t\t${lastTime}`);
    }
    console.log('='.repeat(70) + '\n');
  }

  // Graceful shutdown
  shutdown() {
    console.log('\n\n🛑 Shutting down...');
    
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
    
    this.showStats();
    console.log('👋 Goodbye!\n');
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
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
