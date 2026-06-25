# Lightweight GLP-1 Tracker Spec

## Goal

Build a lightweight personal tracker that lets a user:

- enter height in `ft` + `in`
- enter weight in `st` + `lb`
- record their GLP-1 medication
- record dose events
- view an estimated medication level over time on a graph

This should feel fast and simple, not like a full clinical product.

## Product Boundaries

### In scope

- single-user experience
- manual entry of profile data
- manual entry of medication and dose history
- estimated medication-level graph based on a simple pharmacokinetic model
- lightweight history view

### Out of scope

- medical advice or dosing recommendations
- refill management
- clinician workflows
- symptom journaling
- nutrition/exercise coaching
- precise blood concentration modeling
- multi-user accounts

## Core User Stories

1. As a user, I want to enter my height in feet and inches so I can use familiar units.
2. As a user, I want to enter my weight in stone and pounds so I can use familiar units.
3. As a user, I want to select which GLP-1 medication I am taking.
4. As a user, I want to enter my dose amount and date/time taken.
5. As a user, I want to see a graph of estimated medication remaining in my system over time.
6. As a user, I want to review prior doses so I can confirm what I logged.

## Primary UX

### Screen 1: Profile Setup

Fields:

- height feet
- height inches
- weight stone
- weight pounds

Behavior:

- all fields numeric
- inches constrained to `0-11`
- pounds constrained to `0-13`
- store canonical metric values alongside entered values for calculation consistency

Computed values:

- height in cm
- weight in kg
- optional BMI display

### Screen 2: Medication Setup

Fields:

- medication name
- default dose unit

Recommended starter medication list:

- Wegovy / semaglutide
- Ozempic / semaglutide
- Rybelsus / semaglutide
- Mounjaro / tirzepatide
- Zepbound / tirzepatide
- Saxenda / liraglutide
- Victoza / liraglutide
- Byetta / exenatide
- Bydureon / exenatide ER
- Trulicity / dulaglutide

Behavior:

- medication can be selected from a predefined list
- allow custom medication entry for flexibility
- each medication maps to a default half-life and default dose unit

### Screen 3: Log Dose

Fields:

- medication
- dose value
- dose unit
- date taken
- time taken
- optional note

Behavior:

- prefill medication from current selection
- prefill unit from medication default
- support backdated entries
- show latest logged dose after save

### Screen 4: Dashboard

Components:

- current medication summary
- last dose summary
- next expected low-point or projected decline summary
- estimated level graph
- dose history list

## Functional Requirements

### Profile

- system must accept height as separate `feet` and `inches` inputs
- system must accept weight as separate `stone` and `pounds` inputs
- system must convert:
  - total inches = `feet * 12 + inches`
  - cm = `total inches * 2.54`
  - total pounds = `stone * 14 + pounds`
  - kg = `total pounds * 0.45359237`

### Medication Management

- system must let the user choose one active medication
- system should allow switching medication over time without deleting prior dose history
- system must maintain per-medication metadata:
  - display name
  - active compound
  - dose unit
  - half-life in hours

### Dose Logging

- system must let the user record a dose event with timestamp
- system must preserve historical dose events
- system should allow edit and delete of dose events

### Estimated Medication Levels

- system must estimate medication remaining in the body using exponential decay
- each dose contributes independently to the total estimated level
- displayed level is the sum of all active residual dose contributions

Formula for one dose:

`remaining = dose_amount * (0.5 ^ (elapsed_time / half_life))`

Where:

- `dose_amount` is the entered dose
- `elapsed_time` is time since dose in the same unit as half-life
- `half_life` comes from the selected medication profile

Total estimated level at time `t`:

`estimated_level(t) = sum(remaining_from_each_dose_at_t)`

Important note:

- this is a simplified estimate for trend visualization only
- it is not a validated serum concentration model
- the UI must label it clearly as `Estimated medication level`

## Medication Metadata Seed

Initial half-life defaults for the estimation model:

