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
    let tab: TravelTab

    var body: some View {
        switch tab {
        case .home: HomeScreen()
        case .passport: PassportScreen()
        case .timeline: TimelineScreen()
        case .story: StoryScreen()
        case .explore: MoreScreensHub()
        case .cinematic: CinematicScreen()
        case .collections: CollectionsScreen()
        case .statistics: StatisticsScreen()
        case .insights: InsightsScreen()
        case .highlights: HighlightsScreen()
        case .search: SearchScreen()
        case .settings: SettingsScreen()
        }
    }
}
