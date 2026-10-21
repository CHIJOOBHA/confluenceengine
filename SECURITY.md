# Security Policy

## Multi-Layered Defense Architecture

The Confluence Engine employs an institutional-grade security model to protect intellectual property and financial assets.

### 1. Infrastructure Hardening
- **HTTP Security Headers**: Implemented via `helmet` to prevent XSS, Clickjacking, and MIME-sniffing.
- **API Rate Limiting**: `express-rate-limit` prevents Denial of Service (DoS) and brute-force attempts on execution endpoints.
- **Environment Isolation**: All sensitive keys (Anthropic, Dhan) are server-side environment variables only. They are never bundled into the website or stored in the database.
- **Owner-only API**: every route except /api/health verifies the owner's Firebase ID token; /api/cron needs CRON_SECRET.

### 2. Algorithmic Failsafes (The "Guardians")
- **Live gates**: live orders need LIVE_TRADING_ENABLED=true on the server, the owner's Go live switch, the kill switch off, an active rule, and an Indian instrument.
- **Circuit Breaker**: at most MAX_LIVE_TRADES_PER_DAY live trades (default 1) and a daily loss limit (DAILY_LOSS_LIMIT_INR).
- **Emergency Kill Switch**: A manual override that immediately halts the engine and cancels all pending consensus.

### 3. Data Integrity & IP
- **Blockchain Audit Trail**: Every paper and live trade event and every control change is hashed and chained, creating an immutable record that detects any tampering with the decision logic.
- **Proprietary Headers**: All source files contain legal proprietary notices to protect Intellectual Property rights.

## Reporting a Vulnerability
If you discover a security vulnerability or an exploit in the execution logic, please report it immediately to security@confluence-quant.com.
