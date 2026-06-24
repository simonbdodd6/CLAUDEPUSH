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
    Dependencies/
      AppContainer.swift              centralized mock repository composition root
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
      APIContracts.swift              DTO foundation: TravelDTO, DTOPreviewProviding, DTOMeta
      TravellerDTO.swift              root traveller profile + summary
      PassportDTO.swift               completion, stamps and stats
      TimelineDTO.swift               year-grouped travel events
      StoryDTO.swift                  collections and story drafts
      CinematicDTO.swift              reels and memory scenes
      StatisticsDTO.swift             keyed travel metrics
      InsightsDTO.swift               reason-code insight cards
      HighlightsDTO.swift             standout moments and achievements
      CollectionDTO.swift             standalone memory collection
      OnThisDayDTO.swift              same-day memories across years
      MockDTOProvider.swift           single deterministic mock data source
    Repositories/
      TravellerRepository.swift       traveller protocol + mock implementation
      PassportRepository.swift        passport protocol + mock implementation
      TimelineRepository.swift        timeline protocol + mock implementation
      StoryRepository.swift           story protocol + mock implementation
      CinematicRepository.swift       cinematic protocol + mock implementation
      StatisticsRepository.swift      statistics protocol + mock implementation
      InsightsRepository.swift        insights protocol + mock implementation
      HighlightsRepository.swift      highlights protocol + mock implementation
      CollectionsRepository.swift     collections protocol + mock implementation
      OnThisDayRepository.swift       anniversary protocol + mock implementation
    ViewModels/
      TravellerViewModel.swift        root traveller presentation adapter
      PassportViewModel.swift         passport DTO mapping and display state
      TimelineViewModel.swift         timeline and traveller presentation mapping
      StoryViewModel.swift            story shelf presentation mapping
      CinematicViewModel.swift        reel and scene presentation mapping
      StatisticsViewModel.swift       keyed metric presentation mapping
      InsightsViewModel.swift         reason-code insight presentation mapping
      HighlightsViewModel.swift       moments and achievements presentation mapping
      CollectionsViewModel.swift      collection shelf presentation mapping
      OnThisDayViewModel.swift        anniversary presentation mapping
      SearchViewModel.swift           deterministic local search mapping
      SettingsViewModel.swift         profile and archive presentation mapping
    Navigation/
      RootFlowView.swift              app entry gate: launch → onboarding → ready
      RootShellView.swift             tab shell + Explore hub (registry-driven)
      TravelTab.swift                 screen identity and endpoint metadata
      FeatureRegistry.swift           feature metadata + composition source of truth
      TravelRoute.swift               deep-link-ready route definitions
      NavigationCoordinator.swift     observable navigation source of truth
      FutureFeature.swift             future-feature placeholder definitions
      FeatureNavigationGrid.swift     registry-driven Explore feature grid
  Features/
    Onboarding/
      LaunchScreen.swift              animated launch / splash
      OnboardingView.swift            paged onboarding + welcome flow
      OnboardingComponents.swift      pages, primers, dots, brand mark, buttons
    ComingSoon/
      ComingSoonScreen.swift          placeholder destination for future features
    Home/
    Passport/
    Timeline/
      TimelineComponents.swift        timeline hero, year groups, cards and empty state
    Story/
      StoryComponents.swift           story composer cards, clusters and empty state
    Cinematic/
      CinematicComponents.swift       film reels, memory scenes, moods and empty state
    Collections/
      CollectionsComponents.swift     gallery, theme, detail and statistic cards
    Statistics/
      StatisticsComponents.swift      footprint, coverage, velocity and milestone cards
    Insights/
      InsightsComponents.swift        pattern, trend, seasonality and insight cards
    Highlights/
      HighlightsComponents.swift      moment, achievement, country and memory cards
    OnThisDay/
      OnThisDayComponents.swift       anniversary, historical, year-in-review cards
    Search/
      SearchComponents.swift          destinations, suggestions, results and search stats
    Settings/
      SettingsComponents.swift        profile, preferences, archive and app information
