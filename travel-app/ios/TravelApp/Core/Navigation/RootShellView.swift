import SwiftUI

struct RootShellView: View {
    @Environment(TravelAppState.self) private var appState

    var body: some View {
        TabView(selection: Binding(
            get: { appState.selectedTab },
            set: {
                appState.navigationContext.lastSelectedFeature = appState.selectedTab
                appState.selectedTab = $0
            }
        )) {
            HomeScreen().tag(TravelTab.home)
                .tabItem { Label(TravelTab.home.title, systemImage: TravelTab.home.symbol) }
            PassportScreen().tag(TravelTab.passport)
                .tabItem { Label(TravelTab.passport.title, systemImage: TravelTab.passport.symbol) }
            TimelineScreen().tag(TravelTab.timeline)
                .tabItem { Label(TravelTab.timeline.title, systemImage: TravelTab.timeline.symbol) }
            StoryScreen().tag(TravelTab.story)
                .tabItem { Label(TravelTab.story.title, systemImage: TravelTab.story.symbol) }
            MoreScreensHub().tag(TravelTab.highlights)
                .tabItem { Label("More", systemImage: "square.grid.2x2.fill") }
        }
        .background(TravelTheme.current.background)
    }
}

struct MoreScreensHub: View {
    var body: some View {
        NavigationStack {
            PremiumScrollView {
                ScreenHero(
                    eyebrow: "Travel Intelligence",
                    title: "Explore",
                    subtitle: "Premium surfaces waiting for API data.",
                    symbol: "square.grid.2x2.fill",
                    endpoint: nil
                )
                FeatureLinkGrid(tabs: [.cinematic, .collections, .statistics, .insights, .highlights, .search, .settings])
            }
            .navigationTitle("Explore")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

