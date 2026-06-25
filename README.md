# BudgetWise

> **AI-Powered Personal Finance Management Platform**
> Track income & expenses, set budget goals, get smart insights, and generate professional PDF reports — all in one beautifully designed dashboard.

<p align="center">
  <img alt="React"     src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white">
  <img alt="FastAPI"   src="https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white">
  <img alt="MongoDB"   src="https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white">
  <img alt="Docker"    src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white">
  <img alt="CI"        src="https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white">
  <img alt="License"   src="https://img.shields.io/badge/License-MIT-blue">
</p>

---

## Live Demo

**Frontend:** https://budgetwise-project-12-frontend.onrender.com

**Demo Login**
| Field    | Value                       |
|----------|-----------------------------|
| Email    | `budgettest@example.com`    |
| Password | `TestPass123!`              |

> Or create your own account — it takes seconds.

---

## Features

- **JWT Authentication** — Email/password sign-up, sign-in, session management, plus Google OAuth.
- **Forgot Password Flow** — Secure SHA-256 hashed, time-limited, one-time reset tokens. Pluggable email provider (mock-by-default for demo).
- **Budget Goals** — Per-category monthly limits with live usage tracking and over-budget alerts.
- **AI Insights** — Data-driven recommendations: spending trends, savings rate, budget warnings, category shifts.
- **Dashboard Analytics** — KPI cards, donut/bar/area charts, monthly comparison, top-category badges.
- **Advanced Transaction Filtering** — Search, type, category, date range, amount range, pagination.
- **CSV Export** — Download filtered transactions as CSV in one click.
- **PDF Reports** — Professional, branded multi-page PDF financial report (summary, insights, budget table, embedded charts, recent transactions) generated server-side via **WeasyPrint + matplotlib**.
- **MongoDB Aggregations** — Single-pass `$facet` pipelines for KPIs and category breakdowns; scales to millions of transactions.
- **Dark & Light Mode** — Polished, accessible theme switcher.
- **Multi-Currency** — INR, USD, EUR, GBP, JPY, AUD, CAD.
- **Docker-Ready** — `docker-compose up --build` to launch the entire stack locally.
- **CI/CD** — GitHub Actions pipeline (lint + build + tests + Docker image validation).

---

## Tech Stack

| Layer            | Technology                                                          |
|------------------|----------------------------------------------------------------------|
| **Frontend**     | React 18, React Router v6, Recharts, TailwindCSS, shadcn/ui, Lucide |
| **Backend**      | Python 3.11, FastAPI, Uvicorn, Pydantic v2                          |
| **Database**     | MongoDB 7 (Motor async driver, aggregation pipelines, TTL indexes)  |
| **Analytics**    | Python (pandas, NumPy)                                              |
| **PDF**          | WeasyPrint (HTML→PDF) + matplotlib (chart rendering)                |
| **Auth**         | bcrypt, PyJWT, secure HTTP-only cookies, Google OAuth 2.0           |
| **Containerization** | Docker, Docker Compose, multi-stage nginx build               |
| **CI/CD**        | GitHub Actions (matrix builds: frontend, backend, Docker)           |
| **Deployment**   | Render (web service + static site)                                  |

---

## Architecture

```
                          ┌──────────────────────────┐
                          │      User's Browser      │
                          └────────────┬─────────────┘
                                       │ HTTPS
                                       ▼
                  ┌────────────────────────────────────────┐
                  │   React SPA  (nginx in Docker)         │
                  │   • Tailwind UI, Recharts, lucide      │
                  │   • Auth context (JWT in localStorage) │
                  └────────────┬───────────────────────────┘
                               │  /api/*  (CORS-enabled)
                               ▼
              ┌──────────────────────────────────────────────┐
              │   FastAPI Backend  (Uvicorn)                 │
              │   ┌────────────┐  ┌──────────────────────┐   │
              │   │ Auth & JWT │  │ Reports (WeasyPrint) │   │
              │   ├────────────┤  ├──────────────────────┤   │
              │   │ Transactions│ │ Analytics (pandas)   │   │
              │   ├────────────┤  ├──────────────────────┤   │
              │   │ Budget Goals│ │ AI Insights Engine   │   │
              │   └────────────┘  └──────────────────────┘   │
              └──────────────────────┬───────────────────────┘
                                     │ Motor (async)
                                     ▼
                       ┌──────────────────────────────┐
                       │   MongoDB                    │
                       │   collections:               │
                       │   • users                    │
                       │   • transactions             │
                       │   • budget_goals             │
                       │   • accounts                 │
                       │   • password_reset_tokens    │
                       │     (TTL-indexed)            │
                       └──────────────────────────────┘
```

