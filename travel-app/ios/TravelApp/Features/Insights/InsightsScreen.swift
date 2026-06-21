import SwiftUI
import Observation

@Observable
final class InsightsViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .insights,
        eyebrow: "Cards",
        subtitle: "Fixed reason-code cards with evidence refs, not recommendations or generated text.",
        primaryCardTitle: "Insight cards",
        primaryCardSubtitle: "Binds to /insights cards and categories.",
        secondaryCardTitle: "Evidence layer",
        secondaryCardSubtitle: "Prepared for source refs and expandable evidence later."
    ))
}

struct InsightsScreen: View {
    @State private var viewModel = InsightsViewModel()

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
    }
}

