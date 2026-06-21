import SwiftUI
import Observation

@Observable
final class CollectionsViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .collections,
        eyebrow: "Memory Sets",
        subtitle: "A richly spaced card grid for deterministic memory collections.",
        primaryCardTitle: "Collection gallery",
        primaryCardSubtitle: "Binds to /collections collection cards and cover refs.",
        secondaryCardTitle: "Themed rails",
        secondaryCardSubtitle: "Activity, place, companion and transport collections share one card language."
    ))
}

struct CollectionsScreen: View {
    @State private var viewModel = CollectionsViewModel()

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
    }
}

