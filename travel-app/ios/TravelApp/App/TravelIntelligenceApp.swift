import SwiftUI
import Observation

@main
struct TravelIntelligenceApp: App {
    @State private var appState = TravelAppState()

    var body: some Scene {
        WindowGroup {
            RootFlowView()
                .environment(appState)
                .tint(TravelTheme.current.tint)
        }
    }
}

/// Root application state. Navigation is delegated to a single
/// `NavigationCoordinator` (the source of truth for tab selection, navigation
/// context and deep-link handling), keeping app-wide concerns composable.
@Observable
final class TravelAppState {
    let coordinator = NavigationCoordinator()
    var theme: TravelTheme = .current
}

