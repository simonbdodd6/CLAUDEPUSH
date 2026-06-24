import Foundation

protocol TravellerRepository {
    var traveller: TravellerDTO { get }
}

struct MockTravellerRepository: TravellerRepository {
    let traveller: TravellerDTO

    init(dataSource: any TravellerDataSource = MockTravellerDataSource()) {
        self.traveller = dataSource.traveller
    }
}
