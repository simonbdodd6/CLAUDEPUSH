// MARK: - Travel navigation model (Integration 002)
//
// A pure-data, presentation-first description of the Travel Intelligence app's intended
// navigation map. It is NOT production routing: it touches none of the existing
// `TravelRoute` / `TravelTab` / `NavigationCoordinator` / `RootFlowView` types, defines
// no SwiftUI views, and performs no navigation. It is a value-only blueprint that a
// future shell can read to build a real `NavigationStack`.
//
// Everything here is plain Swift — no `import` is needed. Destinations are referenced by
// stable string id, so groups, sections and shortcuts stay decoupled from one canonical
// registry (`TravelNavigationModel.destinations`). The model includes a self-integrity
// check (`unresolvedDestinationReferences`) so the map can be validated without running
// the app.
//
// No networking, persistence, repository, view-model, AppContainer, DTO, View, routing,
// NavigationStack or NavigationLink — data only.

/// How a destination is classified within the app.
enum NavDestinationKind: String, CaseIterable, Hashable {
    case overview
    case hub
    case planner
    case guide
    case tool
    case profile
}

/// A single navigable screen / route, identified by a stable string id.
struct NavigationDestination: Identifiable, Hashable {
    let id: String
    var title: String
    var subtitle: String
    var symbol: String
    var kind: NavDestinationKind
}

/// A titled grouping of destinations (referenced by id) inside a group.
struct NavigationSection: Identifiable, Hashable {
    let id: String
    var title: String
    var destinationIDs: [String]
}

/// A top-level navigation group (a tab), containing sections.
struct NavigationGroup: Identifiable, Hashable {
    let id: String
    var title: String
    var symbol: String
    var sections: [NavigationSection]

    /// Every destination id reachable in this group, in order, de-duplicated.
    var destinationIDs: [String] {
        var seen: Set<String> = []
        var ordered: [String] = []
        for section in sections {
            for id in section.destinationIDs where !seen.contains(id) {
                seen.insert(id)
                ordered.append(id)
            }
        }
        return ordered
    }
}

/// A quick-jump shortcut pointing at a destination id.
struct NavigationShortcut: Identifiable, Hashable {
    let id: String
    var title: String
    var symbol: String
    var destinationID: String
}

/// The current, value-only navigation state. Holds where the user is and how they got
/// there; mutating helpers update the state but perform no actual navigation.
struct NavigationState: Hashable {
    var selectedGroupID: String
    var selectedDestinationID: String
    /// Root-first breadcrumb of destination ids in the current group.
    var breadcrumb: [String]
    /// Most-recent-first list of visited destination ids (capped).
    var recent: [String]

    var recentLimit = 8

    /// Switch to a group and reset to its root destination.
    mutating func select(group groupID: String, rootDestinationID: String) {
        selectedGroupID = groupID
        selectedDestinationID = rootDestinationID
        breadcrumb = [rootDestinationID]
        recordRecent(rootDestinationID)
    }

    /// Open a destination, pushing it onto the breadcrumb.
    mutating func open(_ destinationID: String) {
        selectedDestinationID = destinationID
        if breadcrumb.last != destinationID {
            breadcrumb.append(destinationID)
        }
        recordRecent(destinationID)
    }

    /// True when there is somewhere to go back to.
    var canGoBack: Bool { breadcrumb.count > 1 }

    /// Pop the breadcrumb by one.
    mutating func back() {
        guard breadcrumb.count > 1 else { return }
        breadcrumb.removeLast()
        if let top = breadcrumb.last {
            selectedDestinationID = top
        }
    }

    private mutating func recordRecent(_ destinationID: String) {
        recent.removeAll { $0 == destinationID }
        recent.insert(destinationID, at: 0)
        if recent.count > recentLimit {
            recent = Array(recent.prefix(recentLimit))
        }
    }
}

// MARK: - The navigation map

enum TravelNavigationModel {

    // MARK: Canonical destination registry

