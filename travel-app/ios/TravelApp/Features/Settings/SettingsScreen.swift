import SwiftUI
import Observation

@Observable
final class SettingsViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .settings,
        eyebrow: "Local",
        subtitle: "A quiet settings shell for theme, accessibility and API configuration later.",
        primaryCardTitle: "Appearance",
        primaryCardSubtitle: "Theme hooks exist; no persistence is implemented in Phase 1.",
        secondaryCardTitle: "Data boundaries",
        secondaryCardSubtitle: "Networking, auth and offline cache are intentionally deferred."
    ))
}

struct SettingsScreen: View {
    @State private var viewModel = SettingsViewModel()

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
    }
}

