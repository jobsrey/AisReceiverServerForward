# 📦 Panduan Lengkap Deployment Coolify untuk AIS Receiver

## Overview

Dokumen ini berisi langkah-langkah detail untuk deploy AIS Receiver Server ke Coolify dengan multi-port range support.

---

## 📋 Prerequisites

1. **Coolify Server** sudah terinstall dan running
2. **Git Repository** dengan code AIS Receiver
3. **Akses SSH** ke server Coolify (untuk konfigurasi firewall)

---

## 🚀 Step-by-Step Deployment

### Step 1: Push Code ke Git Repository

```bash
cd ais_receiver

# Inisialisasi git (jika belum)
git init

# Add remote repository
git remote add origin https://github.com/username/ais-receiver.git

# Add semua file
git add .

# Commit
git commit -m "Initial AIS Receiver Server"

# Push
git push -u origin main
```

### Step 2: Login ke Coolify Dashboard

1. Buka browser: `https://your-coolify-domain.com`
2. Login dengan credentials admin

### Step 3: Create New Resource

1. Di dashboard, klik **"+ New Resource"** atau **"Add Resource"**
2. Pilih **"Docker Compose"**

   > ⚠️ **PENTING**: Pilih Docker Compose, BUKAN Dockerfile biasa

### Step 4: Configure Source

1. **Git Repository**: Masukkan URL repository
   ```
   https://github.com/username/ais-receiver.git
   ```

2. **Branch**: `main` atau branch yang diinginkan

3. **Build Pack**: `Docker Compose`

4. **Docker Compose File**: 
   ```
   docker-compose.coolify.yml
   ```
   atau
   ```
   docker-compose.yml
   ```

### Step 5: Configure Network (KRITIS!)

Untuk multi-port range, HARUS menggunakan Host Network:

1. Go to **Settings** → **Network**
2. ✅ Enable **"Use Host Network"**
   
   > Ini mengizinkan container menggunakan network host langsung,
   > sehingga semua port 5300-12000 dapat diakses

### Step 6: Set Environment Variables

Di tab **Environment Variables**, tambahkan:

| Key | Value | Required |
|-----|-------|----------|
| `HOST` | `0.0.0.0` | ✅ |
| `PORT_START` | `5300` | ✅ |
| `PORT_END` | `12000` | ✅ |
| `VERBOSE_LOGGING` | `false` | ❌ |
| `STATS_INTERVAL` | `60` | ❌ |
| `TZ` | `Asia/Jakarta` | ❌ |

**Atau** dalam format satu baris (untuk bulk import):
```env
HOST=0.0.0.0
PORT_START=5300
PORT_END=12000
VERBOSE_LOGGING=false
STATS_INTERVAL=60
TZ=Asia/Jakarta
```

### Step 7: Configure Resources (Optional)

Di tab **Resources**:

| Setting | Recommended Value |
|---------|------------------|
| CPU Limit | 2 cores |
| Memory Limit | 1 GB |
| CPU Reservation | 0.25 cores |
| Memory Reservation | 128 MB |

### Step 8: Deploy

1. Klik **"Deploy"**
2. Tunggu proses build & deploy selesai
3. Cek tab **"Logs"** untuk memastikan server berjalan

**Expected output:**
```
======================================================================
🚢 AIS MULTI-PORT RECEIVER & FORWARDER SERVER
======================================================================
Host          : 0.0.0.0
Port Range    : 5300 - 12000
Total Ports   : 6701
======================================================================

📡 Starting port servers...

🔄 Progress: 100% (6701 active, 0 failed)

======================================================================
✅ Server started successfully!
   Active ports: 6701
======================================================================
```

---

## 🔥 Konfigurasi Firewall Server

Setelah deploy, pastikan firewall server mengizinkan port range.

### UFW (Ubuntu/Debian)

```bash
# SSH ke server Coolify
ssh root@your-server-ip

# Allow port range
sudo ufw allow 5300:12000/tcp

# Check status
sudo ufw status

# Jika UFW tidak aktif
sudo ufw enable
```

### iptables

```bash
# Allow port range
sudo iptables -A INPUT -p tcp --dport 5300:12000 -j ACCEPT

# Save rules
sudo iptables-save > /etc/iptables.rules
```

