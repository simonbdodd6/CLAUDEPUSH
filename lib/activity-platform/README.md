# Activity Platform

Activity domain foundation for the Travel Intelligence Platform.

An Activity is a canonical travel object that belongs to a Destination. It may
represent things like surfing, diving, hiking, food experiences, cultural
activities, wildlife trips, nightlife, wellness, shopping, photography, family
activities, transport experiences, or other destination-specific things to do.

This module is intentionally independent from Coach's Eye and from production
authentication, maps, payments, geocoding, and external providers.

Core fields:

- `activityId`
- `destinationId`
- `ownerIdentityId`
- `name`
- `description`
- `categories`
- `difficulty`
- `duration`
- `estimatedCostRange`
- `seasonality`
- `ageRestrictions`
- `weatherSensitivity`
- `environment`
- `status`
- `visibility`
- `createdAt`
- `updatedAt`

Privacy rules:

- Activities reference destinations by ID only.
- Activities must not store exact traveller location, live location,
  coordinates, or tracking data.
- Private activities are visible only to their owner or privileged actors.
- Public active activities can be listed for discovery.

Core API:

- `createActivity`
- `updateActivity`
- `activateActivity`
- `deactivateActivity`
- `changeActivityVisibility`
- `getActivityById`
- `listActivitiesByDestination`
- `listActiveActivitiesByDestination`
- `listActivitiesForOwner`
- `searchActivitiesByName`

The repository is adapter-based so production storage can replace the in-memory
adapter without changing the domain API.
