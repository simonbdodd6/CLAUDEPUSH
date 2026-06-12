# Destination Platform

Destination domain foundation for the Travel Intelligence Platform.

A Destination is the canonical travel object used by trips, activities,
recommendations, safety notes, marketplace businesses, and future AI planning.

Supported destination types:

- country
- region
- city
- island
- beach
- mountain
- national park
- neighbourhood
- transport hub

This module deliberately does not connect to external APIs, maps, geocoding,
traveller live location, UI, or production storage yet.

Core API:

- `createDestination`
- `updateDestination`
- `activateDestination`
- `pauseDestination`
- `closeDestination`
- `getDestinationById`
- `listDestinationsByCountry`
- `listActiveDestinations`
- `searchDestinationsByName`

The repository is adapter-based so production storage can replace the in-memory
adapter without changing the domain API.

