import SwiftUI
import Observation

@main
struct TravelIntelligenceApp: App {
    @State private var appState = TravelAppState()

    var body: some Scene {
        WindowGroup {
            RootShellView()
                .environment(appState)
                .tint(TravelTheme.current.tint)
        }
    }
}

@Observable
final class TravelAppState {
    var selectedTab: TravelTab = .home
    var navigationContext = NavigationContext()
    var theme: TravelTheme = .current
}

@Observable
final class NavigationContext {
    var lastSelectedFeature: TravelTab = .home
    var prefersReducedGlass = false
}