```

## Architecture

- SwiftUI lifecycle. App entry is `RootFlowView`, which gates an animated
  launch screen and a multi-page onboarding flow before `RootShellView`
  (in-memory flow state only; nothing persisted).
- MVVM using `@Observable` view models. Phase 19 centralises feature adapters in
  `Core/ViewModels`; each owns immutable DTO input resolved through the shared
  dependency container and exposes presentation-ready computed values.
- Views are presentation-only.
- Feature folders own screen-specific shells.
- Shared presentation primitives live in `Core/Components`.
- Backend contracts are represented as inert `Codable` DTO shells only.
- No API client is implemented in this phase.

### ViewModel layer

The Phase 19 ViewModel layer sits between inert DTO contracts and SwiftUI
screens. Feature screens retain their existing layouts and bindings while
their data mapping lives in one corresponding `Core/ViewModels` type.

- Inputs are immutable DTO values resolved from injected repositories.
- Default dependencies come from `AppContainer.mock`.
- Computed properties perform deterministic formatting, filtering and
  presentation mapping.
- No ViewModel performs I/O, persistence, navigation or backend work.
- Initializer injection keeps mappings independently testable without coupling
  presentation code to a concrete data source.

### Repository layer

Phase 20 inserts a narrow repository boundary between ViewModels and the
deterministic fixture provider:

```
ViewModels → AppContainer → Repository protocols → Mock repositories → MockDTOProvider
```

Each DTO domain has one read-only repository protocol and one immutable mock
implementation. ViewModels accept repository protocols through initializer
injection and retain the same DTO-backed presentation outputs as Phase 19.
Only mock implementations can access `MockDTOProvider`; there are no live
repositories, API clients, persistence stores or side effects.

### Dependency container

Phase 21 centralises dependency composition in `AppContainer`. The container
stores all ten repository protocols and exposes one deterministic `.mock`
registration set. Every ViewModel accepts an `AppContainer`, defaulting to that
mock composition, then reads only the repositories it needs.

```
Views → ViewModels → AppContainer → Repository protocols
      → Mock repositories → MockDTOProvider
```

This keeps feature screens unchanged, removes concrete repository construction
from ViewModels and provides one composition root for future dependency sets.

## Navigation

The navigation architecture (Phase 11) separates four concerns:

- `TravelTab` — stable identity and display metadata (title, symbol, API
  `endpoint`) for each built screen.
- `FeatureRegistry` — the single source of truth for navigation composition.
  `FeatureMetadata` describes every surface (`primary`, `explore`, `future`)
  with its `availability`, and views read filtered slices instead of embedding
  hard-coded screen lists.
- `TravelRoute` — deep-link-ready, value-type routes that parse from and
  serialise to `travelintelligence://…` URLs using only local string work. No
  networking is performed.
- `NavigationCoordinator` — an `@Observable` single source of truth for tab
  selection and navigation context, exposing intent methods (`select`, `open`,
  `handle(url:)`). `TravelAppState` owns one coordinator.

The primary tab bar (Home, Passport, Timeline, Story, Explore) is composed from
`FeatureRegistry.primary`. The Explore hub renders `FeatureRegistry.explore`:
the built secondary surfaces (Cinematic, Collections, Statistics, Insights,
Highlights, On This Day, Search, Settings) followed by registered future-feature
placeholders, which route to `ComingSoonScreen`.

Deep-link `endpoint` strings remain present for existing API contracts; they
are display metadata only in the current visual phases.

## Design system

- `TravelTheme`: palette, background and semantic accent colours.
- `TravelTypography`: rounded Apple-native display, title, section and caption
  styles.
- `TravelMotion`: named animation tokens for future transitions.
- `GlassCard`: reusable material-backed card.
- `ScreenHero`: large premium first-viewport surface.
- `PremiumSection`: consistent section rhythm.
- `FeatureHeroScaffold`: the shared cinematic hero used by every feature hero
  card. Each feature supplies its gradient, eyebrow, copy, metrics and a
  decorative texture; the scaffold owns the layout, typography and spacing.
- `HeroMetric`/`HeroMetricTile`: the value/label metric model and its
  white-on-glass tile rendered in each hero's metric row.
- `FeatureEmptyState`: the shared icon/title/message/pill empty state used by
  every feature surface (symbol, accent, title, message and pill are supplied).
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
- `StoryHeroCard`, `StoryCollectionCard`, `StoryDraftCard`, `StoryThemeCard`,
  `MemoryClusterCard`, `StoryStatisticCard` and `StoryEmptyState`: static
  Phase 5 story composer components.
- `CinematicHeroCard`, `FilmReelCard`, `MemorySceneCard`,
  `DestinationMoodCard`, `CinematicMomentRow`, `CinematicStatisticCard` and
  `CinematicEmptyState`: static Phase 6 cinematic travel components.
- `InsightsHeroCard`, `TravelPatternCard`, `DestinationTrendCard`,
  `SeasonalityCard`, `JourneyInsightCard`, `InsightRecommendationCard` and
  `InsightsEmptyState`: static Phase 8 traveller insights components.
- `HighlightsHeroCard`, `HighlightMomentCard`, `AchievementHighlightCard`,
  `CountryHighlightCard`, `TravelMemoryCard` and `HighlightsEmptyState`:
  static Phase 9 traveller highlights components.
- `CollectionHeroCard`, `CollectionGalleryCard`, `CollectionThemeCard`,
  `CollectionDetailPreviewCard`, `CollectionStatisticCard` and
  `CollectionsEmptyState`: static Phase 13 collections components. The gallery
  binds to `CollectionDTO` via `MockDTOProvider.collections`.
- `OnThisDayHeroCard`, `AnniversaryMomentCard`, `HistoricalMemoryCard`,
  `YearInReviewCard`, `TravelAnniversaryCard`, `OnThisDayStatisticCard` and
  `OnThisDayEmptyState`: static Phase 14 On This Day components. The screen
  binds to `OnThisDayDTO` via `MockDTOProvider.onThisDay`, deriving hero
  metrics and today's memories from the DTO.
