import SwiftUI
import Observation

struct HomeScreen: View {
    @State private var viewModel: HomeViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeHomeViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                HomeHeroHeader()
                TripMemoryCard(memory: viewModel.heroMemory)

                PremiumSection(title: "Travel Pulse", subtitle: "Static dashboard composition only.") {
                    PassportProgressCard(progress: viewModel.passportProgress)
                }

                PremiumSection(title: "Timeline Preview", subtitle: "A calm glance at chronology surfaces.") {
                    VStack(spacing: TravelSpacing.sm) {
                        ForEach(viewModel.timelineItems) { item in
                            TimelinePreviewRow(item: item)
                        }
                    }
                }

                PremiumSection(title: "Highlights", subtitle: "Fixed-category cards ready for deterministic output.") {
                    PremiumAdaptiveGrid(minimumWidth: 156) {
                        ForEach(viewModel.highlights) { highlight in
                            HighlightCard(highlight: highlight)
                        }
                    }
                }

                PremiumSection(title: "Insights", subtitle: "Reason-code first, prose-free backend alignment.") {
                    PremiumAdaptiveGrid(minimumWidth: 156) {
                        ForEach(viewModel.insights) { insight in
                            InsightCard(insight: insight)
                        }
                    }
                }

                CinematicCTACard(preview: viewModel.cinematic)
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct HomeHeroHeader: View {
    var body: some View {
        PremiumHeroHeader(
            eyebrow: "Travel Intelligence",
            symbol: "sparkles",
            title: "Your journeys, beautifully gathered.",
            subtitle: "A premium offline-first shell for memories, passport progress, timeline moments and deterministic insights."
        )
        .padding(.top, TravelSpacing.sm)
    }
}
