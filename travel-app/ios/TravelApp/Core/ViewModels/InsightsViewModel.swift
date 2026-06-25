import SwiftUI
import Observation

@Observable
final class InsightsViewModel {
    let insights: InsightsDTO

    init(repository: any InsightsRepository) {
        self.insights = repository.insights
    }

    var hasInsights: Bool { !insights.cards.isEmpty }

    var hero: InsightsHeroPreview {
        InsightsHeroPreview(
            title: "Patterns in your travel life",
            subtitle: "A premium overview of travel habits, destination trends and journey observations.",
            patterns: "\(insights.cards.count)",
            trends: "7",
            habits: "5"
        )
    }

    let patterns = [
        TravelPatternPreview(id: "pattern-coast", title: "Strongest travel style", value: "Coastal cities", caption: "Sea-facing city breaks lead the traveller history.", symbol: "water.waves", accent: TravelTheme.current.ocean),
        TravelPatternPreview(id: "pattern-pace", title: "Preferred pace", value: "Slow mornings", caption: "Most completed journeys include unhurried city days.", symbol: "cup.and.saucer.fill", accent: TravelTheme.current.moss),
        TravelPatternPreview(id: "pattern-repeat", title: "Return signal", value: "Italy", caption: "The most repeated destination in the preview archive.", symbol: "arrow.triangle.2.circlepath", accent: TravelTheme.current.coral)
    ]

    let trends = [
        DestinationTrendPreview(id: "trend-italy", destination: "Italy", trend: "Most repeated", detail: "Coastal memories and city notes appear across multiple years.", symbol: "heart.fill", gradient: [TravelTheme.current.coral, TravelTheme.current.sun]),
        DestinationTrendPreview(id: "trend-japan", destination: "Japan", trend: "Latest growth", detail: "The newest journey adds fresh cultural and rail scenes.", symbol: "leaf.fill", gradient: [TravelTheme.current.moss, TravelTheme.current.sky]),
        DestinationTrendPreview(id: "trend-portugal", destination: "Portugal", trend: "Origin point", detail: "The first recorded trip anchors the timeline.", symbol: "flag.checkered", gradient: [TravelTheme.current.ocean, TravelTheme.current.tint])
    ]

    let seasons = [
        SeasonalityPreview(id: "season-spring", season: "Spring", label: "Peak", detail: "Spring holds the strongest concentration of recent journeys.", symbol: "camera.macro"),
        SeasonalityPreview(id: "season-autumn", season: "Autumn", label: "Origin", detail: "Autumn contains the first recorded trip marker.", symbol: "leaf.fill"),
        SeasonalityPreview(id: "season-summer", season: "Summer", label: "Coastal", detail: "Summer travel skews toward islands and sea-facing memories.", symbol: "sun.max.fill")
    ]

    let journeyInsights = [
        JourneyInsightPreview(id: "insight-active-year", title: "Most active travel year", detail: "2024 contains the highest density of completed journeys and milestones.", reasonCode: "most_active_year", symbol: "sparkles"),
        JourneyInsightPreview(id: "insight-companion", title: "Companion-based travel", detail: "Shared journeys appear as a meaningful recurring signal.", reasonCode: "companion_based_insight", symbol: "person.2.fill"),
        JourneyInsightPreview(id: "insight-milestone", title: "First major milestone", detail: "Lisbon remains the opening marker for the traveller archive.", reasonCode: "first_major_milestone", symbol: "seal.fill")
    ]

    let recommendations = [
        InsightRecommendationPreview(id: "next-story", title: "Surface coastal chapters", caption: "A fixed card linking the strongest style to story and cinematic surfaces.", reasonCode: "strongest_travel_style", symbol: "rectangle.stack.fill"),
        InsightRecommendationPreview(id: "next-passport", title: "Feature repeat destinations", caption: "A fixed card for repeated destinations and passport stamp context.", reasonCode: "most_repeated_destination", symbol: "person.text.rectangle.fill")
    ]
}
