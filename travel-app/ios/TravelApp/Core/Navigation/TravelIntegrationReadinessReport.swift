// MARK: - Travel integration readiness report (Integration 006)
//
// A pure-data report that explains what is ready to wire into the real app, what still
// needs cleanup, and what should stay demo-only. It is data only — no SwiftUI, no
// routing, no networking, no persistence, no AppContainer, no DTO — and needs no
// `import`. It derives its counts and lists from `TravelScreenRegistry`, and references
// screens by stable id so it can be validated without running the app.

/// How serious an integration risk is.
enum IntegrationRiskLevel: String, CaseIterable, Hashable {
    case low
    case medium
    case high
}

/// A recommended action for a cluster of overlapping screens.
enum ClusterAction: String, CaseIterable, Hashable {
    case keepAll      // complementary — keep each
    case merge        // fold the others into the canonical
    case retire       // drop the non-canonical entirely
}

/// A headline count summary of the screen estate.
struct ReadinessSummary: Hashable {
    var totalScreens: Int
    var flagshipScreens: Int
    var demoWiredScreens: Int
    var presentationOnlyScreens: Int
    var dataModelScreens: Int
    var readyScreens: Int
    var betaScreens: Int
    var placeholderScreens: Int
}

/// A cluster of screens that cover the same concept.
struct DuplicateConceptCluster: Identifiable, Hashable {
    let id: String           // concept key
    var concept: String
    var screenIDs: [String]
    var recommendedCanonicalID: String
    var action: ClusterAction
    var rationale: String
}

/// A single checklist item.
struct ReadinessChecklistItem: Identifiable, Hashable {
    let id: String
    var title: String
    var done: Bool
    var note: String
}

/// A known integration risk.
struct IntegrationRisk: Identifiable, Hashable {
    let id: String
    var title: String
    var level: IntegrationRiskLevel
    var detail: String
    var mitigation: String
}

// MARK: - The report

enum TravelIntegrationReadinessReport {

    // MARK: Summary (derived from the registry)

    static var summary: ReadinessSummary {
        let all = TravelScreenRegistry.allScreens
        return ReadinessSummary(
            totalScreens: all.count,
            flagshipScreens: all.filter { $0.readiness == .flagship }.count,
            demoWiredScreens: all.filter { $0.presentation == .demoWired }.count,
            presentationOnlyScreens: all.filter { $0.presentation == .presentationOnly }.count,
            dataModelScreens: all.filter { $0.presentation == .dataModel }.count,
            readyScreens: all.filter { $0.readiness == .ready }.count,
            betaScreens: all.filter { $0.readiness == .beta }.count,
            placeholderScreens: all.filter { $0.readiness == .placeholder }.count
        )
    }

    // MARK: Screen breakdowns

    static var flagshipScreens: [ScreenDescriptor] {
        TravelScreenRegistry.flagshipScreens
    }

    static var demoWiredScreens: [ScreenDescriptor] {
        TravelScreenRegistry.allScreens.filter { $0.presentation == .demoWired }
    }

    static var presentationOnlyScreens: [ScreenDescriptor] {
        TravelScreenRegistry.allScreens.filter { $0.presentation == .presentationOnly }
    }

    /// Screens that already have a shared-demo-data adapter (or own their state) and a
    /// view, so they can be placed in a `NavigationStack` immediately.
    static var screensReadyForNavigationStack: [ScreenDescriptor] {
        TravelScreenRegistry.allScreens.filter { $0.presentation == .demoWired }
    }

    /// Presentation-only screens that still need a `TravelDemoData` adapter before they
    /// can share the one journey instead of their own inline sample.
    static var screensNeedingAdapterWork: [ScreenDescriptor] {
        TravelScreenRegistry.allScreens.filter { $0.presentation == .presentationOnly && $0.readiness == .ready }
    }

    // MARK: Duplicate concept clusters

