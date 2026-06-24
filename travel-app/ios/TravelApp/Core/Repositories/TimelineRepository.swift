import Foundation

protocol TimelineRepository {
    var timeline: TimelineDTO { get }
}

struct MockTimelineRepository: TimelineRepository {
    let timeline: TimelineDTO

    init(timeline: TimelineDTO = MockDTOProvider.timeline) {
        self.timeline = timeline
    }
}
