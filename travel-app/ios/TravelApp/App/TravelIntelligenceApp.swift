import SwiftUI
import Observation

@main
struct TravelIntelligenceApp: App {
    @State private var appState = TravelAppState()

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            // M49 — First Xcode Launch Integration.
            // DEBUG builds launch the runnable six-tab Travel Intelligence spine
            // (Home · Trips · Destinations · Journey · Explore · Profile). The spine
            // is itself `#if DEBUG`-gated because it renders the DEBUG-only demo data,
            // so it is only referenced here under the same compile-time flag.
            TravelIntelligenceAppSpine()
                .tint(TravelTheme.current.tint)
            #else
            // Release builds keep the production launch → onboarding → shell flow
            // and its architecture (app state, coordinator and mock container) intact.
            RootFlowView()
                .environment(appState)
                .environment(\.appContainer, appState.container)
                .tint(TravelTheme.current.tint)
            #endif
        }
    }
}

/// Root application state. Navigation is delegated to a single
/// `NavigationCoordinator` (the source of truth for tab selection, navigation
/// context and deep-link handling), keeping app-wide concerns composable.
@Observable
final class TravelAppState {
    /// The single app-wide composition root, created once and injected into the
    /// environment for the routing layer to resolve feature ViewModels.
    let container = AppContainer.mock()
    let coordinator = NavigationCoordinator()
    var theme: TravelTheme = .current
}