    static let duplicateClusters: [DuplicateConceptCluster] = [
        DuplicateConceptCluster(id: "connectivity", concept: "Connectivity", screenIDs: ["connectivity", "connectivity-esim"], recommendedCanonicalID: "connectivity", action: .merge, rationale: "Two overlapping connectivity screens; fold the eSIM-specific detail into the broader one."),
        DuplicateConceptCluster(id: "money", concept: "Money & budget", screenIDs: ["money-costs", "currency", "budget"], recommendedCanonicalID: "money-costs", action: .merge, rationale: "Currency, costs and budgeting overlap heavily; consolidate into one Money screen with sub-sections."),
        DuplicateConceptCluster(id: "health", concept: "Health & safety", screenIDs: ["health", "health-medical", "emergency-safety"], recommendedCanonicalID: "health", action: .merge, rationale: "Medical and emergency content duplicates the combined Health & Safety screen."),
        DuplicateConceptCluster(id: "transport", concept: "Getting around", screenIDs: ["transport-getting-around", "taxi-rideshare", "local-transport"], recommendedCanonicalID: "transport-getting-around", action: .merge, rationale: "Three transport screens; merge taxi and local transport as sub-sections."),
        DuplicateConceptCluster(id: "destination", concept: "Destination overview", screenIDs: ["destination-hub", "destination-guide"], recommendedCanonicalID: "destination-hub", action: .merge, rationale: "The hub supersedes the older single-destination guide."),
        DuplicateConceptCluster(id: "dive", concept: "Diving guides", screenIDs: ["dive-log", "dive-surf"], recommendedCanonicalID: "dive-log", action: .merge, rationale: "The dive & surf guide overlaps the dive log; keep snorkel and liveaboard standalone."),
        DuplicateConceptCluster(id: "shell", concept: "Navigation shell", screenIDs: ["nav-preview-shell", "app-nav-shell"], recommendedCanonicalID: "nav-preview-shell", action: .retire, rationale: "The earlier app-nav-shell prototype is superseded by the architecture-backed preview shell.")
    ]

    /// The canonical screen ids recommended to keep from the duplicate clusters.
    static var recommendedCanonicalScreenIDs: [String] {
        var seen: Set<String> = []
        var ordered: [String] = []
        for cluster in duplicateClusters where !seen.contains(cluster.recommendedCanonicalID) {
            seen.insert(cluster.recommendedCanonicalID)
            ordered.append(cluster.recommendedCanonicalID)
        }
        return ordered
    }

    /// Screen ids recommended to merge into a canonical or retire entirely.
    static var screensNeedingMergeOrRetirement: [String] {
        var ids: [String] = []
        for cluster in duplicateClusters {
            for id in cluster.screenIDs where id != cluster.recommendedCanonicalID {
                ids.append(id)
            }
        }
        return ids
    }

    // MARK: Risks

    static let risks: [IntegrationRisk] = [
        IntegrationRisk(id: "risk-divergence", title: "Two parallel apps", level: .high, detail: "A 'travel memories' MVVM app (TravelRoute/TravelTab + DTOs/ViewModels) and the new 'travel intelligence' presentation library coexist but never connect.", mitigation: "Make an explicit product decision: promote Home V2 as the root behind a flag, or keep the memories app reachable from a tab."),
        IntegrationRisk(id: "risk-booking-arity", title: "BookingManager ViewBuilder arity defect", level: .medium, detail: "TravelBookingManagerDashboard's body exceeds 10 direct children and fails the CLI toolchain type-check; harmless under Xcode today but will bite if that file is split during integration.", mitigation: "Refactor its body into grouped sub-views before reusing it."),
        IntegrationRisk(id: "risk-adapters", title: "Most modules still self-sourced", level: .medium, detail: "Only the 5 flagships have TravelDemoData adapters; ~25 topical screens still carry their own inline sample data.", mitigation: "Add adapters incrementally (see screensNeedingAdapterWork) so the whole app shares one journey."),
        IntegrationRisk(id: "risk-namespace", title: "Generic type-name pressure", level: .medium, detail: "The shared namespace is filling up; collisions have already occurred (TransportMode, FerryRoute, ShellAppear).", mitigation: "Keep per-screen prefixes and lean on the shared models/registry rather than new bespoke types."),
        IntegrationRisk(id: "risk-ci-gap", title: "SwiftUI layer never built by CI", level: .high, detail: "No iOS SDK locally and CI only compiles the Foundation TravelCore; the entire SwiftUI surface is unverified by automation.", mitigation: "Add a real Xcode build target / simulator build to CI before trusting integration.")
    ]

