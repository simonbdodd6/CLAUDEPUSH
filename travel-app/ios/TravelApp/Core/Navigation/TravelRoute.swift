import Foundation

/// Typed, deterministic address space for every current app destination.
///
/// Routes contain identity only. They perform no I/O and can be converted to
/// local deep-link paths without resolving an external service.
enum TravelRoute: Hashable, Identifiable {
    case home
    case passport
    case timeline
    case story
    case explore
    case cinematic
    case collections
    case statistics
    case insights
    case highlights
    case onThisDay
    case search
    case settings
    case comingSoon(FutureFeature)

    static let scheme = "travelintelligence"

    /// Every currently built route in stable navigation order.
    static let current: [TravelRoute] = [
        .home,
        .passport,
        .timeline,
        .story,
        .explore,
        .cinematic,
        .collections,
        .statistics,
        .insights,
        .highlights,
        .onThisDay,
        .search,
        .settings
    ]

    var id: String { path }

    /// The built feature represented by this route, if one exists.
    var tab: TravelTab? {
        switch self {
        case .home: .home
        case .passport: .passport
        case .timeline: .timeline
        case .story: .story
        case .explore: .explore
        case .cinematic: .cinematic
        case .collections: .collections
        case .statistics: .statistics
        case .insights: .insights
        case .highlights: .highlights
        case .onThisDay: .onThisDay
        case .search: .search
        case .settings: .settings
        case .comingSoon: nil
        }
    }

    /// Root tab selected when this route is opened.
    var rootTab: TravelTab {
        guard let tab else { return .explore }
        return FeatureRegistry.primaryTabSet.contains(tab) ? tab : .explore
    }

    /// Canonical, slash-prefixed path for this route.
    var path: String {
        switch self {
        case .comingSoon(let feature): "/coming-soon/\(feature.rawValue)"
        default: tab?.routePath ?? "/explore"
        }
    }

    /// Locally constructed deep-link URL. It is never fetched.
    var url: URL? {
        URL(string: "\(Self.scheme):/\(path)")
    }

    init(tab: TravelTab) {
        switch tab {
        case .home: self = .home
        case .passport: self = .passport
        case .timeline: self = .timeline
        case .story: self = .story
        case .explore: self = .explore
        case .cinematic: self = .cinematic
        case .collections: self = .collections
        case .statistics: self = .statistics
        case .insights: self = .insights
        case .highlights: self = .highlights
        case .onThisDay: self = .onThisDay
        case .search: self = .search
        case .settings: self = .settings
        }
    }

    /// Parse a route from a canonical path.
    init?(path raw: String) {
        let trimmed = raw.hasPrefix("/") ? String(raw.dropFirst()) : raw
        let components = trimmed.split(separator: "/").map(String.init)
        guard let first = components.first, !first.isEmpty else { return nil }

        if first == "coming-soon" {
            guard components.count >= 2, let feature = FutureFeature(rawValue: components[1]) else { return nil }
            self = .comingSoon(feature)
            return
        }

        guard let tab = TravelTab.matching(path: first) else { return nil }
        self.init(tab: tab)
    }

    /// Parse a route from a local `travelintelligence://` URL.
    init?(url: URL) {
        guard url.scheme == Self.scheme else { return nil }
        let host = url.host.map { "/\($0)" } ?? ""
        self.init(path: host + url.path)
    }
}

extension TravelTab {
    var route: TravelRoute { TravelRoute(tab: self) }

    /// Canonical route path, distinct from the backend endpoint metadata.
    var routePath: String { "/\(rawValue)" }

    static func matching(path component: String) -> TravelTab? {
        let slug = component.split(separator: "/").last.map(String.init) ?? component
        return TravelTab(rawValue: slug)
    }
}
