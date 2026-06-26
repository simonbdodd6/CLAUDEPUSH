import SwiftUI
import Observation

@Observable
final class HomeViewModel {
    let heroMemory = TripMemoryPreview(
        id: "memory-amalfi-blue-hour",
        title: "Blue hour above the Amalfi coast",
        place: "Positano, Italy",
        dateLabel: "May 2024",
        category: "Featured memory",
        symbol: "sunset.fill",
        gradient: [
            TravelTheme.current.ocean,
            TravelTheme.current.sky.opacity(0.88),
            TravelTheme.current.coral.opacity(0.74)
        ]
    )

    let passportProgress = PassportProgressPreview(
        countriesLabel: "18",
        citiesLabel: "64",
        completionLabel: "Presentation preview from passport DTO space",
        progress: 0.64
    )

    let timelineItems = [
        TimelinePreviewItem(id: "timeline-first", title: "First recorded trip", meta: "Lisbon, Portugal · 2018", symbol: "flag.checkered"),
        TimelinePreviewItem(id: "timeline-latest", title: "Latest journey", meta: "Kyoto, Japan · 2025", symbol: "clock.arrow.circlepath"),
        TimelinePreviewItem(id: "timeline-ocean", title: "Ocean chapter", meta: "Three island memories grouped", symbol: "water.waves")
    ]

    let highlights = [
        HighlightPreview(id: "highlight-top", title: "Most active year", value: "2024", reasonCode: "most_active_year", symbol: "sparkles"),
        HighlightPreview(id: "highlight-place", title: "Favourite destination", value: "Italy", reasonCode: "most_repeated_destination", symbol: "heart.fill")
    ]

    let insights = [
        InsightPreview(id: "insight-style", title: "Strongest travel style", detail: "Coastal city breaks lead this static dashboard preview.", reasonCode: "strongest_travel_style", symbol: "figure.walk.motion"),
        InsightPreview(id: "insight-companion", title: "Companion signal", detail: "Shared trips can surface here once bound to existing DTOs.", reasonCode: "companion_based_insight", symbol: "person.2.fill")
    ]

    let cinematic = CinematicPreview(
        title: "Build the reel",
        subtitle: "A cinematic surface reserved for existing deterministic story and cinematic outputs.",
        actionLabel: "Cinematic"
    )
}

struct HomeScreen: View {
    @State private var viewModel = HomeViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                HomeHeroHeader()
                TripMemoryCard(memory: viewModel.heroMemory)

                PremiumSection(title: "Travel Pulse", subtitle: "Static dashboard composition only.") {
                    PassportProgressCard(progress: viewModel.passportProgress)
                }

                PremiumSection(title: "Timeline Preview", subtitle: "A calm glance at chronology surfaces.") {
                    VStack(spacing: TravelSpacing.sm) {
                        ForEach(viewModel.timelineItems) { item in
                            TimelinePreviewRow(item: item)
                        }
                    }
                }

                PremiumSection(title: "Highlights", subtitle: "Fixed-category cards ready for deterministic output.") {
                    PremiumAdaptiveGrid(minimumWidth: 156) {
                        ForEach(viewModel.highlights) { highlight in
                            HighlightCard(highlight: highlight)
                        }
                    }
                }

                PremiumSection(title: "Insights", subtitle: "Reason-code first, prose-free backend alignment.") {
                    PremiumAdaptiveGrid(minimumWidth: 156) {
                        ForEach(viewModel.insights) { insight in
                            InsightCard(insight: insight)
                        }
                    }
                }

                CinematicCTACard(preview: viewModel.cinematic)
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct HomeHeroHeader: View {
    var body: some View {
        PremiumHeroHeader(
            eyebrow: "Travel Intelligence",
            symbol: "sparkles",
            title: "Your journeys, beautifully gathered.",
            subtitle: "A premium offline-first shell for memories, passport progress, timeline moments and deterministic insights."
        )
        .padding(.top, TravelSpacing.sm)
    }
}
