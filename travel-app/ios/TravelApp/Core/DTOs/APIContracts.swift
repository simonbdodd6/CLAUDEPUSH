import Foundation

protocol TravelAPIContract: Decodable {}

struct HomeDTO: TravelAPIContract {
    let version: String?
    let hasMemories: Bool?
}

struct PassportDTO: TravelAPIContract {
    let version: String
    let hasPassport: Bool
}

struct TravellerTimelineDTO: TravelAPIContract {
    let version: String
    let entries: [TimelineEntry]

    struct TimelineEntry: Decodable, Identifiable {
        let id: String
        let type: String
        let title: String
        let date: String
    }
}

struct StoryDTO: TravelAPIContract {
    let story: StorySummary

    struct StorySummary: Decodable {
        let chapterCount: Int
        let momentCount: Int
    }
}

struct CinematicDTO: TravelAPIContract {
    let cinematicId: String
    let scenes: [Scene]

    struct Scene: Decodable, Identifiable {
        let id: String
        let type: String
        let title: String
    }
}

struct CollectionsDTO: TravelAPIContract {
    let collections: [Collection]

    struct Collection: Decodable, Identifiable {
        let id: String
        let title: String
        let type: String
    }
}

struct StatisticsDTO: TravelAPIContract {
    let version: String
    let hasStatistics: Bool
}

struct InsightsDTO: TravelAPIContract {
    let version: String
    let hasInsights: Bool
}

struct HighlightsDTO: TravelAPIContract {
    let version: String
    let hasHighlights: Bool
}

struct SearchDTO: TravelAPIContract {
    let version: String?
    let query: String?
}