**Why this design?**
- **Stateless API** with JWT → trivially horizontal scale.
- **MongoDB aggregation `$facet` pipelines** keep heavy analytics in-database.
- **PDF generation is server-side** so reports look identical on every device.
- **TTL indexes** on reset tokens & sessions = self-cleaning storage.

---

## Screenshots

| | |
|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Reports](docs/screenshots/reports.png) |
| **Dashboard** — KPIs, insights, charts | **Reports** — deep analytics & PDF export |
| ![Budget Goals](docs/screenshots/budget-goals.png) | ![PDF Report](docs/screenshots/pdf-report.png) |
| **Budget Goals** — per-category limits | **PDF Report** — branded, printable |

---

## Installation (Local — no Docker)

### Prerequisites
- Node.js ≥ 20, Yarn 1.x
- Python 3.11
- MongoDB 7 (or Atlas connection string)
- For PDF: `libpango`, `libcairo`, `libgdk-pixbuf` system libs (auto-installed in Docker)

### 1. Clone
```bash
git clone https://github.com/Pawan-Sonar/BudgetWise-Project-1.git
cd BudgetWise-Project-1
```

### 2. Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Configure env (use values from .env.example)
cat > .env <<EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=budgetwise_db
JWT_SECRET=$(python -c 'import secrets; print(secrets.token_hex(32))')
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
ENVIRONMENT=development
EOF

uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### 3. Frontend
```bash
cd ../frontend
yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start
```

Visit **http://localhost:3000**.

---

## Docker Setup

The entire stack — MongoDB, backend, and frontend — is ready to launch with one command.

### Quickstart
```bash
# 1) Copy env template
cp .env.example .env
# 2) Build & start
docker-compose up --build
```

| Service  | URL                       |
|----------|---------------------------|
| Frontend | http://localhost:3000     |
| Backend  | http://localhost:8001     |
| MongoDB  | mongodb://localhost:27017 |

### Stop & clean up
```bash
docker-compose down          # stop containers
docker-compose down -v       # also remove the MongoDB volume
```

### Production notes
- Set a strong `JWT_SECRET` (`python -c 'import secrets; print(secrets.token_hex(32))'`)
- Set `ENVIRONMENT=production` so the forgot-password endpoint stops returning dev links
- Set an explicit `CORS_ORIGINS` (no wildcards in prod)
- Mount or back up the `mongo_data` volume

---

## API Endpoints

Full prefix: `/api`. Authenticated endpoints accept either `Authorization: Bearer <jwt>` **or** the `session_token` cookie.

### Auth
| Method | Path                          | Purpose                                 |
|--------|-------------------------------|-----------------------------------------|
| POST   | `/auth/register`              | Create an account                       |
| POST   | `/auth/login`                 | Email + password login                  |
| POST   | `/auth/logout`                | Clear session                           |
| GET    | `/auth/me`                    | Current user (auth required)            |
| POST   | `/auth/forgot-password`       | Request password reset link             |
| POST   | `/auth/reset-password`        | Submit new password with reset token    |
| GET    | `/auth/google/url`            | Get Google OAuth authorization URL      |
| POST   | `/auth/google/callback`       | Exchange Google code for JWT            |
| POST   | `/auth/session`               | Process Emergent-managed Google session |

### Transactions
| Method | Path                          | Purpose                              |
|--------|-------------------------------|--------------------------------------|
| GET    | `/transactions`               | List + filter + paginate             |
| POST   | `/transactions`               | Create                               |
| PUT    | `/transactions/{txn_id}`      | Update                               |
| DELETE | `/transactions/{txn_id}`      | Delete                               |
| GET    | `/transactions/export`        | CSV export (filters supported)       |

