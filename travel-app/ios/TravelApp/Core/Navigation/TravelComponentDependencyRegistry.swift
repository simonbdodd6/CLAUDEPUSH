// MARK: - Travel component dependency registry (Integration 008)
//
// A pure-data registry describing how every reusable component relates to the flagship
// screens and to the rest of the design/architecture stack. It is documentation as
// strongly typed Swift — no SwiftUI, no routing, no networking, no persistence, no DTO,
// no AppContainer, and no `import` is needed. Components and screens are referenced by
// stable id; screen references are validated against `TravelScreenRegistry` and
// component/dependency references against this registry itself.

/// The kind of a registered component.
enum ComponentCategory: String, CaseIterable, Hashable {
    case designToken
    case layout
    case surface
    case hero
    case metric
    case chart
    case timeline
    case sharedData
    case navigation
}

/// How complete / stable a component is.
enum ComponentReadiness: String, CaseIterable, Hashable {
    case stable
    case ready
    case beta
    case deprecated
}

/// The kind of relationship between a component and a dependency.
enum DependencyType: String, CaseIterable, Hashable {
    case component     // another reusable component
    case designSystem  // a design token
    case sharedData    // a shared-data module
    case navigation    // a navigation-architecture module
}

/// A single resolved dependency edge (target id + relationship).
struct DependencyDescriptor: Identifiable, Hashable {
    let id: String      // target component id
    var type: DependencyType
}

/// A complete description of one reusable component.
struct ComponentDescriptor: Identifiable, Hashable {
    let id: String
    var name: String
    var category: ComponentCategory
    var buildPhase: String
    var readiness: ComponentReadiness
    var consumedByScreenIDs: [String]
    var dependsOnComponentIDs: [String]
    var designSystemDependencies: [String]
    var sharedDataDependencies: [String]
    var navigationDependencies: [String]
}

/// The result of validating the registry.
struct ComponentValidation: Hashable {
    var duplicateIdentifiers: [String]
    var unresolvedScreenReferences: [String]
    var unresolvedDependencyReferences: [String]
    var orphanComponents: [String]

    var isValid: Bool {
        duplicateIdentifiers.isEmpty
            && unresolvedScreenReferences.isEmpty
            && unresolvedDependencyReferences.isEmpty
            && orphanComponents.isEmpty
    }
}

// MARK: - The registry

enum TravelComponentDependencyRegistry {

    /// Categories whose components are "reusable UI" and so must not be orphaned.
    private static let reusableUICategories: Set<ComponentCategory> = [.layout, .surface, .hero, .metric, .chart, .timeline]

    private static let flagshipScreenIDs = ["home-v2", "destination-hub", "journey", "trip-planner-v2", "island-guide"]

    // MARK: Every reusable component

