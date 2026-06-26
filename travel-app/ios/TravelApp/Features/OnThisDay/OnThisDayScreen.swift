import SwiftUI
import Observation

struct OnThisDayScreen: View {
    @State private var viewModel: OnThisDayViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeOnThisDayViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                OnThisDayHeroCard(preview: viewModel.hero)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("On This Day")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Today's travel memories", subtitle: "Moments recorded on \(viewModel.onThisDay.dateLabel) in previous years.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.todaysMemories) { moment in
                    AnniversaryMomentCard(moment: moment)
                }
            }
        }

        PremiumSection(title: "Anniversary moments", subtitle: "Milestones with a meaningful date in the archive.") {
            VStack(spacing: TravelSpacing.md) {
                ForEach(viewModel.anniversaries) { anniversary in
                    TravelAnniversaryCard(anniversary: anniversary)
                }
            }
        }

        PremiumSection(title: "Historical journey highlights", subtitle: "Standout scenes from this date across the years.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.historical) { memory in
                    HistoricalMemoryCard(memory: memory)
                }
            }
        }

        PremiumSection(title: "Year in review", subtitle: "A compact look back at notable travel years.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.yearsInReview) { review in
                    YearInReviewCard(review: review)
                }
            }
        }

        PremiumSection(title: "Travel statistics", subtitle: "A compact overview of this date's memories.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statistics) { statistic in
                    OnThisDayStatisticCard(statistic: statistic)
                }
            }
        }
    }
}