### Budget Goals
| Method | Path                          | Purpose                              |
|--------|-------------------------------|--------------------------------------|
| GET    | `/budget-goals`               | List goals + per-goal `spent` field  |
| POST   | `/budget-goals`               | Create                               |
| PUT    | `/budget-goals/{goal_id}`     | Update                               |
| DELETE | `/budget-goals/{goal_id}`     | Delete                               |

### Accounts
| Method | Path                          | Purpose                              |
|--------|-------------------------------|--------------------------------------|
| GET    | `/accounts`                   | List user accounts                   |
| POST   | `/accounts`                   | Create                               |
| GET    | `/accounts/{account_id}`      | Read                                 |
| PUT    | `/accounts/{account_id}`      | Update                               |
| DELETE | `/accounts/{account_id}`      | Delete (transactions retained)       |

### Analytics
| Method | Path                                       | Purpose                          |
|--------|--------------------------------------------|----------------------------------|
| GET    | `/analytics/dashboard-kpis`                | Current-month KPIs               |
| GET    | `/analytics/summary?period=`               | Period summary                   |
| GET    | `/analytics/spending-by-category?period=`  | Category breakdown               |
| GET    | `/analytics/income-vs-expenses?period=`    | Aggregate totals                 |
| GET    | `/analytics/monthly-trends?months=6`       | Time-series                      |
| GET    | `/analytics/monthly-comparison`            | Current vs previous month + Δ%   |
| GET    | `/analytics/insights`                      | AI-style insight cards           |
| GET    | `/analytics/top-expenses?limit=5`          | Largest single transactions      |

### Reports
| Method | Path             | Purpose                                                |
|--------|------------------|--------------------------------------------------------|
| GET    | `/reports/pdf`   | Generates branded PDF financial report (current month) |

### Misc
| Method | Path             | Purpose                              |
|--------|------------------|--------------------------------------|
| GET    | `/categories`    | Master list of categories            |
| GET    | `/currencies`    | Supported currency codes & symbols   |
| GET    | `/settings`      | Read user preferences                |
| PUT    | `/settings`      | Update preferences                   |

---

## Project Structure

```
budgetwise/
├── backend/                # FastAPI service
│   ├── server.py           # All routes + helpers (auth, transactions, analytics, PDF)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/               # React (CRA) SPA
│   ├── src/
│   │   ├── pages/          # Dashboard, Transactions, Reports, Goals, Login, ForgotPassword, ResetPassword
│   │   ├── components/     # Navbar, TransactionForm, InsightsCard, BudgetGoalsWidget, ui/*
│   │   ├── contexts/       # AuthContext, ThemeContext
│   │   └── App.js
│   ├── nginx.conf
│   └── Dockerfile
├── .github/workflows/
│   └── build.yml           # Frontend + backend + Docker CI
├── docker-compose.yml
├── .dockerignore
├── .env.example
└── README.md
```

---

## Continuous Integration

Every push and pull request triggers `.github/workflows/build.yml`, which:

1. **Frontend** — installs dependencies and runs `yarn build`.
2. **Backend** — installs Python deps, runs pytest (if present), imports the FastAPI app against a real MongoDB service container.
3. **Docker** — validates both Dockerfiles build cleanly (with GitHub Actions cache for speed).
4. **CI Summary** — aggregates results into the GitHub run summary.

A failure in any stage fails the whole pipeline.

---

## Future Improvements

- [ ] Real email provider (Resend / SendGrid) — drop-in: replace `_send_reset_email()` body.
- [ ] Two-factor authentication (TOTP).
- [ ] Recurring transactions (rent, subscriptions, salary auto-create).
- [ ] Bank statement upload + auto-categorisation (Plaid / Salt Edge).
- [ ] Multi-account transfers with double-entry bookkeeping.
- [ ] Mobile apps (React Native / Expo) using the same API.
- [ ] LLM-powered insights (swap the rule-based engine for Claude / GPT via Emergent LLM).
- [ ] Shared household budgets & roles.
- [ ] Export PDF in multiple periods (year/quarter).
- [ ] CSV import with column mapping.

---

## License

MIT — free to use, modify, and learn from. Pull requests welcome.

---

<p align="center">
  Built with care for personal finance enthusiasts and resume reviewers.<br>
  <a href="https://budgetwise-project-12-frontend.onrender.com">Try the live demo →</a>
</p>
