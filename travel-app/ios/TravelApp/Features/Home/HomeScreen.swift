import SwiftUI
import Observation

@Observable
final class HomeViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .home,
        eyebrow: "Today",
        subtitle: "A calm daily entry point for memories, highlights and the next premium surface.",
        primaryCardTitle: "Daily travel dashboard",
        primaryCardSubtitle: "Designed for /home without local business rules.",
        secondaryCardTitle: "Large hero surface",
        secondaryCardSubtitle: "Reserved for imagery, recommendation-free context and recent memories."
    ))
}

struct HomeScreen: View {
    @State private var viewModel = HomeViewModel()

    var body: some View {
        NavigationStack {
            FeatureShellView(viewModel: viewModel.shell)
        }
    }
}

