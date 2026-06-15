# Travel App — iOS (SwiftUI shell, M23.2)

A native SwiftUI client for the Indonesia Travel MVP. It consumes the
`travel-app/api` HTTP API **only** — no platform logic, no business logic, no
repository access. All state changes go through the API; the app renders results.

Design language: **Apple Journal + Flighty + Things 3 + Day One** — clean,
modern, premium, Apple-native (system materials, SF Symbols, large titles,
generous spacing, restrained colour).

## ⚠️ Build environment

This shell was authored outside Xcode (the CI/agent environment has Swift CLT but
not full Xcode), so **it has not been compiled here.** Build & verify in Xcode:

1. Open Xcode 15+, **File ▸ New ▸ Project ▸ iOS App** (SwiftUI lifecycle), name
   it `TravelApp`, then add the files under `TravelApp/` to the target (or point
   the target's sources at this folder).
2. Capabilities: add **Sign in with Apple**. Set a bundle id + your team.
3. Set `APIClient.baseURL` (Settings or `AppConfig`) to your running API, e.g.
   `http://localhost:8787` for dev, or your deployed URL.
4. Run the API: `PORT=8787 TRAVEL_STORE_DIR=./.travel-data node ../api/server.js`.
5. Build & run on a simulator/device → TestFlight via Archive.

## Architecture

```
TravelApp/
  TravelApp.swift     @main App + scene; injects AppState
  AppState.swift      session token + current traveller; auth lifecycle (ObservableObject)
  APIClient.swift     async HTTP client + Codable DTOs — the ONLY integration point
  DesignSystem.swift  colours, typography, spacing, reusable components
  RootView.swift      routes: signed-out -> SignInView, signed-in -> MainTabView
  MainTabView.swift   tab navigation + placeholder screens (Trip/Itinerary/Capture/Settings)
  Screens/
    SignInView.swift  Sign in with Apple (wired)
    TodayView.swift   today overview (wired)
```

## Wiring status (incremental, per milestone)

- ✅ Shell: App, AppState, APIClient, DesignSystem, RootView, MainTabView.
- ✅ Wired: **Sign In** (`POST /auth/apple`), **Today** (`GET /today`).
- ⏳ Next: Timeline (`GET /timeline`), Itinerary (`GET/PUT /itinerary`),
  Capture (`POST /capture`), Trip (`GET/PUT /trip`), Settings.

## Principles

- The app calls the API; it never imports or re-implements platform logic.
- Offline-first comes next (local cache + queued mutations); the shell already
  centralises all I/O in `APIClient` so caching slots in behind it.
- No AI screens (V2). No maps, bookings, companions, recommendations (V2).
