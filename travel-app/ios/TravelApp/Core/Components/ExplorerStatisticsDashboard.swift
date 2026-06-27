import SwiftUI

// MARK: - Explorer statistics dashboard (Phase 71)
//
// A reusable, presentation-only travel-analytics panel that gathers an explorer's
// lifetime statistics into a polished, Apple-quality dashboard: countries, cities,
// flights, passport stamps, days travelling, continents, photos, dive sites, surf
// breaks, hidden places discovered, national parks visited and UNESCO World
// Heritage sites.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumStatCard` (icon-led featured metrics), `PremiumMetricTile` (dense
// value/label tiles), `PremiumAdaptiveGrid` and the optional `PremiumLevelProgress`
// rank header — plus the established tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are
// caller-supplied mock data; the component holds no data, scoring, networking,
// persistence, view-model or navigation logic, and is not wired into any screen.
// Animations are subtle appearance polish only (a staggered fade-and-rise).

/// A single, presentation-only explorer statistic.
struct ExplorerStat: Identifiable {
    let id: String
    var symbol: String
    /// Pre-formatted display value (presentation-only — the caller owns formatting).
    var value: String
    var label: String
    /// Optional qualifier shown beneath the value in the expanded featured cards.
    var caption: String?
    var accent: Color

    /// `id` defaults to the label, matching the codebase's deterministic
    /// conventions (no `UUID()`); pass an explicit id for non-unique labels.
    init(
        id: String? = nil,
        symbol: String,
        value: String,
        label: String,
        caption: String? = nil,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? label
        self.symbol = symbol
        self.value = value
        self.label = label
        self.caption = caption
        self.accent = accent
    }

    /// Integer convenience for whole-number metrics.
    init(
        id: String? = nil,
        symbol: String,
        value: Int,
        label: String,
        caption: String? = nil,
        accent: Color = TravelTheme.current.tint
    ) {
        self.init(id: id, symbol: symbol, value: "\(value)", label: label, caption: caption, accent: accent)
    }

    var accessibilityText: String {
        var text = "\(value) \(label)"
        if let caption { text += ", \(caption)" }
        return text
    }
}

/// An optional rank/level summary shown atop the dashboard, rendered with the
/// existing `PremiumLevelProgress`.
struct ExplorerStatRank {
    var level: Int
    var rankTitle: String?
    var currentXP: Int
    var requiredXP: Int
    var accent: Color = TravelTheme.current.tint
}

/// Layout density for an `ExplorerStatisticsDashboard`.
enum ExplorerStatisticsLayout {
    case compact
    case expanded
}

/// A premium, presentation-only explorer statistics dashboard.
struct ExplorerStatisticsDashboard: View {
    var title: String? = "Travel statistics"
    var subtitle: String? = nil
    var stats: [ExplorerStat]
    /// Optional rank header; omit for a stats-only panel.
    var rank: ExplorerStatRank? = nil
    var layout: ExplorerStatisticsLayout = .expanded

    @State private var appeared = false

    /// In the expanded layout, the first three stats are promoted to icon-led
    /// featured cards; the remainder fill a dense tile grid.
    private var featuredStats: [ExplorerStat] { Array(stats.prefix(3)) }
    private var remainingStats: [ExplorerStat] { Array(stats.dropFirst(3)) }

