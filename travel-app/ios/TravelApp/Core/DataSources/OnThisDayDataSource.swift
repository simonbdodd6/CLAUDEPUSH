import Foundation

protocol OnThisDayDataSource {
    var onThisDay: OnThisDayDTO { get }
}

struct MockOnThisDayDataSource: OnThisDayDataSource {
    let onThisDay: OnThisDayDTO

    init(onThisDay: OnThisDayDTO = MockDTOProvider.onThisDay) {
        self.onThisDay = onThisDay
    }
}
