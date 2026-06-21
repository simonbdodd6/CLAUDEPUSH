import SwiftUI
import Observation

@Observable
final class HighlightsViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .highlights,
        eyebrow: "Best Of",
        subtitle: "A curated-feeling but deterministic surface for the traveller's most important moments.",
        primaryCardTitle: "Highlight stack",
        primaryCardSubtitle: "Binds to /highlights fixed reason-code cards.",
        secondaryCardTitle: "Hero moments",
        secondaryCardSubtitle: "Prepared for story, cinematic, achievement and collection refs."
    ))
}

struct HighlightsScreen: View {
    @State private var viewModel = HighlightsViewModel()

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
    }
}