    static let allComponents: [ComponentDescriptor] = [

        // Design tokens
        ComponentDescriptor(id: "travel-theme", name: "TravelTheme", category: .designToken, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: [], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "travel-typography", name: "TravelTypography", category: .designToken, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: [], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "travel-motion", name: "TravelMotion", category: .designToken, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: [], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "travel-semantics", name: "TravelSemantics", category: .designToken, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: [], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: []),

        // Layout primitives
        ComponentDescriptor(id: "premium-scroll-view", name: "PremiumScrollView", category: .layout, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "premium-section", name: "PremiumSection", category: .layout, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: [], designSystemDependencies: ["travel-typography"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "premium-adaptive-grid", name: "PremiumAdaptiveGrid", category: .layout, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme"], sharedDataDependencies: [], navigationDependencies: []),

        // Surfaces
        ComponentDescriptor(id: "glass-card", name: "GlassCard", category: .surface, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme", "travel-semantics"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "map-texture-placeholder", name: "MapTexturePlaceholder", category: .surface, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "premium-empty-state", name: "PremiumEmptyState", category: .surface, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["journey", "trip-planner-v2"], dependsOnComponentIDs: ["glass-card"], designSystemDependencies: ["travel-typography", "travel-semantics"], sharedDataDependencies: [], navigationDependencies: []),

        // Hero
        ComponentDescriptor(id: "feature-hero-scaffold", name: "FeatureHeroScaffold", category: .hero, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: ["glass-card", "hero-metric-tile", "map-texture-placeholder"], designSystemDependencies: ["travel-theme", "travel-typography"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "hero-metric-tile", name: "HeroMetricTile", category: .hero, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: flagshipScreenIDs, dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme", "travel-typography"], sharedDataDependencies: [], navigationDependencies: []),

        // Metrics
        ComponentDescriptor(id: "premium-metric-tile", name: "PremiumMetricTile", category: .metric, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["home-v2", "destination-hub", "journey", "trip-planner-v2"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-typography"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "premium-pill-row", name: "PremiumPillRow", category: .metric, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["nav-preview-shell", "app-nav-shell"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-typography"], sharedDataDependencies: [], navigationDependencies: []),

        // Charts
        ComponentDescriptor(id: "premium-progress-bar", name: "PremiumProgressBar", category: .chart, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["home-v2", "journey", "trip-planner-v2"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme", "travel-motion"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "premium-ring-progress", name: "PremiumRingProgress", category: .chart, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["home-v2", "destination-hub", "trip-planner-v2"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme", "travel-motion"], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "premium-bar-chart", name: "PremiumBarChart", category: .chart, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["budget", "weather"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme"], sharedDataDependencies: [], navigationDependencies: []),

        // Timeline
        ComponentDescriptor(id: "premium-timeline", name: "PremiumTimelineComponents", category: .timeline, buildPhase: "Phase 10", readiness: .stable, consumedByScreenIDs: ["journey", "trip-timeline"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme", "travel-typography"], sharedDataDependencies: [], navigationDependencies: []),

        // Shared data
        ComponentDescriptor(id: "demo-data", name: "TravelDemoData", category: .sharedData, buildPhase: "Integration 001", readiness: .ready, consumedByScreenIDs: ["home-v2", "destination-hub", "journey", "trip-planner-v2", "island-guide", "nav-preview-shell"], dependsOnComponentIDs: [], designSystemDependencies: ["travel-theme"], sharedDataDependencies: [], navigationDependencies: []),

        // Navigation architecture
        ComponentDescriptor(id: "nav-model", name: "TravelNavigationModel", category: .navigation, buildPhase: "Integration 002", readiness: .ready, consumedByScreenIDs: ["nav-preview-shell"], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: []),
        ComponentDescriptor(id: "nav-coordinator", name: "TravelNavigationCoordinator", category: .navigation, buildPhase: "Integration 003", readiness: .ready, consumedByScreenIDs: ["nav-preview-shell"], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: ["nav-model"]),
        ComponentDescriptor(id: "screen-registry", name: "TravelScreenRegistry", category: .navigation, buildPhase: "Integration 005", readiness: .ready, consumedByScreenIDs: ["nav-preview-shell"], dependsOnComponentIDs: [], designSystemDependencies: [], sharedDataDependencies: [], navigationDependencies: [])
    ]

    // MARK: Derived views

    static var reusableComponents: [ComponentDescriptor] {
        allComponents.filter { reusableUICategories.contains($0.category) }
    }

    /// For each flagship screen, the components that declare they are consumed by it.
    static var flagshipDependencies: [String: [String]] {
        var result: [String: [String]] = [:]
        for screenID in flagshipScreenIDs {
            result[screenID] = allComponents
                .filter { $0.consumedByScreenIDs.contains(screenID) }
                .map { $0.id }
        }
        return result
    }

    /// The outgoing dependency edges for one component, typed.
    static func dependencies(of component: ComponentDescriptor) -> [DependencyDescriptor] {
        component.dependsOnComponentIDs.map { DependencyDescriptor(id: $0, type: .component) }
            + component.designSystemDependencies.map { DependencyDescriptor(id: $0, type: .designSystem) }
            + component.sharedDataDependencies.map { DependencyDescriptor(id: $0, type: .sharedData) }
            + component.navigationDependencies.map { DependencyDescriptor(id: $0, type: .navigation) }
    }

    /// The full dependency graph: component id → typed outgoing edges.
    static var dependencyGraph: [String: [DependencyDescriptor]] {
        var graph: [String: [DependencyDescriptor]] = [:]
        for component in allComponents {
            graph[component.id] = dependencies(of: component)
        }
        return graph
    }

    /// Components ordered so dependencies come before dependents: tokens, then UI
    /// primitives, then shared data, then navigation — stable by id.
    static var integrationOrder: [ComponentDescriptor] {
        allComponents.sorted { lhs, rhs in
            let l = categoryRank(lhs.category)
            let r = categoryRank(rhs.category)
            if l != r { return l < r }
            return lhs.id < rhs.id
        }
    }

    private static func categoryRank(_ category: ComponentCategory) -> Int {
        switch category {
        case .designToken: return 0
        case .layout, .surface, .hero, .metric, .chart, .timeline: return 1
        case .sharedData: return 2
        case .navigation: return 3
        }
    }

    // MARK: Search

    static func search(id: String) -> ComponentDescriptor? {
        allComponents.first { $0.id == id }
    }

    static func search(name: String) -> [ComponentDescriptor] {
        let needle = name.lowercased()
        guard !needle.isEmpty else { return [] }
        return allComponents.filter { $0.name.lowercased().contains(needle) }
    }

    // MARK: Validation

    static var validation: ComponentValidation {
        // Duplicate component identifiers
        var counts: [String: Int] = [:]
        for component in allComponents { counts[component.id, default: 0] += 1 }
        let duplicates = counts.filter { $0.value > 1 }.keys.sorted()

        // Screen references must exist in the screen registry
        let knownScreens = Set(TravelScreenRegistry.allScreens.map { $0.id })
        var seenScreens: Set<String> = []
        var unresolvedScreens: [String] = []
        for component in allComponents {
            for screenID in component.consumedByScreenIDs where !knownScreens.contains(screenID) && !seenScreens.contains(screenID) {
                seenScreens.insert(screenID)
                unresolvedScreens.append(screenID)
            }
        }

        // Dependency references must exist in this registry
        let knownComponents = Set(allComponents.map { $0.id })
        var seenDeps: Set<String> = []
        var unresolvedDeps: [String] = []
        for component in allComponents {
            let refs = component.dependsOnComponentIDs + component.designSystemDependencies + component.sharedDataDependencies + component.navigationDependencies
            for ref in refs where !knownComponents.contains(ref) && !seenDeps.contains(ref) {
                seenDeps.insert(ref)
                unresolvedDeps.append(ref)
            }
        }

        // Orphans: reusable UI components consumed by no screen and depended on by nobody
        var dependedOn: Set<String> = []
        for component in allComponents {
            for ref in component.dependsOnComponentIDs { dependedOn.insert(ref) }
        }
        let orphans = allComponents
            .filter { reusableUICategories.contains($0.category) && $0.consumedByScreenIDs.isEmpty && !dependedOn.contains($0.id) }
            .map { $0.id }
            .sorted()

        return ComponentValidation(
            duplicateIdentifiers: Array(duplicates),
            unresolvedScreenReferences: unresolvedScreens.sorted(),
            unresolvedDependencyReferences: unresolvedDeps.sorted(),
            orphanComponents: orphans
        )
    }

    /// True when the registry is internally consistent and its screen registry is valid.
    static var isConsistent: Bool {
        validation.isValid && TravelScreenRegistry.isValid
    }
}
