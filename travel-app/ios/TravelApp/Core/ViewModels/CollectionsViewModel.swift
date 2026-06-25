import SwiftUI
import Observation

@Observable
final class CollectionsViewModel {
    let collections: [CollectionDTO]
    private(set) var loadingState: ViewModelLoadingState

    init(repository: any CollectionsRepository) {
        let collections = repository.collections
        self.collections = collections
        self.loadingState = .resolved(isEmpty: collections.isEmpty)
    }

    var hasCollections: Bool { loadingState == .loaded }

    var statePresentation: ViewModelStatePresentation? {
        loadingState.presentation(
            empty: EmptyStatePresentation(
                title: "Your collections are ready",
                message: "Completed journeys can group into themed memory collections here.",
                actionLabel: nil,
                reasonCode: "collections_empty"
            ),
            failureTitle: "Unable to load collections"
        )
    }

    let themes = [
        CollectionThemePreview(id: "theme-coast", title: "Ocean & islands", caption: "Coastlines, harbours and sea crossings.", symbol: "sailboat.fill", accent: TravelTheme.current.ocean),
        CollectionThemePreview(id: "theme-city", title: "City notes", caption: "Walkable days and quiet evening streets.", symbol: "building.2.fill", accent: TravelTheme.current.tint),
        CollectionThemePreview(id: "theme-people", title: "Companions", caption: "Journeys shared with the people in them.", symbol: "person.2.fill", accent: TravelTheme.current.coral),
        CollectionThemePreview(id: "theme-slow", title: "Slow mornings", caption: "Cafes, markets and unhurried travel rhythm.", symbol: "cup.and.saucer.fill", accent: TravelTheme.current.moss)
    ]

    let detail = CollectionDetailPreview(
        id: "detail-coast",
        title: "Coastal chapters",
        subtitle: "The strongest collection in the static archive, led by sea-facing city breaks.",
        kindLabel: "Place collection",
        memoryCount: 12,
        symbol: "water.waves",
        accent: TravelTheme.current.ocean,
        items: ["Blue hour · Positano", "Harbour morning · Lisbon", "Island light · Santorini"]
    )

    let statistics = [
        CollectionStatisticPreview(id: "stat-collections", value: "4", label: "Collections", caption: "Themed memory sets on record.", symbol: "rectangle.stack.fill", accent: TravelTheme.current.tint),
        CollectionStatisticPreview(id: "stat-largest", value: "Coastal", label: "Largest set", caption: "The most-filled collection.", symbol: "water.waves", accent: TravelTheme.current.ocean),
        CollectionStatisticPreview(id: "stat-kinds", value: "4", label: "Grouping kinds", caption: "Activity, place, companion and transport.", symbol: "square.grid.2x2.fill", accent: TravelTheme.current.moss)
    ]

    var hero: CollectionsHeroPreview {
        CollectionsHeroPreview(
            title: "Grouped travel memories",
            subtitle: "A premium shelf of themed collections built from places, activities, companions and journeys.",
            collections: "\(collections.count)",
            memories: "\(collections.reduce(0) { $0 + $1.memoryCount })",
            themes: "\(themes.count)"
        )
    }
}
