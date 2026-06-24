import Foundation

protocol InsightsRepository {
    var insights: InsightsDTO { get }
}

struct MockInsightsRepository: InsightsRepository {
    let insights: InsightsDTO

    init(dataSource: any InsightsDataSource = MockInsightsDataSource()) {
        self.insights = dataSource.insights
    }
}
