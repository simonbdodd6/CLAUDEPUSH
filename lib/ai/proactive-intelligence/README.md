# Proactive Intelligence Engine

Read-only executive intelligence layer for Coach's Eye.

Responsibilities:

- Monitor existing engines and avoid duplicating their intelligence.
- Detect significant events and convert them into executive briefings.
- Rank urgency and impact.
- Maintain an Executive Inbox.
- Generate a Morning Briefing.
- Keep every recommendation explainable.
- Require human approval for every action.
- Never execute external actions autonomously.

Public API:

- `runProactiveIntelligence(options)`
- `detectSignificantEvents(snapshot)`
- `buildExecutiveInbox(briefings)`
- `buildExecutiveDashboard(briefings)`
- `buildMorningBriefing(snapshot, freshBriefings, persistedBriefings)`
- `loadInbox(options)`
- `updateBriefingStatus(id, status, options)`