### firewalld (CentOS/RHEL)

```bash
# Allow port range
sudo firewall-cmd --permanent --add-port=5300-12000/tcp

# Reload
sudo firewall-cmd --reload

# Check
sudo firewall-cmd --list-ports
```

---

## ✅ Verifikasi Deployment

### 1. Check via Telnet/Netcat

```bash
# Dari komputer lokal
nc -v your-server-ip 7000

# Atau telnet
telnet your-server-ip 7000
```

Jika berhasil connect, berarti port sudah terbuka.

### 2. Test dengan Script

```bash
# Clone repository ke lokal
git clone https://github.com/username/ais-receiver.git
cd ais-receiver

# Install dependencies
npm install

# Test sebagai sender
node src/test-client.js your-server-ip 7000 sender

# Test sebagai receiver (di terminal lain)
node src/test-client.js your-server-ip 7000 receiver
```

### 3. Check Coolify Logs

1. Di Coolify dashboard
2. Klik pada service AIS Receiver
3. Tab **"Logs"**
4. Lihat real-time logs

---

## 🔧 Konfigurasi Port Range Spesifik

Jika tidak perlu semua 6700+ port, kurangi range untuk hemat resource:

### Contoh: Hanya 100 ports (7000-7100)

Di Coolify Environment Variables:
```env
PORT_START=7000
PORT_END=7100
```

### Contoh: Multiple small ranges

Jika butuh port tidak berurutan, deploy multiple instances:

**Instance 1:**
```env
PORT_START=7000
PORT_END=7050
```

**Instance 2:**
```env
PORT_START=10000
PORT_END=10050
```

---

## 📊 Monitoring

### Coolify Dashboard

- **Logs**: Real-time server output
- **Stats**: CPU/Memory usage
- **Deployments**: History deployment

### Server Statistics

Server akan print statistik setiap `STATS_INTERVAL` detik di logs:

```
======================================================================
📊 STATISTICS
======================================================================
Uptime: 10m 30s
Active Channels: 5
----------------------------------------------------------------------
Port		Sender	Receivers	Messages	Last Data
----------------------------------------------------------------------
7000		✓	3		500		15:30:25
7001		✓	2		320		15:30:22
7002		✓	1		150		15:29:55
======================================================================
```

---

## 🆘 Troubleshooting

### Problem: Port tidak bisa diakses

**Solusi:**
1. Pastikan "Use Host Network" aktif di Coolify
2. Check firewall: `sudo ufw status`
3. Check port listening: `netstat -tlnp | grep 7000`

### Problem: Container restart terus

**Solusi:**
1. Check logs untuk error message
2. Pastikan memory limit cukup (1GB minimum untuk banyak port)
3. Kurangi port range jika perlu

### Problem: High memory usage

**Solusi:**
1. Kurangi `PORT_END` untuk fewer ports
2. Set `VERBOSE_LOGGING=false`
3. Tingkatkan memory limit di Coolify

### Problem: Connection timeout

**Solusi:**
1. Check network connectivity
2. Pastikan IP server benar
3. Check DNS resolution

---

## 📝 Quick Reference

### Start/Stop via Coolify

- **Start**: Click "Start" di dashboard
- **Stop**: Click "Stop" di dashboard
- **Restart**: Click "Restart" di dashboard
- **Redeploy**: Click "Redeploy" untuk rebuild

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT_START` | `5300` | First port |
| `PORT_END` | `12000` | Last port |
| `VERBOSE_LOGGING` | `false` | Detail logs |
| `STATS_INTERVAL` | `60` | Stats interval (sec) |
| `TZ` | `UTC` | Timezone |

### Docker Commands (jika SSH ke server)

```bash
# List containers
docker ps | grep ais

# View logs
docker logs -f ais-receiver-server

# Restart
docker restart ais-receiver-server

# Enter container
docker exec -it ais-receiver-server sh
```

---

## ✨ Selesai!

Server AIS Receiver sekarang running di Coolify dengan multi-port support.

**Test connection:**
```
AIS Device → your-server-ip:7000 → OpenCPN connects to same port
```

Untuk bantuan lebih lanjut, lihat [README.md](README.md).
