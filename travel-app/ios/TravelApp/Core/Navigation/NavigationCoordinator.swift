import SwiftUI
import Observation

/// The single source of truth for app navigation.
///
/// The coordinator owns which root tab is selected and the lightweight
/// navigation context (last feature, accessibility preferences), and exposes
/// intent methods (`select`, `open`, `handle(url:)`) instead of letting views
/// mutate raw state. Deep links resolve through `TravelRoute`, so the app is
/// ready to accept external navigation in a later phase without any view
/// changes. No networking or persistence is involved — selection is in-memory.
@Observable
final class NavigationCoordinator {
    /// The currently selected root tab.
    var selectedTab: TravelTab

    /// The previously selected root tab, for "back to where I was" affordances.
    var lastSelectedFeature: TravelTab

    /// Accessibility preference carried through navigation, honoured by views
    /// that can soften material effects.
    var prefersReducedGlass: Bool

    init(selectedTab: TravelTab = .home, prefersReducedGlass: Bool = false) {
        self.selectedTab = selectedTab
        self.lastSelectedFeature = selectedTab
        self.prefersReducedGlass = prefersReducedGlass
    }

    /// Select a root tab, recording the previous selection.
    func select(_ tab: TravelTab) {
        guard tab != selectedTab else { return }
        lastSelectedFeature = selectedTab
        selectedTab = tab
    }

    /// Navigate to a route, mapping it onto the nearest root tab. Explore-only
    /// and future features surface the Explore hub, ready for a later phase to
    /// push the specific destination onto Explore's stack.
    @discardableResult
    func open(_ route: TravelRoute) -> Bool {
        select(route.rootTab)
        return true
    }

    /// Handle a `travelintelligence://` deep-link URL. Returns `false` for
    /// URLs this app does not recognise.
    @discardableResult
    func handle(url: URL) -> Bool {
        guard let route = TravelRoute(url: url) else { return false }
        return open(route)
    }
}
