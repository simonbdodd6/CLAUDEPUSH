// MARK: - Travel screen registry (Integration 005)
//
// A single, pure-data source of truth describing every screen built in the Travel
// Intelligence app so far. It is data only — no SwiftUI, no routing, no networking, no
// persistence, no AppContainer — and needs no `import`. Each screen is described once;
// navigation groups, categories and related screens are referenced by stable id so the
// registry can be validated (`validation`) without running the app.
//
// `dependencies` may reference conceptual building blocks (e.g. "design-system") as well
// as other screen ids; only `relatedScreenIDs` are required to resolve to registered
// screens.

/// The broad area a screen belongs to.
enum ScreenCategory: String, CaseIterable, Hashable {
    case overview
    case planning
    case destination
    case journey
    case money
    case connectivity
    case health
    case culture
    case logistics
    case diving
    case documents
    case profile
    case navigation
    case system
}

/// How complete a screen is.
enum ScreenReadiness: String, CaseIterable, Hashable {
    case flagship
    case ready
    case beta
    case placeholder
}

/// How a screen is currently realised.
enum ScreenPresentation: String, CaseIterable, Hashable {
    case demoWired        // a SwiftUI screen with a shared-demo-data adapter
    case presentationOnly // a SwiftUI screen with its own inline sample data
    case dataModel        // pure-data architecture, no view
}

/// A complete description of one screen.
struct ScreenDescriptor: Identifiable, Hashable {
    let id: String
    var title: String
    var category: ScreenCategory
    var parentSection: String
    var group: String
    var icon: String
    var buildPhase: String
    var readiness: ScreenReadiness
    var presentation: ScreenPresentation
    var dependencies: [String]
    var relatedScreenIDs: [String]
}

/// The result of validating the registry.
struct ScreenRegistryValidation: Hashable {
    var duplicateIdentifiers: [String]
    var orphanScreens: [String]
    var unresolvedRelatedReferences: [String]

    var isValid: Bool {
        duplicateIdentifiers.isEmpty && orphanScreens.isEmpty && unresolvedRelatedReferences.isEmpty
    }
}

// MARK: - The registry

enum TravelScreenRegistry {

    /// Recognised navigation groups a screen may belong to.
    static let knownGroups: Set<String> = ["home", "trips", "destinations", "journey", "explore", "profile", "system"]

    // MARK: Every screen built so far

