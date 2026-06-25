import SwiftUI
import Observation

struct SettingsScreen: View {
    @State private var viewModel: SettingsViewModel

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makeSettingsViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                SettingsHeroCard(preview: viewModel.hero)

                if let presentation = viewModel.statePresentation {
                    StatePresentationView(presentation: presentation)
                } else {
                    populatedContent
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Traveller profile", subtitle: "Identity details from the existing TravellerDTO.") {
            TravellerProfileCard(preview: viewModel.profile)
        }

        PremiumSection(title: "Preferences", subtitle: "Read-only presentation settings for this static milestone.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.preferences) { preference in
                    PreferenceCategoryCard(preview: preference)
                }
            }
        }

        PremiumSection(title: "Travel archive summary", subtitle: "A composed view of passport and traveller fixtures.") {
            TravelArchiveCard(preview: viewModel.archive)
        }

        PremiumSection(title: "App information", subtitle: "Clear boundaries for the current visual application.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.appInformation) { information in
                    AppInformationCard(preview: information)
                }
            }
        }

        PremiumSection(title: "Statistics", subtitle: "A compact read-only summary of the local preview archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statisticsCards) { statistic in
                    SettingsStatisticCard(preview: statistic)
                }
            }
        }
    }
}
