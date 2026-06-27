import SwiftUI

// MARK: - Explorer travel score card (Phase 75)
//
// A reusable, presentation-only "Travel Score" card: one headline number that
// rewards exploration across the app, presented as a premium circular gauge with
// the explorer's rank, level, progress to the next level, and the key metrics
// (countries, XP earned, streak). It is the travel equivalent of a credit-score
// or fitness-ring summary — a single, motivating glance.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumProgressBar`, `PremiumAdaptiveGrid`, `PremiumMetricTile` and the tokens
// (`TravelTheme`, `TravelSpacing`, `TravelRadius`, `TravelTypography`,
// `TravelMotion`). All values are caller-supplied mock data; the component holds
// no data, scoring, networking, persistence, view-model or navigation logic, and
// is not wired into any screen. Animations are subtle appearance polish only (the
// score ring and level bar ease in on appear).

/// An explorer's overall rank tier. Drives the gauge gradient, accent and badge
/// glyph (existing palette colours only).
enum ExplorerRank: CaseIterable {
    case beginner
    case explorer
    case veteran
    case legendary

    var displayName: String {
        switch self {
        case .beginner: "Beginner"
        case .explorer: "Explorer"
        case .veteran: "Veteran"
        case .legendary: "Legendary"
        }
    }

    var icon: String {
        switch self {
        case .beginner: "leaf.fill"
        case .explorer: "map.fill"
        case .veteran: "star.fill"
        case .legendary: "crown.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .beginner: return theme.moss
        case .explorer: return theme.tint
        case .veteran: return theme.ocean
        case .legendary: return theme.coral
        }
    }

    /// Gauge / progress gradient — existing palette colours only.
    var gradient: [Color] {
        let theme = TravelTheme.current
        switch self {
        case .beginner: return [theme.moss, theme.sky]
        case .explorer: return [theme.tint, theme.sky]
        case .veteran: return [theme.ocean, theme.sky]
        case .legendary: return [theme.coral, theme.sun, theme.sky]
        }
    }
}

/// Layout density for an `ExplorerTravelScoreCard`.
enum TravelScoreLayout {
    case compact
    case expanded
}

/// A premium, presentation-only travel-score summary card.
struct ExplorerTravelScoreCard: View {
    var score: Int
    var maxScore: Int = 1000
    var rank: ExplorerRank
    var level: Int
    var currentXP: Int
    var requiredXP: Int
    var countriesVisited: Int
    var xpEarned: Int
    var streakDays: Int
    var nextMilestone: String? = nil
    var layout: TravelScoreLayout = .expanded
    var title: String? = "Travel score"

    @State private var appeared = false

    // MARK: Derived

    private var scoreFraction: Double {
        guard maxScore > 0 else { return 0 }
        return min(max(Double(score) / Double(maxScore), 0), 1)
    }

    private var levelFraction: Double {
        guard requiredXP > 0 else { return 0 }
        return min(max(Double(currentXP) / Double(requiredXP), 0), 1)
    }

    private var animatedScore: Double { appeared ? scoreFraction : 0 }
    private var animatedLevel: Double { appeared ? levelFraction : 0 }
    private var levelPercent: Int { Int((levelFraction * 100).rounded()) }

    var body: some View {
        Group {
            switch layout {
            case .expanded: expanded
            case .compact: compact
            }
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Expanded

    private var expanded: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.lg) {
                if let title {
                    Text(title)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                scoreRing(diameter: 168, lineWidth: 14, showsDetail: true)

                rankBadge

                levelBlock

                PremiumAdaptiveGrid(minimumWidth: 104) {
                    metricTiles
                }

                if let nextMilestone {
                    nextMilestoneCallout(nextMilestone)
                }
            }
        }
    }

    // MARK: Compact

