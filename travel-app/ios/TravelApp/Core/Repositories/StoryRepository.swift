import Foundation

protocol StoryRepository {
    var story: StoryDTO { get }
}

struct MockStoryRepository: StoryRepository {
    let story: StoryDTO

    init(story: StoryDTO = MockDTOProvider.story) {
        self.story = story
    }
}
