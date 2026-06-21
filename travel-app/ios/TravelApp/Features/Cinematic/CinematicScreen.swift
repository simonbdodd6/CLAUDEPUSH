import SwiftUI
import Observation

@Observable
final class CinematicViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .cinematic,
        eyebrow: "Playback",
        subtitle: "A storyboard shell for cinematic scenes, pacing hints and transition metadata.",
        primaryCardTitle: "Scene deck",
        primaryCardSubtitle: "Binds to /cinematic scenes and scene order.",
        secondaryCardTitle: "Motion stage",
        secondaryCardSubtitle: "Animation placeholders only; real playback comes later."
    ))
}

struct CinematicScreen: View {
    @State private var viewModel = CinematicViewModel()

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
    }
}

