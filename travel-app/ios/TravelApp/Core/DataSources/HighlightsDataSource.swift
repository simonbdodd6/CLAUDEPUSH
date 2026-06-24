import Foundation

protocol HighlightsDataSource {
    var highlights: HighlightsDTO { get }
}

struct MockHighlightsDataSource: HighlightsDataSource {
    let highlights: HighlightsDTO

    init(highlights: HighlightsDTO = MockDTOProvider.highlights) {
        self.highlights = highlights
    }
}
