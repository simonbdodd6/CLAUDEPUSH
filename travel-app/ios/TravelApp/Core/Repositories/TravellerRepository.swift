import Foundation

protocol TravellerRepository {
    var traveller: TravellerDTO { get }
}

struct MockTravellerRepository: TravellerRepository {
    let traveller: TravellerDTO

    init(traveller: TravellerDTO = MockDTOProvider.traveller) {
        self.traveller = traveller
    }
}
