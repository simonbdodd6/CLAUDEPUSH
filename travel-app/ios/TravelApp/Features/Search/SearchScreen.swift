import SwiftUI
import Observation

@Observable
final class SearchViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .search,
        eyebrow: "Find",
        subtitle: "A minimal search surface for deterministic results across premium experiences.",
        primaryCardTitle: "Search field",
        primaryCardSubtitle: "Binds to /search?q= without local ranking rules.",
        secondaryCardTitle: "Result groups",
        secondaryCardSubtitle: "Prepared for places, memories, achievements and experiences."
    ))
}

struct SearchScreen: View {
    @State private var viewModel = SearchViewModel()
    @State private var query = ""

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
            .searchable(text: $query, prompt: "Search memories, places, years")
    }
}
