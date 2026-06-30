// MARK: - Travel launch readiness (Integration 009)
//
// The final architectural readiness report before Xcode integration. It answers one
// question — "if Xcode were installed today, what exactly would we do first?" — as
// strongly typed Swift data, cross-checked against the screen registry, canonical
// screen plan, component dependency registry and integration readiness report.
//
// Pure data only: no SwiftUI, no routing, no networking, no persistence, no DTO, no
// AppContainer, and no `import`. It reuses `ReadinessChecklistItem` and
// `IntegrationRiskLevel` from the integration readiness report (same module).

/// One scored readiness dimension.
struct ReadinessDimension: Identifiable, Hashable {
    let id: String
    var name: String
    var score: Double     // 0...1
    var summary: String
}

/// The overall launch readiness score and its dimensions.
struct LaunchReadinessScore: Hashable {
    var overall: Double
    var dimensions: [ReadinessDimension]
}

/// A piece of remaining technical debt.
struct TechnicalDebtItem: Identifiable, Hashable {
    let id: String
    var title: String
    var detail: String
}

/// A known build risk.
struct BuildRiskItem: Identifiable, Hashable {
    let id: String
    var title: String
    var level: IntegrationRiskLevel
    var detail: String
    var mitigation: String
}

/// A recommended Xcode work session.
struct LaunchWorkSession: Identifiable, Hashable {
    let id: Int
    var title: String
    var goal: String
    var steps: [String]
}

/// A manual test plan (simulator or device).
struct LaunchTestPlan: Identifiable, Hashable {
    let id: String
    var name: String
    var steps: [String]
}

/// The concrete launch plan.
struct LaunchPlan: Hashable {
    var filesToConnectFirst: [String]
    var filesToLeaveUntouched: [String]
    var firstNavigationStackTargets: [String]
    var knownDuplicateAreas: [String]
    var remainingTechnicalDebt: [TechnicalDebtItem]
    var knownBuildRisks: [BuildRiskItem]
    var simulatorTestPlan: LaunchTestPlan
    var iphoneTestPlan: LaunchTestPlan
    var betaChecklist: [ReadinessChecklistItem]
    var productionChecklist: [ReadinessChecklistItem]
    var workSessions: [LaunchWorkSession]
}

/// The result of validating this report against the other registries.
struct LaunchValidation: Hashable {
    var registriesConsistent: Bool
    var unresolvedNavigationTargets: [String]
    var scoresInRange: Bool

    var isValid: Bool {
        registriesConsistent && unresolvedNavigationTargets.isEmpty && scoresInRange
    }
}

// MARK: - The report

enum TravelLaunchReadiness {

    /// The minimum overall score considered "ready to open in Xcode".
    static let readyThreshold = 0.75

    // MARK: Readiness score

    static var readiness: LaunchReadinessScore {
        let dimensions = [
            ReadinessDimension(id: "architecture", name: "Architecture", score: 0.90, summary: "Screen registry, canonical plan and dependency graph are complete and self-validating."),
            ReadinessDimension(id: "navigation", name: "Navigation", score: 0.80, summary: "Model + coordinator + interactive preview shell exist; a real NavigationStack is not wired yet."),
            ReadinessDimension(id: "shared-data", name: "Shared data", score: 0.60, summary: "One canonical journey with adapters for all 5 flagships; ~24 topical screens still carry inline samples."),
            ReadinessDimension(id: "component", name: "Components", score: 0.90, summary: "Reusable components are catalogued and mapped to the flagships with no orphans."),
            ReadinessDimension(id: "design-system", name: "Design system", score: 0.95, summary: "Tokens and premium primitives are stable and used consistently across every screen."),
            ReadinessDimension(id: "demo-data", name: "Demo data", score: 0.80, summary: "A complete Indonesia journey (traveller, trip, bookings, budget, activities) drives the flagships.")
        ]
        let overall = dimensions.isEmpty ? 0 : dimensions.map { $0.score }.reduce(0, +) / Double(dimensions.count)
        return LaunchReadinessScore(overall: overall, dimensions: dimensions)
    }

