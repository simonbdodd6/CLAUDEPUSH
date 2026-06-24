import Foundation

protocol StoryRepository {
    var story: StoryDTO { get }
}

struct MockStoryRepository: StoryRepository {
    let story: StoryDTO

    init(dataSource: any StoryDataSource = MockStoryDataSource()) {
        self.story = dataSource.story
    }
}