    var body: some View {
        Group {
            switch layout {
            case .expanded: expandedDashboard
            case .compact: compactDashboard
            }
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
    }

    // MARK: Expanded

    private var expandedDashboard: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.lg) {
            if title != nil || subtitle != nil {
                header(titleFont: TravelTypography.title)
            }

            if let rank {
                PremiumLevelProgress(
                    level: rank.level,
                    currentXP: rank.currentXP,
                    requiredXP: rank.requiredXP,
                    rankTitle: rank.rankTitle,
                    accent: rank.accent,
                    layout: .compact
                )
            }

            if stats.isEmpty {
                emptyState
            } else {
                if !featuredStats.isEmpty {
                    PremiumAdaptiveGrid(minimumWidth: 160) {
                        ForEach(Array(featuredStats.enumerated()), id: \.element.id) { index, stat in
                            PremiumStatCard(
                                symbol: stat.symbol,
                                value: stat.value,
                                label: stat.label,
                                caption: stat.caption ?? "Lifetime",
                                accent: stat.accent
                            )
                            .modifier(StatAppearance(appeared: appeared, index: index))
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(stat.accessibilityText)
                        }
                    }
                }

                if !remainingStats.isEmpty {
                    VStack(alignment: .leading, spacing: TravelSpacing.md) {
                        Text("More stats")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(.secondary)
                        GlassCard {
                            tileGrid(remainingStats, minimumWidth: 110, baseIndex: featuredStats.count)
                        }
                    }
                }
            }
        }
    }

    // MARK: Compact

    private var compactDashboard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                if title != nil || subtitle != nil {
                    header(titleFont: TravelTypography.cardTitle)
                }

                if let rank {
                    PremiumLevelProgress(
                        level: rank.level,
                        currentXP: rank.currentXP,
                        requiredXP: rank.requiredXP,
                        rankTitle: rank.rankTitle,
                        accent: rank.accent,
                        layout: .compact
                    )
                }

                if stats.isEmpty {
                    emptyState
                } else {
                    tileGrid(stats, minimumWidth: 104, baseIndex: 0)
                }
            }
        }
    }

    // MARK: Pieces

    private func header(titleFont: Font) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            if let title {
                Text(title).font(titleFont)
            }
            if let subtitle {
                Text(subtitle)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func tileGrid(_ items: [ExplorerStat], minimumWidth: CGFloat, baseIndex: Int) -> some View {
        PremiumAdaptiveGrid(minimumWidth: minimumWidth) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, stat in
                PremiumMetricTile(value: stat.value, label: stat.label)
                    .modifier(StatAppearance(appeared: appeared, index: baseIndex + index))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(stat.accessibilityText)
            }
        }
    }

    private var emptyState: some View {
        Text("No travel statistics yet — your first journey starts the count.")
            .font(TravelTypography.body)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// Subtle, staggered appearance polish (fade + slight rise) shared by every stat
/// cell. The stagger is capped so long dashboards still settle quickly.
private struct StatAppearance: ViewModifier {
    let appeared: Bool
    let index: Int

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 8)
            .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.04), value: appeared)
    }
}

#if DEBUG
struct ExplorerStatisticsDashboard_Previews: PreviewProvider {

    /// A seasoned traveller with a full lifetime of statistics.
    private static let voyagerStats: [ExplorerStat] = [
        ExplorerStat(symbol: "globe.europe.africa.fill", value: 24, label: "Countries", caption: "Lifetime", accent: TravelTheme.current.ocean),
        ExplorerStat(symbol: "building.2.fill", value: 68, label: "Cities", caption: "Explored", accent: TravelTheme.current.sky),
        ExplorerStat(symbol: "globe.americas.fill", value: 5, label: "Continents", caption: "Of seven", accent: TravelTheme.current.coral),
        ExplorerStat(symbol: "airplane", value: 142, label: "Flights", accent: TravelTheme.current.tint),
        ExplorerStat(symbol: "seal.fill", value: 31, label: "Stamps", accent: TravelTheme.current.sun),
        ExplorerStat(symbol: "calendar", value: 410, label: "Days", accent: TravelTheme.current.moss),
        ExplorerStat(symbol: "camera.fill", value: "12.4k", label: "Photos", accent: TravelTheme.current.sky),
        ExplorerStat(symbol: "water.waves", value: 19, label: "Dive sites", accent: TravelTheme.current.ocean),
        ExplorerStat(symbol: "figure.surfing", value: 8, label: "Surf breaks", accent: TravelTheme.current.tint),
        ExplorerStat(symbol: "mappin.and.ellipse", value: 27, label: "Hidden places", accent: TravelTheme.current.coral),
        ExplorerStat(symbol: "tree.fill", value: 14, label: "National parks", accent: TravelTheme.current.moss),
        ExplorerStat(symbol: "building.columns.fill", value: 11, label: "UNESCO sites", accent: TravelTheme.current.ocean)
    ]

