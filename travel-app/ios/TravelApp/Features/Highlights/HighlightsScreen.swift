import SwiftUI
import Observation

struct HighlightsScreen: View {
    @State private var viewModel: HighlightsViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeHighlightsViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                HighlightsHeroCard(highlight: viewModel.hero)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("Highlights")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Best moments", subtitle: "Static standout scenes from the traveller archive.") {
            PremiumAdaptiveGrid(minimumWidth: 180) {
                ForEach(viewModel.moments) { moment in
                    HighlightMomentCard(moment: moment)
                }
            }
        }

        PremiumSection(title: "Achievements", subtitle: "Fixed milestone counts, not generated stats.") {
            PremiumAdaptiveGrid(minimumWidth: 156) {
                ForEach(viewModel.achievements) { achievement in
                    AchievementHighlightCard(achievement: achievement)
                }
            }
        }

        PremiumSection(title: "Country highlights", subtitle: "Places with repeated, recent or origin signals.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.countries) { country in
                    CountryHighlightCard(country: country)
                }
            }
        }

        PremiumSection(title: "Memorable events", subtitle: "Fixed reason-code memories without generated text.") {
            PremiumAdaptiveGrid(minimumWidth: 180) {
                ForEach(viewModel.memories) { memory in
                    TravelMemoryCard(memory: memory)
                }
            }
        }
    }
}
