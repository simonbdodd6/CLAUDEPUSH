import Foundation

protocol TimelineRepository {
    var timeline: TimelineDTO { get }
}

struct MockTimelineRepository: TimelineRepository {
    let timeline: TimelineDTO

    init(dataSource: any TimelineDataSource = MockTimelineDataSource()) {
        self.timeline = dataSource.timeline
    }
}
