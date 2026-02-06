# Code Clone Detector

A full-stack application that detects duplicate (cloned) code and provides quality metrics and refactoring suggestions. Built with a **Flask** REST API backend and a **React** frontend.

## Prerequisites

- **Python 3.7+**
- **Node.js 18+** and **npm**

## Quick Start

You need **two terminals** — one for the backend API and one for the frontend dev server.

### Terminal 1 — Start the Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

The API will be running at **http://localhost:5000**.

### Terminal 2 — Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be running at **http://localhost:5173**. Open it in your browser.

## Project Structure

```
Code_Clone_Detector-FL/
├── backend/            # Flask REST API
│   ├── app/            # Application package
│   │   ├── api/        # Route handlers (routes.py, auth.py)
│   │   ├── models/     # Database models
│   │   ├── services/   # Business logic (analyzer.py)
│   │   └── utils/      # Validators, exceptions
│   ├── tests/          # Backend tests
│   ├── requirements.txt
│   ├── run.py          # Entry point
│   └── API_SPEC.md     # Full API documentation
└── frontend/           # React + Vite SPA
    ├── src/
    │   ├── components/ # React components
    │   └── App.jsx     # Router setup
    ├── package.json
    └── index.html
```

## Backend Details

### Setup

```bash
cd backend
pip install -r requirements.txt
```

Optionally create a `.env` file in the `backend/` directory:

```
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
FLASK_ENV=development
```

If no `.env` is provided, safe defaults are used for local development.

### Run

```bash
python run.py
```

The server starts on **http://localhost:5000** with auto-reload enabled.

### API Endpoints

| Method | Endpoint              | Description                       |
| ------ | --------------------- | --------------------------------- |
| GET    | `/api/v1/health`      | Health check                      |
| GET    | `/api/v1/languages`   | List supported languages          |
| POST   | `/api/v1/analyze`     | Analyze code for clones           |
| POST   | `/api/v1/auth/register` | Register a new user             |
| POST   | `/api/v1/auth/login`  | Login and get JWT token           |
| POST   | `/api/v1/auth/logout` | Logout (invalidate token)         |
| GET    | `/api/v1/auth/me`     | Get current user info (requires JWT) |

See [`backend/API_SPEC.md`](backend/API_SPEC.md) for full request/response examples.

### Quick Test with curl

```bash
# Health check
curl http://localhost:5000/api/v1/health

# Analyze Python code
curl -X POST http://localhost:5000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"code": "def hello():\n    return 1\n\ndef greet():\n    return 1", "language": "python"}'
```

### Run Backend Tests

```bash
cd backend
pytest
```

## Frontend Details

### Setup

```bash
cd frontend
npm install
```

### Run (Development)

```bash
npm run dev
```

Opens at **http://localhost:5173** with hot module reload.

### Build for Production

```bash
npm run build
```

Output goes to `frontend/dist/`.

### Lint

```bash
npm run lint
```

### Pages

| Route        | Description                        |
| ------------ | ---------------------------------- |
| `/login`     | Login / Register                   |
| `/dashboard` | User dashboard (requires login)    |
| `/analyzer`  | Code analyzer with file upload     |
| `/students`  | Student list                       |
