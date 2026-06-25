import Foundation

/// Central composition root for app-wide dependencies.
///
/// The current app registers deterministic mock repositories only. Future
/// repository implementations can be composed here without changing
/// ViewModels, DTOs or feature screens.
struct AppContainer {
    let travellerRepository: any TravellerRepository
    let passportRepository: any PassportRepository
    let timelineRepository: any TimelineRepository
    let storyRepository: any StoryRepository
    let cinematicRepository: any CinematicRepository
    let statisticsRepository: any StatisticsRepository
    let insightsRepository: any InsightsRepository
    let highlightsRepository: any HighlightsRepository
    let collectionsRepository: any CollectionsRepository
    let onThisDayRepository: any OnThisDayRepository

    init(
        travellerRepository: any TravellerRepository,
        passportRepository: any PassportRepository,
        timelineRepository: any TimelineRepository,
        storyRepository: any StoryRepository,
        cinematicRepository: any CinematicRepository,
        statisticsRepository: any StatisticsRepository,
        insightsRepository: any InsightsRepository,
        highlightsRepository: any HighlightsRepository,
        collectionsRepository: any CollectionsRepository,
        onThisDayRepository: any OnThisDayRepository
    ) {
        self.travellerRepository = travellerRepository
        self.passportRepository = passportRepository
        self.timelineRepository = timelineRepository
        self.storyRepository = storyRepository
        self.cinematicRepository = cinematicRepository
        self.statisticsRepository = statisticsRepository
        self.insightsRepository = insightsRepository
        self.highlightsRepository = highlightsRepository
        self.collectionsRepository = collectionsRepository
        self.onThisDayRepository = onThisDayRepository
    }

    static func mock() -> AppContainer {
        AppContainer(
            travellerRepository: MockTravellerRepository(),
            passportRepository: MockPassportRepository(),
            timelineRepository: MockTimelineRepository(),
            storyRepository: MockStoryRepository(),
            cinematicRepository: MockCinematicRepository(),
            statisticsRepository: MockStatisticsRepository(),
            insightsRepository: MockInsightsRepository(),
            highlightsRepository: MockHighlightsRepository(),
            collectionsRepository: MockCollectionsRepository(),
            onThisDayRepository: MockOnThisDayRepository()
        )
    }

    func makeTravellerViewModel() -> TravellerViewModel {
        TravellerViewModel(repository: travellerRepository)
    }

    func makePassportViewModel() -> PassportViewModel {
        PassportViewModel(repository: passportRepository)
    }

    func makeTimelineViewModel() -> TimelineViewModel {
        TimelineViewModel(
            timelineRepository: timelineRepository,
            travellerRepository: travellerRepository
        )
    }

    func makeStoryViewModel() -> StoryViewModel {
        StoryViewModel(
            storyRepository: storyRepository,
            travellerRepository: travellerRepository
        )
    }

    func makeCinematicViewModel() -> CinematicViewModel {
        CinematicViewModel(repository: cinematicRepository)
    }

    func makeStatisticsViewModel() -> StatisticsViewModel {
        StatisticsViewModel(repository: statisticsRepository)
    }

    func makeInsightsViewModel() -> InsightsViewModel {
        InsightsViewModel(repository: insightsRepository)
    }

    func makeHighlightsViewModel() -> HighlightsViewModel {
        HighlightsViewModel(repository: highlightsRepository)
    }

    func makeCollectionsViewModel() -> CollectionsViewModel {
        CollectionsViewModel(repository: collectionsRepository)
    }

    func makeOnThisDayViewModel() -> OnThisDayViewModel {
        OnThisDayViewModel(repository: onThisDayRepository)
    }

    func makeSearchViewModel() -> SearchViewModel {
        SearchViewModel(
            travellerRepository: travellerRepository,
            timelineRepository: timelineRepository,
            storyRepository: storyRepository,
            collectionsRepository: collectionsRepository,
            highlightsRepository: highlightsRepository
        )
    }

    func makeSettingsViewModel() -> SettingsViewModel {
        SettingsViewModel(
            travellerRepository: travellerRepository,
            passportRepository: passportRepository,
            statisticsRepository: statisticsRepository,
            collectionsRepository: collectionsRepository
        )
    }
}
