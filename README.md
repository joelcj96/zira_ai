# Zira AI

Zira AI is a full-stack AI-powered job assistant MVP that helps users discover job matches, generate personalized proposals, and track applications.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- Database: MongoDB (Mongoose)
- AI: OpenAI API (with fallback generator when key is not provided)

## Features Implemented

1. Authentication
- Email/password registration and login
- Google login flow (mock payload for MVP)

2. Profile Management
- Skills
- Experience summary
- Job preferences (titles, locations, remote-only, salary minimum)

3. AI Job Finder
- Real external jobs feed via Remotive, Arbeitnow, and The Muse public APIs with mock fallback
- Match scoring based on profile/preferences

4. AI Proposal Generator
- Generates proposal drafts from user profile + job data
- Editable proposal in UI before saving

5. Application Tracker
- Save applications
- Update status: pending, accepted, rejected

6. Notifications
- New top-match notifications
- Mark notifications as read

## Project Structure

```text
AI agent/
  backend/
    src/
      config/
      data/
      middleware/
      models/
      routes/
      services/
      server.js
    .env.example
    package.json
  frontend/
    src/
      api/
      components/
      context/
      pages/
      App.jsx
      main.jsx
      styles.css
    .env.example
    package.json
  README.md
```

## Prerequisites

- Node.js 18+
- MongoDB running locally or a MongoDB connection string

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Set values in `.env`:

- `MONGO_URI`
- `JWT_SECRET`
- `OPENAI_API_KEY` (optional, fallback text generation works without this)
- `FRONTEND_URL`
- `DISABLE_REAL_JOB_FEED` (optional, defaults to `false`)
- `REAL_JOB_SYNC_INTERVAL_MINUTES` (optional, defaults to `360`)
- `REAL_JOB_MAX_RESULTS` (optional, defaults to `300`)

Backend runs at `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

## API Overview

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `GET /api/user/me`
- `PUT /api/user/profile`
- `GET /api/jobs`
- `POST /api/proposals/generate`
- `GET /api/applications`
- `POST /api/applications`
- `PUT /api/applications/:id`
- `GET /api/notifications`
- `PUT /api/notifications/:id/read`

## Notes

- Jobs are pulled from the Remotive, Arbeitnow, and The Muse public APIs and synced into the shared jobs store.
- If the external feed is unavailable, the backend serves the last synced jobs or falls back to bundled mock jobs.
- Google login is mocked by design for now.
- OpenAI proposal generation uses the configured API key when available; otherwise it falls back to templated generation.
