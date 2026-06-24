import Foundation

protocol OnThisDayRepository {
    var onThisDay: OnThisDayDTO { get }
}

struct MockOnThisDayRepository: OnThisDayRepository {
    let onThisDay: OnThisDayDTO

    init(onThisDay: OnThisDayDTO = MockDTOProvider.onThisDay) {
        self.onThisDay = onThisDay
    }
}