    // MARK: Checklists

    static let xcodeReadinessChecklist: [ReadinessChecklistItem] = [
        ReadinessChecklistItem(id: "xcode-open", title: "Open the project in Xcode", done: false, note: "The SwiftUI layer has only been type-checked headlessly so far."),
        ReadinessChecklistItem(id: "xcode-target", title: "Confirm iOS deployment target", done: false, note: "Components use iOS 17-era SwiftUI; confirm the app target matches."),
        ReadinessChecklistItem(id: "xcode-build", title: "Build the full SwiftUI target", done: false, note: "CI builds only TravelCore; a real build will surface anything headless checks missed."),
        ReadinessChecklistItem(id: "xcode-booking", title: "Fix the BookingManager arity defect", done: false, note: "Split its body into grouped sub-views."),
        ReadinessChecklistItem(id: "xcode-previews", title: "Render every flagship preview", done: false, note: "Confirm the 5 flagships render from TravelDemoData adapters."),
        ReadinessChecklistItem(id: "xcode-simulator", title: "Run the preview shell on a simulator", done: false, note: "Exercise the coordinator navigation interactively.")
    ]

    static let firstRunnableAppChecklist: [ReadinessChecklistItem] = [
        ReadinessChecklistItem(id: "run-decision", title: "Decide Home V2 vs memories Home", done: false, note: "Pick the launch root (recommend Home V2 behind a flag)."),
        ReadinessChecklistItem(id: "run-tabs", title: "Add 6 real tabs additively", done: false, note: "Home, Trips, Places, Journey, Explore, Profile in TravelTab/TravelRoute."),
        ReadinessChecklistItem(id: "run-stack", title: "Wrap flagships in a NavigationStack", done: false, note: "Drive it from TravelNavigationCoordinator's breadcrumb."),
        ReadinessChecklistItem(id: "run-wire-flagships", title: "Wire the 5 flagships via adapters", done: false, note: "Use TravelDemoData so they share one journey."),
        ReadinessChecklistItem(id: "run-fanout", title: "Fan out Planner & Hub to top modules", done: false, note: "Push ~10 highest-value topical screens."),
        ReadinessChecklistItem(id: "run-coordinator", title: "Bind the coordinator to NavigationPath", done: false, note: "Map open/goBack/reset to the real stack.")
    ]

    // MARK: Next task

    static let recommendedNextTask: String =
        "Integration 007 — Canonical Screen Consolidation Plan (data-only): produce a pure-data plan mapping each duplicate cluster to its canonical screen, with explicit redirects for every merged/retired id, so a later integration can collapse duplicates unambiguously. No production code changes."

    // MARK: Validation

    /// Every screen id referenced by clusters that is not in the registry (should be empty).
    static var unresolvedScreenReferences: [String] {
        let known = Set(TravelScreenRegistry.allScreens.map { $0.id })
        var ids: [String] = []
        for cluster in duplicateClusters {
            ids.append(contentsOf: cluster.screenIDs)
            ids.append(cluster.recommendedCanonicalID)
        }
        var seen: Set<String> = []
        var missing: [String] = []
        for id in ids where !known.contains(id) && !seen.contains(id) {
            seen.insert(id)
            missing.append(id)
        }
        return missing
    }

    /// True when the report and the registry agree and the registry itself is valid.
    static var isConsistent: Bool {
        unresolvedScreenReferences.isEmpty && TravelScreenRegistry.isValid
    }
}
