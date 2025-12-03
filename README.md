# 🚢 AIS Multi-Port Receiver & Forwarder Server

Server TCP untuk menerima dan meneruskan data AIS dari multiple port secara on-the-fly (tanpa penyimpanan).

## 📋 Daftar Isi

- [Konsep](#konsep)
- [Flow Diagram](#flow-diagram)
- [Fitur](#fitur)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Penggunaan](#penggunaan)
- [Testing](#testing)
- [Docker Deployment](#docker-deployment)
- [Coolify Deployment](#coolify-deployment)
- [Troubleshooting](#troubleshooting)

---

## 📊 Konsep

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AIS RECEIVER ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐                                    ┌──────────────┐   │
│  │ AIS      │ ──────────────────────────────────▶│              │   │
│  │ Device 1 │        Port 7000                   │              │   │
│  └──────────┘                                    │              │   │
│                                                  │              │   │
│  ┌──────────┐                                    │    SERVER    │   │
│  │ AIS      │ ──────────────────────────────────▶│              │   │
│  │ Device 2 │        Port 7001                   │   AIS        │   │
│  └──────────┘                                    │   RECEIVER   │   │
│                                                  │              │   │
│  ┌──────────┐                                    │              │   │
│  │ AIS      │ ──────────────────────────────────▶│              │   │
│  │ Device 3 │        Port 7002                   │              │   │
│  └──────────┘                                    └──────────────┘   │
│                                                         │           │
│                                                         │           │
│                                         ┌───────────────┴───────┐   │
│                                         ▼                       ▼   │
│                                  ┌──────────────┐      ┌───────────┐│
│                                  │   OpenCPN    │      │  Client   ││
│                                  │   (Port 7000)│      │  (7001)   ││
│                                  └──────────────┘      └───────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Prinsip kerja:**
1. Setiap port (5300-12000) adalah channel independen
2. AIS Device mengirim data ke port tertentu → Server menerima
3. Client (OpenCPN, dll) connect ke port yang sama → Menerima data on-the-fly
4. **Tidak ada penyimpanan** - data langsung di-forward ke semua receiver

---

## 🔄 Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    TCP     ┌─────────────┐    TCP    ┌───────────┐ │
│  │             │ ─────────▶ │             │ ────────▶ │           │ │
│  │  AIS CLIENT │   Sender   │   SERVER    │  Forward  │  OpenCPN  │ │
│  │  (Device)   │   Data     │   (Port X)  │  Stream   │  (Client) │ │
│  │             │            │             │           │           │ │
│  └─────────────┘            └─────────────┘           └───────────┘ │
│                                                                      │
│  Contoh:                                                            │
│  Device AIS → 18.18.18.18:7000 → Server Forward → OpenCPN:7000     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Fitur

- ✅ **Multi-port support** - Range 5300-12000 (dapat dikonfigurasi)
- ✅ **On-the-fly forwarding** - Tidak ada penyimpanan, langsung forward
- ✅ **Multiple receivers per port** - Banyak client bisa connect ke 1 port
- ✅ **Auto role detection** - Otomatis deteksi sender vs receiver
- ✅ **Last data cache** - Receiver baru mendapat data terakhir
- ✅ **Statistics monitoring** - Monitoring real-time
- ✅ **Docker ready** - Siap deploy via Docker
- ✅ **Coolify compatible** - Mudah deploy via Coolify

---

## 🚀 Instalasi

### Prerequisites
- Node.js >= 18.0.0
- npm atau yarn

### Steps

```bash
# Clone atau copy folder
cd ais_receiver

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit konfigurasi
nano .env

# Jalankan server
npm start
```

---

## ⚙️ Konfigurasi

Edit file `.env`:

```env
# Port range yang akan dibuka
PORT_START=5300
PORT_END=12000

# Host binding (0.0.0.0 untuk semua interface)
HOST=0.0.0.0

# Logging
VERBOSE_LOGGING=true
STATS_INTERVAL=60
```

### Catatan Port Range:
- Default: 5300-12000 (6701 ports)
- Sesuaikan dengan kebutuhan untuk menghemat resource
- Contoh untuk 100 ports: `PORT_START=7000`, `PORT_END=7100`

---

## 📖 Penggunaan

### 1. Menjalankan Server

```bash
# Mode development (auto-reload)
npm run dev

# Mode production
npm start
```

### 2. Connect AIS Device

Configure AIS device untuk mengirim data ke:
```
Host: <server-ip>
Port: <pilih port, misal 7000>
Protocol: TCP
```

### 3. Connect OpenCPN / Client

Di OpenCPN:
1. Options → Connections → Add
2. Network
   - Protocol: TCP
   - Address: `<server-ip>`
   - Port: `7000` (sama dengan port AIS device)
3. Apply

---

## 🧪 Testing

### Test dengan Script

```bash
# Terminal 1: Jalankan server
npm start

# Terminal 2: Jalankan sender (simulasi AIS device)
node src/test-client.js localhost 7000 sender

# Terminal 3: Jalankan receiver (simulasi OpenCPN)
node src/test-client.js localhost 7000 receiver
```

### Test dengan Netcat

```bash
# Receiver (OpenCPN simulation)
nc localhost 7000

# Sender (AIS device simulation) - di terminal lain
echo '!AIVDM,1,1,,B,13u@pQ0P01OiLWLMMI1000vH0HJp,0*59' | nc localhost 7000
```

---

## 🐳 Docker Deployment

### Option 1: Host Network Mode (Recommended)

```bash
# Build dan jalankan
docker-compose up -d

# Lihat logs
docker-compose logs -f

# Stop
docker-compose down
```

### Option 2: Specific Port Mapping

```bash
# Gunakan file compose dengan port mapping
docker-compose -f docker-compose.ports.yml up -d
```

### Build Manual

```bash
# Build image
docker build -t ais-receiver-server .

# Run dengan host network
docker run -d \
  --name ais-receiver \
  --network host \
  -e PORT_START=5300 \
  -e PORT_END=12000 \
  -e VERBOSE_LOGGING=false \
  ais-receiver-server

# Run dengan port mapping (contoh port 7000-7100)
docker run -d \
  --name ais-receiver \
  -p 7000-7100:7000-7100 \
  -e PORT_START=7000 \
  -e PORT_END=7100 \
  ais-receiver-server
```

---

## ☁️ Coolify Deployment

### Step-by-Step Setup di Coolify

#### 1. Prepare Repository

Push code ke Git repository:
```bash
git init
git add .
git commit -m "Initial AIS Receiver Server"
git remote add origin <your-repo-url>
git push -u origin main
```

#### 2. Create New Service di Coolify

1. Login ke Coolify Dashboard
2. Click **"+ Add New Resource"**
3. Pilih **"Docker Compose"** (BUKAN "Dockerfile")

#### 3. Configure Service

**Source Configuration:**
- Repository: `<your-repo-url>`
- Branch: `main`

**Network Settings (PENTING):**

Untuk multi-port range, ada 2 opsi:

**Opsi A: Host Network (Recommended)**
```yaml
# Di docker-compose.yml sudah ada:
network_mode: host
```

Di Coolify:
- Go to **Settings** → **Network**
- Enable **"Use Host Network"**

**Opsi B: Port Mapping**

Edit port ranges di Coolify:
- Go to **Settings** → **Ports**
- Add port ranges:
  ```
  5300-5400:5300-5400
  7000-7100:7000-7100
  10000-10100:10000-10100
  ```

#### 4. Environment Variables

Di Coolify, set environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `HOST` | `0.0.0.0` | Bind semua interface |
| `PORT_START` | `5300` | Port awal |
| `PORT_END` | `12000` | Port akhir |
| `VERBOSE_LOGGING` | `false` | Logging detail |
| `STATS_INTERVAL` | `60` | Interval statistik (detik) |
| `TZ` | `Asia/Jakarta` | Timezone |

#### 5. Resource Limits (Optional)

```yaml
# Recommended limits
CPU: 2 cores
Memory: 1GB
```

#### 6. Deploy

1. Click **"Deploy"**
2. Wait for build & deployment
3. Check logs untuk konfirmasi

#### 7. Firewall Configuration

Pastikan port range terbuka di firewall server:

```bash
# UFW
sudo ufw allow 5300:12000/tcp

# iptables
sudo iptables -A INPUT -p tcp --dport 5300:12000 -j ACCEPT

# firewalld
sudo firewall-cmd --permanent --add-port=5300-12000/tcp
sudo firewall-cmd --reload
```

---

## 📁 Coolify docker-compose.yml untuk Production

Buat file `docker-compose.coolify.yml` khusus untuk Coolify:

```yaml
version: '3.8'

services:
  ais-receiver:
    build: .
    container_name: ais-receiver-server
    restart: unless-stopped
    network_mode: host
    
    environment:
      - HOST=0.0.0.0
      - PORT_START=${PORT_START:-5300}
      - PORT_END=${PORT_END:-12000}
      - VERBOSE_LOGGING=${VERBOSE_LOGGING:-false}
      - STATS_INTERVAL=${STATS_INTERVAL:-60}
      - TZ=${TZ:-Asia/Jakarta}
    
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
    
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
    
    labels:
      - "coolify.managed=true"
      - "coolify.type=ais-receiver"
```

---

## 🔧 Troubleshooting

### Port Already in Use
```bash
# Check port usage
netstat -tlnp | grep 7000
lsof -i :7000

# Kill process
kill -9 <PID>
```

### Docker Network Issues
```bash
# Use host network
docker run --network host ...

# Check container network
docker inspect ais-receiver | grep NetworkMode
```

### No Data Received

1. Check AIS device connection:
   ```bash
   nc -v server-ip port
   ```

2. Check firewall:
   ```bash
   sudo ufw status
   ```

3. Check server logs:
   ```bash
   docker-compose logs -f
   ```

### High Memory Usage

Reduce port range:
```env
PORT_START=7000
PORT_END=7100  # Hanya 100 ports
```

---

## 📊 Monitoring

### Server Statistics

Server akan menampilkan statistik setiap `STATS_INTERVAL` detik:

```
======================================================================
📊 STATISTICS
======================================================================
Uptime: 5m 30s
Active Channels: 3
----------------------------------------------------------------------
Port		Sender	Receivers	Messages	Last Data
----------------------------------------------------------------------
7000		✓	2		150		14:30:25
7001		✓	1		89		14:30:20
7002		-	0		0		Never
======================================================================
```

### Docker Logs

```bash
# Real-time logs
docker-compose logs -f

# Last 100 lines
docker-compose logs --tail 100
```

---

## 📝 License

ISC © WiWIT Project

---

## 🤝 Support

Untuk bantuan lebih lanjut, hubungi tim development WiWIT Project.
