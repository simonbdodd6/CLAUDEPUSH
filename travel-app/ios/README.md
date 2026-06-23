# Travel Intelligence iOS — SwiftUI Foundation

Native SwiftUI foundation for the Travel Intelligence app. This phase is visual
and architectural only: no authentication, no networking, no persistence, no
maps, and no business logic. Baseline: Xcode 15+ / iOS 17+ for Swift
Observation.

Design target: Apple Photos, Flighty, Day One, Polarsteps, Airbnb and Spotify
Wrapped. Large typography, glass, depth, whitespace, route-like textures and
premium cards.

## Folder structure

```
TravelApp/
  App/
    TravelIntelligenceApp.swift       app entry + root app state
  Core/
    Components/
      DashboardCards.swift            home cards and dashboard primitives
      PassportComponents.swift        passport cover, stamps, stats and empty state
      PremiumComponents.swift         glass cards, heroes, sections, grid
      FeatureShell.swift              reusable empty feature surface
    DesignSystem/
      TravelTheme.swift               colour palette, spacing, radius
      TravelTypography.swift          type scale
      TravelMotion.swift              motion tokens only
    DTOs/
      APIContracts.swift              Codable shells matching existing endpoints
    Navigation/
      RootShellView.swift             tab shell + more hub
      TravelTab.swift                 screen registry and endpoint mapping
  Features/
    Home/
    Passport/
    Timeline/
      TimelineComponents.swift        timeline hero, year groups, cards and empty state
    Story/
    Cinematic/
    Collections/
    Statistics/
    Insights/
    Highlights/
    Search/
    Settings/
```

## Architecture

- SwiftUI lifecycle.
- MVVM using `@Observable` view models.
- Views are presentation-only.
- Feature folders own screen-specific shells.
- Shared presentation primitives live in `Core/Components`.
- Backend contracts are represented as inert `Codable` DTO shells only.
- No API client is implemented in this phase.

## Navigation

`TravelTab` is the single screen registry. The primary tab bar exposes Home,
Passport, Timeline, Story and an Explore hub. Explore links to Cinematic,
Collections, Statistics, Insights, Highlights, Search and Settings.

Deep-link-ready endpoint strings are present for existing API contracts, but
they are display metadata only in the current visual phases.

## Design system

- `TravelTheme`: palette, background and semantic accent colours.
- `TravelTypography`: rounded Apple-native display, title, section and caption
  styles.
- `TravelMotion`: named animation tokens for future transitions.
- `GlassCard`: reusable material-backed card.
- `ScreenHero`: large premium first-viewport surface.
- `PremiumSection`: consistent section rhythm.
- `TripMemoryCard`, `PassportProgressCard`, `TimelinePreviewRow`,
  `HighlightCard`, `InsightCard` and `CinematicCTACard`: static Phase 2
  dashboard components.
- `MapTexturePlaceholder`: decorative route texture, not MapKit.
- `PassportCoverCard`, `CompletionRing`, `PassportStatTile`/`PassportStatGrid`,
  `PassportStyleCard`, `PassportStampCell`/`PassportStampGrid`,
  `PassportMomentRow` and `PassportEmptyState`: static Phase 3 premium passport
  components. `CompletionRing` is a drawn progress ring, not a chart library.
- `TimelineHeroCard`, `TimelineYearHeader`, `TimelineEventCard`,
  `JourneyMilestoneCard`, `TravelMomentRow` and `TimelineEmptyState`: static
  Phase 4 traveller timeline components.

## Component hierarchy

```
TravelIntelligenceApp
  RootShellView
    TabView
      HomeScreen
        HomeHeroHeader
        TripMemoryCard
        PassportProgressCard
        TimelinePreviewRow
        HighlightCard
        InsightCard
        CinematicCTACard
      PassportScreen
        PassportCoverCard
        PassportStatGrid
        PassportStyleCard
        PassportStampGrid
        PassportMomentRow
        PassportEmptyState
      TimelineScreen
        TimelineHeroCard
        JourneyMilestoneCard
        TimelineYearHeader
        TimelineEventCard
        TravelMomentRow
        TimelineEmptyState
      StoryScreen
      MoreScreensHub
        FeatureLinkGrid
          FeatureDestinationView
```

## Phase boundaries

Not included yet:

- Authentication
- Networking
- Persistence
- Offline cache
- MapKit
- Real animations beyond motion tokens
- Business logic
- Backend model invention

Build in Xcode 15+ by creating an iOS SwiftUI app target and adding the
`TravelApp/` source folder to the target.
