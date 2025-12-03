/**
 * AIS Test Client
 * 
 * Mengirim data AIS dummy ke port tertentu untuk testing
 * Juga bisa digunakan sebagai receiver
 */

import net from 'net';

const HOST = process.argv[2] || 'localhost';
const PORT = parseInt(process.argv[3]) || 7000;
const MODE = process.argv[4] || 'sender'; // 'sender' or 'receiver'

// Sample AIS messages
const sampleAISMessages = [
  '!AIVDM,1,1,,B,13u@pQ0P01OiLWLMMI1000vH0HJp,0*59',
  '!AIVDM,1,1,,A,14eGrSiP01MKQ5dLd1E;r?v80000,0*72',
  '!AIVDM,1,1,,B,15N4cJ`005Jrek0H@9n`DW5608EP,0*13',
  '!AIVDM,1,1,,A,15NOHL0P01oP@S0MC2F400000000,0*3B',
  '!AIVDM,1,1,,B,177KQJ5000G?tO`K>RA1wUbN0TKH,0*5C',
  '!AIVDM,1,1,,A,1815N<0P00PT;80N3k<40?vR0000,0*70',
  '!AIVDM,2,1,3,B,55?MbV02>H97B`44000000000000000000000000000P10>554E820,0*72',
  '!AIVDM,2,2,3,B,0000000000,2*2A',
  '!AIVDM,1,1,,B,B5N;S4@0<T7B68`40010TLn00000,0*1A',
  '!AIVDM,1,1,,A,15Mq4J0P01o@BU`Lg<pLsUl60<1:,0*01'
];

function getTimestamp() {
  return new Date().toLocaleTimeString('id-ID', { hour12: false });
}

// Sender mode - simulates AIS device
function runAsSender() {
  console.log('='.repeat(60));
  console.log('🚢 AIS TEST SENDER');
  console.log('='.repeat(60));
  console.log(`Target: ${HOST}:${PORT}`);
  console.log('='.repeat(60));
  console.log('\nConnecting...\n');

  const client = new net.Socket();

  client.connect(PORT, HOST, () => {
    console.log(`[${getTimestamp()}] ✅ Connected to ${HOST}:${PORT}`);
    console.log('[INFO] Sending AIS data every 2 seconds...\n');

    let index = 0;
    const interval = setInterval(() => {
      const message = sampleAISMessages[index % sampleAISMessages.length];
      client.write(message + '\r\n');
      console.log(`[${getTimestamp()}] 📡 Sent: ${message.substring(0, 50)}...`);
      index++;
    }, 2000);

    client.on('close', () => {
      clearInterval(interval);
      console.log(`\n[${getTimestamp()}] ❌ Connection closed`);
    });
  });

  client.on('error', (err) => {
    console.error(`[${getTimestamp()}] ❌ Error: ${err.message}`);
  });
}

// Receiver mode - simulates OpenCPN
function runAsReceiver() {
  console.log('='.repeat(60));
  console.log('👁️  AIS TEST RECEIVER (OpenCPN Simulation)');
  console.log('='.repeat(60));
  console.log(`Target: ${HOST}:${PORT}`);
  console.log('='.repeat(60));
  console.log('\nConnecting...\n');

  const client = new net.Socket();
  let messageCount = 0;

  client.connect(PORT, HOST, () => {
    console.log(`[${getTimestamp()}] ✅ Connected to ${HOST}:${PORT}`);
    console.log('[INFO] Waiting for AIS data...\n');
  });

  client.on('data', (data) => {
    const messages = data.toString().trim().split('\n');
    for (const msg of messages) {
      if (msg.trim()) {
        messageCount++;
        console.log(`[${getTimestamp()}] 📨 #${messageCount}: ${msg.trim()}`);
      }
    }
  });

  client.on('close', () => {
    console.log(`\n[${getTimestamp()}] ❌ Connection closed. Total messages: ${messageCount}`);
  });

  client.on('error', (err) => {
    console.error(`[${getTimestamp()}] ❌ Error: ${err.message}`);
  });
}

// Usage info
if (process.argv.length < 4) {
  console.log('Usage: node test-client.js <host> <port> [sender|receiver]');
  console.log('');
  console.log('Examples:');
  console.log('  Sender:   node test-client.js localhost 7000 sender');
  console.log('  Receiver: node test-client.js localhost 7000 receiver');
  console.log('');
  console.log('Default mode: sender');
  console.log('');
}

// Run
if (MODE === 'receiver') {
  runAsReceiver();
} else {
  runAsSender();
}

process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  process.exit(0);
});
