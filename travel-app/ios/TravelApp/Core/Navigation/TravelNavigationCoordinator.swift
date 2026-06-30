// MARK: - Travel navigation coordinator (Integration 003)
//
// The first reusable navigation coordinator. It owns a `NavigationState`, reads the
// `TravelNavigationModel` blueprint, and exposes pure read accessors and mutating
// methods. It is the bridge between the navigation data model and a future
// `NavigationStack` integration — but it is NOT production navigation: it defines no
// SwiftUI views, performs no routing, and has no UI.
//
// Everything here is plain Swift — no `import` is needed. The coordinator is a reference
// type (it "owns" the state across mutations) but conforms to no framework protocol
// (no Observable / ObservableObject), so it stays architecture-only. A future shell can
// wrap or observe it without this file depending on SwiftUI.
//
// No networking, persistence, repository, view-model, AppContainer, DTO, View, routing,
// NavigationStack or NavigationLink — coordination logic only.

/// A pure, presentation-only coordinator over `TravelNavigationModel` + `NavigationState`.
final class TravelNavigationCoordinator {

    /// The owned navigation state. Mutated only through this coordinator's methods.
    private(set) var state: NavigationState

    init(state: NavigationState = TravelNavigationModel.initialState) {
        self.state = state
    }

    // MARK: Reads

    /// The currently selected top-level group, if it resolves.
    var currentGroup: NavigationGroup? {
        TravelNavigationModel.group(state.selectedGroupID)
    }

    /// The currently selected destination, if it resolves.
    var currentDestination: NavigationDestination? {
        TravelNavigationModel.destination(state.selectedDestinationID)
    }

    /// The breadcrumb trail, resolved to destinations (root-first).
    var breadcrumbs: [NavigationDestination] {
        state.breadcrumb.compactMap { TravelNavigationModel.destination($0) }
    }

    /// Recently visited destinations, resolved (most-recent-first).
    var recentDestinations: [NavigationDestination] {
        state.recent.compactMap { TravelNavigationModel.destination($0) }
    }

    /// The quick-jump shortcuts available from the blueprint.
    var availableShortcuts: [NavigationShortcut] {
        TravelNavigationModel.quickShortcuts
    }

    /// Whether there is somewhere to go back to in the current group.
    var canGoBack: Bool { state.canGoBack }

    // MARK: Mutations

    /// Open a destination by id, pushing it onto the breadcrumb. No-op for unknown ids.
    func open(destination id: String) {
        guard TravelNavigationModel.destination(id) != nil else { return }
        state.open(id)
    }

    /// Switch to a group, resetting to its root destination. No-op for unknown groups.
    func open(group id: String) {
        guard let root = TravelNavigationModel.rootDestinationID(of: id) else { return }
        state.select(group: id, rootDestinationID: root)
    }

    /// Go back one step in the breadcrumb.
    func goBack() {
        state.back()
    }

    /// Reset to the app's initial navigation state.
    func reset() {
        state = TravelNavigationModel.initialState
    }

    // MARK: Convenience openers

    /// Open the Home group on Home Dashboard V2.
    func openHome() {
        open(group: "home")
    }

    /// Switch to the Journey group and open the Journey Dashboard.
    func openJourney() {
        focus(destination: "journey", inGroup: "journey")
    }

    /// Switch to the Trips group and open the Trip Planner V2.
    func openTripPlanner() {
        focus(destination: "trip-planner-v2", inGroup: "trips")
    }

    /// Switch to the Destinations group and open the Destination Hub.
    func openDestinationHub() {
        focus(destination: "destination-hub", inGroup: "destinations")
    }

    /// Switch to the Explore group and open the Island Guide.
    func openIslandGuide() {
        focus(destination: "island-guide", inGroup: "explore")
    }

    // MARK: Helpers

    /// Select a group, then open a destination within it (skipping a redundant push when
    /// the destination is already the group's root).
    private func focus(destination destinationID: String, inGroup groupID: String) {
        open(group: groupID)
        if state.selectedDestinationID != destinationID {
            open(destination: destinationID)
        }
    }
}