    private var compact: some View {
        GlassCard {
            HStack(alignment: .center, spacing: TravelSpacing.md) {
                scoreRing(diameter: 76, lineWidth: 8, showsDetail: false)

                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Image(systemName: rank.icon)
                            .foregroundStyle(rank.accent)
                        Text("\(rank.displayName) · Level \(level)")
                            .font(TravelTypography.cardTitle)
                            .lineLimit(1)
                    }

                    PremiumProgressBar(
                        progress: animatedLevel,
                        colors: rank.gradient,
                        height: TravelSpacing.xs
                    )

                    Text("\(grouped(countriesVisited)) countries · \(grouped(xpEarned)) XP · \(streakDays)d streak")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)

                    if let nextMilestone {
                        Label(nextMilestone, systemImage: "flag.checkered")
                            .font(TravelTypography.caption)
                            .foregroundStyle(rank.accent)
                            .lineLimit(1)
                    }
                }
            }
        }
    }

    // MARK: Pieces

    private func scoreRing(diameter: CGFloat, lineWidth: CGFloat, showsDetail: Bool) -> some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.16), lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: animatedScore)
                .stroke(
                    AngularGradient(colors: rank.gradient, center: .center),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(TravelMotion.gentle, value: animatedScore)

            VStack(spacing: TravelSpacing.xxs) {
                Text("\(score)")
                    .font(showsDetail ? TravelTypography.display : TravelTypography.title)
                    .monospacedDigit()
                if showsDetail {
                    Text("of \(grouped(maxScore))")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Text("TRAVEL SCORE")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(width: diameter, height: diameter)
        .scaleEffect(appeared ? 1 : 0.96)
        .opacity(appeared ? 1 : 0)
        .animation(TravelMotion.gentle, value: appeared)
    }

    private var rankBadge: some View {
        HStack(spacing: TravelSpacing.xs) {
            Image(systemName: rank.icon)
            Text(rank.displayName)
                .textCase(.uppercase)
        }
        .font(TravelTypography.caption)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.md)
        .padding(.vertical, TravelSpacing.xs)
        .background(
            LinearGradient(colors: rank.gradient, startPoint: .leading, endPoint: .trailing),
            in: Capsule()
        )
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
        .shadow(color: rank.accent.opacity(0.3), radius: 8, y: 4)
    }

    private var levelBlock: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text("Level \(level)")
                    .font(TravelTypography.cardTitle)
                Spacer(minLength: TravelSpacing.sm)
                Text("\(grouped(currentXP)) / \(grouped(requiredXP)) XP")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            PremiumProgressBar(
                progress: animatedLevel,
                colors: rank.gradient,
                height: TravelSpacing.sm
            )
            Text("\(levelPercent)% to Level \(level + 1)")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var metricTiles: some View {
        PremiumMetricTile(value: grouped(countriesVisited), label: "Countries")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(countriesVisited) countries visited")
        PremiumMetricTile(value: grouped(xpEarned), label: "XP earned")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(xpEarned) XP earned")
        PremiumMetricTile(value: "\(streakDays)", label: "Day streak")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(streakDays) day streak")
    }

    private func nextMilestoneCallout(_ text: String) -> some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: "flag.checkered.circle.fill")
                .font(TravelTypography.title)
                .foregroundStyle(rank.accent)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text("Next milestone")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(text)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }

    // MARK: Helpers

    /// Deterministic thousands grouping (no Locale, no formatter state), so the
    /// same number always renders identically offline.
    private func grouped(_ value: Int) -> String {
        let digits = String(abs(value))
        var out = ""
        for (index, character) in digits.reversed().enumerated() {
            if index > 0 && index % 3 == 0 { out.append(",") }
            out.append(character)
        }
        let result = String(out.reversed())
        return value < 0 ? "-\(result)" : result
    }

    private var accessibilityText: String {
        var parts = [
            title ?? "Travel score",
            "\(score) of \(maxScore)",
            "\(rank.displayName) rank",
            "Level \(level)",
            "\(levelPercent) percent to level \(level + 1)",
            "\(countriesVisited) countries",
            "\(xpEarned) XP earned",
            "\(streakDays) day streak"
        ]
        if let nextMilestone { parts.append("next milestone \(nextMilestone)") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct ExplorerTravelScoreCard_Previews: PreviewProvider {

    private static let beginner = ExplorerTravelScoreCard(
        score: 180, rank: .beginner, level: 2,
        currentXP: 40, requiredXP: 120,
        countriesVisited: 3, xpEarned: 1_250, streakDays: 2,
        nextMilestone: "Visit your 5th country"
    )

    private static let explorer = ExplorerTravelScoreCard(
        score: 540, rank: .explorer, level: 7,
        currentXP: 320, requiredXP: 500,
        countriesVisited: 24, xpEarned: 8_420, streakDays: 12,
        nextMilestone: "Reach Level 8"
    )

    private static let veteran = ExplorerTravelScoreCard(
        score: 780, rank: .veteran, level: 18,
        currentXP: 640, requiredXP: 900,
        countriesVisited: 52, xpEarned: 41_300, streakDays: 86,
        nextMilestone: "Complete Asia"
    )

    private static let legendary = ExplorerTravelScoreCard(
        score: 960, rank: .legendary, level: 40,
        currentXP: 1_820, requiredXP: 2_000,
        countriesVisited: 97, xpEarned: 184_500, streakDays: 365,
        nextMilestone: "Reach 100 countries"
    )

    private static func withLayout(_ card: ExplorerTravelScoreCard, _ layout: TravelScoreLayout) -> ExplorerTravelScoreCard {
        var copy = card
        copy.layout = layout
        return copy
    }

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Beginner").font(TravelTypography.section)
                    beginner
                    Text("Expanded · Explorer").font(TravelTypography.section)
                    explorer
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Travel score · Beginner & Explorer")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Veteran").font(TravelTypography.section)
                    veteran
                    Text("Expanded · Legendary").font(TravelTypography.section)
                    legendary
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Travel score · Veteran & Legendary")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Text("Compact · all ranks").font(TravelTypography.section)
                    withLayout(beginner, .compact)
                    withLayout(explorer, .compact)
                    withLayout(veteran, .compact)
                    withLayout(legendary, .compact)
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Travel score · Compact")
        }
    }
}
#endif
