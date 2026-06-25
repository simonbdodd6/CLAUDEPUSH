import SwiftUI
import Observation

struct SearchScreen: View {
    @State private var viewModel: SearchViewModel
    @State private var query = ""

    init(container: AppContainer = .mock()) {
        _viewModel = State(initialValue: container.makeSearchViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                SearchHeroCard(preview: viewModel.hero)

                if let presentation = viewModel.statePresentation {
                    StatePresentationView(presentation: presentation)
                } else {
                    populatedContent
                }
            }
            .navigationTitle("Search")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search memories, places, years")
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Recent destinations", subtitle: "The latest places in the traveller timeline.") {
            ScrollView(.horizontal) {
                HStack(spacing: TravelSpacing.md) {
                    ForEach(viewModel.recentDestinations) { destination in
                        RecentDestinationCard(preview: destination)
                            .frame(width: 240)
                    }
                }
            }
            .scrollIndicators(.hidden)
        }

        PremiumSection(title: "Popular searches", subtitle: "Fixed shortcuts into the preview archive.") {
            SearchSuggestionCard(suggestions: viewModel.suggestions) { suggestion in
                query = suggestion.query
            }
        }

        PremiumSection(title: "Categories", subtitle: "Browse the archive by travel content type.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.categories) { category in
                    SearchCategoryCard(preview: category)
                }
            }
        }

        PremiumSection(
            title: query.isEmpty ? "Search previews" : "Results",
            subtitle: query.isEmpty ? "A sample of searchable DTO-backed content." : "Deterministic matches for “\(query)”."
        ) {
            let results = viewModel.results(matching: query)
            if viewModel.hasResults(for: query) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(results) { result in
                        SearchResultPreviewCard(preview: result)
                    }
                }
            } else {
                SearchEmptyState(query: query)
            }
        }

        PremiumSection(title: "Search statistics", subtitle: "A compact view of the local preview index.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statistics) { statistic in
                    SearchStatisticCard(preview: statistic)
                }
            }
        }
    }
}
