import SwiftUI
import Observation

struct StatisticsScreen: View {
    @State private var viewModel: StatisticsViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeStatisticsViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                StatisticsHeroCard(preview: viewModel.hero)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("Statistics")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(
            title: "Travel footprint",
            subtitle: "The scale of the traveller archive at a glance.",
            accessory: { EmptyView() }
        ) {
            CountryCountCard(preview: viewModel.countryCount)
        }

        PremiumSection(title: "Geographic coverage", subtitle: "Continental reach across recorded journeys.") {
            ContinentCoverageCard(preview: viewModel.continentCoverage)
        }

        PremiumSection(title: "Journey milestones", subtitle: "The markers that define the travel timeline.") {
            PremiumAdaptiveGrid(minimumWidth: 156) {
                ForEach(viewModel.milestones) { milestone in
                    MilestoneStatisticCard(preview: milestone)
                }
            }
        }

        PremiumSection(title: "Travel velocity", subtitle: "A deterministic ratio of journeys to active years.") {
            TravelVelocityCard(preview: viewModel.travelVelocity)
        }

        PremiumSection(title: "Journey distance", subtitle: "A visual route total for the static preview archive.") {
            JourneyDistanceCard(preview: viewModel.journeyDistance)
        }

        PremiumSection(title: "Travel patterns", subtitle: "Fixed observations from the current preview history.") {
            PremiumAdaptiveGrid(minimumWidth: 180) {
                ForEach(viewModel.patterns) { pattern in
                    TravelPatternCard(pattern: pattern)
                }
            }
        }

        PremiumSection(title: "Statistics summary", subtitle: "Every metric supplied by StatisticsDTO.") {
            PremiumAdaptiveGrid(minimumWidth: 156) {
                ForEach(viewModel.summaryMetrics) { metric in
                    StatisticsSummaryCard(metric: metric)
                }
            }
        }
    }
}
