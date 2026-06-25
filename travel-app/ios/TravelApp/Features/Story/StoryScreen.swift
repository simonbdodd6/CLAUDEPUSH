import SwiftUI
import Observation

struct StoryScreen: View {
    @State private var viewModel: StoryViewModel

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makeStoryViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                StoryHeroCard(story: viewModel.hero)

                if viewModel.hasStories {
                    populatedContent
                } else {
                    StoryEmptyState()
                }
            }
            .navigationTitle("Story")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Story collections", subtitle: "Shelves for related travel memories.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.collections) { collection in
                    StoryCollectionCard(collection: collection)
                }
            }
        }

        PremiumSection(title: "Featured travel stories", subtitle: "Premium story cards from completed journeys.") {
            VStack(spacing: TravelSpacing.md) {
                ForEach(viewModel.drafts) { draft in
                    StoryDraftCard(draft: draft)
                }
            }
        }

        PremiumSection(title: "Memory clusters", subtitle: "Grouped places and moments for story building.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.clusters) { cluster in
                    MemoryClusterCard(cluster: cluster)
                }
            }
        }

        PremiumSection(title: "Story themes", subtitle: "Visual directions for the traveller archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.themes) { theme in
                    StoryThemeCard(theme: theme)
                }
            }
        }

        PremiumSection(title: "Story inspiration", subtitle: "Static cards for narrative starting points.") {
            VStack(spacing: TravelSpacing.md) {
                ForEach(viewModel.inspirations) { inspiration in
                    StoryDraftCard(draft: inspiration)
                }
            }
        }

        PremiumSection(title: "Story statistics", subtitle: "A compact overview of the story shelf.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statistics) { statistic in
                    StoryStatisticCard(statistic: statistic)
                }
            }
        }
    }
}