    // MARK: Launch plan

    static var launchPlan: LaunchPlan {
        LaunchPlan(
            filesToConnectFirst: [
                "TravelDemoData.swift",
                "TravelNavigationModel.swift",
                "TravelNavigationCoordinator.swift",
                "TravelHomeDashboardV2.swift",
                "TravelDestinationHubDashboard.swift",
                "TravelJourneyDashboard.swift",
                "TravelTripPlannerDashboardV2.swift",
                "TravelIslandGuideDashboard.swift",
                "TravelNavigationPreviewShell.swift"
            ],
            filesToLeaveUntouched: [
                "TravelIntelligenceApp.swift",
                "RootFlowView.swift",
                "RootShellView.swift",
                "NavigationCoordinator.swift",
                "TravelRoute.swift",
                "TravelTab.swift",
                "FeatureRegistry.swift",
                "AppContainer.swift",
                "Core/DTOs/*",
                "Core/ViewModels/*",
                "Core/Repositories/*",
                "Core/DataSources/*"
            ],
            firstNavigationStackTargets: firstNavigationStackTargets,
            knownDuplicateAreas: knownDuplicateAreas,
            remainingTechnicalDebt: [
                TechnicalDebtItem(id: "debt-booking-arity", title: "BookingManager ViewBuilder arity", detail: "TravelBookingManagerDashboard's body exceeds 10 direct children; split into grouped sub-views before reuse."),
                TechnicalDebtItem(id: "debt-adapters", title: "Adapter coverage", detail: "Only the 5 flagships consume TravelDemoData; the remaining topical screens still own inline samples."),
                TechnicalDebtItem(id: "debt-duplicates", title: "Duplicate screens", detail: "Several feature areas have overlapping screens; consolidate per TravelCanonicalScreenPlan."),
                TechnicalDebtItem(id: "debt-explorer", title: "Legacy Explorer guides", detail: "Older Explorer* guides overlap the newer dashboards and should be retired during consolidation.")
            ],
            knownBuildRisks: [
                BuildRiskItem(id: "build-ci-gap", title: "SwiftUI layer unbuilt by CI", level: .high, detail: "CI only compiles the Foundation TravelCore; the SwiftUI surface has only been type-checked headlessly.", mitigation: "Add a real Xcode/simulator build target to CI."),
                BuildRiskItem(id: "build-no-sdk", title: "No iOS SDK locally", level: .high, detail: "Verification used the macOS SDK with availability targets; the iOS build is unproven.", mitigation: "First Xcode session is a full iOS build on a simulator."),
                BuildRiskItem(id: "build-booking", title: "BookingManager arity defect", level: .medium, detail: "Trips the CLI toolchain type-check; benign under Xcode today but fragile if edited.", mitigation: "Refactor its body early.")
            ],
            simulatorTestPlan: LaunchTestPlan(id: "simulator", name: "First simulator test plan", steps: [
                "Build the app for an iPhone 15 simulator.",
                "Launch the TravelNavigationPreviewShell and confirm it renders.",
                "Tap each navigation button (Home, Journey, Trip Planner, Destination Hub, Island Guide).",
                "Confirm breadcrumb, recent destinations and the placeholder routing card update.",
                "Render each of the 5 flagship dashboards from TravelDemoData adapters.",
                "Toggle Dynamic Type XL and Reduce Motion and re-check layout."
            ]),
            iphoneTestPlan: LaunchTestPlan(id: "iphone", name: "First iPhone test plan", steps: [
                "Run on a physical iPhone over a development profile.",
                "Verify scroll performance and animation smoothness on each flagship.",
                "Confirm safe-area and notch handling on the navigation shell and bottom bar.",
                "Check VoiceOver reads the hero, cards and buttons in order.",
                "Confirm there is genuinely no networking (airplane mode renders identically)."
            ]),
            betaChecklist: [
                ReadinessChecklistItem(id: "beta-build", title: "App builds & runs on simulator", done: false, note: "Full iOS build, not just headless type-check."),
                ReadinessChecklistItem(id: "beta-tabs", title: "6 tabs wired additively", done: false, note: "Home, Trips, Places, Journey, Explore, Profile."),
                ReadinessChecklistItem(id: "beta-stack", title: "Flagships in a NavigationStack", done: false, note: "Driven by the coordinator's breadcrumb."),
                ReadinessChecklistItem(id: "beta-adapters", title: "Flagships use shared demo data", done: false, note: "No inline samples on the flagships."),
                ReadinessChecklistItem(id: "beta-a11y", title: "Accessibility pass", done: false, note: "VoiceOver + Dynamic Type on every flagship.")
            ],
            productionChecklist: [
                ReadinessChecklistItem(id: "prod-data", title: "Real data layer", done: false, note: "Replace demo data with persisted trip/booking/budget models."),
                ReadinessChecklistItem(id: "prod-consolidate", title: "Duplicates consolidated", done: false, note: "Collapse to canonical screens; retire Explorer guides."),
                ReadinessChecklistItem(id: "prod-placeholders", title: "Placeholders replaced", done: false, note: "Live weather, currency, connectivity, maps and calendar."),
                ReadinessChecklistItem(id: "prod-ci", title: "CI builds the app", done: false, note: "Simulator build + UI smoke tests in CI."),
                ReadinessChecklistItem(id: "prod-decision", title: "Memories vs intelligence resolved", done: false, note: "One coherent product, or a deliberate split.")
            ],
            workSessions: [
                LaunchWorkSession(id: 1, title: "Get it building", goal: "A green iOS build with every flagship rendering.", steps: [
                    "Open the project in Xcode and select an iPhone simulator.",
                    "Build the full SwiftUI target and fix anything headless checks missed.",
                    "Refactor the BookingManager body into grouped sub-views.",
                    "Render the 5 flagship previews from TravelDemoData adapters."
                ]),
                LaunchWorkSession(id: 2, title: "Wire the spine", goal: "Real navigation across the 5 flagships.", steps: [
                    "Add the 6 tabs additively to TravelTab/TravelRoute.",
                    "Wrap the flagships in a NavigationStack.",
                    "Bind TravelNavigationCoordinator to a NavigationPath (open/goBack/reset).",
                    "Inject the shared demo data into each flagship."
                ]),
                LaunchWorkSession(id: 3, title: "Fan out & consolidate", goal: "Depth and a cleaner estate.", steps: [
                    "Push the highest-value topical screens from the Planner and Hub.",
                    "Add TravelDemoData adapters to those topical screens.",
                    "Begin merging duplicate areas per TravelCanonicalScreenPlan.mergeOrder.",
                    "Retire the superseded Explorer guides."
                ])
            ]
        )
    }

