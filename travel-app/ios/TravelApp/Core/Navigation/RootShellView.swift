import SwiftUI

/// The application shell: a primary tab bar composed declaratively from
/// `FeatureRegistry.primary` and bound to the `NavigationCoordinator`. Adding,
/// removing or reordering a root tab is a registry change, not a view change.
struct RootShellView: View {
    @Environment(TravelAppState.self) private var appState

    private var coordinator: NavigationCoordinator { appState.coordinator }

    var body: some View {
        TabView(selection: Binding(
            get: { coordinator.selectedTab },
            set: { coordinator.select($0) }
        )) {
            ForEach(FeatureRegistry.primary) { feature in
                let tab = feature.tab ?? .home
                FeatureDestinationView(tab: tab)
                    .tag(tab)
                    .tabItem { Label(feature.title, systemImage: feature.symbol) }
            }
        }
        .background(TravelTheme.current.background)
    }
}

/// The Explore hub: a registry-driven grid of secondary surfaces and
/// registered future-feature placeholders.
struct MoreScreensHub: View {
    var body: some View {
        NavigationStack {
            PremiumScrollView {
                ScreenHero(
                    eyebrow: "Travel Intelligence",
                    title: "Explore",
                    subtitle: "The quiet control room for deeper travel surfaces as data arrives.",
                    symbol: TravelTab.explore.symbol,
                    endpoint: nil
                )
                FeatureNavigationGrid(features: FeatureRegistry.explore)
            }
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}
