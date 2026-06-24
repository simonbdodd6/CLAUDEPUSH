import Foundation

protocol HighlightsRepository {
    var highlights: HighlightsDTO { get }
}

struct MockHighlightsRepository: HighlightsRepository {
    let highlights: HighlightsDTO

    init(dataSource: any HighlightsDataSource = MockHighlightsDataSource()) {
        self.highlights = dataSource.highlights
    }
}
