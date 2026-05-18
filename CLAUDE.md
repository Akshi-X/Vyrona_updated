# mG-SCALE — Claude Context

## Project Overview

IVF lab management platform. Tracks cryogenic tanks (LN2 canisters), incubators, embryo grading, shipments, and alert configurations. Two major components:

- **FrontEnd** — React 18 + TypeScript + Vite + Tailwind CSS + MUI
- **backend** — Python FastAPI + SQLAlchemy (Postgres)

## Frontend Architecture

### Stack
- React 18, TypeScript, Vite
- Tailwind CSS (utility classes) + MUI for complex components
- `axios` via service layer (`src/services/`)
- `lucide-react` for icons

### Service Layer Pattern
All API calls live in `src/services/`. Pages call services, never `axios` directly.

Key services:
- `shipmentService.ts` — cryotanks, incubators, branches, active device lists
- `ivfService.ts` — KPI config (alert settings), embryo grading logs, quality data
- `userService.ts` — user profile, auth
- `ivfAlertsService.ts` — alert acknowledgment

### Device Type Distinction
Two device types share much UI but are fetched separately:
- **Cryotanks** — `shipmentService.getActiveCanisters()` → `/api/ivf/control_tower/active_canisters`
- **Incubators** — `shipmentService.getActiveIncubators()` → `/api/ivf/control_tower/active_incubators`

Never filter one from the other's endpoint. `is_incubator` is a property on objects returned from their respective endpoints; ControlTower no longer uses it as a filter.

### Key Pages

| Page | Path | Purpose |
|------|------|---------|
| ControlTower | `src/pages/ControlTower/` | Live device status grid (cryotanks + incubators) |
| AlertSetting | `src/pages/AlertSetting/` | Per-device KPI alert thresholds |
| EmbryoGrading | `src/pages/EmbryoGrading/` | Log embryo development per cycle/patient |
| IncubatorTracking | `src/pages/IncubatorTracking/` | Per-incubator readings chart |

## ControlTower Patterns

`deviceType` state (`"canisters"` | `"incubators"`) drives which data is shown.

```tsx
const activeList = deviceType === "incubators" ? incubators : canisters;
```

Declare `activeList` **before** any `useMemo` that depends on it.

