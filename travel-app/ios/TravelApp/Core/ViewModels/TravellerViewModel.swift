import Foundation
import Observation

/// Presentation adapter for the root traveller contract.
@Observable
final class TravellerViewModel {
    let traveller: TravellerDTO
    private(set) var loadingState: ViewModelLoadingState

    init(repository: any TravellerRepository) {
        let traveller = repository.traveller
        self.traveller = traveller
        self.loadingState = .resolved(isEmpty: traveller.displayName.isEmpty)
    }

    var displayName: String { traveller.displayName }
    var homeCity: String { traveller.homeCity ?? "Home city not set" }
    var memberSinceLabel: String { "Traveller since \(traveller.memberSince)" }
    var countriesLabel: String { "\(traveller.summary.countries)" }
    var citiesLabel: String { "\(traveller.summary.cities)" }
    var journeysLabel: String { "\(traveller.summary.journeys)" }
    var memoriesLabel: String { "\(traveller.summary.memories)" }
    var hasProfile: Bool { loadingState == .loaded }

    var statePresentation: ViewModelStatePresentation? {
        loadingState.presentation(
            empty: EmptyStatePresentation(
                title: "Traveller profile unavailable",
                message: "Traveller details will appear when profile data is available.",
                actionLabel: nil,
                reasonCode: "traveller_profile_empty"
            ),
            failureTitle: "Unable to load traveller profile"
        )
    }
}
