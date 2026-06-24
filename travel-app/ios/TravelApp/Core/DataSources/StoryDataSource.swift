import Foundation

protocol StoryDataSource {
    var story: StoryDTO { get }
}

struct MockStoryDataSource: StoryDataSource {
    let story: StoryDTO

    init(story: StoryDTO = MockDTOProvider.story) {
        self.story = story
    }
}
