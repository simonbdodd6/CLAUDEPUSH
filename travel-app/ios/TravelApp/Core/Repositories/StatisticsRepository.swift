import Foundation

protocol StatisticsRepository {
    var statistics: StatisticsDTO { get }
}

struct MockStatisticsRepository: StatisticsRepository {
    let statistics: StatisticsDTO

    init(dataSource: any StatisticsDataSource = MockStatisticsDataSource()) {
        self.statistics = dataSource.statistics
    }
}
