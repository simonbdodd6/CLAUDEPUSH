import SwiftUI
import Observation

@Observable
final class TimelineViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .timeline,
        eyebrow: "Chronology",
        subtitle: "A lifetime stream with generous spacing, scrub-friendly rows and media-led rhythm.",
        primaryCardTitle: "Timeline rail",
        primaryCardSubtitle: "Binds to /traveller-timeline entries and by-year groups.",
        secondaryCardTitle: "Year anchors",
        secondaryCardSubtitle: "Prepared for scroll position, filtering and route sync later."
    ))
}

struct TimelineScreen: View {
    @State private var viewModel = TimelineViewModel()

    var body: some View {
        NavigationStack {
            FeatureShellView(viewModel: viewModel.shell)
        }
    }
}

