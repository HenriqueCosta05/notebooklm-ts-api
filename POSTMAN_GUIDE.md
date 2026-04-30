# Postman Collection Guide

This directory contains Postman collection and environment files for testing the NotebookLM TypeScript API.

## Files

- **postman_collection.json** - Complete API collection with all endpoints
- **postman_environment_dev.json** - Development environment variables
- **postman_environment_prod.json** - Production environment variables

## Setup Instructions

### 1. Extract Authentication (Required First)

Before using Postman, you must extract your NotebookLM credentials:

#### Option A: Automated Extraction (Recommended)

```bash
npm run auth:extract
```

A browser window opens. Log in with your Google account. Credentials are automatically extracted and saved to `.notebooklm-auth/`.

#### Option B: Manual Extraction

If Option A doesn't work, see [docs/authentication.md](./docs/authentication.md) for manual extraction steps.

### 2. Import the Collection

1. Open Postman
2. Click **Import** in the top-left corner
3. Select **postman_collection.json**
4. The collection will be imported with all endpoints organized by category

### 3. Import an Environment

1. Click the **Environments** icon on the left sidebar
2. Click **Import**
3. Select either **postman_environment_dev.json** or **postman_environment_prod.json**
4. Click the environment dropdown in the top-right and select your environment

### 4. Configure Base URL

Update the base URL if needed:

1. Click the environment name in the top-right dropdown
2. Click **Edit** (pencil icon)
3. Find the `base_url` variable
4. Update it to match your API location (default is `http://localhost:3000/api/v1`)
5. Click **Save**

### 5. Start the API Server

```bash
npm run dev
```

The API server starts and loads your extracted credentials automatically.

## Environment Variables

Each environment includes the following variables:

| Variable | Purpose | Required |
|----------|---------|----------|
| `base_url` | API base URL | Yes |
| `notebook_id` | Current notebook ID | No |
| `source_id` | Current source ID | No |
| `artifact_id` | Current artifact ID | No |
| `conversation_id` | Current conversation ID | No |
| `task_id` | Current task ID | No |
| `api_version` | API version | No |
| `environment` | Current environment name | No |

## API Endpoints Overview

### Health Check
- **GET** `/health` - Check API health status

### Notebooks
- **GET** `/notebooks` - List all notebooks
- **POST** `/notebooks` - Create a new notebook
- **GET** `/notebooks/:id` - Get a specific notebook
- **PATCH** `/notebooks/:id` - Rename a notebook
- **DELETE** `/notebooks/:id` - Delete a notebook
- **GET** `/notebooks/:id/description` - Get notebook description

### Sources
- **GET** `/notebooks/:notebookId/sources` - List sources
- **POST** `/notebooks/:notebookId/sources/url` - Add URL source
- **POST** `/notebooks/:notebookId/sources/text` - Add text source
- **POST** `/notebooks/:notebookId/sources/drive` - Add Google Drive source
- **PATCH** `/notebooks/:notebookId/sources/:sourceId` - Rename source
- **DELETE** `/notebooks/:notebookId/sources/:sourceId` - Delete source
- **POST** `/notebooks/:notebookId/sources/:sourceId/refresh` - Refresh source
- **GET** `/notebooks/:notebookId/sources/:sourceId/guide` - Get source guide
- **GET** `/notebooks/:notebookId/sources/:sourceId/fulltext` - Get source fulltext

### Chat
- **POST** `/notebooks/:notebookId/chat/ask` - Ask a question
- **GET** `/notebooks/:notebookId/chat/conversation-id` - Get conversation ID
- **GET** `/notebooks/:notebookId/chat/history` - Get chat history
- **GET** `/notebooks/:notebookId/chat/cache/:conversationId` - Get cached turns
- **DELETE** `/notebooks/:notebookId/chat/cache` - Clear all cache
- **DELETE** `/notebooks/:notebookId/chat/cache/:conversationId` - Clear specific cache
- **PUT** `/notebooks/:notebookId/chat/configure` - Configure chat settings
- **PUT** `/notebooks/:notebookId/chat/mode` - Set chat mode

### Artifacts
- **GET** `/notebooks/:notebookId/artifacts` - List artifacts
- **POST** `/notebooks/:notebookId/artifacts/generate/audio` - Generate audio
- **POST** `/notebooks/:notebookId/artifacts/generate/video` - Generate video
- **POST** `/notebooks/:notebookId/artifacts/generate/report` - Generate report
- **POST** `/notebooks/:notebookId/artifacts/generate/quiz` - Generate quiz
- **POST** `/notebooks/:notebookId/artifacts/generate/flashcards` - Generate flashcards
- **POST** `/notebooks/:notebookId/artifacts/generate/infographic` - Generate infographic
- **POST** `/notebooks/:notebookId/artifacts/generate/slide-deck` - Generate slide deck
- **POST** `/notebooks/:notebookId/artifacts/generate/data-table` - Generate data table
- **POST** `/notebooks/:notebookId/artifacts/generate/mind-map` - Generate mind map
- **GET** `/notebooks/:notebookId/artifacts/status/:taskId` - Poll artifact status
- **GET** `/notebooks/:notebookId/artifacts/:artifactId` - Get artifact
- **PATCH** `/notebooks/:notebookId/artifacts/:artifactId` - Rename artifact
- **POST** `/notebooks/:notebookId/artifacts/:artifactId/export` - Export artifact
- **POST** `/notebooks/:notebookId/artifacts/:artifactId/revise-slide` - Revise slide
- **DELETE** `/notebooks/:notebookId/artifacts/:artifactId` - Delete artifact
- **GET** `/notebooks/:notebookId/artifacts/suggestions` - Get report suggestions

