import Foundation

protocol StatisticsDataSource {
    var statistics: StatisticsDTO { get }
}

struct MockStatisticsDataSource: StatisticsDataSource {
    let statistics: StatisticsDTO

    init(statistics: StatisticsDTO = MockDTOProvider.statistics) {
        self.statistics = statistics
    }
}
