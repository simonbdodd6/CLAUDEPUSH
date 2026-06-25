import SwiftUI
import Observation

struct InsightsScreen: View {
    @State private var viewModel: InsightsViewModel

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makeInsightsViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                InsightsHeroCard(insight: viewModel.hero)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("Insights")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Travel patterns", subtitle: "Static pattern cards from the traveller archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.patterns) { pattern in
                    TravelPatternCard(pattern: pattern)
                }
            }
        }

        PremiumSection(title: "Destination trends", subtitle: "Places with repeated, recent or origin signals.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.trends) { trend in
                    DestinationTrendCard(trend: trend)
                }
            }
        }

        PremiumSection(title: "Seasonality", subtitle: "A visual read on when travel tends to happen.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.seasons) { season in
                    SeasonalityCard(seasonality: season)
                }
            }
        }

        PremiumSection(title: "Journey observations", subtitle: "Fixed reason-code insights without generated text.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.journeyInsights) { insight in
                    JourneyInsightCard(insight: insight)
                }
            }
        }

        PremiumSection(title: "Suggested next surfaces", subtitle: "Static cards, not generated recommendations.") {
            VStack(spacing: TravelSpacing.md) {
                ForEach(viewModel.recommendations) { recommendation in
                    InsightRecommendationCard(recommendation: recommendation)
                }
            }
        }
    }
}
