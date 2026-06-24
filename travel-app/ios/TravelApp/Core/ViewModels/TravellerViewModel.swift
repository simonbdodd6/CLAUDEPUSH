import Foundation
import Observation

/// Presentation adapter for the root traveller contract.
@Observable
final class TravellerViewModel {
    let traveller: TravellerDTO

    init(container: AppContainer = .mock) {
        self.traveller = container.travellerRepository.traveller
    }

    var displayName: String { traveller.displayName }
    var homeCity: String { traveller.homeCity ?? "Home city not set" }
    var memberSinceLabel: String { "Traveller since \(traveller.memberSince)" }
    var countriesLabel: String { "\(traveller.summary.countries)" }
    var citiesLabel: String { "\(traveller.summary.cities)" }
    var journeysLabel: String { "\(traveller.summary.journeys)" }
    var memoriesLabel: String { "\(traveller.summary.memories)" }
    var hasProfile: Bool { !traveller.displayName.isEmpty }
}
