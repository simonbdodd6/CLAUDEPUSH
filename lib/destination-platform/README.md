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
- town
- neighbourhood
- transport hub

This module deliberately does not connect to external APIs, maps, geocoding,
traveller live location, UI, or production storage yet.

Destinations may be organised into a parent/child hierarchy:

- Indonesia > Bali > Canggu
- Indonesia > Lombok > Kuta Lombok
- Indonesia > Raja Ampat > Mansuar

Hierarchy rules:

- A destination may have one `parentDestinationId`.
- Country destinations are root destinations and cannot have a parent.
- A destination cannot be its own parent.
- Circular parent relationships are rejected.
- Hierarchy validation is handled in the service layer, not in client code.

Destinations may also store broad named `areas`, such as neighbourhood or local
area names. These are descriptive area labels only. They must not contain exact
traveller location, coordinates, live location, or tracking data.

Core API:

- `createDestination`
- `updateDestination`
- `activateDestination`
- `pauseDestination`
- `closeDestination`
- `getDestinationById`
- `listDestinationsByCountry`
- `listActiveDestinations`
- `listChildDestinations`
- `listActiveDestinationsUnderParent`
- `getDestinationBreadcrumbPath`
- `searchDestinationsByName`

The repository is adapter-based so production storage can replace the in-memory
adapter without changing the domain API.
