import SwiftUI
import Observation

@Observable
final class PassportViewModel {
    let shell = FeatureShellViewModel(model: FeatureShellModel(
        tab: .passport,
        eyebrow: "Identity",
        subtitle: "A glass passport and stamp book for the traveller's completed journeys.",
        primaryCardTitle: "Passport cover",
        primaryCardSubtitle: "Binds to /passport cover, credentials and references.",
        secondaryCardTitle: "Stamp grid",
        secondaryCardSubtitle: "A premium shell for country, activity and transport stamps."
    ))
}

struct PassportScreen: View {
    @State private var viewModel = PassportViewModel()

    var body: some View {
        NavigationStack {
            FeatureShellView(viewModel: viewModel.shell)
        }
    }
}

