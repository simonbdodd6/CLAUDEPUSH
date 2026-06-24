import Foundation

protocol InsightsRepository {
    var insights: InsightsDTO { get }
}

struct MockInsightsRepository: InsightsRepository {
    let insights: InsightsDTO

    init(insights: InsightsDTO = MockDTOProvider.insights) {
        self.insights = insights
    }
}
