import Foundation

/// A single, deterministic source of mock contract data for the whole app.
///
/// Every value is fixed and offline — no networking, persistence or randomness.
/// View models in a later phase can depend on this provider to render real
/// layouts against contract-shaped data before any backend is wired, and tests
/// can assert against stable fixtures.
enum MockDTOProvider {
    static let traveller = TravellerDTO.mock
    static let passport = PassportDTO.mock
    static let timeline = TimelineDTO.mock
    static let story = StoryDTO.mock
    static let cinematic = CinematicDTO.mock
    static let statistics = StatisticsDTO.mock
    static let insights = InsightsDTO.mock
    static let highlights = HighlightsDTO.mock
    static let collections = CollectionDTO.mockList
    static let onThisDay = OnThisDayDTO.mock

    /// A bundle of every top-level contract, for surfaces that compose several.
    struct Bundle: Sendable {
        let traveller: TravellerDTO
        let passport: PassportDTO
        let timeline: TimelineDTO
        let story: StoryDTO
        let cinematic: CinematicDTO
        let statistics: StatisticsDTO
        let insights: InsightsDTO
        let highlights: HighlightsDTO
        let collections: [CollectionDTO]
        let onThisDay: OnThisDayDTO
    }

    /// The full mock contract bundle.
    static let bundle = Bundle(
        traveller: traveller,
        passport: passport,
        timeline: timeline,
        story: story,
        cinematic: cinematic,
        statistics: statistics,
        insights: insights,
        highlights: highlights,
        collections: collections,
        onThisDay: onThisDay
    )
}