UI labels switch based on `deviceType`:
- Header: "Active Canisters" / "Active Incubators"
- Stat: "Canisters #" / "Incubators #"
- Row label: "Container {id}" / "Incubator {id}"
- Column: "Last Refill Date" for canisters, "Last Updated" for incubators (incubators don't get refilled)

## AlertSetting Patterns

### Chamber vs Common (Incubators)
Incubators have chambers. `selectedChamberId: string | null`:
- `null` → **Common** (incubator-level config, `chamber_id IS NULL` in DB)
- `string` → specific chamber

The "Common" button renders full-width above the chamber grid. Selecting it sets `selectedChamberId(null)`.

### effectiveKpiNames
```ts
const effectiveKpiNames =
  directionFilter === "incubators" && selectedChamberId === null
    ? [KPI_NAMES.IVF_TEMPERATURE_EXTERNAL]          // Common: external temp only
    : directionFilter === "incubators"
      ? INCUBATOR_KPI_NAMES
      : CRYOTANK_KPI_NAMES;
```

### Conditional UI (incubators)
- "Apply to Other Chambers" — only when `primaryContainer?.is_incubator && selectedChamberId !== null`
- "Copy to Additional Tanks" — only when `!primaryContainer?.is_incubator`
- Both hidden when Common is selected.

### KPI Config Fetch
`ivfService.getKpiConfigList` sends `chamber_id=null` (literal string) to signal IS NULL filter:
```ts
if (chamberId === null) param += `&chamber_id=null`;
// chamberId === undefined → omit param entirely (legacy/cryotank path)
```

Backend (`ivf_quality_controller.py`):
```python
if chamber_id == "null":
    q = q.filter(KpiConfig.chamber_id.is_(None))
elif chamber_id:
    q = q.filter(KpiConfig.chamber_id == chamber_id)
```

### useEffect deps for incubator fetch
Always include `primaryContainer?.tank_id` in the dep array alongside `selectedChamberId`. Without it, switching between incubators while on Common (null→null) won't re-fetch.

```ts
useEffect(() => { ... }, [primaryContainer?.tank_id, selectedChamberId, refetchKpiConfig]);
```

## EmbryoGrading Patterns

### Grade Formats
- Day 3 cleavage: `{cellCount}C{fragmentation}` e.g. `4C2` — lavender chip `bg-[#F7ECFF] text-[#6b1176]`
- Day 5/6 blastocyst: `{expansion}{icm}{te}` e.g. `4AA`, `4BB`, `4AB` — colored chips by ICM+TE grade
  - `AA` → green, `BB` → yellow, other → amber

### openEditLog(row, step)
Single helper that populates `logForm`, sets `editingLogId`, sets `logModalStep(step)`, opens modal. Used by the Update button (step 0) and all clickable grade cells:
- Oocyte / PN → step 0
- Day 3 → step 1
- Day 5 → step 2
- Day 6 → step 3
- Fate → step 4

## Backend Patterns

### FastAPI + SQLAlchemy
- Controllers in `backend/app/controller/IVF/`
- SQLAlchemy models use `.is_(None)` for IS NULL, not `== None`
- String `"null"` in query params maps to SQL IS NULL (explicit convention, not an accident)

### IVF Quality Controller
`ivf_quality_controller.py` — handles KPI config CRUD, alert thresholds, incubator + cryotank configs.

## Onboarding Flow

### Overview
A gamified guided-tour system. 8 levels, each with an interactive spotlight tour followed by a quiz. Progress and scores are persisted per user.

### File Locations
```
src/onboarding/data/levels.json          — level config (id, route, pointsRequired, scoreRequired, etc.)
src/onboarding/data/level-N.steps.json  — step definitions for each level
src/onboarding/data/level-N.quiz.json   — quiz questions for each level
src/types/onboarding.ts                  — all TypeScript types
src/contexts/OnboardingContext.tsx       — state, persistence, score logic
src/contexts/OnboardingModeContext.tsx   — useOnboardingMode() hook (true when tour is active)
src/contexts/TourNavContext.tsx          — isTourActive, nav state shared between Shell and Level
src/pages/Onboarding/OnboardingShell.tsx — TourProvider wrapper, sidebar layout
src/pages/Onboarding/OnboardingOverlay.tsx — controls tour open/close, quiz overlay
src/pages/Onboarding/Level.tsx           — all tour step side-effects (pointer-events, navigation, click handlers)
```

### Level Unlock Rules
- `pointsRequired` — minimum quiz score this user must have earned to unlock
- `scoreRequired` — minimum cumulative highScore across ALL levels to unlock
- `unlockDelayHours` — hours after previous level completion before this unlocks

### Step Schema (`OnboardingStep`)
| Field | Type | Purpose |
|-------|------|---------|
| `id` | string | Unique step identifier |
| `target` | string | CSS selector for the spotlight element |
| `title` / `content` | string | Tooltip text |
| `placement` | top/bottom/left/right/center | Tooltip position |
| `requireClick` | boolean | `true` = user must click target to advance; `false` = read-only, pointer-events disabled |
| `clickOnlyId` | string[] | Extra selectors that get a pulse animation; clicking them advances the step |
| `disableClickID` | string[] | Selectors to disable while the step is active |
| `startPage` | string | Route to navigate to before activating this step |
| `prevDisable` | boolean | Disables the Back button on this step |
| `rewindOnRefresh` | boolean | On page reload, rewind past this step so user never resumes mid-flow |
| `genieImage` | string | Genie mascot image path shown in tooltip |
| `onboardingEvent` | string | CustomEvent name dispatched on `document` when step activates |
| `inputText` | string | Pre-fills a text input in the target component via `onboarding:set-chat-input` event |
| `stepDelay` | number | ms to wait before activating step |

### Level.tsx — Key Effects
All side-effects for a step run in `Level.tsx`. The effects fire whenever `activeStep` or `isTourActive` changes.

**Effect 4 — `startPage` navigation**: if current route ≠ `activeStep.startPage`, navigate there.

**Effect 5 — async element re-sync**: if target element is not yet in the DOM (e.g., loading state), polls every 50ms. When it appears: sets `pointer-events: none` if `requireClick === false`, then calls `setIsOpen(false/true)` to reposition the spotlight.

**Effect 6 — `requireClick: false` → disable interaction**: sets `pointer-events: none` on the target element. Cleans up on step change. Only fires if element is already in DOM at step activation; async elements are handled by Effect 5.

**Effect 7 — `clickOnlyId` pulse animation**: adds/removes `tour-click-target` CSS class on listed selectors.

**Effect 8/9 — `clickOnlyId` click advance**: attaches `mousedown` listeners to `clickOnlyId` elements that call `goNext()`.

**Effect 10 — `disableClickID`**: sets `pointer-events: none` on listed selectors.

### `requireClick` vs `clickOnlyId`
- `requireClick: true` — the **spotlight target itself** must be clicked. User cannot advance with Next button until they click it.
- `clickOnlyId` — **different elements** from the target get the click handler. The spotlight highlights the target for reading; clicking one of the `clickOnlyId` elements advances the tour. These two are often used together.

### `onClickMask`
Set to `() => {}` (no-op) in `OnboardingShell.tsx` so clicking the dark tour mask never closes or advances the tour.

### `useOnboardingMode()`
Returns `true` whenever the page is rendered inside the onboarding flow. Use it in page components to suppress behaviours that would break the tour:

```tsx
const isOnboarding = useOnboardingMode();

// Prevent modal backdrop from closing during tour
onClick={() => { if (!isOnboarding) setShowModal(false); }}

// Prevent click-outside handler from firing during tour
const handleClickOutside = (e) => { if (isOnboarding) return; ... };
```

Do NOT add `pointer-events-none` classes in page components for tour steps — use `requireClick: false` in the step JSON instead. Level.tsx applies it automatically.

### Replica Pages
Each level runs on a `/onboarding/*` route that renders a replica of the real page (`OnboardingReplica` type). Replicas use mock data and mock API overrides so the tour runs without side effects. The real page component is reused; mock data is injected by overriding service calls inside a `useEffect` that restores originals on cleanup.

### Adding a New Step
1. Add the element `id` (`id="onboarding-..."`) to the target component in the real page.
2. Add the step object to the relevant `level-N.steps.json`.
3. If the step is read-only (just explain, no interaction needed): set `"requireClick": false`.
4. If the step requires the user to click something to proceed: set `"requireClick": true`, or use `"clickOnlyId"` if the click target differs from the spotlight target.
5. If the target element renders conditionally (behind a loading state), Effect 5 handles it automatically — no extra code needed.
6. If a page component closes a modal or dropdown on click-outside, guard it with `useOnboardingMode()`.

## Conventions

- No comments unless the WHY is non-obvious
- No emojis
- No trailing summaries in responses
- Prefer editing existing files over creating new ones
- Never add dead code, unused imports, or backwards-compat shims
- `activeList` pattern: compute per render (not memoized) when it just picks between two already-memoized arrays
- Service functions distinguish `null` (explicit) from `undefined` (omit) for optional params