### Research
- **POST** `/notebooks/:notebookId/research` - Start research
- **GET** `/notebooks/:notebookId/research/:taskId` - Get research status
- **POST** `/notebooks/:notebookId/research/:taskId/import` - Import research results
- **GET** `/notebooks/:notebookId/research/:taskId/wait` - Wait for completion

### Sharing
- **GET** `/notebooks/:notebookId/share` - Get share status
- **PATCH** `/notebooks/:notebookId/share/public` - Set public/private
- **POST** `/notebooks/:notebookId/share/users` - Add user
- **DELETE** `/notebooks/:notebookId/share/users` - Remove user
- **PATCH** `/notebooks/:notebookId/share/users` - Update permission
- **GET** `/notebooks/:notebookId/share/users` - Get shared users
- **GET** `/notebooks/:notebookId/share/url` - Get share URL

## Common Testing Workflows

### 1. Create and Test a Notebook

1. Run **Create Notebook** request
2. Copy the notebook ID from response
3. Set `{{notebook_id}}` variable to this ID
4. Test other notebook endpoints with this ID

### 2. Add Sources and Ask Questions

1. Run **Add URL Source** (or text/drive source)
2. Get conversation ID with **Get Conversation ID**
3. Run **Ask Question** to interact with the notebook
4. View results with **Get Conversation History**

### 3. Generate Artifacts

1. Run any **Generate** request (e.g., Generate Report)
2. Copy the task ID from response
3. Poll status with **Poll Artifact Status** using the task ID
4. Once complete, view with **Get Artifact**

### 4. Share a Notebook

1. Run **Set Public/Private** to make it public
2. Or run **Add User** to share with specific users
3. Check permissions with **Get Shared Users**
4. Get share URL with **Get Share URL**

## Authentication

Postman requests no longer need an auth token or custom header. The API falls back to the browser-extracted session saved in `.notebooklm-auth/storage_state.json`.

If you have not extracted cookies yet, run:

```bash
npm run auth:extract
```

The API server loads that saved session automatically, so Postman can send plain requests without any auth setup.

## Tips & Tricks

1. **Save Variables Between Requests** - Use Postman's test scripts to automatically save IDs from responses:
   ```javascript
   pm.environment.set("notebook_id", pm.response.json().id);
   ```

2. **Chain Requests** - Create a collection runner to execute multiple requests in sequence

3. **Create Test Cases** - Use Postman's test feature to validate responses

4. **Monitor API Performance** - Use Postman's monitoring feature to track API health

5. **Export Collections** - Keep backups of your collections by exporting them

## Troubleshooting

### 401 Unauthorized
- Verify `.notebooklm-auth/storage_state.json` exists
- Re-run `npm run auth:extract` to refresh the saved session
- Make sure the API server can read `NOTEBOOKLM_STORAGE_PATH` if you configured a custom path

### 404 Not Found
- Verify the notebook/source/artifact IDs are correct
- Check the base URL matches your environment
- Make sure the resource hasn't been deleted

### 429 Too Many Requests
- You've exceeded the rate limit
- Wait a moment before making more requests
- Check the `Retry-After` header in the response

### 500 Internal Server Error
- Check the API logs for more details
- Ensure all required request body fields are provided
- Try the request again after a few seconds

## Advanced Features

### Using Environments

Switch between development and production by selecting different environments from the top-right dropdown.

### Collection Variables

Global variables for the collection can be set by clicking the folder icon next to the environment dropdown.

### Pre-request Scripts

Add authentication headers or transform request data before sending:

```javascript
// Set current timestamp
pm.environment.set("timestamp", Date.now());

// Add custom headers
pm.request.headers.add({
  key: "X-Custom-Header",
  value: "custom-value"
});
```

### Test Scripts

Validate responses and extract data:

```javascript
// Verify status code
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

// Save notebook ID from response
pm.test("Save notebook ID", function () {
    let jsonData = pm.response.json();
    pm.environment.set("notebook_id", jsonData.id);
});
```

## Support

For issues with the API, check the documentation at `/docs` endpoint or review the API logs.

For issues with Postman, refer to [Postman Documentation](https://learning.postman.com/).
