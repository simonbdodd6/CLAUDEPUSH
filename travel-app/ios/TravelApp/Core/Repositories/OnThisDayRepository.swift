import Foundation

protocol OnThisDayRepository {
    var onThisDay: OnThisDayDTO { get }
}

struct MockOnThisDayRepository: OnThisDayRepository {
    let onThisDay: OnThisDayDTO

    init(dataSource: any OnThisDayDataSource = MockOnThisDayDataSource()) {
        self.onThisDay = dataSource.onThisDay
    }
}
