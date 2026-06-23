import SwiftUI
import Observation

@Observable
final class TimelineViewModel {
    let hasEvents = true

    let summary = TimelineSummaryPreview(
        title: "A life in motion",
        subtitle: "A premium, year-by-year record of trips, milestones and travel memories.",
        countries: "18",
        journeys: "27",
        years: "8"
    )

    let milestones = [
        JourneyMilestonePreview(
            id: "milestone-first-trip",
            title: "First trip",
            value: "Lisbon",
            caption: "The first recorded journey in this travel history.",
            symbol: "flag.checkered"
        ),
        JourneyMilestonePreview(
            id: "milestone-biggest-year",
            title: "Most active year",
            value: "2024",
            caption: "Six completed journeys and the strongest travel rhythm.",
            symbol: "sparkles"
        ),
        JourneyMilestonePreview(
            id: "milestone-countries",
            title: "Countries visited",
            value: "18",
            caption: "Reach across the traveller's completed journeys.",
            symbol: "globe.europe.africa.fill"
        )
    ]

    let years = [
        TimelineYearPreview(
            id: "year-2025",
            year: "2025",
            summary: "Latest journey and new stamp",
            events: [
                TimelineEventPreview(
                    id: "event-kyoto",
                    title: "Latest journey",
                    place: "Kyoto, Japan",
                    dateLabel: "Apr",
                    category: "Country visit",
                    symbol: "leaf.fill",
                    accent: TravelTheme.current.moss,
                    detail: "A calm cultural chapter with temples, rail days and evening walks."
                ),
                TimelineEventPreview(
                    id: "event-achievement-2025",
                    title: "New passport stamp",
                    place: "Japan",
                    dateLabel: "Apr",
                    category: "Achievement",
                    symbol: "seal.fill",
                    accent: TravelTheme.current.coral,
                    detail: "A completed destination marker for the traveller passport."
                )
            ]
        ),
        TimelineYearPreview(
            id: "year-2024",
            year: "2024",
            summary: "Most active travel year",
            events: [
                TimelineEventPreview(
                    id: "event-amalfi",
                    title: "Blue hour on the coast",
                    place: "Positano, Italy",
                    dateLabel: "May",
                    category: "Travel memory",
                    symbol: "sunset.fill",
                    accent: TravelTheme.current.sun,
                    detail: "The dashboard hero memory belongs to this timeline chapter."
                ),
                TimelineEventPreview(
                    id: "event-cape-town",
                    title: "Fifth continent reached",
                    place: "Cape Town, South Africa",
                    dateLabel: "Nov",
                    category: "Milestone",
                    symbol: "globe.americas.fill",
                    accent: TravelTheme.current.ocean,
                    detail: "A major reach marker inside the personal travel history."
                )
            ]
        ),
        TimelineYearPreview(
            id: "year-2018",
            year: "2018",
            summary: "The timeline begins",
            events: [
                TimelineEventPreview(
                    id: "event-lisbon",
                    title: "First recorded trip",
                    place: "Lisbon, Portugal",
                    dateLabel: "Sep",
                    category: "First trip",
                    symbol: "flag.checkered",
                    accent: TravelTheme.current.tint,
                    detail: "The origin point for this traveller timeline."
                )
            ]
        )
    ]

    let moments = [
        TravelMomentPreview(id: "moment-island", title: "Island chapter", subtitle: "Three coastal memories grouped in the travel history.", symbol: "water.waves"),
        TravelMomentPreview(id: "moment-streak", title: "Seven-month streak", subtitle: "A recent movement pattern surfaced as a visual callout.", symbol: "flame.fill"),
        TravelMomentPreview(id: "moment-companion", title: "Shared journey", subtitle: "A companion-based moment from the traveller history.", symbol: "person.2.fill")
    ]
}

struct TimelineScreen: View {
    @State private var viewModel = TimelineViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                TimelineHeroCard(summary: viewModel.summary)

                if viewModel.hasEvents {
                    populatedContent
                } else {
                    TimelineEmptyState()
                }
            }
            .navigationTitle("Timeline")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Journey summary", subtitle: "Callouts from the traveller timeline.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.milestones) { milestone in
                    JourneyMilestoneCard(milestone: milestone)
                }
            }
        }

        PremiumSection(title: "Travel history", subtitle: "Year groups, markers and memory-led event cards.") {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                ForEach(viewModel.years) { year in
                    VStack(alignment: .leading, spacing: TravelSpacing.md) {
                        TimelineYearHeader(year: year)
                        VStack(spacing: TravelSpacing.md) {
                            ForEach(year.events) { event in
                                TimelineEventCard(event: event)
                            }
                        }
                    }
                }
            }
        }

        PremiumSection(title: "Travel moments", subtitle: "Small callouts from the journey record.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.moments) { moment in
                    TravelMomentRow(moment: moment)
                }
            }
        }
    }
}
