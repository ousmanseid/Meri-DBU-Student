# Meri DBU Student: Deployment & Operations Guide

**Institution:** Debre Berhan University (DBU), Ethiopia  
**Repository:** https://github.com/ousmanseid/Meri-DBU-Student  
**Last Updated:** 2026-10-10  

---

## 1. Production Deployment Prerequisites

- **Server Environment:** Ubuntu 22.04 LTS / 24.04 LTS or Windows Server 2022.
- **Node.js:** v20 LTS or v22 LTS.
- **Database:** PostgreSQL 15+ (with `pgvector` extension if using native vector search).
- **Reverse Proxy:** Nginx with TLS termination (Let's Encrypt / Institutional SSL).

---

## 2. Environment Variables Configuration

Create a `.env` file in the root directory:

```env
# Application Settings
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://student.dbu.edu.et

# Institutional Identity
INSTITUTION_NAME=Debre Berhan University
INSTITUTION_CODE=DBU
DEFAULT_ACADEMIC_YEAR=2025/2026

# Database Connection (Production PostgreSQL)
USE_PGLITE=false
DATABASE_URL=postgresql://dbu_user:SecureDbuPass2026@localhost:5432/dbu_student_prod

# Authentication & Security
JWT_SECRET=replace-with-a-64-character-cryptographically-secure-random-secret
SESSION_TIMEOUT_MINUTES=60
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=15
SEPARATION_OF_DUTIES_STRICT=true

# Storage
UPLOAD_DIR=/var/data/dbu_uploads
```

---

## 3. Step-by-Step Production Deployment

### Step 1: Install Dependencies & Build
```bash
npm ci --omit=dev
npm run build
```

### Step 2: Apply Migrations & Seed Reference Data
```bash
npm run migrate
npm run seed
```

### Step 3: Run as a Systemd Service
Create `/etc/systemd/system/meri-dbu.service`:

```ini
[Unit]
Description=Meri DBU Student Platform
After=network.target postgresql.service

[Service]
Type=simple
User=dbu_app
WorkingDirectory=/opt/meri-dbu-student
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
EnvironmentFile=/opt/meri-dbu-student/.env

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable meri-dbu
sudo systemctl start meri-dbu
sudo systemctl status meri-dbu
```

---

## 4. Nginx Reverse Proxy Configuration

```nginx
server {
    listen 80;
    server_name student.dbu.edu.et;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name student.dbu.edu.et;

    ssl_certificate /etc/letsencrypt/live/student.dbu.edu.et/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/student.dbu.edu.et/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 5. Health Checks & Monitoring

- **Health Probe:** `GET https://student.dbu.edu.et/api/v1/health` (HTTP 200)
- **Readiness Probe:** `GET https://student.dbu.edu.et/api/v1/ready` (Verifies live database connectivity)

---

## 6. Database Backup & Disaster Recovery

### Daily Automated Backup
```bash
# Backup PostgreSQL database to encrypted storage
pg_dump -U dbu_user -h localhost -d dbu_student_prod -F c -b -v -f "/var/backups/dbu_student_$(date +\%Y\%m\%d).dump"
```

### Restore Procedure
```bash
# Restore into target database
pg_restore -U dbu_user -h localhost -d dbu_student_prod -v "/var/backups/dbu_student_YYYYMMDD.dump"
```
