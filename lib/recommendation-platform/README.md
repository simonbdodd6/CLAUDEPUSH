# Recommendation Platform

Deterministic Recommendation Platform foundation for the Travel Intelligence Platform.

This module does not use AI, machine learning, LLMs, embeddings, or external
providers. It ranks recommendations with transparent weighted scoring over
provided Trip, Destination, Activity, and Traveller Preferences snapshots.

Supported recommendation types:

- activity
- destination
- food
- accommodation
- transport
- safety
- weather suitability

Scoring factors:

- traveller interests
- budget
- trip duration
- activity preferences
- accessibility
- travel pace
- crowd tolerance
- climate preference
- language preference
- transport preference
- risk tolerance

Core API:

- `generateRecommendations`
- `scoreDestination`
- `scoreActivity`
- `rankRecommendations`
- `explainRecommendation`

Privacy rules:

- Inputs must not include exact traveller location, live location, coordinates,
  or tracking data.
- The engine consumes snapshots passed to it; it does not read from other domain
  repositories directly.
- Every recommendation includes score, confidence, explanation, and source
  factors so results remain explainable.

The repository stores recommendation runs in memory behind an adapter boundary
so future persistence can replace it without changing the domain API.
