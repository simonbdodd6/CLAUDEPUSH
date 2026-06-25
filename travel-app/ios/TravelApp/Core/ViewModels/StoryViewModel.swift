import SwiftUI
import Observation

@Observable
final class StoryViewModel {
    let story: StoryDTO
    let traveller: TravellerDTO

    init(
        storyRepository: any StoryRepository,
        travellerRepository: any TravellerRepository
    ) {
        self.story = storyRepository.story
        self.traveller = travellerRepository.traveller
    }

    var hasStories: Bool { !story.collections.isEmpty || !story.drafts.isEmpty }

    var hero: StoryHeroPreview {
        StoryHeroPreview(
            title: "Turn journeys into stories",
            subtitle: "A visual shelf for travel memories, drafts, themes and finished story collections.",
            collections: "\(story.collections.count)",
            drafts: "\(story.drafts.count)",
            memories: "\(traveller.summary.memories)"
        )
    }

    let collections = [
        StoryCollectionPreview(
            id: "collection-coast",
            title: "Coastal chapters",
            subtitle: "Sea views, island days and city harbours.",
            count: "12 memories",
            symbol: "water.waves",
            gradient: [TravelTheme.current.ocean, TravelTheme.current.sky]
        ),
        StoryCollectionPreview(
            id: "collection-firsts",
            title: "Firsts and milestones",
            subtitle: "Opening trips, new stamps and reach markers.",
            count: "8 moments",
            symbol: "flag.checkered",
            gradient: [TravelTheme.current.coral, TravelTheme.current.sun]
        ),
        StoryCollectionPreview(
            id: "collection-city",
            title: "City notes",
            subtitle: "Walkable days, late dinners and quiet streets.",
            count: "15 notes",
            symbol: "building.2.fill",
            gradient: [TravelTheme.current.ink, TravelTheme.current.moss]
        )
    ]

    let drafts = [
        StoryDraftPreview(
            id: "draft-amalfi",
            title: "Blue hour on the coast",
            trip: "Positano, Italy · May 2024",
            status: "Featured story",
            detail: "A composed story card for the hero memory from the travel dashboard.",
            symbol: "sunset.fill"
        ),
        StoryDraftPreview(
            id: "draft-kyoto",
            title: "Rail days and temple evenings",
            trip: "Kyoto, Japan · Apr 2025",
            status: "Trip story",
            detail: "A draft-style surface for grouped memories from the latest journey.",
            symbol: "leaf.fill"
        ),
        StoryDraftPreview(
            id: "draft-lisbon",
            title: "The first recorded trip",
            trip: "Lisbon, Portugal · Sep 2018",
            status: "Origin story",
            detail: "A beginning marker for the traveller's personal archive.",
            symbol: "flag.checkered"
        )
    ]

    let clusters = [
        MemoryClusterPreview(id: "cluster-islands", title: "Island light", place: "Greece, Iceland, Portugal", count: "9", symbol: "camera.aperture"),
        MemoryClusterPreview(id: "cluster-food", title: "Tables and markets", place: "Italy, Japan, Mexico", count: "14", symbol: "fork.knife"),
        MemoryClusterPreview(id: "cluster-walks", title: "Long walks", place: "Lisbon, Kyoto, Cape Town", count: "11", symbol: "figure.walk.motion")
    ]

    let themes = [
        StoryThemePreview(id: "theme-ocean", title: "Ocean & islands", caption: "A theme led by coastline memories and sea crossings.", symbol: "sailboat.fill", accent: TravelTheme.current.ocean),
        StoryThemePreview(id: "theme-milestone", title: "Milestones", caption: "First trips, new countries and major travel markers.", symbol: "seal.fill", accent: TravelTheme.current.coral),
        StoryThemePreview(id: "theme-slow", title: "Slow mornings", caption: "Quiet streets, cafes and unhurried travel rhythm.", symbol: "cup.and.saucer.fill", accent: TravelTheme.current.moss)
    ]

    let inspirations = [
        StoryDraftPreview(
            id: "inspiration-companion",
            title: "Shared journeys",
            trip: "Companion-based story prompt",
            status: "Inspiration",
            detail: "A visual card for companion-led memories without generating story text.",
            symbol: "person.2.fill"
        ),
        StoryDraftPreview(
            id: "inspiration-return",
            title: "Places returned to",
            trip: "Repeated destinations",
            status: "Inspiration",
            detail: "A card for repeated places, familiar routes and favourite destinations.",
            symbol: "arrow.triangle.2.circlepath"
        )
    ]

    let statistics = [
        StoryStatisticPreview(id: "stat-stories", value: "22", label: "Story cards", caption: "Finished and draft surfaces.", symbol: "rectangle.stack.fill"),
        StoryStatisticPreview(id: "stat-clusters", value: "9", label: "Memory clusters", caption: "Grouped moments by place and theme.", symbol: "circle.grid.3x3.fill"),
        StoryStatisticPreview(id: "stat-themes", value: "5", label: "Themes", caption: "Reusable visual story directions.", symbol: "paintpalette.fill")
    ]
}
