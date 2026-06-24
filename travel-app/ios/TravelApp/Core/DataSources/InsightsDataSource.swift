import Foundation

protocol InsightsDataSource {
    var insights: InsightsDTO { get }
}

struct MockInsightsDataSource: InsightsDataSource {
    let insights: InsightsDTO

    init(insights: InsightsDTO = MockDTOProvider.insights) {
        self.insights = insights
    }
}
