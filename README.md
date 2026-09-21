# Health App

A patient/doctor healthcare platform with a FastAPI backend, React patient portal, and React doctor dashboard.

## Prerequisites

- **Python 3.11+**
- **PostgreSQL** running on `localhost:5432`
- **MongoDB** running on `localhost:27017`
- **Node.js 18+**

## Quick Start

### 1. Create the PostgreSQL database

```bash
psql -U postgres -c "CREATE DATABASE health_db;"
```

### 2. Set up the backend

```bash
cd apps/backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Backend API docs: http://localhost:8000/docs

### 3. Set up the patient portal

```bash
cd apps/patient-portal
npm install
npm run dev
```

Patient portal: http://localhost:5173

## Project Structure

```
health/
├── apps/
│   ├── backend/          # FastAPI + PostgreSQL + MongoDB
│   ├── patient-portal/   # React + Vite (patients)
│   └── doctor-dashboard/ # React + Vite (doctors) — Task 2
└── .env                  # Environment variables (gitignored)
```

## Tech Stack

| Layer | Tool |
|---|---|
| Backend | FastAPI (Python) |
| Structured data | PostgreSQL (SQLAlchemy + Alembic) |
| Flexible medical data | MongoDB (Motor) |
| Auth | JWT (python-jose + passlib/bcrypt) |
| Frontend | React + Vite + TypeScript |
