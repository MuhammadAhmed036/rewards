# Multi-Tenant QR Loyalty Platform

UK-market multi-tenant loyalty platform supporting Points and Stamps loyalty programmes, member QR generation/verification, staff scan/earn/redeem flows, review and social link tracking without gating, and multi-location tenancy.

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: v22 LTS or v24
- **pnpm**: v12+
- **Docker Desktop** (for local PostgreSQL 16 & Mailpit)

### 2. Setup
```bash
# Install dependencies
pnpm install
pnpm approve-builds --all

# Start local services (PostgreSQL 16 & Mailpit)
docker compose up -d

# Apply database schema migrations
pnpm db:migrate

# Seed test tenant data (Demo Barber & Demo Coffee)
pnpm db:seed

# Start the development server
pnpm dev
```

Visit:
- App: [http://localhost:3000](http://localhost:3000)
- Health Check: [http://localhost:3000/api/health](http://localhost:3000/api/health)
- Mailpit Web UI: [http://localhost:8025](http://localhost:8025)

## 🧪 Testing & Verification
```bash
# Run unit & integration tests
pnpm test

# Typecheck TypeScript
pnpm typecheck

# Lint codebase
pnpm lint

# Production build
pnpm build
```

## 📚 Documentation
- [Architecture & Decisions](docs/DECISIONS.md)
- [Operational Runbook](docs/RUNBOOK.md)
- [Security Architecture](docs/SECURITY.md)
