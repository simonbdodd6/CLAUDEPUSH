import SwiftUI
import Observation

struct TimelineScreen: View {
    @State private var viewModel: TimelineViewModel

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makeTimelineViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                TimelineHeroCard(summary: viewModel.summary)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("Timeline")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Journey summary", subtitle: "Callouts from the traveller timeline.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.milestones) { milestone in
                    JourneyMilestoneCard(milestone: milestone)
                }
            }
        }

        PremiumSection(title: "Travel history", subtitle: "Year groups, markers and memory-led event cards.") {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                ForEach(viewModel.years) { year in
                    PremiumTimelineSection(title: year.year, subtitle: year.summary) {
                        VStack(spacing: TravelSpacing.md) {
                            ForEach(year.events) { event in
                                TimelineEventCard(event: event)
                            }
                        }
                    }
                }
            }
        }

        PremiumSection(title: "Travel moments", subtitle: "Small callouts from the journey record.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.moments) { moment in
                    TravelMomentRow(moment: moment)
                }
            }
        }
    }
}
