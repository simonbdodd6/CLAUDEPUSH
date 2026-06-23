import SwiftUI
import Observation

@Observable
final class HighlightsViewModel {
    let hasHighlights = true

    let hero = HighlightsHeroPreview(
        title: "The best of your travels",
        subtitle: "A premium reel of standout moments, achievements and memorable journeys.",
        moments: "9",
        achievements: "6",
        countries: "11"
    )

    let moments = [
        HighlightMomentPreview(id: "moment-amalfi", title: "Sunset over the Amalfi Coast", place: "Italy", detail: "The most-revisited memory across the preview archive.", symbol: "sun.horizon.fill", gradient: [TravelTheme.current.coral, TravelTheme.current.sun]),
        HighlightMomentPreview(id: "moment-kyoto", title: "First morning in Kyoto", place: "Japan", detail: "The newest journey's standout cultural scene.", symbol: "leaf.fill", gradient: [TravelTheme.current.moss, TravelTheme.current.sky]),
        HighlightMomentPreview(id: "moment-lisbon", title: "Where it all began", place: "Portugal", detail: "Lisbon anchors the opening chapter of the timeline.", symbol: "flag.checkered", gradient: [TravelTheme.current.ocean, TravelTheme.current.tint])
    ]

    let achievements = [
        AchievementHighlightPreview(id: "achieve-countries", title: "Countries explored", value: "11", caption: "A static count of distinct destinations in the archive.", symbol: "globe.europe.africa.fill", accent: TravelTheme.current.ocean),
        AchievementHighlightPreview(id: "achieve-journeys", title: "Journeys completed", value: "18", caption: "Completed trips recorded across the preview years.", symbol: "checkmark.seal.fill", accent: TravelTheme.current.moss),
        AchievementHighlightPreview(id: "achieve-streak", title: "Longest travel streak", value: "3 years", caption: "Consecutive years with at least one journey.", symbol: "flame.fill", accent: TravelTheme.current.coral)
    ]

    let countries = [
        CountryHighlightPreview(id: "country-italy", country: "Italy", flag: "🇮🇹", detail: "Most repeated destination, led by coastal city breaks.", visits: "5 visits", accent: TravelTheme.current.coral),
        CountryHighlightPreview(id: "country-japan", country: "Japan", flag: "🇯🇵", detail: "Latest addition with fresh cultural and rail scenes.", visits: "2 visits", accent: TravelTheme.current.moss),
        CountryHighlightPreview(id: "country-portugal", country: "Portugal", flag: "🇵🇹", detail: "Origin point and first recorded trip marker.", visits: "3 visits", accent: TravelTheme.current.ocean)
    ]

    let memories = [
        TravelMemoryPreview(id: "memory-active-year", title: "Most memorable year", detail: "2024 holds the highest density of standout moments and milestones.", reasonCode: "most_active_year", symbol: "calendar.badge.clock"),
        TravelMemoryPreview(id: "memory-companion", title: "Best shared journey", detail: "A companion-based trip recurs as a meaningful highlight signal.", reasonCode: "companion_based_insight", symbol: "person.2.fill"),
        TravelMemoryPreview(id: "memory-milestone", title: "First major milestone", detail: "Lisbon remains the opening marker for the traveller archive.", reasonCode: "first_major_milestone", symbol: "seal.fill")
    ]
}

struct HighlightsScreen: View {
    @State private var viewModel = HighlightsViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                HighlightsHeroCard(highlight: viewModel.hero)

                if viewModel.hasHighlights {
                    populatedContent
                } else {
                    HighlightsEmptyState()
                }
            }
            .navigationTitle("Highlights")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Best moments", subtitle: "Static standout scenes from the traveller archive.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.moments) { moment in
                    HighlightMomentCard(moment: moment)
                }
            }
        }

        PremiumSection(title: "Achievements", subtitle: "Fixed milestone counts, not generated stats.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.achievements) { achievement in
                    AchievementHighlightCard(achievement: achievement)
                }
            }
        }

        PremiumSection(title: "Country highlights", subtitle: "Places with repeated, recent or origin signals.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.countries) { country in
                    CountryHighlightCard(country: country)
                }
            }
        }

        PremiumSection(title: "Memorable events", subtitle: "Fixed reason-code memories without generated text.") {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 180), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
                ForEach(viewModel.memories) { memory in
                    TravelMemoryCard(memory: memory)
                }
            }
        }
    }
}
