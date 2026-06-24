import SwiftUI
import Observation

struct HighlightsScreen: View {
    @State private var viewModel = HighlightsViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                HighlightsHeroCard(highlight: viewModel.hero)

                if viewModel.hasHighlights {
                    populatedContent
                } else {
                    HighlightsEmptyState()
                }
            }
            .navigationTitle("Highlights")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Best moments", subtitle: "Static standout scenes from the traveller archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.moments) { moment in
                    HighlightMomentCard(moment: moment)
                }
            }
        }

        PremiumSection(title: "Achievements", subtitle: "Fixed milestone counts, not generated stats.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
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
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.memories) { memory in
                    TravelMemoryCard(memory: memory)
                }
            }
        }
    }
}
