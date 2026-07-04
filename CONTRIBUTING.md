# Contributing to Migration Mapper

Thanks for your interest in contributing. This document covers what you need to get set up and what a good PR looks like.

## Prerequisites

- **Node** `^20.19.0 || >=22.12.0` (the `engines` constraint in `package.json`)
- **npm** (ships with Node)

Development works on any platform; packaging the Windows installer (`npm run dist`) requires Windows.

## Setup

```bash
git clone https://github.com/NeverNathaniel/SPMM.git
cd SPMM
npm install
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server + Electron with hot reload |
| `npm test` | Run the Vitest suites once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint over the whole repo |
| `npm run build` | Type-check (`tsc --noEmit`) + production bundles |
| `npm run dist` | Build + package the Windows installer & portable exe (**requires Windows**) |

## Project layout

- `electron/` — the Electron main process: window, IPC handlers, the directory-scan worker, persistence, export writing.
- `src/shared/` — pure logic with no Node or DOM imports: the mapping engine, SPMT task planning, validation, CSV/HTML generation, tech-config sanitisation. **This is the unit-tested core — changes here need accompanying tests in `tests/`.**
- `src/components/` — React UI (screens and panels).
- `src/store/` — Zustand store and derived-state hooks.
- `tests/` — Vitest suites for `src/shared/`, the store, and the scanner.

## Pull requests

Before opening a PR, make sure:

- `npm run build` passes (this includes the `tsc --noEmit` type check),
- `npm test` passes,
- `npm run lint` is clean.

New or changed behaviour in `src/shared/` should come with tests. There is no component-level test infrastructure yet, so keep logic out of components — anything decision-shaped belongs in `src/shared/` where it is testable in isolation.
