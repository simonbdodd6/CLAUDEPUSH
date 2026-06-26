import SwiftUI
import Observation

struct FeatureShellModel: Equatable {
    let tab: TravelTab
    let eyebrow: String
    let subtitle: String
    let primaryCardTitle: String
    let primaryCardSubtitle: String
    let secondaryCardTitle: String
    let secondaryCardSubtitle: String
}

@Observable
final class FeatureShellViewModel {
    let model: FeatureShellModel

    init(model: FeatureShellModel) {
        self.model = model
    }
}

struct FeatureShellView: View {
    let viewModel: FeatureShellViewModel

    var body: some View {
        PremiumScrollView {
            ScreenHero(
                eyebrow: viewModel.model.eyebrow,
                title: viewModel.model.tab.title,
                subtitle: viewModel.model.subtitle,
                symbol: viewModel.model.tab.symbol,
                endpoint: viewModel.model.tab.endpoint == "local" ? nil : viewModel.model.tab.endpoint
            )

            PremiumSection(title: "Foundation", subtitle: "Visual shell only. API data will bind here in a later phase.") {
                PlaceholderCard(
                    title: viewModel.model.primaryCardTitle,
                    subtitle: viewModel.model.primaryCardSubtitle,
                    symbol: viewModel.model.tab.symbol
                )
                PlaceholderCard(
                    title: viewModel.model.secondaryCardTitle,
                    subtitle: viewModel.model.secondaryCardSubtitle,
                    symbol: "sparkles.rectangle.stack"
                )
            }
        }
        .navigationTitle(viewModel.model.tab.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct FeatureDestinationView: View {
    @Environment(\.appContainer) private var container
    let route: TravelRoute

    init(tab: TravelTab) {
        self.route = tab.route
    }

    init(route: TravelRoute) {
        self.route = route
    }

    var body: some View {
        switch route {
        case .home: HomeScreen()
        case .passport: PassportScreen(container: container)
        case .timeline: TimelineScreen(container: container)
        case .story: StoryScreen(container: container)
        case .explore: MoreScreensHub()
        case .cinematic: CinematicScreen(container: container)
        case .collections: CollectionsScreen(container: container)
        case .statistics: StatisticsScreen(container: container)
        case .insights: InsightsScreen(container: container)
        case .highlights: HighlightsScreen(container: container)
        case .onThisDay: OnThisDayScreen(container: container)
        case .search: SearchScreen(container: container)
        case .settings: SettingsScreen(container: container)
        case .comingSoon(let feature):
            ComingSoonScreen(feature: FeatureMetadata.placeholder(feature))
        }
    }
}
