import SwiftUI
import Observation

@Observable
final class CollectionsViewModel {
    let hasCollections = true

    /// Gallery data is sourced from the Phase 12 DTO contract layer.
    let collections = MockDTOProvider.collections

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

struct CollectionsScreen: View {
    @State private var viewModel = CollectionsViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                CollectionHeroCard(preview: viewModel.hero)

                if viewModel.hasCollections {
                    populatedContent
                } else {
                    CollectionsEmptyState()
                }
            }
            .navigationTitle("Collections")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Collection gallery", subtitle: "Themed memory sets from the traveller archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.collections) { collection in
                    CollectionGalleryCard(collection: collection)
                }
            }
        }

        PremiumSection(title: "Featured collection", subtitle: "A closer look at the strongest memory set.") {
            CollectionDetailPreviewCard(detail: viewModel.detail)
        }

        PremiumSection(title: "Collection themes", subtitle: "Visual groupings across the archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.themes) { theme in
                    CollectionThemeCard(theme: theme)
                }
            }
        }

        PremiumSection(title: "Collection statistics", subtitle: "A compact overview of the collection shelf.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.statistics) { statistic in
                    CollectionStatisticCard(statistic: statistic)
                }
            }
        }
    }
}