    // MARK: Cross-registry derived facts

    static var firstNavigationStackTargets: [String] {
        TravelScreenRegistry.flagshipScreens.map { $0.id }
    }

    static var knownDuplicateAreas: [String] {
        TravelCanonicalScreenPlan.allFeatureAreas
            .filter { $0.status == .consolidationPending }
            .map { $0.name }
    }

    // MARK: Validation

    static var validation: LaunchValidation {
        let registriesConsistent =
            TravelScreenRegistry.isValid
            && TravelCanonicalScreenPlan.isConsistent
            && TravelComponentDependencyRegistry.isConsistent
            && TravelIntegrationReadinessReport.isConsistent

        // Every first-stack target must exist and be a flagship screen.
        let flagshipIDs = Set(TravelScreenRegistry.flagshipScreens.map { $0.id })
        let unresolved = firstNavigationStackTargets.filter { !flagshipIDs.contains($0) }.sorted()

        let score = readiness
        let scoresInRange = (0...1).contains(score.overall) && score.dimensions.allSatisfy { (0...1).contains($0.score) }

        return LaunchValidation(
            registriesConsistent: registriesConsistent,
            unresolvedNavigationTargets: unresolved,
            scoresInRange: scoresInRange
        )
    }

    /// True when every registry is consistent and the overall score clears the threshold.
    static var isReadyForXcode: Bool {
        validation.isValid && readiness.overall >= readyThreshold
    }
}
