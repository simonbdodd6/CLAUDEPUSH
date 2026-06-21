import SwiftUI
import Observation

@Observable
final class StatisticsViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .statistics,
        eyebrow: "Numbers",
        subtitle: "A polished statistics board for history, activity, memory and progress.",
        primaryCardTitle: "Metric stack",
        primaryCardSubtitle: "Binds to /statistics headline and grouped metrics.",
        secondaryCardTitle: "Milestone strip",
        secondaryCardSubtitle: "First trip, latest trip and timeline entry shells."
    ))
}

struct StatisticsScreen: View {
    @State private var viewModel = StatisticsViewModel()

    var body: some View {
        FeatureShellView(viewModel: viewModel.shell)
    }
}