    static let allScreens: [ScreenDescriptor] = [

        // Flagship composed dashboards
        ScreenDescriptor(id: "home-v2", title: "Home Dashboard V2", category: .overview, parentSection: "Overview", group: "home", icon: "house.fill", buildPhase: "Phase 139", readiness: .flagship, presentation: .demoWired, dependencies: ["design-system", "demo-data"], relatedScreenIDs: ["journey", "trip-planner-v2", "destination-hub"]),
        ScreenDescriptor(id: "destination-hub", title: "Destination Hub", category: .destination, parentSection: "Browse", group: "destinations", icon: "globe.asia.australia.fill", buildPhase: "Phase 137", readiness: .flagship, presentation: .demoWired, dependencies: ["design-system", "demo-data"], relatedScreenIDs: ["island-guide", "accommodation", "ferries", "weather", "culture", "health"]),
        ScreenDescriptor(id: "journey", title: "Journey Dashboard", category: .journey, parentSection: "Live trip", group: "journey", icon: "figure.walk.motion", buildPhase: "Phase 138", readiness: .flagship, presentation: .demoWired, dependencies: ["design-system", "demo-data"], relatedScreenIDs: ["trip-timeline", "dive-log", "ferries"]),
        ScreenDescriptor(id: "trip-planner-v2", title: "Trip Planner Dashboard V2", category: .planning, parentSection: "Planning", group: "trips", icon: "calendar", buildPhase: "Phase 136", readiness: .flagship, presentation: .demoWired, dependencies: ["design-system", "demo-data"], relatedScreenIDs: ["budget", "packing", "documents", "offline"]),
        ScreenDescriptor(id: "island-guide", title: "Island Guide Dashboard", category: .destination, parentSection: "Discover", group: "explore", icon: "map.fill", buildPhase: "Phase 135", readiness: .flagship, presentation: .demoWired, dependencies: ["design-system", "demo-data"], relatedScreenIDs: ["island-hopping", "destination-hub", "ferries"]),

        // Destination & planning modules
        ScreenDescriptor(id: "destination-guide", title: "Destination Guide", category: .destination, parentSection: "Browse", group: "destinations", icon: "map.circle.fill", buildPhase: "Phase 114", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["destination-hub"]),
        ScreenDescriptor(id: "trip-timeline", title: "Trip Timeline", category: .journey, parentSection: "Live trip", group: "journey", icon: "clock.fill", buildPhase: "Phase 113", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["journey"]),
        ScreenDescriptor(id: "booking-manager", title: "Booking Manager", category: .planning, parentSection: "Planning", group: "trips", icon: "checkmark.seal.fill", buildPhase: "Phase 104", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["accommodation", "ferries"]),
        ScreenDescriptor(id: "packing", title: "Packing Checklist", category: .logistics, parentSection: "Logistics", group: "trips", icon: "bag.fill", buildPhase: "Phase 112", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["trip-planner-v2"]),

        // Logistics & transport
        ScreenDescriptor(id: "accommodation", title: "Accommodation", category: .logistics, parentSection: "Logistics", group: "trips", icon: "bed.double.fill", buildPhase: "Phase 134", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["destination-hub", "booking-manager"]),
        ScreenDescriptor(id: "ferries", title: "Ferries & Boats", category: .logistics, parentSection: "On the water", group: "journey", icon: "ferry.fill", buildPhase: "Phase 132", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["island-hopping", "island-guide"]),
        ScreenDescriptor(id: "island-hopping", title: "Island Hopping", category: .logistics, parentSection: "Discover", group: "explore", icon: "point.topleft.down.to.point.bottomright.curvepath.fill", buildPhase: "Phase 117", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["island-guide", "ferries"]),
        ScreenDescriptor(id: "transport-getting-around", title: "Transport & Getting Around", category: .logistics, parentSection: "Logistics", group: "trips", icon: "car.2.fill", buildPhase: "Phase 126", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["taxi-rideshare", "local-transport"]),
        ScreenDescriptor(id: "taxi-rideshare", title: "Taxi & Ride Share", category: .logistics, parentSection: "Logistics", group: "trips", icon: "car.fill", buildPhase: "Phase 133", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["transport-getting-around"]),
        ScreenDescriptor(id: "local-transport", title: "Local Transport", category: .logistics, parentSection: "Logistics", group: "trips", icon: "tram.fill", buildPhase: "Phase 106", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["transport-getting-around"]),

        // Money
        ScreenDescriptor(id: "currency", title: "Currency & Money", category: .money, parentSection: "Money & comms", group: "trips", icon: "banknote.fill", buildPhase: "Phase 120", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["money-costs", "budget"]),
        ScreenDescriptor(id: "money-costs", title: "Money, Costs & Budget", category: .money, parentSection: "Money & comms", group: "trips", icon: "wallet.bifold.fill", buildPhase: "Phase 127", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["currency", "budget"]),
        ScreenDescriptor(id: "budget", title: "Budget & Expense", category: .money, parentSection: "Money & comms", group: "trips", icon: "chart.pie.fill", buildPhase: "Phase 110", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["currency", "money-costs"]),

        // Connectivity
        ScreenDescriptor(id: "connectivity", title: "Connectivity", category: .connectivity, parentSection: "Money & comms", group: "trips", icon: "wifi", buildPhase: "Phase 129", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["connectivity-esim"]),
        ScreenDescriptor(id: "connectivity-esim", title: "Connectivity & eSIM", category: .connectivity, parentSection: "Money & comms", group: "trips", icon: "simcard.fill", buildPhase: "Phase 121", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["connectivity"]),

        // Health & safety
        ScreenDescriptor(id: "health", title: "Health & Safety", category: .health, parentSection: "Know before you go", group: "destinations", icon: "cross.case.fill", buildPhase: "Phase 128", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["health-medical", "emergency-safety"]),
        ScreenDescriptor(id: "health-medical", title: "Health & Medical", category: .health, parentSection: "Know before you go", group: "destinations", icon: "cross.fill", buildPhase: "Phase 122", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["health"]),
        ScreenDescriptor(id: "emergency-safety", title: "Emergency & Safety", category: .health, parentSection: "Know before you go", group: "destinations", icon: "exclamationmark.triangle.fill", buildPhase: "Phase 108", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["health"]),

        // Culture & language
        ScreenDescriptor(id: "culture", title: "Culture & Etiquette", category: .culture, parentSection: "Know before you go", group: "destinations", icon: "hands.sparkles.fill", buildPhase: "Phase 125", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["language-phrasebook"]),
        ScreenDescriptor(id: "language-phrasebook", title: "Language & Phrasebook", category: .culture, parentSection: "Know before you go", group: "destinations", icon: "character.bubble.fill", buildPhase: "Phase 123", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["culture"]),
        ScreenDescriptor(id: "weather", title: "Weather & Seasons", category: .destination, parentSection: "Practical", group: "explore", icon: "cloud.sun.fill", buildPhase: "Phase 124", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["destination-hub"]),

        // Documents
        ScreenDescriptor(id: "visa", title: "Visa & Entry", category: .documents, parentSection: "Know before you go", group: "destinations", icon: "doc.text.fill", buildPhase: "Phase 119", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["documents"]),
        ScreenDescriptor(id: "documents", title: "Document Wallet", category: .documents, parentSection: "Saved", group: "profile", icon: "wallet.bifold.fill", buildPhase: "Phase 131", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["offline", "visa"]),
        ScreenDescriptor(id: "offline", title: "Offline Essentials", category: .documents, parentSection: "Saved", group: "profile", icon: "arrow.down.circle.fill", buildPhase: "Phase 130", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["documents"]),

        // Diving
        ScreenDescriptor(id: "dive-log", title: "Dive Log", category: .diving, parentSection: "On the water", group: "journey", icon: "water.waves", buildPhase: "Phase 115", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["snorkel", "liveaboard", "dive-surf"]),
        ScreenDescriptor(id: "snorkel", title: "Snorkel Guide", category: .diving, parentSection: "On the water", group: "journey", icon: "figure.pool.swim", buildPhase: "Phase 116", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["dive-log"]),
        ScreenDescriptor(id: "liveaboard", title: "Liveaboard", category: .diving, parentSection: "On the water", group: "journey", icon: "sailboat.fill", buildPhase: "Phase 118", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["dive-log"]),
        ScreenDescriptor(id: "dive-surf", title: "Dive & Surf Guide", category: .diving, parentSection: "On the water", group: "journey", icon: "figure.surfing", buildPhase: "Phase 111", readiness: .ready, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["dive-log"]),

        // Profile
        ScreenDescriptor(id: "profile", title: "Profile", category: .profile, parentSection: "You", group: "profile", icon: "person.crop.circle.fill", buildPhase: "Planned", readiness: .placeholder, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["documents", "offline"]),

        // Navigation & system foundations
        ScreenDescriptor(id: "demo-data", title: "Shared Demo Data", category: .system, parentSection: "Foundations", group: "system", icon: "shippingbox.fill", buildPhase: "Integration 001", readiness: .ready, presentation: .dataModel, dependencies: ["home-v2", "destination-hub", "journey", "trip-planner-v2", "island-guide"], relatedScreenIDs: ["nav-preview-shell"]),
        ScreenDescriptor(id: "nav-model", title: "Navigation Model", category: .navigation, parentSection: "Foundations", group: "system", icon: "point.3.connected.trianglepath.dotted", buildPhase: "Integration 002", readiness: .ready, presentation: .dataModel, dependencies: [], relatedScreenIDs: ["nav-coordinator", "nav-preview-shell"]),
        ScreenDescriptor(id: "nav-coordinator", title: "Navigation Coordinator", category: .navigation, parentSection: "Foundations", group: "system", icon: "arrow.triangle.branch", buildPhase: "Integration 003", readiness: .ready, presentation: .dataModel, dependencies: ["nav-model"], relatedScreenIDs: ["nav-model", "nav-preview-shell"]),
        ScreenDescriptor(id: "nav-preview-shell", title: "Navigation Preview Shell", category: .navigation, parentSection: "Foundations", group: "system", icon: "square.grid.2x2.fill", buildPhase: "Integration 004", readiness: .beta, presentation: .demoWired, dependencies: ["nav-model", "nav-coordinator", "demo-data", "design-system"], relatedScreenIDs: ["nav-model", "nav-coordinator", "demo-data"]),
        ScreenDescriptor(id: "app-nav-shell", title: "App Navigation Shell", category: .navigation, parentSection: "Foundations", group: "system", icon: "rectangle.bottomthird.inset.filled", buildPhase: "Phase 140", readiness: .beta, presentation: .presentationOnly, dependencies: ["design-system"], relatedScreenIDs: ["nav-preview-shell"])
    ]

