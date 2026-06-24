import Foundation

protocol HighlightsRepository {
    var highlights: HighlightsDTO { get }
}

struct MockHighlightsRepository: HighlightsRepository {
    let highlights: HighlightsDTO

    init(highlights: HighlightsDTO = MockDTOProvider.highlights) {
        self.highlights = highlights
    }
}
