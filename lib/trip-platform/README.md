# Trip Platform

Trip domain foundation for the Travel Intelligence Platform.

A Trip is the traveller-owned container for destination, approximate area,
dates, privacy, activities, recommendations, safety context, and future AI
planning.

This module deliberately does not connect to authentication providers, real
databases, UI, exact live location, activities, or recommendations yet.

Core API:

- `createTrip`
- `updateTrip`
- `changeTripDates`
- `changeTripDestination`
- `changeTripVisibility`
- `startTrip`
- `completeTrip`
- `cancelTrip`
- `getTripById`
- `listTripsForIdentity`

The repository is adapter-based so production storage can replace the in-memory
adapter without changing the domain API.