| Medication | Compound | Example Unit | Approx Half-Life |
| --- | --- | --- | --- |
| Wegovy / Ozempic | semaglutide | mg | 168 hours |
| Rybelsus | semaglutide | mg | 168 hours |
| Mounjaro / Zepbound | tirzepatide | mg | 120 hours |
| Saxenda / Victoza | liraglutide | mg | 13 hours |
| Byetta | exenatide | mcg | 2.4 hours |
| Bydureon | exenatide ER | mg | 336 hours |
| Trulicity | dulaglutide | mg | 120 hours |

Implementation note:

- keep this table configurable in code
- if a custom medication is added, require a half-life value or hide the graph until configured

## Graph Requirements

- line chart of estimated medication level over time
- default range: last 30 days and next 14 days projection
- x-axis: date/time
- y-axis: estimated medication level in dose units
- plot should visibly stack overlapping doses into a combined curve
- show markers for actual logged dose events
- tooltip should show:
  - timestamp
  - estimated total level
  - most recent dose details

Recommended extra views:

- `7D`
- `30D`
- `90D`

## Validation Rules

### Height

- feet must be `0-9`
- inches must be `0-11`

### Weight

- stone must be `0-99`
- pounds must be `0-13`

### Dose

- dose must be positive
- timestamp cannot be empty
- medication cannot be empty

## Data Model

### UserProfile

```json
{
  "heightFt": 5,
  "heightIn": 10,
  "heightCm": 177.8,
  "weightSt": 15,
  "weightLb": 4,
  "weightKg": 97.52,
  "createdAt": "2026-06-25T09:00:00Z",
  "updatedAt": "2026-06-25T09:00:00Z"
}
```

### MedicationProfile

```json
{
  "id": "semaglutide-wegovy",
  "name": "Wegovy",
  "compound": "semaglutide",
  "doseUnit": "mg",
  "halfLifeHours": 168
}
```

### DoseEvent

```json
{
  "id": "dose_001",
  "medicationId": "semaglutide-wegovy",
  "doseAmount": 1.0,
  "doseUnit": "mg",
  "takenAt": "2026-06-24T08:30:00Z",
  "note": "Weekly injection"
}
```

## Non-Functional Requirements

- mobile-first layout
- all key actions reachable in under 2 taps from dashboard
- local-first storage is acceptable for v1
- graph should render quickly with at least 500 dose points
- calculations should happen client-side for v1

## Suggested Technical Approach

### Frontend

- simple SPA
- React, Vue, or Svelte all fit
- charting via Recharts, Chart.js, or ECharts

### Storage

V1 options:

- browser local storage for fastest prototype
- SQLite if packaged desktop/mobile app
- lightweight hosted DB only if sync is needed

### Calculation Engine

- generate time-series points at daily or 6-hour intervals
- for each point, sum residual values from all prior dose events
- project forward by applying the same decay formula to existing active doses

Pseudo-logic:

```ts
function estimateLevelAt(date: Date, doses: DoseEvent[], meds: Record<string, MedicationProfile>) {
  return doses.reduce((total, dose) => {
    const med = meds[dose.medicationId];
    const elapsedHours = (date.getTime() - new Date(dose.takenAt).getTime()) / 36e5;
    if (elapsedHours < 0) return total;
    const remaining = dose.doseAmount * Math.pow(0.5, elapsedHours / med.halfLifeHours);
    return total + remaining;
  }, 0);
}
```

## Risks and Caveats

- users may misread the graph as an exact concentration measurement
- different formulations and delivery methods can make half-life assumptions imperfect
- oral vs injectable products with the same compound may not behave identically in reality

Mitigation:

- prominent disclaimer near the graph
- product copy should say `trend estimate`, not `blood level`

## V1 Acceptance Criteria

1. User can save height in feet/inches.
2. User can save weight in stone/pounds.
3. User can select or create a medication entry.
4. User can log dose amount and timestamp.
5. User can view a graph of estimated medication level over time.
6. Graph updates when a new dose is added.
7. Dose history is visible and editable.
8. App clearly labels the graph as an estimate, not medical advice.

## Nice-to-Have V2

- reminders for next dose
- weight trend graph alongside medication level
- side-effect and symptom logging
- export dose history
- cloud sync across devices
