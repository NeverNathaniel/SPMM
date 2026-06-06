# SPMM Frontend

React + Vite single-page app for the **File Share to SharePoint Migration Mapper**.
It renders an interactive React Flow canvas where you connect scanned source-folder
nodes to SharePoint destination nodes, and talks to the FastAPI backend over REST.

## Prerequisites

- Node.js 18+
- The SPMM backend running on `http://127.0.0.1:8000` (start it with `python3 main.py`
  from the repository root). The backend's CORS config only allows the Vite dev
  origins `http://localhost:5173` and `http://127.0.0.1:5173`.

## Setup

```bash
npm install
```

## Develop

```bash
npm run dev      # Vite dev server at http://localhost:5173
```

The API base URL is defined as `API_BASE` in `src/App.jsx` and `src/components/FolderPicker.jsx`
(`http://127.0.0.1:8000/api`). Change it there if your backend runs elsewhere.

## Build

```bash
npm run build    # production build into dist/
npm run preview  # preview the production build
```

## Lint

```bash
npm run lint
```

## Structure

| Path | Responsibility |
|---|---|
| `src/App.jsx` | Root component: React Flow canvas + header controls (scan, browse, add destination, validate, export). |
| `src/components/CustomNodes.jsx` | Source-folder and SharePoint-destination node renderers. |
| `src/components/FolderPicker.jsx` | Modal directory browser backed by `GET /api/browse`. |
| `src/components/ErrorBoundary.jsx` | Catches render errors and shows a recoverable fallback. |
| `src/index.css` | Global dark glassmorphism theme and React Flow overrides. |