    // MARK: Groupings

    static var screensByCategory: [ScreenCategory: [ScreenDescriptor]] {
        Dictionary(grouping: allScreens, by: { $0.category })
    }

    static var screensByGroup: [String: [ScreenDescriptor]] {
        Dictionary(grouping: allScreens, by: { $0.group })
    }

    static var flagshipScreens: [ScreenDescriptor] {
        allScreens.filter { $0.readiness == .flagship }
    }

    /// Screens in a sensible order to integrate into the app: data/navigation
    /// foundations first, then flagships, then the remaining modules — stable by id.
    static var integrationOrder: [ScreenDescriptor] {
        allScreens.sorted { lhs, rhs in
            let l = integrationRank(lhs)
            let r = integrationRank(rhs)
            if l != r { return l < r }
            return lhs.id < rhs.id
        }
    }

    private static func integrationRank(_ screen: ScreenDescriptor) -> Int {
        if screen.category == .system || screen.category == .navigation { return 0 }
        switch screen.readiness {
        case .flagship: return 1
        case .ready: return 2
        case .beta: return 3
        case .placeholder: return 4
        }
    }

    // MARK: Search

    static func search(id: String) -> ScreenDescriptor? {
        allScreens.first { $0.id == id }
    }

    static func search(title: String) -> [ScreenDescriptor] {
        let needle = title.lowercased()
        guard !needle.isEmpty else { return [] }
        return allScreens.filter { $0.title.lowercased().contains(needle) }
    }

    // MARK: Validation

    static var validation: ScreenRegistryValidation {
        // Duplicate identifiers
        var counts: [String: Int] = [:]
        for screen in allScreens { counts[screen.id, default: 0] += 1 }
        let duplicates = counts.filter { $0.value > 1 }.keys.sorted()

        // Orphan screens: a group that isn't recognised
        let orphans = allScreens.filter { !knownGroups.contains($0.group) }.map { $0.id }.sorted()

        // Related references that don't resolve to a registered screen
        let known = Set(allScreens.map { $0.id })
        var seen: Set<String> = []
        var unresolved: [String] = []
        for screen in allScreens {
            for related in screen.relatedScreenIDs where !known.contains(related) && !seen.contains(related) {
                seen.insert(related)
                unresolved.append(related)
            }
        }

        return ScreenRegistryValidation(
            duplicateIdentifiers: Array(duplicates),
            orphanScreens: orphans,
            unresolvedRelatedReferences: unresolved.sorted()
        )
    }

    /// True when the registry is internally consistent.
    static var isValid: Bool { validation.isValid }
}
