import Foundation

// MARK: - Asynchronous repository interfaces (Phase 40)
//
// Each repository already vends a deterministic value synchronously. These
// async methods establish the asynchronous loading seam WITHOUT introducing any
// networking: the default implementations simply return the existing
// deterministic value. A future live repository can override them with real,
// awaited I/O while the mock repositories continue to resolve deterministically.

extension TravellerRepository {
    func loadTraveller() async throws -> TravellerDTO { traveller }
}

extension PassportRepository {
    func loadPassport() async throws -> PassportDTO { passport }
}

extension TimelineRepository {
    func loadTimeline() async throws -> TimelineDTO { timeline }
}

extension StoryRepository {
    func loadStory() async throws -> StoryDTO { story }
}

extension CinematicRepository {
    func loadCinematic() async throws -> CinematicDTO { cinematic }
}

extension StatisticsRepository {
    func loadStatistics() async throws -> StatisticsDTO { statistics }
}

extension InsightsRepository {
    func loadInsights() async throws -> InsightsDTO { insights }
}

extension HighlightsRepository {
    func loadHighlights() async throws -> HighlightsDTO { highlights }
}

extension CollectionsRepository {
    func loadCollections() async throws -> [CollectionDTO] { collections }
}

extension OnThisDayRepository {
    func loadOnThisDay() async throws -> OnThisDayDTO { onThisDay }
}
