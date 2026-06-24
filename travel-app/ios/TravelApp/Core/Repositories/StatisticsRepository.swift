import Foundation

protocol StatisticsRepository {
    var statistics: StatisticsDTO { get }
}

struct MockStatisticsRepository: StatisticsRepository {
    let statistics: StatisticsDTO

    init(statistics: StatisticsDTO = MockDTOProvider.statistics) {
        self.statistics = statistics
    }
}
