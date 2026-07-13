# Project Police - AI-Ready Technical Summary

This document provides deep technical details about the Project Police application, including database schemas, API request/response shapes, and frontend component interfaces.

## 1. Database Schema (PostgreSQL)

### Table: `users`
- `id`: SERIAL PRIMARY KEY
- `name`: VARCHAR(255)
- `password`: VARCHAR(255) (Hashed)
- `color`: VARCHAR(7) DEFAULT '#000000' (Hex color for profile)

### Table: `documents`
- `id`: SERIAL PRIMARY KEY
- `filename`: VARCHAR(255)
- `content`: TEXT (Raw OCR text)
- `content_hash`: VARCHAR(64) UNIQUE
- `drive_file_id`: VARCHAR(255)
- `drive_web_view_link`: TEXT
- `keywords_found`: JSONB
- `created_by`: INT REFERENCES users(id)

### Table: `tasks`
- `id`: UUID/SERIAL PRIMARY KEY
- `document_id`: INT REFERENCES documents(id)
- `title`: TEXT
- `memo_no`: TEXT
- `memo_date`: DATE
- `main_text`: TEXT
- `department`: TEXT
- `sender`: TEXT
- `due_date`: DATE
- `received_date`: DATE
- `signed_date`: DATE
- `status`: VARCHAR(20) DEFAULT 'following' (following, problem, completed)
- `is_urgent`: BOOLEAN DEFAULT FALSE
- `notes`: TEXT
- `created_by`: INT REFERENCES users(id)

### Table: `task_assignments`
- `id`: UUID PRIMARY KEY
- `task_id`: REFERENCES tasks(id)
- `user_id`: INT REFERENCES users(id)
- `role_or_name`: TEXT (Fall-back if user_id is null)

### Table: `task_topics`
- `id`: SERIAL PRIMARY KEY
- `assignment_id`: REFERENCES task_assignments(id)
- `detail`: TEXT
- `is_completed`: BOOLEAN DEFAULT FALSE

---

## 2. Backend API Reference (`/api/v1`)

### Authentication
- `POST /auth/login`
    - Request: `{ "name": "...", "password": "..." }`
    - Response: `{ "success": true, "token": "...", "user": { "id": 1, "name": "..." } }`

### Document Processing
- `POST /documents/process` (Protected)
    - Input: `multipart/form-data` with `files`
    - Response:
      ```json
      {
        "total": 1,
        "results": [
          {
            "filename": "file.pdf",
            "status": "success",
            "extractedData": { "ที่": "...", "เรื่อง": "...", "assignments": [...] },
            "fileInfo": { "path": "...", "text": "...", "mimetype": "..." }
          }
        ]
      }
      ```

### Task Management
- `POST /tasks/confirm` (Protected)
    - Request:
      ```json
      {
        "fileInfo": { ... },
        "memos": [
          {
            "ที่": "...",
            "เรื่อง": "...",
            "due_date": "YYYY-MM-DD",
            "assignments": [
              { "user_id": 1, "topics": ["Task 1", "Task 2"] }
            ]
          }
        ],
        "createdBy": 1
      }
      ```

- `GET /tasks/:id`
    - Response Includes: `assignments` array, where each object has a `topics` array.

- `PUT /tasks/:id` (Update Detail)
    - Request: `{ "name": "...", "date": "...", "notes": "...", "isUrgent": bool, "assignments": [...] }`
    - *Note: This endpoint handles syncing assignments and topics (deleting removed ones, updating existing ones).*

---

## 3. Frontend Data Interfaces (TypeScript)

### `TaskData` (Used in Details)
```typescript
interface TaskData {
    id: string;
    name: string;
    status: "following" | "problem" | "completed";
    isUrgent: boolean;
    date: string; // ISO String
    main_text: string;
    notes: string;
    memo_no: string;
    memo_date: string;
    creatorName: string;
    document_link: string;
    assignments: {
        assignment_id: string;
        user_id: string;
        personInCharge: string;
        topics: {
            topic_id: string;
            detail: string;
            is_completed: boolean;
        }[];
    }[];
}
```

### `FileResult` (OCR Response)
```typescript
interface FileResult {
    filename: string;
    status: "success" | "error";
    extractedData: {
        ที่?: string;
        วันที่?: string;
        เรื่อง?: string;
        main_text?: string;
        assignments?: { responsible_person: string; topics: string[] }[];
    }[];
    fileInfo: any; // Used for confirm API
}
```

---

## 4. Key Logic & Environment
- **OCR Logic:** Uses Gemini AI to extract data in `ocrService.js`.
- **Duplicate Checking:** Uses hash of content + timestamp.
- **Drive Integration:** Uploads to Google Drive upon confirmation.
- **Frontend State:**
    - `Uploaded.tsx` manages complex state for multiple scanned files and their assignments before confirmation.
    - `DetailsDisplayer.tsx` handles real-time toggling of `is_completed` for topics with auto-save.
- **Environment Variables:**
    - `NEXT_PUBLIC_BACKEND_URL`: URL of the Express server.
    - `JWT_SECRET`: Secret for signing tokens.
    - `GOOGLE_DRIVE_FOLDER_ID`: Destination for document uploads.
