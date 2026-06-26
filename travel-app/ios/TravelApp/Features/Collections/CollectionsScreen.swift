import SwiftUI
import Observation

struct CollectionsScreen: View {
    @State private var viewModel: CollectionsViewModel

    init(container: AppContainer) {
        _viewModel = State(initialValue: container.makeCollectionsViewModel())
    }

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                CollectionHeroCard(preview: viewModel.hero)

                PremiumScreenStateContainer(
                    loadingState: viewModel.loadingState,
                    presentation: viewModel.statePresentation
                ) {
                    populatedContent
                }
            }
            .navigationTitle("Collections")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(
            title: "Collection gallery",
            subtitle: "Themed memory sets from the traveller archive.",
            accessory: { EmptyView() }
        ) {
            PremiumAdaptiveGrid(minimumWidth: 180) {
                ForEach(viewModel.collections) { collection in
                    CollectionGalleryCard(collection: collection)
                }
            }
        }

        PremiumSection(title: "Featured collection", subtitle: "A closer look at the strongest memory set.") {
            CollectionDetailPreviewCard(detail: viewModel.detail)
        }

        PremiumSection(title: "Collection themes", subtitle: "Visual groupings across the archive.") {
            PremiumAdaptiveGrid(minimumWidth: 156) {
                ForEach(viewModel.themes) { theme in
                    CollectionThemeCard(theme: theme)
                }
            }
        }

        PremiumSection(title: "Collection statistics", subtitle: "A compact overview of the collection shelf.") {
            PremiumAdaptiveGrid(minimumWidth: 156) {
                ForEach(viewModel.statistics) { statistic in
                    CollectionStatisticCard(statistic: statistic)
                }
            }
        }
    }
}
