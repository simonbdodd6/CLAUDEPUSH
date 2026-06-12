# Trip Intelligence Platform

Deterministic Trip Intelligence Planner foundation for the Travel Intelligence Platform.

This module turns Trip, Destination, Activity, Traveller Preferences, and
Recommendation snapshots into simple explainable trip plans. It does not mutate
those domains and does not call AI, LLMs, external APIs, maps, or providers.

Core API:

- `generateTripPlan`
- `generateDailyPlan`
- `suggestActivitiesForDay`
- `suggestDestinationFocus`
- `detectTripGaps`
- `explainTripPlan`

Plan output supports:

- morning suggestion
- afternoon suggestion
- evening suggestion
- backup rainy-day option
- safety note
- transport note
- budget note
- why this plan fits the traveller

Privacy rules:

- Inputs must not include exact traveller location, live location, coordinates,
  or tracking data.
- Plans are generated from supplied snapshots only.
- Every plan includes explanations and source factors from recommendation input.

The repository stores generated plans in memory behind an adapter boundary so
future persistence can replace it without changing the domain API.
