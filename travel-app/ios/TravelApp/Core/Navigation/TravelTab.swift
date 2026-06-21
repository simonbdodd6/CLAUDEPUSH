import SwiftUI

enum TravelTab: String, CaseIterable, Identifiable, Hashable {
    case home
    case passport
    case timeline
    case story
    case cinematic
    case collections
    case statistics
    case insights
    case highlights
    case search
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .passport: "Passport"
        case .timeline: "Timeline"
        case .story: "Story"
        case .cinematic: "Cinematic"
        case .collections: "Collections"
        case .statistics: "Statistics"
        case .insights: "Insights"
        case .highlights: "Highlights"
        case .search: "Search"
        case .settings: "Settings"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .passport: "person.text.rectangle.fill"
        case .timeline: "clock.fill"
        case .story: "book.pages.fill"
        case .cinematic: "film.stack.fill"
        case .collections: "rectangle.stack.fill"
        case .statistics: "chart.bar.xaxis"
        case .insights: "sparkles"
        case .highlights: "star.fill"
        case .search: "magnifyingglass"
        case .settings: "gearshape.fill"
        }
    }

    var endpoint: String {
        switch self {
        case .home: "/home"
        case .passport: "/passport"
        case .timeline: "/traveller-timeline"
        case .story: "/story"
        case .cinematic: "/cinematic"
        case .collections: "/collections"
        case .statistics: "/statistics"
        case .insights: "/insights"
        case .highlights: "/highlights"
        case .search: "/search"
        case .settings: "local"
        }
    }

    static let primaryTabs: [TravelTab] = [.home, .passport, .timeline, .story, .highlights]
    static let allScreens: [TravelTab] = [.home, .passport, .timeline, .story, .cinematic, .collections, .statistics, .insights, .highlights, .search, .settings]
}

