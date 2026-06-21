import SwiftUI
import Observation

@Observable
final class StoryViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .story,
        eyebrow: "Narrative",
        subtitle: "An immersive chapter surface for the existing deterministic story composer.",
        primaryCardTitle: "Chapter canvas",
        primaryCardSubtitle: "Binds to /story chapters, anchors and hero moment.",
        secondaryCardTitle: "Day flow",
        secondaryCardSubtitle: "Prepared for moment and transition cards without creating story text."
    ))
}

struct StoryScreen: View {
    @State private var viewModel = StoryViewModel()

    var body: some View {
        NavigationStack {
            FeatureShellView(viewModel: viewModel.shell)
        }
    }
}

