# Code Clone Detector API Specification

**Version:** 1.0.0  
**Base URL:** `http://localhost:5000/api/v1`  
**Last Updated:** 2025-01-15

---

## Endpoints

### 1. Health Check

Check if API is running.

**Endpoint:** `GET /health`

**Response (200 OK):**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": 1737123456.789
}
```

---

### 2. Get Supported Languages

Get list of programming languages supported by the analyzer.

**Endpoint:** `GET /languages`

**Response (200 OK):**
```json
{
  "languages": [
    {
      "code": "java",
      "name": "Java",
      "versions": ["8", "11", "17"]
    },
    {
      "code": "python",
      "name": "Python",
      "versions": ["3.7", "3.8", "3.9", "3.10", "3.11"]
    }
  ]
}
```

---

### 3. Analyze Code

Submit code for clone detection and quality analysis.

**Endpoint:** `POST /analyze`

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
```json
{
  "code": "def hello():\n    print('hello')\n\ndef greet():\n    print('hello')",
  "language": "python"
}
```

**Fields:**
- `code` (string, required): Source code to analyze
- `language` (string, required): Programming language (`"java"` or `"python"`)
- `user_id` (string, optional): User identifier for tracking
- `assignment_id` (string, optional): Assignment identifier

**Response (200 OK):**
```json
{
  "analysis_id": "550e8400-e29b-41d4-a716-446655440000",
  "clone_percentage": 22.5,
  "cyclomatic_complexity": 15.3,
  "maintainability_index": 58.2,
  "execution_time_ms": 3245,
  "clones": [
    {
      "clone_id": "650e8400-e29b-41d4-a716-446655440001",
      "type": 2,
      "similarity": 0.92,
      "locations": [
        {"start_line": 1, "end_line": 5},
        {"start_line": 10, "end_line": 14}
      ],
      "code_snippet": "def hello():\n    print('hello')"
    }
  ],
  "refactoring_suggestions": [
    {
      "suggestion_id": "750e8400-e29b-41d4-a716-446655440002",
      "priority": 1,
      "priority_score": 0.87,
      "refactoring_type": "Extract Method",
      "affected_clone_id": "650e8400-e29b-41d4-a716-446655440001",
      "explanation": {
        "remember": "You have duplicated this code 2 times",
        "understand": "Code duplication makes bugs hard to fix",
        "apply": "Extract this into a reusable method"
      },
      "before_code": "def hello():\n    print('hello')",
      "after_code": "def greet():\n    print('hello')\n\nhello = greet"
    }
  ]
}
```

**Response (400 Bad Request):**
```json
{
  "error": "Missing required field: code",
  "details": "Request must include \"code\" field with source code"
}
```

**Response (500 Internal Server Error):**
```json
{
  "error": "Analysis failed",
  "details": "Error message here"
}
```

---

## Testing Examples

### Using curl
```bash
# Health check
curl http://localhost:5000/api/v1/health

# Analyze Python code
curl -X POST http://localhost:5000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"code": "def test():\n    return 1", "language": "python"}'
```

### Using JavaScript (fetch)
```javascript
const response = await fetch('http://localhost:5000/api/v1/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    code: 'def hello():\n    print("hi")',
    language: 'python'
  })
});

const data = await response.json();
console.log(data);
```

---

## Notes for Frontend Team

1. **CORS is enabled** for `http://localhost:3000` and `http://localhost:5173` (Vite default)
2. **Mock data currently returned** - Real analysis algorithm coming soon
3. **All timestamps** are Unix timestamps (seconds since epoch)
4. **All IDs** are UUIDs in string format

---

## Upcoming Features

- [ ] User authentication
- [ ] Analysis history (`GET /history/{user_id}`)
- [ ] Save/load analyses
- [ ] Real-time analysis status via WebSocket