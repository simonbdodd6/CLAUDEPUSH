import Foundation

protocol TimelineDataSource {
    var timeline: TimelineDTO { get }
}

struct MockTimelineDataSource: TimelineDataSource {
    let timeline: TimelineDTO

    init(timeline: TimelineDTO = MockDTOProvider.timeline) {
        self.timeline = timeline
    }
}