- `StatisticsHeroCard`, `CountryCountCard`, `ContinentCoverageCard`,
  `TravelVelocityCard`, `JourneyDistanceCard`, `MilestoneStatisticCard` and
  `StatisticsEmptyState`: static Phase 16 traveller statistics components. The
  screen binds to `StatisticsDTO` via `MockDTOProvider.statistics`, keeping
  keyed-metric mapping and deterministic display ratios in the view layer. It
  composes the existing `TravelPatternCard` for fixed archive observations.
- `SearchHeroCard`, `RecentDestinationCard`, `SearchSuggestionCard`,
  `SearchCategoryCard`, `SearchResultPreviewCard`, `SearchStatisticCard` and
  `SearchEmptyState`: static Phase 17 search components. The screen composes
  existing Timeline, Story, Collection, Highlights and Traveller DTO fixtures
  through `MockDTOProvider`; local matching remains deterministic presentation
  logic and does not introduce a search contract or backend dependency.
- `SettingsHeroCard`, `TravellerProfileCard`, `PreferenceCategoryCard`,
  `TravelArchiveCard`, `AppInformationCard`, `SettingsStatisticCard` and
  `SettingsEmptyState`: static Phase 18 settings components. The screen
  composes existing Traveller, Passport, Statistics and Collection fixtures
  through `MockDTOProvider`. Preference cards are read-only presentation
  statuses, so the feature introduces no persistence or configuration storage.
- `LaunchScreen`, `OnboardingView`, `OnboardingPageView`,
  `OnboardingValuePrimerRow`, `OnboardingWelcomeCard`, `OnboardingProgressDots`,
  `LaunchBrandMark` and `OnboardingPrimaryButton`/`OnboardingSecondaryButton`:
  static Phase 15 launch & onboarding components. `RootFlowView` gates app
  entry through launch → onboarding → ready with in-memory state only.

### Phase 10 design-system pass

Every feature hero card (`TimelineHeroCard`, `StoryHeroCard`,
`CinematicHeroCard`, `InsightsHeroCard`, `HighlightsHeroCard`) and every feature
empty state (`PassportEmptyState`, `TimelineEmptyState`, `StoryEmptyState`,
`CinematicEmptyState`, `InsightsEmptyState`, `HighlightsEmptyState`) now
delegates to the shared `FeatureHeroScaffold` and `FeatureEmptyState`
primitives. The previously duplicated per-feature metric tiles
(`InsightsHeroMetric`, `HighlightsHeroMetric`, `CinematicHeroMetric`,
`StoryHeroMetric`, `TimelineMetricPill`) were removed in favour of a single
`HeroMetricTile`. Public component names, layouts and visuals are unchanged;
only the duplicated implementation was consolidated. Decorative hero textures
remain private to each feature so each surface keeps its own character.

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
        StoryHeroCard
        StoryCollectionCard
        StoryDraftCard
        MemoryClusterCard
        StoryThemeCard
        StoryStatisticCard
        StoryEmptyState
      CinematicScreen
        CinematicHeroCard
        FilmReelCard
        MemorySceneCard
        DestinationMoodCard
        CinematicMomentRow
        CinematicStatisticCard
        CinematicEmptyState
      InsightsScreen
        InsightsHeroCard
        TravelPatternCard
        DestinationTrendCard
        SeasonalityCard
        JourneyInsightCard
        InsightRecommendationCard
        InsightsEmptyState
      HighlightsScreen
        HighlightsHeroCard
        HighlightMomentCard
        AchievementHighlightCard
        CountryHighlightCard
        TravelMemoryCard
        HighlightsEmptyState
      CollectionsScreen
        CollectionHeroCard
        CollectionGalleryCard
        CollectionDetailPreviewCard
        CollectionThemeCard
        CollectionStatisticCard
        CollectionsEmptyState
      StatisticsScreen
        StatisticsHeroCard
        CountryCountCard
        ContinentCoverageCard
        MilestoneStatisticCard
        TravelVelocityCard
        JourneyDistanceCard
        TravelPatternCard
        StatisticsSummaryCard
        StatisticsEmptyState
      SearchScreen
        SearchHeroCard
        RecentDestinationCard
        SearchSuggestionCard
        SearchCategoryCard
        SearchResultPreviewCard
        SearchStatisticCard
        SearchEmptyState
      SettingsScreen
        SettingsHeroCard
        TravellerProfileCard
        PreferenceCategoryCard
        TravelArchiveCard
        AppInformationCard
        SettingsStatisticCard
        SettingsEmptyState
      OnThisDayScreen
        OnThisDayHeroCard
        AnniversaryMomentCard
        TravelAnniversaryCard
        HistoricalMemoryCard
        YearInReviewCard
        OnThisDayStatisticCard
        OnThisDayEmptyState
      MoreScreensHub
        FeatureNavigationGrid
          FeatureCard
          FeatureDestinationView / ComingSoonScreen
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
