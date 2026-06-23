import Foundation

/// Deep-link-ready, value-type description of a navigable destination.
///
/// Routes are deterministic and offline: they parse from and serialise to a
/// custom-scheme URL (`travelintelligence://…`) using only local string work.
/// No networking, no `URLSession`, no external resolution is performed — this
/// type is purely the address space the app is ready to navigate when a later
/// phase wires real deep links, universal links or restoration state.
enum TravelRoute: Hashable {
    /// A first-class feature screen backed by an existing `TravelTab`.
    case feature(TravelTab)
    /// A registered but not-yet-built future feature placeholder.
    case comingSoon(FutureFeature)

    /// Custom URL scheme reserved for in-app deep links.
    static let scheme = "travelintelligence"

    /// Canonical, slash-prefixed path for this route (e.g. `/passport`).
    var path: String {
        switch self {
        case .feature(let tab): tab.routePath
        case .comingSoon(let feature): "/coming-soon/\(feature.rawValue)"
        }
    }

    /// A shareable deep-link URL for this route, e.g.
    /// `travelintelligence://passport`. Constructed locally; never fetched.
    var url: URL? {
        URL(string: "\(Self.scheme):/\(path)")
    }

    /// Parse a route from a canonical path such as `/passport` or
    /// `/coming-soon/companions`. Returns `nil` for unknown paths.
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
        self = .feature(tab)
    }

    /// Parse a route from a `travelintelligence://` deep-link URL.
    init?(url: URL) {
        guard url.scheme == Self.scheme else { return nil }
        let host = url.host.map { "/\($0)" } ?? ""
        self.init(path: host + url.path)
    }
}

extension TravelTab {
    /// Canonical app route for this tab.
    var route: TravelRoute { .feature(self) }

    /// Canonical, slash-prefixed deep-link path (distinct from `endpoint`,
    /// which describes the backend API contract).
    var routePath: String { "/\(rawValue)" }

    /// Resolve a tab from the leading path component of a route.
    static func matching(path component: String) -> TravelTab? {
        let slug = component.split(separator: "/").last.map(String.init) ?? component
        return TravelTab(rawValue: slug)
    }
}
