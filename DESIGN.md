# OpenRAB — Design System (`DESIGN.md`)

## 1. Visual Direction & Intent
- **Domain**: Architectural Cost Engineering & Quantity Surveying (QS) Workbench.
- **Persona**: Indonesian architects, estimators, and architecture students preparing auditable, reproducible RAB (Rencana Anggaran Biaya).
- **Aesthetic**: Warm Architectural Drafting Paper meets High-Precision Engineering Ledger. Calm, dense enough for numerical work, unmistakably crisp on financial figures.

## 2. Color Tokens
- **Paper Canvas (`--bg-canvas`)**: `#F8F7F4` (warm drafting vellum)
- **Ledger Surface (`--bg-surface`)**: `#FFFFFF`
- **Muted Drafting Band (`--bg-subtle`)**: `#F1EFEA`
- **Primary Ink (`--ink-primary`)**: `#0F172A` (blueprint slate)
- **Secondary Ink (`--ink-secondary`)**: `#475569`
- **Hairline Grid Border (`--border-grid`)**: `#DDD9D0`
- **Draft / Active Workbench Accent (`--accent-draft`)**: `#B45309` (architectural amber/copper)
- **Finalized / Locked State (`--accent-locked`)**: `#047857` (verified emerald)
- **Dummy Seed Warning (`--accent-dummy`)**: `#9A3412` on `#FFEDD5`
- **Validation Error (`--accent-danger`)**: `#B91C1C` on `#FEF2F2`

## 3. Typography
- **Display & Section Headings**: `Space Grotesk` (clean architectural geometry)
- **UI Body & Labels**: `Plus Jakarta Sans`
- **Numbers, Dimensions, Codes, Currency**: `JetBrains Mono` with `font-variant-numeric: tabular-nums`

## 4. Guardrails (Anti-Slop)
- NO purple-blue gradients anywhere.
- NO emoji used as UI icons (use `lucide-react` stroke icons exclusively).
- NO generic marketing hero + 3-card templates; launch directly into project/master workbenches.
- NO unformatted float numbers; all currency uses Indonesian format (`1.234.567,89`) and volumes use 4 decimal places (`20.0000`).
- Respect `prefers-reduced-motion` and keep transitions subtle and functional (`<= 150ms`).