    /// A brand-new explorer, just getting started.
    private static let newExplorerStats: [ExplorerStat] = [
        ExplorerStat(symbol: "globe.europe.africa.fill", value: 3, label: "Countries", caption: "Lifetime", accent: TravelTheme.current.ocean),
        ExplorerStat(symbol: "building.2.fill", value: 5, label: "Cities", caption: "Explored", accent: TravelTheme.current.sky),
        ExplorerStat(symbol: "globe.americas.fill", value: 1, label: "Continents", caption: "Of seven", accent: TravelTheme.current.coral),
        ExplorerStat(symbol: "airplane", value: 6, label: "Flights", accent: TravelTheme.current.tint),
        ExplorerStat(symbol: "seal.fill", value: 2, label: "Stamps", accent: TravelTheme.current.sun),
        ExplorerStat(symbol: "calendar", value: 21, label: "Days", accent: TravelTheme.current.moss),
        ExplorerStat(symbol: "camera.fill", value: 318, label: "Photos", accent: TravelTheme.current.sky),
        ExplorerStat(symbol: "tree.fill", value: 1, label: "National parks", accent: TravelTheme.current.moss)
    ]

    /// A legendary globetrotter with very large numbers.
    private static let globetrotterStats: [ExplorerStat] = [
        ExplorerStat(symbol: "globe.europe.africa.fill", value: 97, label: "Countries", caption: "Lifetime", accent: TravelTheme.current.ocean),
        ExplorerStat(symbol: "building.2.fill", value: 412, label: "Cities", caption: "Explored", accent: TravelTheme.current.sky),
        ExplorerStat(symbol: "globe.americas.fill", value: 7, label: "Continents", caption: "All seven", accent: TravelTheme.current.coral),
        ExplorerStat(symbol: "airplane", value: "1,204", label: "Flights", accent: TravelTheme.current.tint),
        ExplorerStat(symbol: "seal.fill", value: 188, label: "Stamps", accent: TravelTheme.current.sun),
        ExplorerStat(symbol: "calendar", value: "3,650", label: "Days", accent: TravelTheme.current.moss),
        ExplorerStat(symbol: "camera.fill", value: "84.0k", label: "Photos", accent: TravelTheme.current.sky),
        ExplorerStat(symbol: "water.waves", value: 96, label: "Dive sites", accent: TravelTheme.current.ocean),
        ExplorerStat(symbol: "figure.surfing", value: 54, label: "Surf breaks", accent: TravelTheme.current.tint),
        ExplorerStat(symbol: "mappin.and.ellipse", value: 203, label: "Hidden places", accent: TravelTheme.current.coral),
        ExplorerStat(symbol: "tree.fill", value: 73, label: "National parks", accent: TravelTheme.current.moss),
        ExplorerStat(symbol: "building.columns.fill", value: 64, label: "UNESCO sites", accent: TravelTheme.current.ocean)
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Seasoned Voyager")
                        .font(TravelTypography.section)
                    ExplorerStatisticsDashboard(
                        subtitle: "A lifetime of journeys, gathered in one place.",
                        stats: voyagerStats,
                        rank: ExplorerStatRank(
                            level: 7,
                            rankTitle: "Seasoned Voyager",
                            currentXP: 320,
                            requiredXP: 500,
                            accent: TravelTheme.current.tint
                        ),
                        layout: .expanded
                    )

                    Divider()

                    Text("Expanded · New Explorer (no rank)")
                        .font(TravelTypography.section)
                    ExplorerStatisticsDashboard(
                        title: "Your travel statistics",
                        subtitle: "Every journey adds to the story.",
                        stats: newExplorerStats,
                        layout: .expanded
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Statistics · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · Globetrotter")
                        .font(TravelTypography.section)
                    ExplorerStatisticsDashboard(
                        subtitle: "All seven continents and counting.",
                        stats: globetrotterStats,
                        rank: ExplorerStatRank(
                            level: 24,
                            rankTitle: "Globetrotter",
                            currentXP: 980,
                            requiredXP: 1000,
                            accent: TravelTheme.current.coral
                        ),
                        layout: .compact
                    )

                    Text("Compact · New Explorer")
                        .font(TravelTypography.section)
                    ExplorerStatisticsDashboard(
                        title: "At a glance",
                        stats: newExplorerStats,
                        layout: .compact
                    )

                    Text("Compact · Empty")
                        .font(TravelTypography.section)
                    ExplorerStatisticsDashboard(
                        title: "Travel statistics",
                        stats: [],
                        layout: .compact
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Statistics · Compact")
        }
    }
}
#endif