    static let destinations: [NavigationDestination] = [
        NavigationDestination(id: "home-v2", title: "Home", subtitle: "Your personalised landing page.", symbol: "house.fill", kind: .overview),
        NavigationDestination(id: "journey", title: "Journey", subtitle: "Your live trip, end to end.", symbol: "figure.walk.motion", kind: .overview),
        NavigationDestination(id: "trip-planner-v2", title: "Trip Planner", subtitle: "Plan every part of a trip.", symbol: "calendar", kind: .planner),
        NavigationDestination(id: "destination-hub", title: "Destination Hub", subtitle: "Everything about a destination.", symbol: "globe.asia.australia.fill", kind: .hub),
        NavigationDestination(id: "island-guide", title: "Island Guide", subtitle: "Compare and choose islands.", symbol: "map.fill", kind: .guide),
        NavigationDestination(id: "accommodation", title: "Accommodation", subtitle: "Where to stay.", symbol: "bed.double.fill", kind: .guide),
        NavigationDestination(id: "ferries", title: "Ferries & Boats", subtitle: "Getting between islands.", symbol: "ferry.fill", kind: .guide),
        NavigationDestination(id: "documents", title: "Document Wallet", subtitle: "Passports, visas and tickets.", symbol: "wallet.bifold.fill", kind: .tool),
        NavigationDestination(id: "offline", title: "Offline Essentials", subtitle: "Saved for no signal.", symbol: "arrow.down.circle.fill", kind: .tool),
        NavigationDestination(id: "currency", title: "Currency & Money", subtitle: "Cash, cards and budgets.", symbol: "banknote.fill", kind: .guide),
        NavigationDestination(id: "connectivity", title: "Connectivity", subtitle: "SIMs, eSIMs and Wi-Fi.", symbol: "wifi", kind: .guide),
        NavigationDestination(id: "health", title: "Health & Safety", subtitle: "Stay well and safe.", symbol: "cross.case.fill", kind: .guide),
        NavigationDestination(id: "culture", title: "Culture & Etiquette", subtitle: "Travel respectfully.", symbol: "hands.sparkles.fill", kind: .guide),
        NavigationDestination(id: "weather", title: "Weather & Seasons", subtitle: "The best time to go.", symbol: "cloud.sun.fill", kind: .guide),
        NavigationDestination(id: "visa", title: "Visa & Entry", subtitle: "Entry requirements.", symbol: "doc.text.fill", kind: .guide),
        NavigationDestination(id: "dive-log", title: "Dive Log", subtitle: "Your dives and certifications.", symbol: "water.waves", kind: .guide),
        NavigationDestination(id: "snorkel", title: "Snorkel Guide", subtitle: "Best snorkel spots.", symbol: "figure.pool.swim", kind: .guide),
        NavigationDestination(id: "profile", title: "Profile", subtitle: "You, saved trips and settings.", symbol: "person.crop.circle.fill", kind: .profile)
    ]

    // MARK: Top-level groups (tabs)

