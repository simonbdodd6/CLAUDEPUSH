import SwiftUI
import Observation

struct PassportScreen: View {
    @State private var viewModel: PassportViewModel

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makePassportViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                PassportCoverCard(
                    name: viewModel.coverName,
                    tagline: viewModel.coverTagline,
                    completionLabel: viewModel.completionLabel,
                    progress: viewModel.completionProgress
                )

                if viewModel.hasJourneys {
                    populatedContent
                } else {
                    PassportEmptyState()
                }
            }
            .navigationTitle("Passport")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Passport at a glance", subtitle: "Static preview of recorded reach.") {
            PassportStatGrid(stats: viewModel.stats)
        }

        PremiumSection(title: "Travel signature", subtitle: "The shape of the traveller's journeys.") {
            PassportStyleCard(style: viewModel.style)
        }

        PremiumSection(title: "Stamp book", subtitle: "A visual grid of completed stamps and ready pages.") {
            PassportStampGrid(stamps: viewModel.stamps)
        }

        PremiumSection(title: "Recent passport moments", subtitle: "Milestones, streaks and the latest stamps.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.moments) { moment in
                    PassportMomentRow(moment: moment)
                }
            }
        }
    }
}
