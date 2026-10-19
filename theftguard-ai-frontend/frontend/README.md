# TheftGuard AI — Frontend (`theftguard-ai-frontend`)

React 18 single-page application built with Vite, Tailwind CSS, Recharts, and Tesseract.js for electricity theft detection screening, bill discrepancy auditing, and investigation workflows.

---

## 1. Prerequisites & Installation

- **Node.js:** Node.js 18 or newer (tested on Node v20.x and v24.x; npm 10+).
- **Working Directory:** All commands below should be executed from the `theftguard-ai-frontend\frontend` folder.

```powershell
cd theftguard-ai-frontend\frontend

# Install dependencies into node_modules
npm install
```

---

## 2. Available Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts the Vite local development server on `http://localhost:5173` |
| `npm test` | Runs the 40 native Node unit tests (`test/*.test.js`) |
| `npm run build` | Compiles production assets into `dist/` (~723 kB minified JS, ~21 kB CSS) |
| `npm run preview` | Previews the production build locally |

---

## 3. Reverse Proxy & Backend Connectivity

The frontend connects to the FastAPI backend service via the Vite reverse proxy defined in [`vite.config.js`](file:///c:/Users/shush/OneDrive/Desktop/TheftGuard-AI/theftguard-ai-frontend/frontend/vite.config.js):

```javascript
server: {
  proxy: {
    '/ml': {
      target: 'http://127.0.0.1:8000',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/ml/, ''),
    },
  },
}
```

- When the frontend requests `/ml/v1/batches`, Vite forwards the request to `http://127.0.0.1:8000/v1/batches`.
- **Security Guarantee:** Browser clients **never** connect directly to the database or receive database credentials. All database operations route through the backend proxy.

---

## 4. Key Application Workflows

### 1. ML Screening & Historical Batch Reload
- **Screening (`/app/screening`):** Upload a CSV containing the 13 required features. The client parses rows, calls chunked prediction via `predictBatch` (50 rows/chunk), and displays results.
- **Batch Persistence:** Clicking "Save Batch to Database" saves the batch and records atomically via `POST /v1/batches`.
- **Pagination (`getBatchWithAllRecords`):** When loading historical batches from the database with $> 100$ records, the client transparently pages across all records (`limit=100`, `offset=...`) to ensure full batches are loaded without truncation.

### 2. Spot-Billing OCR & Discrepancy Detection (`/app/bill-upload`)
- Uses client-side **Tesseract.js** (utilizing local `eng.traineddata` for offline execution) to parse spot-billing receipts (e.g. TSSPDCL).
- Extracts consumer number, previous reading, current reading, billed units, and billing days.
- **Discrepancy Check:** Calculates `current_reading - previous_reading` and flags differences from billed units.
- **Data Minimization:** Strictly sends only parsed numerical and categorical metadata to `/ml/v1/bill-extractions`. Raw OCR text, images, and PDF files are **never** persisted or transmitted.

### 3. Investigation Audit Tickets (`/app/investigations`)
- Creates audit tickets (`INV-YYYYMMDD-XXXX`) directly from high-risk screening records or bill discrepancies.
- Manages ticket status (`New`, `In inspection`, `Closed`), priority, assignee, notes, and interactive 5-point inspection checklists.
- **Visual Distinction:** Tickets display `<Badge tone="ok">Persisted</Badge>` when saved in PostgreSQL, or `<Badge tone="grey">Local Session</Badge>` when in demo fallback mode.
- **409 Conflict Protection:** Automatically detects and displays clear warnings if a screening record has already been linked to an open investigation.

---

## 5. Offline & Fallback Resilience

If the FastAPI service or PostgreSQL database is offline:
- The health check cleanly reports `database_unavailable`.
- Investigation creation falls back gracefully to local session memory (`LOCAL-XXXXXX`) with an in-app notice, allowing demonstrations and offline reviews to proceed without application crashes.
