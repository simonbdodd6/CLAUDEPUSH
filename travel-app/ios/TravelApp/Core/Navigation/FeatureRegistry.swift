import SwiftUI

/// Where a feature sits in the app's navigation structure.
enum FeatureCategory: String, Hashable {
    /// A root tab in the primary tab bar.
    case primary
    /// A secondary surface reached through the Explore hub.
    case explore
    /// A registered placeholder for a not-yet-built feature.
    case future
}

/// Whether a registered feature has a real screen yet.
enum FeatureAvailability: Hashable {
    case available
    case comingSoon
}

/// Declarative metadata for a single feature surface. This is the single
/// description the rest of the app reads from — tab bar, Explore hub, deep
/// links and screen titles all derive from registry metadata rather than
/// hard-coded lists scattered across views.
struct FeatureMetadata: Identifiable, Hashable {
    let id: String
    let title: String
    let symbol: String
    let summary: String
    let route: TravelRoute
    let category: FeatureCategory
    let availability: FeatureAvailability
    /// The backing `TravelTab` for built screens; `nil` for future placeholders.
    let tab: TravelTab?

    /// Short caption shown on feature cards: the API endpoint for built
    /// screens, or a "coming soon" hint for placeholders.
    var caption: String {
        switch availability {
        case .available: tab?.endpoint ?? route.path
        case .comingSoon: "Coming soon"
        }
    }

    /// Build metadata for an existing tab-backed screen.
    static func screen(_ tab: TravelTab, category: FeatureCategory, summary: String) -> FeatureMetadata {
        FeatureMetadata(
            id: tab.rawValue,
            title: tab.title,
            symbol: tab.symbol,
            summary: summary,
            route: tab.route,
            category: category,
            availability: .available,
            tab: tab
        )
    }

    /// Build metadata for a future-feature placeholder.
    static func placeholder(_ feature: FutureFeature) -> FeatureMetadata {
        FeatureMetadata(
            id: "future-\(feature.rawValue)",
            title: feature.title,
            symbol: feature.symbol,
            summary: feature.summary,
            route: .comingSoon(feature),
            category: .future,
            availability: .comingSoon,
            tab: nil
        )
    }
}

/// The canonical, declarative registry of every feature in the app.
///
/// This is the architecture's source of truth for navigation composition.
/// Views read filtered slices (`primary`, `explore`) instead of embedding
/// their own screen lists, so adding or reordering a feature is a one-line
/// change here.
enum FeatureRegistry {
    /// Root tabs, in tab-bar order.
    static let primary: [FeatureMetadata] = [
        .screen(.home, category: .primary, summary: "Your travel life at a glance."),
        .screen(.passport, category: .primary, summary: "Stamps, milestones and reach."),
        .screen(.timeline, category: .primary, summary: "A year-by-year travel history."),
        .screen(.story, category: .primary, summary: "Journeys composed into stories."),
        .screen(.explore, category: .primary, summary: "Deeper surfaces and future features.")
    ]

    /// Built secondary surfaces reached through the Explore hub.
    static let exploreAvailable: [FeatureMetadata] = [
        .screen(.cinematic, category: .explore, summary: "Your travels as a film reel."),
        .screen(.collections, category: .explore, summary: "Deterministic memory collections."),
        .screen(.statistics, category: .explore, summary: "Counts, totals and travel patterns."),
        .screen(.insights, category: .explore, summary: "Reason-code travel insights."),
        .screen(.highlights, category: .explore, summary: "The best of your travels."),
        .screen(.search, category: .explore, summary: "Find journeys, places and memories."),
        .screen(.settings, category: .explore, summary: "Appearance and local preferences.")
    ]

    /// Registered placeholders for future features.
    static let future: [FeatureMetadata] = FutureFeature.allCases.map(FeatureMetadata.placeholder)

    /// Everything the Explore hub presents: built surfaces, then placeholders.
    static let explore: [FeatureMetadata] = exploreAvailable + future

    /// Every registered feature across all categories.
    static let all: [FeatureMetadata] = primary + exploreAvailable + future

    /// The set of tabs that are root entries in the primary tab bar.
    static let primaryTabSet: Set<TravelTab> = Set(primary.compactMap(\.tab))

    /// Tabs in primary tab-bar order.
    static var primaryTabs: [TravelTab] { primary.compactMap(\.tab) }

    /// Look up metadata for a built tab.
    static func metadata(for tab: TravelTab) -> FeatureMetadata? {
        all.first { $0.tab == tab }
    }
}
