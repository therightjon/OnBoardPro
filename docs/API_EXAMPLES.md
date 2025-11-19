# API Examples

Complete examples for interacting with the OnBoardPro API.

---

## Authentication

### Login with Local Provider
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@example.com",
  "firstName": "Admin",
  "lastName": "User",
  "role": "system_admin",
  "status": "active",
  "roles": ["system_admin"],
  "departmentScopes": [],
  "divisionScopes": [],
  "managedCandidateIds": []
}
```

### Multi-Provider Authentication
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ldap",
    "credentials": {
      "username": "jdoe",
      "password": "password123"
    }
  }'
```

### Get Current User
```bash
curl http://localhost:5000/api/user \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Logout
```bash
curl -X POST http://localhost:5000/api/logout \
  -H "Cookie: connect.sid=your-session-cookie"
```

---

## Candidates

### List Candidates
```bash
curl "http://localhost:5000/api/candidates?status=active&limit=10" \
  -H "Cookie: connect.sid=your-session-cookie"
```

**Query Parameters:**
- `status`: Filter by status (draft, active, on_hold, completed, canceled, archived)
- `departmentId`: Filter by department UUID
- `divisionId`: Filter by division UUID
- `managerId`: Filter by manager UUID
- `search`: Search by name or email
- `limit`: Results per page (default: 50, max: 100)
- `offset`: Pagination offset (default: 0)

**Response:**
```json
[
  {
    "id": "candidate-uuid",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "status": "active",
    "departmentId": "dept-uuid",
    "currentStageId": "stage-uuid",
    "anticipatedStartDate": "2025-06-01T00:00:00.000Z",
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
]
```

### Get Candidate by ID
```bash
curl http://localhost:5000/api/candidates/550e8400-e29b-41d4-a716-446655440000 \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Create Candidate
```bash
curl -X POST http://localhost:5000/api/candidates \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "salutation": "Mr.",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john.doe@example.com",
    "candidateTypeId": "type-uuid",
    "departmentId": "dept-uuid",
    "divisionId": "div-uuid",
    "managerId": "manager-uuid",
    "offerLetterIssuedAt": "2025-01-15",
    "offerLetterAcceptedAt": "2025-01-20",
    "anticipatedStartDate": "2025-06-01",
    "templateId": "template-uuid"
  }'
```

**Response:** `201 Created`
```json
{
  "id": "new-candidate-uuid",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "status": "active",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

### Update Candidate
```bash
curl -X PATCH http://localhost:5000/api/candidates/candidate-uuid \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "firstName": "Jonathan",
    "anticipatedStartDate": "2025-07-01"
  }'
```

### Apply Template to Candidate
```bash
curl -X POST http://localhost:5000/api/candidates/candidate-uuid/apply-template \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "templateId": "template-uuid"
  }'
```

### Delete Candidate (Archive)
```bash
curl -X DELETE http://localhost:5000/api/candidates/candidate-uuid \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Restore Archived Candidate
```bash
curl -X POST http://localhost:5000/api/candidates/candidate-uuid/restore \
  -H "Cookie: connect.sid=your-session-cookie"
```

---

## Tasks

### List All Tasks
```bash
curl "http://localhost:5000/api/tasks?status=todo&limit=20" \
  -H "Cookie: connect.sid=your-session-cookie"
```

**Query Parameters:**
- `status`: Filter by status (todo, in_progress, blocked, done, canceled)
- `candidateId`: Filter by candidate UUID
- `assigneeUserId`: Filter by assignee UUID
- `priority`: Filter by priority (low, medium, high, critical)
- `search`: Search in task titles
- `limit`: Results per page
- `offset`: Pagination offset

### Get My Tasks
```bash
curl "http://localhost:5000/api/tasks/mine?status=todo" \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Get Tasks for Candidate
```bash
curl http://localhost:5000/api/candidates/candidate-uuid/tasks \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Create Task
```bash
curl -X POST http://localhost:5000/api/tasks \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "candidateId": "candidate-uuid",
    "title": "Complete background check",
    "description": "Submit all required documents",
    "stageId": "stage-uuid",
    "assigneeUserId": "user-uuid",
    "priority": "high",
    "categoryId": "category-uuid",
    "dueAt": "2025-02-01T00:00:00.000Z",
    "required": true
  }'
```

### Update Task
```bash
curl -X PATCH http://localhost:5000/api/tasks/task-uuid \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "status": "done",
    "notes": "Completed successfully"
  }'
```

### Delete Task
```bash
curl -X DELETE http://localhost:5000/api/tasks/task-uuid \
  -H "Cookie: connect.sid=your-session-cookie"
```

---

## Templates

### List Templates
```bash
curl http://localhost:5000/api/templates \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Get Template by ID
```bash
curl http://localhost:5000/api/templates/template-uuid \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Create Template
```bash
curl -X POST http://localhost:5000/api/templates \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "name": "Faculty Onboarding",
    "candidateTypeId": "type-uuid",
    "description": "Standard faculty onboarding process",
    "isActive": true
  }'
```

### Update Template
```bash
curl -X PATCH http://localhost:5000/api/templates/template-uuid \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "name": "Updated Template Name",
    "description": "Updated description"
  }'
```

### Check Template Readiness
```bash
curl http://localhost:5000/api/templates/template-uuid/readiness \
  -H "Cookie: connect.sid=your-session-cookie"
```

