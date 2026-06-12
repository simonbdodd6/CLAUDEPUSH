# Traveller Preferences Platform

Traveller Preferences domain foundation for the Travel Intelligence Platform.

A TravellerPreferences record is the private canonical profile that captures a
traveller's travel preferences for future recommendations, discovery, planning,
and safety-aware matching. This module does not build recommendations yet.

This module is independent from Coach's Eye and from production authentication,
AI, maps, external providers, and persistent storage.

Core fields:

- `preferencesId`
- `travellerIdentityId`
- `budgetLevel`
- `accommodationStyles`
- `travelStyles`
- `preferredActivityCategories`
- `fitnessLevel`
- `accessibilityRequirements`
- `foodPreferences`
- `languages`
- `transportPreferences`
- `riskTolerance`
- `crowdTolerance`
- `climatePreferences`
- `preferredTravelPace`
- `maximumDailyBudget`
- `preferredTripDuration`
- `favouriteDestinations`
- `avoidedDestinations`
- `favouriteActivities`
- `avoidedActivities`
- `createdAt`
- `updatedAt`
- `deletedAt`

Privacy rules:

- One preference profile exists per traveller identity.
- Preferences are private by default and are never public profile data.
- Reads and writes require the traveller identity owner or a privileged system actor.
- Exact traveller location, live location, coordinates, and tracking data are rejected.
- Deletion clears preference arrays and budget/duration details while retaining a
  tombstone for audit-safe lifecycle handling.

Core API:

- `createPreferences`
- `getPreferencesForTraveller`
- `updatePreferences`
- `deletePreferences`
- `getAuditEvents`

The repository is adapter-based so production storage can replace the in-memory
adapter without changing the domain API.
