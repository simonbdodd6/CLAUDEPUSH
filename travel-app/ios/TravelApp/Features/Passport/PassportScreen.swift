import SwiftUI
import Observation

@Observable
final class PassportViewModel {
    let hasJourneys = true

    let coverName = "Atlas traveller"
    let coverTagline = "A cinematic passport for completed journeys, stamps and milestones."
    let completionLabel = "64% passport completion"
    let completionProgress = 0.64

    let stats = [
        PassportStatPreview(
            id: "stat-countries",
            value: "18",
            label: "Countries visited",
            caption: "Distinct nations across recorded trips",
            symbol: "flag.fill",
            accent: TravelTheme.current.tint
        ),
        PassportStatPreview(
            id: "stat-continents",
            value: "5",
            label: "Continents",
            caption: "Reach spanning the recorded atlas",
            symbol: "globe.americas.fill",
            accent: TravelTheme.current.ocean
        ),
        PassportStatPreview(
            id: "stat-streak",
            value: "7 mo",
            label: "Travel streak",
            caption: "Recent movement, most recent first",
            symbol: "flame.fill",
            accent: TravelTheme.current.coral
        ),
        PassportStatPreview(
            id: "stat-memory",
            value: "82",
            label: "Memories",
            caption: "Captured moments across completed trips",
            symbol: "sparkles",
            accent: TravelTheme.current.sun
        )
    ]

    let style = PassportStylePreview(
        style: "Coastal city breaks",
        detail: "The strongest pattern across this static passport preview.",
        reasonCode: "strongest_travel_style",
        symbol: "beach.umbrella.fill"
    )

    let stamps = [
        PassportStampPreview(id: "stamp-it", country: "Italy", glyph: "🇮🇹", dateLabel: "2024", symbol: "sun.max.fill", gradient: [TravelTheme.current.ocean, TravelTheme.current.sky], isStamped: true),
        PassportStampPreview(id: "stamp-jp", country: "Japan", glyph: "🇯🇵", dateLabel: "2025", symbol: "leaf.fill", gradient: [TravelTheme.current.coral, TravelTheme.current.sun], isStamped: true),
        PassportStampPreview(id: "stamp-pt", country: "Portugal", glyph: "🇵🇹", dateLabel: "2018", symbol: "water.waves", gradient: [TravelTheme.current.moss, TravelTheme.current.sky], isStamped: true),
        PassportStampPreview(id: "stamp-is", country: "Iceland", glyph: "🇮🇸", dateLabel: "2022", symbol: "snowflake", gradient: [TravelTheme.current.ocean, TravelTheme.current.moss], isStamped: true),
        PassportStampPreview(id: "stamp-mx", country: "Mexico", glyph: "🇲🇽", dateLabel: "2023", symbol: "sparkles", gradient: [TravelTheme.current.sun, TravelTheme.current.coral], isStamped: true),
        PassportStampPreview(id: "stamp-gr", country: "Greece", glyph: "🇬🇷", dateLabel: "2021", symbol: "building.columns.fill", gradient: [TravelTheme.current.sky, TravelTheme.current.tint], isStamped: true),
        PassportStampPreview(id: "stamp-next-1", country: "Ready", glyph: "", dateLabel: "", symbol: "plus", gradient: [], isStamped: false),
        PassportStampPreview(id: "stamp-next-2", country: "Ready", glyph: "", dateLabel: "", symbol: "plus", gradient: [], isStamped: false)
    ]

    let moments = [
        PassportMomentPreview(id: "moment-kyoto", title: "New stamp · Kyoto", place: "Kyoto, Japan", dateLabel: "2025", category: "Latest stamp", symbol: "leaf.fill"),
        PassportMomentPreview(id: "moment-continent", title: "Fifth continent reached", place: "Cape Town, South Africa", dateLabel: "2024", category: "Milestone", symbol: "globe.americas.fill"),
        PassportMomentPreview(id: "moment-streak", title: "Seven-month streak", place: "Across recent journeys", dateLabel: "2024", category: "Streak", symbol: "flame.fill"),
        PassportMomentPreview(id: "moment-first", title: "First recorded trip", place: "Lisbon, Portugal", dateLabel: "2018", category: "Origin", symbol: "flag.checkered")
    ]
}

struct PassportScreen: View {
    @State private var viewModel = PassportViewModel()

    var body: some View {
        NavigationStack {
            PremiumScrollView {
                PassportCoverCard(
                    name: viewModel.coverName,
                    tagline: viewModel.coverTagline,
                    completionLabel: viewModel.completionLabel,
                    progress: viewModel.completionProgress
                )

                if viewModel.hasJourneys {
                    populatedContent
                } else {
                    PassportEmptyState()
                }
            }
            .navigationTitle("Passport")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private var populatedContent: some View {
        PremiumSection(title: "Passport at a glance", subtitle: "Static preview of recorded reach.") {
            PassportStatGrid(stats: viewModel.stats)
        }

        PremiumSection(title: "Travel signature", subtitle: "The shape of the traveller's journeys.") {
            PassportStyleCard(style: viewModel.style)
        }

        PremiumSection(title: "Stamp book", subtitle: "A visual grid of completed stamps and ready pages.") {
            PassportStampGrid(stamps: viewModel.stamps)
        }

        PremiumSection(title: "Recent passport moments", subtitle: "Milestones, streaks and the latest stamps.") {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(viewModel.moments) { moment in
                    PassportMomentRow(moment: moment)
                }
            }
        }
    }
}