**Response:**
```json
{
  "ready": true,
  "issues": [],
  "stageCount": 5,
  "taskCount": 23
}
```

---

## Notifications

### List Notifications
```bash
curl "http://localhost:5000/api/notifications?limit=20&unreadOnly=true" \
  -H "Cookie: connect.sid=your-session-cookie"
```

**Response:**
```json
{
  "items": [
    {
      "id": "notif-uuid",
      "type": "task_assigned",
      "entityType": "task",
      "entityId": "task-uuid",
      "isRead": false,
      "createdAt": "2025-01-15T10:30:00.000Z",
      "payload": {
        "taskTitle": "Complete onboarding",
        "candidateName": "John Doe"
      }
    }
  ],
  "unreadCount": 5
}
```

### Mark Notification as Read
```bash
curl -X PATCH http://localhost:5000/api/notifications/notif-uuid \
  -H "Cookie: connect.sid=your-session-cookie"
```

### Mark All Notifications as Read
```bash
curl -X POST http://localhost:5000/api/notifications/mark-all-read \
  -H "Cookie: connect.sid=your-session-cookie"
```

---

## Health & Monitoring

### Comprehensive Health Check
```bash
curl http://localhost:5000/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "checks": {
    "database": "up (12ms)",
    "server": "up",
    "memory": "45MB / 128MB",
    "uptime": "3600s"
  },
  "version": "1.0.0"
}
```

### Readiness Probe (Kubernetes)
```bash
curl http://localhost:5000/health/ready
```

**Response:** `OK` (200) or `Not Ready` (503)

### Liveness Probe (Kubernetes)
```bash
curl http://localhost:5000/health/live
```

**Response:** `OK` (200)

### Ping
```bash
curl http://localhost:5000/ping
```

**Response:** `pong`

---

## User Preferences

### Get My Preferences
```bash
curl http://localhost:5000/api/me/preferences \
  -H "Cookie: connect.sid=your-session-cookie"
```

**Response:**
```json
{
  "userId": "user-uuid",
  "notifyInApp": true,
  "notifyEmail": false,
  "digestFrequency": "immediate",
  "mytasksShowArchived": false,
  "mytasksShowCanceled": false,
  "mytasksShowCompleted": false,
  "allowSelfNotifications": false,
  "eventSubscriptions": {
    "task_assigned": true,
    "task_completed": true,
    "candidate_stage_changed": true
  }
}
```

### Update Preferences
```bash
curl -X PATCH http://localhost:5000/api/me/preferences \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=your-session-cookie" \
  -d '{
    "notifyEmail": true,
    "digestFrequency": "daily",
    "eventSubscriptions": {
      "task_assigned": true,
      "task_completed": false
    }
  }'
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "requestId": "a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d"
  }
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 422 | Invalid input data |
| `CONFLICT` | 409 | Resource conflict |
| `INTERNAL_ERROR` | 500 | Server error |
| `BAD_REQUEST` | 400 | Malformed request |

### Example Error
```bash
curl -X POST http://localhost:5000/api/candidates \
  -H "Content-Type: application/json" \
  -d '{ "invalid": "data" }'
```

**Response:** `422 Unprocessable Entity`
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "firstName",
        "message": "Required"
      },
      {
        "field": "email",
        "message": "Required"
      }
    ],
    "requestId": "a7b3c9d1-..."
  }
}
```

---

## Rate Limiting

All API endpoints are rate limited:
- **Default endpoints:** 120 requests per minute
- **Sensitive endpoints:** 60 requests per minute

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 115
X-RateLimit-Reset: 1642262400
Retry-After: 30
```

When rate limit is exceeded:
```json
{
  "message": "Too many requests, please slow down."
}
```

---

## Testing with Session Cookies

### Using curl with session persistence
```bash
# Login and save cookies
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  -c cookies.txt

# Use saved cookies for subsequent requests
curl http://localhost:5000/api/candidates \
  -b cookies.txt
```

### Using Postman
1. Send POST request to `/api/login`
2. Cookies are automatically saved
3. All subsequent requests include the session cookie

### Using HTTPie
```bash
# Login (session is auto-saved)
http --session=./session.json POST localhost:5000/api/login \
  email=admin@example.com password=password

# Use saved session
http --session=./session.json GET localhost:5000/api/candidates
```

---

## Pagination

List endpoints support pagination:

```bash
# First page (50 results)
curl "http://localhost:5000/api/candidates?limit=50&offset=0"

# Second page
curl "http://localhost:5000/api/candidates?limit=50&offset=50"

# Third page
curl "http://localhost:5000/api/candidates?limit=50&offset=100"
```

**Response includes:**
- `items`: Array of results
- `total`: Total count (if available)
- `limit`: Current page size
- `offset`: Current offset

---

## Response Headers

All responses include useful headers:

```
X-Request-ID: a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 115
X-RateLimit-Reset: 1642262400
ETag: "33a64df551425fcc55e4d42a148795d9f25f89d4"
Content-Type: application/json
```

Use `X-Request-ID` for debugging and support requests.

---

## Further Documentation

- **Architecture:** `/docs/ARCHITECTURE_REVIEW.md`
- **Contributing:** `/CONTRIBUTING.md`
- **Environment Setup:** `/.env.example`
- **Quick Wins:** `/docs/QUICK_WINS.md`