    static let groups: [NavigationGroup] = [
        NavigationGroup(id: "home", title: "Home", symbol: "house.fill", sections: [
            NavigationSection(id: "home-overview", title: "Overview", destinationIDs: ["home-v2"]),
            NavigationSection(id: "home-jump", title: "Jump back in", destinationIDs: ["journey", "trip-planner-v2", "destination-hub"])
        ]),
        NavigationGroup(id: "trips", title: "Trips", symbol: "calendar", sections: [
            NavigationSection(id: "trips-planning", title: "Planning", destinationIDs: ["trip-planner-v2"]),
            NavigationSection(id: "trips-logistics", title: "Logistics", destinationIDs: ["accommodation", "ferries", "documents", "offline"]),
            NavigationSection(id: "trips-money", title: "Money & comms", destinationIDs: ["currency", "connectivity"])
        ]),
        NavigationGroup(id: "destinations", title: "Places", symbol: "globe.asia.australia.fill", sections: [
            NavigationSection(id: "destinations-browse", title: "Browse", destinationIDs: ["destination-hub", "island-guide"]),
            NavigationSection(id: "destinations-know", title: "Know before you go", destinationIDs: ["culture", "weather", "visa", "health"])
        ]),
        NavigationGroup(id: "journey", title: "Journey", symbol: "figure.walk.motion", sections: [
            NavigationSection(id: "journey-live", title: "Live trip", destinationIDs: ["journey"]),
            NavigationSection(id: "journey-water", title: "On the water", destinationIDs: ["dive-log", "snorkel", "ferries"])
        ]),
        NavigationGroup(id: "explore", title: "Explore", symbol: "map.fill", sections: [
            NavigationSection(id: "explore-discover", title: "Discover", destinationIDs: ["island-guide", "destination-hub"]),
            NavigationSection(id: "explore-practical", title: "Practical", destinationIDs: ["weather", "currency", "connectivity", "culture", "visa"])
        ]),
        NavigationGroup(id: "profile", title: "Profile", symbol: "person.crop.circle.fill", sections: [
            NavigationSection(id: "profile-you", title: "You", destinationIDs: ["profile"]),
            NavigationSection(id: "profile-saved", title: "Saved", destinationIDs: ["documents", "offline"])
        ])
    ]

    // MARK: Quick shortcuts

    static let quickShortcuts: [NavigationShortcut] = [
        NavigationShortcut(id: "sc-journey", title: "Journey", symbol: "figure.walk.motion", destinationID: "journey"),
        NavigationShortcut(id: "sc-planner", title: "Plan a trip", symbol: "calendar", destinationID: "trip-planner-v2"),
        NavigationShortcut(id: "sc-documents", title: "Documents", symbol: "wallet.bifold.fill", destinationID: "documents"),
        NavigationShortcut(id: "sc-weather", title: "Weather", symbol: "cloud.sun.fill", destinationID: "weather"),
        NavigationShortcut(id: "sc-currency", title: "Money", symbol: "banknote.fill", destinationID: "currency")
    ]

    // MARK: Lookups & state

    static func destination(_ id: String) -> NavigationDestination? {
        destinations.first { $0.id == id }
    }

    static func group(_ id: String) -> NavigationGroup? {
        groups.first { $0.id == id }
    }

    /// The root destination id for a group (the first destination in its first section).
    static func rootDestinationID(of groupID: String) -> String? {
        group(groupID)?.sections.first?.destinationIDs.first
    }

    /// The default state when the app launches: the Home group on Home Dashboard V2.
    static var initialState: NavigationState {
        NavigationState(
            selectedGroupID: "home",
            selectedDestinationID: "home-v2",
            breadcrumb: ["home-v2"],
            recent: ["home-v2"]
        )
    }

    // MARK: Integrity

    /// Every destination id referenced anywhere in the map (groups + shortcuts).
    static var referencedDestinationIDs: [String] {
        var ids: [String] = []
        for grp in groups {
            for section in grp.sections {
                ids.append(contentsOf: section.destinationIDs)
            }
        }
        ids.append(contentsOf: quickShortcuts.map { $0.destinationID })
        return ids
    }

    /// Referenced destination ids that are missing from the registry (should be empty).
    static var unresolvedDestinationReferences: [String] {
        let known = Set(destinations.map { $0.id })
        var seen: Set<String> = []
        var missing: [String] = []
        for id in referencedDestinationIDs where !known.contains(id) && !seen.contains(id) {
            seen.insert(id)
            missing.append(id)
        }
        return missing
    }

    /// Registry destinations not reachable from any group (informational; profile/tools may be deep).
    static var unreachableDestinationIDs: [String] {
        let reachable = Set(referencedDestinationIDs)
        return destinations.map { $0.id }.filter { !reachable.contains($0) }
    }

    /// True when every reference resolves and ids are unique.
    static var isConsistent: Bool {
        unresolvedDestinationReferences.isEmpty
            && Set(destinations.map { $0.id }).count == destinations.count
            && Set(groups.map { $0.id }).count == groups.count
    }
}
