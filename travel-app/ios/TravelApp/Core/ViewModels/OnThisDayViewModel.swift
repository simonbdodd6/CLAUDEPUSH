import SwiftUI
import Observation

@Observable
final class OnThisDayViewModel {
    /// Source contract for this surface, from the Phase 12 DTO layer.
    let onThisDay: OnThisDayDTO
    private(set) var loadingState: ViewModelLoadingState

    init(repository: any OnThisDayRepository) {
        let onThisDay = repository.onThisDay
        self.onThisDay = onThisDay
        self.loadingState = .resolved(isEmpty: onThisDay.entries.isEmpty)
    }

    /// Fixed reference year for deterministic "years ago" arithmetic. Kept in
    /// the view layer so the DTO performs no date work and stays Foundation-only.
    private let referenceYear = 2026

    var hasMemories: Bool { loadingState == .loaded }

    /// Hero metrics derived directly from the DTO's entries.
    var hero: OnThisDayHeroPreview {
        let years = onThisDay.entries.compactMap { Int($0.year) }
        let distinctYears = Set(years).count
        let earliest = years.min().map(String.init) ?? "—"
        return OnThisDayHeroPreview(
            title: "Your travels on \(onThisDay.dateLabel)",
            subtitle: "Anniversaries, milestones and memories surfaced from previous journeys on this date.",
            memories: "\(onThisDay.entries.count)",
            years: "\(distinctYears)",
            earliest: earliest
        )
    }

    /// "Today's travel memories" mapped from the DTO entries. Presentation
    /// (years-ago label, symbol, accent) is derived here in the view layer.
    var todaysMemories: [AnniversaryMomentPreview] {
        onThisDay.entries.enumerated().map { index, entry in
            let yearValue = Int(entry.year)
            let yearsAgo = yearValue.map { referenceYear - $0 }
            let yearsAgoLabel = yearsAgo.map { $0 <= 0 ? "This year" : "\($0) yr ago" } ?? "—"
            return AnniversaryMomentPreview(
                id: entry.id,
                year: entry.year,
                yearsAgoLabel: yearsAgoLabel,
                title: entry.title,
                place: entry.place,
                symbol: Self.momentSymbols[index % Self.momentSymbols.count],
                accent: Self.momentAccents[index % Self.momentAccents.count]
            )
        }
    }

    private static let momentSymbols = ["sunset.fill", "figure.walk.motion", "building.columns.fill"]
    private static let momentAccents = [TravelTheme.current.sun, TravelTheme.current.moss, TravelTheme.current.ocean]

    let anniversaries = [
        TravelAnniversaryPreview(id: "anni-first", title: "First recorded trip", milestone: "8 years ago", detail: "Lisbon opened the traveller archive in 2018.", symbol: "flag.checkered", accent: TravelTheme.current.tint),
        TravelAnniversaryPreview(id: "anni-continent", title: "Fifth continent reached", milestone: "2 years ago", detail: "Cape Town marked a major reach milestone in 2024.", symbol: "globe.americas.fill", accent: TravelTheme.current.ocean)
    ]

    let historical = [
        HistoricalMemoryPreview(id: "hist-amalfi", year: "2024", title: "Blue hour on the coast", place: "Positano, Italy", detail: "The featured memory belongs to this date's history.", symbol: "sunset.fill", gradient: [TravelTheme.current.coral, TravelTheme.current.sun]),
        HistoricalMemoryPreview(id: "hist-lisbon", year: "2018", title: "First evening walk", place: "Lisbon, Portugal", detail: "The opening chapter of the traveller archive.", symbol: "figure.walk.motion", gradient: [TravelTheme.current.ocean, TravelTheme.current.tint]),
        HistoricalMemoryPreview(id: "hist-athens", year: "2021", title: "Ancient streets", place: "Athens, Greece", detail: "A historical highlight from a mid-archive journey.", symbol: "building.columns.fill", gradient: [TravelTheme.current.moss, TravelTheme.current.sky])
    ]

    let yearsInReview = [
        YearInReviewPreview(id: "yir-2024", year: "2024", headline: "Most active year", detail: "The strongest travel rhythm in the archive.", highlights: ["Amalfi coast memory", "Fifth continent reached"], accent: TravelTheme.current.coral),
        YearInReviewPreview(id: "yir-2018", year: "2018", headline: "Where it began", detail: "The origin point of the traveller timeline.", highlights: ["First recorded trip", "Lisbon evening walk"], accent: TravelTheme.current.ocean)
    ]

    var statistics: [OnThisDayStatisticPreview] {
        [
            OnThisDayStatisticPreview(id: "stat-memories", value: "\(onThisDay.entries.count)", label: "On this day", caption: "Memories sharing today's date.", symbol: "calendar.badge.clock", accent: TravelTheme.current.tint),
            OnThisDayStatisticPreview(id: "stat-years", value: "\(Set(onThisDay.entries.compactMap { Int($0.year) }).count)", label: "Across years", caption: "Distinct years with a memory today.", symbol: "clock.arrow.circlepath", accent: TravelTheme.current.moss),
            OnThisDayStatisticPreview(id: "stat-anniversaries", value: "\(anniversaries.count)", label: "Anniversaries", caption: "Milestones tied to this date.", symbol: "seal.fill", accent: TravelTheme.current.coral)
        ]
    }
}
