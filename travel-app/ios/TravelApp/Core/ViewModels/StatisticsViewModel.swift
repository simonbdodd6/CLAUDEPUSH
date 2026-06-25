import SwiftUI
import Observation

@Observable
final class StatisticsViewModel {
    let statistics: StatisticsDTO
    private(set) var loadingState: ViewModelLoadingState

    init(repository: any StatisticsRepository) {
        let statistics = repository.statistics
        self.statistics = statistics
        self.loadingState = .resolved(isEmpty: statistics.metrics.isEmpty)
    }

    var hasStatistics: Bool { loadingState == .loaded }

    var hero: StatisticsHeroPreview {
        StatisticsHeroPreview(
            title: "Your travel life, measured",
            subtitle: "A calm view of geographic reach, journey rhythm and the milestones shaping your archive.",
            countries: value(for: "countries"),
            journeys: value(for: "journeys"),
            years: value(for: "active_years")
        )
    }

    var countryCount: CountryCountPreview {
        CountryCountPreview(
            value: value(for: "countries"),
            label: label(for: "countries"),
            caption: caption(for: "countries"),
            secondaryValue: "64",
            secondaryLabel: "Cities recorded"
        )
    }

    let continentCoverage = ContinentCoveragePreview(
        covered: 5,
        total: 7,
        regions: ["Europe", "Africa", "Asia", "North America", "Oceania"]
    )

    var travelVelocity: TravelVelocityPreview {
        let journeys = integerValue(for: "journeys")
        let years = integerValue(for: "active_years")
        let rate = years > 0 ? Double(journeys) / Double(years) : 0

        return TravelVelocityPreview(
            value: rate.formatted(.number.precision(.fractionLength(1))),
            label: "Journeys per active year",
            caption: "\(value(for: "journeys")) journeys across \(value(for: "active_years")) active years.",
            activity: [0.36, 0.52, 0.44, 0.72, 0.61, 0.88, 0.70, 1.0]
        )
    }

    let journeyDistance = JourneyDistancePreview(
        value: "46,280",
        unit: "km",
        caption: "Static preview distance across the recorded journey archive.",
        routeLabels: ["Lisbon", "Athens", "Cape Town"]
    )

    var milestones: [MilestoneStatisticPreview] {
        [
            MilestoneStatisticPreview(
                id: "milestone-first",
                value: "2018",
                title: "First recorded trip",
                caption: "Lisbon opened the traveller archive.",
                symbol: "flag.checkered",
                accent: TravelTheme.current.tint
            ),
            MilestoneStatisticPreview(
                id: "milestone-latest",
                value: "2026",
                title: "Latest travel year",
                caption: "The most recent chapter in this static preview.",
                symbol: "calendar.badge.clock",
                accent: TravelTheme.current.coral
            ),
            MilestoneStatisticPreview(
                id: "milestone-memories",
                value: value(for: "memories"),
                title: label(for: "memories"),
                caption: caption(for: "memories"),
                symbol: "photo.stack.fill",
                accent: TravelTheme.current.sun
            )
        ]
    }

    let patterns = [
        TravelPatternPreview(
            id: "statistics-pattern-coast",
            title: "Strongest destination theme",
            value: "Coastal cities",
            caption: "Sea-facing places appear most often in the static archive.",
            symbol: "water.waves",
            accent: TravelTheme.current.ocean
        ),
        TravelPatternPreview(
            id: "statistics-pattern-season",
            title: "Most active season",
            value: "Late summer",
            caption: "August and September hold the densest journey rhythm.",
            symbol: "sun.max.fill",
            accent: TravelTheme.current.sun
        ),
        TravelPatternPreview(
            id: "statistics-pattern-pace",
            title: "Journey rhythm",
            value: "Steady explorer",
            caption: "Travel remains consistent across the active years.",
            symbol: "chart.line.uptrend.xyaxis",
            accent: TravelTheme.current.moss
        )
    ]

    var summaryMetrics: [StatisticsDTO.Metric] { statistics.metrics }

    private func metric(for key: String) -> StatisticsDTO.Metric? {
        statistics.metrics.first { $0.key == key }
    }

    private func value(for key: String) -> String {
        metric(for: key)?.value ?? "0"
    }

    private func label(for key: String) -> String {
        metric(for: key)?.label ?? key
    }

    private func caption(for key: String) -> String {
        metric(for: key)?.caption ?? ""
    }

    private func integerValue(for key: String) -> Int {
        Int(value(for: key)) ?? 0
    }
}
