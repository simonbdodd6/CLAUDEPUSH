import Foundation

protocol TravellerDataSource {
    var traveller: TravellerDTO { get }
}

struct MockTravellerDataSource: TravellerDataSource {
    let traveller: TravellerDTO

    init(traveller: TravellerDTO = MockDTOProvider.traveller) {
        self.traveller = traveller
    }
}
