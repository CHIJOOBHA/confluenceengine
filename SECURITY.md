# Security Policy

## Multi-Layered Defense Architecture

The Confluence Engine employs an institutional-grade security model to protect intellectual property and financial assets.

### 1. Infrastructure Hardening
- **HTTP Security Headers**: Implemented via `helmet` to prevent XSS, Clickjacking, and MIME-sniffing.
- **API Rate Limiting**: `express-rate-limit` prevents Denial of Service (DoS) and brute-force attempts on execution endpoints.
- **Environment Isolation**: All sensitive keys (Gemini, Broker) are managed via server-side environment variables and never exposed to the client.

### 2. Algorithmic Failsafes (The "Guardians")
- **Anomaly Scrubber**: Automatically aborts trading if market volatility exceeds 400% of the 10-day ATR (prevents "Fat Finger" or "Flash Crash" losses).
- **Circuit Breaker**: Hard-coded limit of 3 trades per day to prevent runaway algorithmic loops.
- **Emergency Kill Switch**: A manual override that immediately halts the engine and cancels all pending consensus.
- **Timeout Protection**: 30-second timeout on all AI agent calls to prevent system hanging or memory leaks.

### 3. Data Integrity & IP
- **Blockchain Audit Trail**: Every AI agent report and execution signal is hashed and chained, creating an immutable record that detects any tampering with the decision logic.
- **Proprietary Headers**: All source files contain legal proprietary notices to protect Intellectual Property rights.

## Reporting a Vulnerability
If you discover a security vulnerability or an exploit in the execution logic, please report it immediately to security@confluence-quant.com.
