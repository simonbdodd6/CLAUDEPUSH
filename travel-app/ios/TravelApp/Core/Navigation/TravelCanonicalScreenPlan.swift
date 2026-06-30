// MARK: - Travel canonical screen plan (Integration 007)
//
// A pure-data architectural plan naming the permanent ("canonical") screen for each
// feature area before real app integration begins. It is documentation expressed as
// strongly typed Swift — it modifies no screens, merges no files, and touches no
// production routing. No SwiftUI, no networking, no persistence, no DTO, no
// AppContainer, and no `import` is needed. Screens are referenced by stable id and
// validated against `TravelScreenRegistry`.

/// How a deprecated screen should eventually be removed.
enum MigrationAction: String, CaseIterable, Hashable {
    case merge   // fold into the canonical screen
    case retire  // drop entirely
}

/// Rough effort to consolidate a feature area.
enum MigrationComplexity: String, CaseIterable, Hashable {
    case trivial
    case low
    case medium
    case high
}

/// Integration priority for a feature area (P1 = first runnable app).
enum PlanPriority: String, CaseIterable, Hashable {
    case one
    case two
    case three

    var rank: Int {
        switch self {
        case .one: return 1
        case .two: return 2
        case .three: return 3
        }
    }
}

/// Where a feature area stands in its consolidation.
enum ConsolidationStatus: String, CaseIterable, Hashable {
    case alreadyCanonical      // a single screen; nothing to consolidate
    case consolidationPending  // duplicates remain to merge or retire
    case consolidationComplete // duplicates already collapsed
}

/// A feature area and how its screens consolidate to one canonical screen.
struct FeatureArea: Identifiable, Hashable {
    let id: String
    var name: String
    var canonicalScreenID: String
    var screensToKeep: [String]
    var screensToMergeLater: [String]
    var screensToRetireLater: [String]
    var reasoning: String
    var priority: PlanPriority
    var complexity: MigrationComplexity
    var dependencies: [String]
    var status: ConsolidationStatus
}

/// The permanent screen chosen for an area.
struct CanonicalScreen: Identifiable, Hashable {
    let id: String          // screen id
    var areaID: String
    var title: String
}

/// A screen that will eventually be merged or retired.
struct DeprecatedScreen: Identifiable, Hashable {
    let id: String          // screen id
    var areaID: String
    var action: MigrationAction
    var canonicalTargetID: String
    var reason: String
}

/// A single ordered migration step.
struct MergePlan: Identifiable, Hashable {
    let id: String
    var areaID: String
    var canonicalScreenID: String
    var fromScreenID: String
    var action: MigrationAction
    var priority: PlanPriority
    var complexity: MigrationComplexity
}

/// The result of validating the plan.
struct PlanValidation: Hashable {
    var unresolvedScreenReferences: [String]
    var duplicateCanonicalScreens: [String]

    var isValid: Bool {
        unresolvedScreenReferences.isEmpty && duplicateCanonicalScreens.isEmpty
    }
}

// MARK: - The plan

enum TravelCanonicalScreenPlan {

