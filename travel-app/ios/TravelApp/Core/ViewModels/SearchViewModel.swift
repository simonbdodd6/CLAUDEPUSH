import SwiftUI
import Observation

@Observable
final class SearchViewModel {
    let traveller: TravellerDTO
    let timeline: TimelineDTO
    let story: StoryDTO
    let collections: [CollectionDTO]
    let highlights: HighlightsDTO

    init(
        traveller: TravellerDTO = MockDTOProvider.traveller,
        timeline: TimelineDTO = MockDTOProvider.timeline,
        story: StoryDTO = MockDTOProvider.story,
        collections: [CollectionDTO] = MockDTOProvider.collections,
        highlights: HighlightsDTO = MockDTOProvider.highlights
    ) {
        self.traveller = traveller
        self.timeline = timeline
        self.story = story
        self.collections = collections
        self.highlights = highlights
    }

    var hero: SearchHeroPreview {
        SearchHeroPreview(
            title: "Find any travel memory",
            subtitle: "Search across destinations, journeys, stories and collections in one quiet archive.",
            destinations: "\(traveller.summary.cities)",
            memories: "\(traveller.summary.memories)",
            journeys: "\(traveller.summary.journeys)"
        )
    }

    var recentDestinations: [RecentDestinationPreview] {
        timeline.years
            .flatMap(\.events)
            .prefix(4)
            .enumerated()
            .map { index, event in
                RecentDestinationPreview(
                    id: event.id,
                    place: event.place,
                    detail: event.title,
                    date: event.date,
                    symbol: Self.destinationSymbols[index % Self.destinationSymbols.count],
                    accent: Self.destinationAccents[index % Self.destinationAccents.count]
                )
            }
    }

    let suggestions = [
        SearchSuggestionPreview(id: "suggestion-coast", title: "Coastal memories", query: "coast", symbol: "water.waves"),
        SearchSuggestionPreview(id: "suggestion-first", title: "First trips", query: "first", symbol: "flag.checkered"),
        SearchSuggestionPreview(id: "suggestion-rail", title: "Rail journeys", query: "rail", symbol: "tram.fill"),
        SearchSuggestionPreview(id: "suggestion-2024", title: "Travel in 2024", query: "2024", symbol: "calendar")
    ]

    var categories: [SearchCategoryPreview] {
        [
            SearchCategoryPreview(
                id: "category-destinations",
                title: "Destinations",
                count: traveller.summary.cities,
                symbol: "mappin.and.ellipse",
                accent: TravelTheme.current.ocean
            ),
            SearchCategoryPreview(
                id: "category-memories",
                title: "Memories",
                count: traveller.summary.memories,
                symbol: "photo.stack.fill",
                accent: TravelTheme.current.coral
            ),
            SearchCategoryPreview(
                id: "category-stories",
                title: "Stories",
                count: story.drafts.count,
                symbol: "book.pages.fill",
                accent: TravelTheme.current.moss
            ),
            SearchCategoryPreview(
                id: "category-collections",
                title: "Collections",
                count: collections.count,
                symbol: "rectangle.stack.fill",
                accent: TravelTheme.current.sun
            )
        ]
    }

    var resultPreviews: [SearchResultPreview] {
        let eventResults = timeline.years
            .flatMap(\.events)
            .prefix(3)
            .map {
                SearchResultPreview(
                    id: "event-\($0.id)",
                    title: $0.title,
                    subtitle: $0.place,
                    metadata: $0.date,
                    category: "Timeline",
                    symbol: Self.symbol(for: $0.category),
                    searchTerms: [$0.title, $0.place, $0.date, "timeline"]
                )
            }

        let storyResults = story.drafts.prefix(2).map {
            SearchResultPreview(
                id: "story-\($0.id)",
                title: $0.title,
                subtitle: $0.trip,
                metadata: "Story draft",
                category: "Story",
                symbol: "book.closed.fill",
                searchTerms: [$0.title, $0.trip, $0.status, "story"]
            )
        }

        let collectionResults = collections.prefix(2).map {
            SearchResultPreview(
                id: "collection-\($0.id)",
                title: $0.title,
                subtitle: $0.subtitle,
                metadata: "\($0.memoryCount) memories",
                category: "Collection",
                symbol: $0.coverSymbol,
                searchTerms: [$0.title, $0.subtitle, $0.kind.rawValue, "collection"]
            )
        }

        let highlightResults = highlights.moments.prefix(2).map {
            SearchResultPreview(
                id: "highlight-\($0.id)",
                title: $0.title,
                subtitle: $0.place,
                metadata: "Highlight",
                category: "Memory",
                symbol: "star.fill",
                searchTerms: [$0.title, $0.place, $0.detail, "highlight", "memory"]
            )
        }

        return eventResults + storyResults + collectionResults + highlightResults
    }

    var statistics: [SearchStatisticPreview] {
        let timelineEvents = timeline.years.reduce(0) { $0 + $1.events.count }
        return [
            SearchStatisticPreview(
                id: "stat-places",
                value: "\(traveller.summary.cities)",
                label: "Places indexed",
                caption: "Cities available in the static traveller summary.",
                symbol: "mappin.circle.fill",
                accent: TravelTheme.current.ocean
            ),
            SearchStatisticPreview(
                id: "stat-events",
                value: "\(timelineEvents)",
                label: "Timeline events",
                caption: "DTO events represented in this preview archive.",
                symbol: "clock.fill",
                accent: TravelTheme.current.tint
            ),
            SearchStatisticPreview(
                id: "stat-collections",
                value: "\(collections.count)",
                label: "Collections",
                caption: "Themed sets ready for deterministic matching.",
                symbol: "rectangle.stack.fill",
                accent: TravelTheme.current.sun
            )
        ]
    }

    func results(matching query: String) -> [SearchResultPreview] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return Array(resultPreviews.prefix(4)) }

        return resultPreviews.filter { result in
            result.searchTerms.contains { $0.lowercased().contains(normalized) }
        }
    }

    func hasResults(for query: String) -> Bool {
        !results(matching: query).isEmpty
    }

    private static let destinationSymbols = [
        "torii.gate",
        "seal.fill",
        "sunset.fill",
        "globe.americas.fill"
    ]

    private static let destinationAccents = [
        TravelTheme.current.coral,
        TravelTheme.current.tint,
        TravelTheme.current.sun,
        TravelTheme.current.ocean
    ]

    private static func symbol(for category: String) -> String {
        switch category {
        case "achievement": "seal.fill"
        case "travel_memory": "photo.fill"
        case "milestone": "flag.checkered"
        case "first_trip": "sparkles"
        default: "mappin.and.ellipse"
        }
    }
}