    static let allFeatureAreas: [FeatureArea] = [
        FeatureArea(id: "home", name: "Home", canonicalScreenID: "home-v2",
            screensToKeep: ["home-v2"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "Home Dashboard V2 is the single, demo-wired landing page.",
            priority: .one, complexity: .trivial, dependencies: ["demo-data", "nav-coordinator"], status: .alreadyCanonical),

        FeatureArea(id: "destination", name: "Destination", canonicalScreenID: "destination-hub",
            screensToKeep: ["destination-hub"], screensToMergeLater: ["destination-guide"], screensToRetireLater: [],
            reasoning: "The hub supersedes the older single-destination guide; fold the guide's content in as a section.",
            priority: .one, complexity: .medium, dependencies: ["demo-data"], status: .consolidationPending),

        FeatureArea(id: "journey", name: "Journey", canonicalScreenID: "journey",
            screensToKeep: ["journey"], screensToMergeLater: ["trip-timeline"], screensToRetireLater: [],
            reasoning: "The Journey Dashboard is the end-to-end view; the standalone trip timeline becomes a section of it.",
            priority: .one, complexity: .medium, dependencies: ["demo-data"], status: .consolidationPending),

        FeatureArea(id: "trip-planner", name: "Trip Planner", canonicalScreenID: "trip-planner-v2",
            screensToKeep: ["trip-planner-v2"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "Trip Planner V2 is the single planning hub; the v1 planner is unregistered and dropped.",
            priority: .one, complexity: .trivial, dependencies: ["demo-data", "booking-manager"], status: .alreadyCanonical),

        FeatureArea(id: "accommodation", name: "Accommodation", canonicalScreenID: "accommodation",
            screensToKeep: ["accommodation"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "One accommodation dashboard; the older Explorer guide is unregistered and dropped.",
            priority: .two, complexity: .low, dependencies: [], status: .alreadyCanonical),

        FeatureArea(id: "money", name: "Budget / Money", canonicalScreenID: "money-costs",
            screensToKeep: ["money-costs"], screensToMergeLater: ["currency", "budget"], screensToRetireLater: [],
            reasoning: "Money, Costs & Budget is the most complete; fold currency and budget in as sub-sections.",
            priority: .two, complexity: .high, dependencies: [], status: .consolidationPending),

        FeatureArea(id: "connectivity", name: "Connectivity", canonicalScreenID: "connectivity",
            screensToKeep: ["connectivity"], screensToMergeLater: ["connectivity-esim"], screensToRetireLater: [],
            reasoning: "The broader connectivity screen absorbs the eSIM-specific one.",
            priority: .two, complexity: .low, dependencies: [], status: .consolidationPending),

        FeatureArea(id: "transport", name: "Transport", canonicalScreenID: "transport-getting-around",
            screensToKeep: ["transport-getting-around"], screensToMergeLater: ["taxi-rideshare", "local-transport"], screensToRetireLater: [],
            reasoning: "Getting Around is the umbrella; taxi/ride-share and local transport become sub-sections.",
            priority: .two, complexity: .medium, dependencies: [], status: .consolidationPending),

        FeatureArea(id: "health-safety", name: "Health & Safety", canonicalScreenID: "health",
            screensToKeep: ["health"], screensToMergeLater: ["health-medical", "emergency-safety"], screensToRetireLater: [],
            reasoning: "The combined Health & Safety screen absorbs the medical and emergency screens.",
            priority: .two, complexity: .medium, dependencies: [], status: .consolidationPending),

        FeatureArea(id: "diving", name: "Diving", canonicalScreenID: "dive-log",
            screensToKeep: ["dive-log", "snorkel", "liveaboard"], screensToMergeLater: ["dive-surf"], screensToRetireLater: [],
            reasoning: "Dive Log is canonical; snorkel and liveaboard are complementary and kept; the dive & surf guide folds in.",
            priority: .three, complexity: .low, dependencies: [], status: .consolidationPending),

        FeatureArea(id: "ferries", name: "Ferries", canonicalScreenID: "ferries",
            screensToKeep: ["ferries"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "One ferries & boats screen; island-hopping is handled under Island Guides.",
            priority: .two, complexity: .low, dependencies: [], status: .alreadyCanonical),

        FeatureArea(id: "weather", name: "Weather", canonicalScreenID: "weather",
            screensToKeep: ["weather"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "A single weather & seasons screen; no duplicates registered.",
            priority: .two, complexity: .trivial, dependencies: [], status: .alreadyCanonical),

        FeatureArea(id: "culture", name: "Culture", canonicalScreenID: "culture",
            screensToKeep: ["culture", "language-phrasebook"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "Culture & Etiquette is canonical; the phrasebook is complementary and kept alongside it.",
            priority: .three, complexity: .trivial, dependencies: [], status: .alreadyCanonical),

        FeatureArea(id: "documents", name: "Documents", canonicalScreenID: "documents",
            screensToKeep: ["documents", "visa"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "The document wallet is canonical; visa & entry is a distinct, complementary screen.",
            priority: .two, complexity: .low, dependencies: [], status: .alreadyCanonical),

        FeatureArea(id: "offline", name: "Offline", canonicalScreenID: "offline",
            screensToKeep: ["offline"], screensToMergeLater: [], screensToRetireLater: [],
            reasoning: "A single offline essentials screen; no duplicates registered.",
            priority: .two, complexity: .trivial, dependencies: ["documents"], status: .alreadyCanonical),

        FeatureArea(id: "island-guides", name: "Island Guides", canonicalScreenID: "island-guide",
            screensToKeep: ["island-guide"], screensToMergeLater: ["island-hopping"], screensToRetireLater: [],
            reasoning: "The Island Guide is canonical; island-hopping route planning folds in as a section.",
            priority: .two, complexity: .medium, dependencies: ["demo-data"], status: .consolidationPending)
    ]

    // MARK: Derived views

    static var canonicalScreens: [CanonicalScreen] {
        allFeatureAreas.map { area in
            CanonicalScreen(
                id: area.canonicalScreenID,
                areaID: area.id,
                title: TravelScreenRegistry.search(id: area.canonicalScreenID)?.title ?? area.canonicalScreenID
            )
        }
    }

    static var deprecatedScreens: [DeprecatedScreen] {
        var result: [DeprecatedScreen] = []
        for area in allFeatureAreas {
            for id in area.screensToMergeLater {
                result.append(DeprecatedScreen(id: id, areaID: area.id, action: .merge, canonicalTargetID: area.canonicalScreenID, reason: area.reasoning))
            }
            for id in area.screensToRetireLater {
                result.append(DeprecatedScreen(id: id, areaID: area.id, action: .retire, canonicalTargetID: area.canonicalScreenID, reason: area.reasoning))
            }
        }
        return result
    }

    /// Every migration step, ordered by priority then complexity then area.
    static var mergeOrder: [MergePlan] {
        var steps: [MergePlan] = []
        for area in allFeatureAreas {
            for id in area.screensToMergeLater {
                steps.append(MergePlan(id: "\(area.id)-merge-\(id)", areaID: area.id, canonicalScreenID: area.canonicalScreenID, fromScreenID: id, action: .merge, priority: area.priority, complexity: area.complexity))
            }
            for id in area.screensToRetireLater {
                steps.append(MergePlan(id: "\(area.id)-retire-\(id)", areaID: area.id, canonicalScreenID: area.canonicalScreenID, fromScreenID: id, action: .retire, priority: area.priority, complexity: area.complexity))
            }
        }
        return steps.sorted { lhs, rhs in
            if lhs.priority.rank != rhs.priority.rank { return lhs.priority.rank < rhs.priority.rank }
            if complexityRank(lhs.complexity) != complexityRank(rhs.complexity) { return complexityRank(lhs.complexity) < complexityRank(rhs.complexity) }
            return lhs.id < rhs.id
        }
    }

    /// Feature areas ordered by integration priority then complexity.
    static var integrationPriority: [FeatureArea] {
        allFeatureAreas.sorted { lhs, rhs in
            if lhs.priority.rank != rhs.priority.rank { return lhs.priority.rank < rhs.priority.rank }
            if complexityRank(lhs.complexity) != complexityRank(rhs.complexity) { return complexityRank(lhs.complexity) < complexityRank(rhs.complexity) }
            return lhs.id < rhs.id
        }
    }

    private static func complexityRank(_ complexity: MigrationComplexity) -> Int {
        switch complexity {
        case .trivial: return 0
        case .low: return 1
        case .medium: return 2
        case .high: return 3
        }
    }

    // MARK: Validation

    static var validation: PlanValidation {
        let known = Set(TravelScreenRegistry.allScreens.map { $0.id })

        // All referenced screen ids must exist in the registry.
        var referenced: [String] = []
        for area in allFeatureAreas {
            referenced.append(area.canonicalScreenID)
            referenced.append(contentsOf: area.screensToKeep)
            referenced.append(contentsOf: area.screensToMergeLater)
            referenced.append(contentsOf: area.screensToRetireLater)
        }
        var seenRef: Set<String> = []
        var unresolved: [String] = []
        for id in referenced where !known.contains(id) && !seenRef.contains(id) {
            seenRef.insert(id)
            unresolved.append(id)
        }

        // No screen may be canonical in more than one area.
        var canonicalCounts: [String: Int] = [:]
        for area in allFeatureAreas { canonicalCounts[area.canonicalScreenID, default: 0] += 1 }
        let duplicateCanonicals = canonicalCounts.filter { $0.value > 1 }.keys.sorted()

        return PlanValidation(
            unresolvedScreenReferences: unresolved.sorted(),
            duplicateCanonicalScreens: Array(duplicateCanonicals)
        )
    }

    /// True when the plan resolves cleanly and the registry it relies on is valid.
    static var isConsistent: Bool {
        validation.isValid && TravelScreenRegistry.isValid
    }
}
