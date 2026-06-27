import SwiftUI

// MARK: - Explorer journey timeline (Phase 69)
//
// A reusable, presentation-only timeline that tells the story of an explorer's
// travels over time: countries visited, passport stamps earned, achievements
// unlocked, treasure rewards collected, completed quests and level-ups, threaded
// onto a single chronological spine. It is intended as one of the app's signature
// surfaces — a vertical "journey rail" of colourful milestone nodes beside premium
// glass cards.
//
// It reuses the existing design system exclusively: `GlassCard`,
// `PremiumTimelineDateBadge` and `PremiumLocationBadge` for the card chrome, the
// Phase-57 `AchievementRarity` palette for reward pills, and the established
// `PremiumTimelineConnector` spine technique (a node above a `maxHeight: .infinity`
// line) — here given a richer gamified icon-medallion node rather than a plain
// dot. All values are caller-supplied mock data; the component holds no data,
// scoring, networking, persistence, view-model or navigation logic. Animations
// are subtle appearance polish only (a staggered fade-in and a spine that draws
// downward). DEBUG previews only; not wired into any screen.

/// A kind of journey milestone. Drives the node glyph, accent (existing palette
/// colours only) and the card eyebrow.
enum JourneyMilestoneKind: CaseIterable {
    case countryVisited
    case stampEarned
    case achievementUnlocked
    case treasureCollected
    case questCompleted
    case levelUp

    var label: String {
        switch self {
        case .countryVisited: "Country visited"
        case .stampEarned: "Stamp earned"
        case .achievementUnlocked: "Achievement unlocked"
        case .treasureCollected: "Treasure collected"
        case .questCompleted: "Quest completed"
        case .levelUp: "Level up"
        }
    }

    var icon: String {
        switch self {
        case .countryVisited: "globe.europe.africa.fill"
        case .stampEarned: "seal.fill"
        case .achievementUnlocked: "rosette"
        case .treasureCollected: "gift.fill"
        case .questCompleted: "checkmark.seal.fill"
        case .levelUp: "chevron.up.circle.fill"
        }
    }

    /// Node accent — existing palette colours only.
    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .countryVisited: return theme.ocean
        case .stampEarned: return theme.tint
        case .achievementUnlocked: return theme.sun
        case .treasureCollected: return theme.coral
        case .questCompleted: return theme.moss
        case .levelUp: return theme.sky
        }
    }
}

/// A single, presentation-only milestone on an explorer's journey.
struct ExplorerJourneyMilestone: Identifiable {
    let id: String
    var kind: JourneyMilestoneKind
    var title: String
    var place: String?
    var dateLabel: String
    var xp: Int?
    var rarity: AchievementRarity?

    /// `id` defaults to a stable, deterministic value derived from the date and
    /// title (no `UUID()`, matching the codebase's deterministic conventions).
    init(
        id: String? = nil,
        kind: JourneyMilestoneKind,
        title: String,
        place: String? = nil,
        dateLabel: String,
        xp: Int? = nil,
        rarity: AchievementRarity? = nil
    ) {
        self.id = id ?? "\(dateLabel)-\(title)"
        self.kind = kind
        self.title = title
        self.place = place
        self.dateLabel = dateLabel
        self.xp = xp
        self.rarity = rarity
    }
}

/// Layout density for an `ExplorerJourneyTimeline`.
enum ExplorerJourneyLayout {
    case compact
    case expanded
}

/// A premium, presentation-only journey timeline.
///
/// `milestones` are rendered top-to-bottom in the order supplied — the component
/// performs no sorting, so the caller controls chronology.
struct ExplorerJourneyTimeline: View {
    var milestones: [ExplorerJourneyMilestone]
    var layout: ExplorerJourneyLayout = .expanded
    /// Optional header title; pass `nil` for a chrome-free rail.
    var title: String? = "Your journey"
    var subtitle: String? = nil

    @State private var appeared = false

    private var totalXP: Int { milestones.compactMap(\.xp).reduce(0, +) }

    private var summaryLabel: String {
        let stops = milestones.count == 1 ? "1 stop" : "\(milestones.count) stops"
        return totalXP > 0 ? "\(stops) · \(totalXP) XP" : stops
    }

    private var hasHeader: Bool { title != nil || subtitle != nil }

    var body: some View {
        Group {
            if milestones.isEmpty {
                emptyState
            } else {
                switch layout {
                case .expanded: expandedTimeline
                case .compact: compactTimeline
                }
            }
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
    }

    // MARK: Expanded

    private var expandedTimeline: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.lg) {
            if hasHeader {
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    if let title {
                        HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                            Text(title).font(TravelTypography.title)
                            Spacer(minLength: 0)
                            summaryPill
                        }
                    }
                    if let subtitle {
                        Text(subtitle)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(milestones.enumerated()), id: \.element.id) { index, milestone in
                    expandedRow(milestone, isLast: index == milestones.count - 1, index: index)
                }
            }
        }
    }

    private func expandedRow(_ milestone: ExplorerJourneyMilestone, isLast: Bool, index: Int) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            node(milestone.kind, diameter: 44, iconFont: TravelTypography.cardTitle, showsLine: !isLast)

            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(milestone.kind.label)
                                .font(TravelTypography.eyebrow)
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                            Text(milestone.title)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: TravelSpacing.sm)
                        PremiumTimelineDateBadge(label: milestone.dateLabel, style: .capsule)
                    }

                    if let place = milestone.place {
                        PremiumLocationBadge(label: place)
                    }

                    if milestone.rarity != nil || milestone.xp != nil {
                        HStack(spacing: TravelSpacing.sm) {
                            if let rarity = milestone.rarity { rarityPill(rarity) }
                            if let xp = milestone.xp { xpPill(xp, accent: milestone.kind.accent) }
                        }
                    }
                }
            }
            .padding(.bottom, isLast ? 0 : TravelSpacing.md)
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 10)
        .animation(TravelMotion.gentle.delay(Double(index) * 0.05), value: appeared)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText(milestone))
    }

    // MARK: Compact

    private var compactTimeline: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                if hasHeader {
                    HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                        if let title {
                            Text(title).font(TravelTypography.cardTitle)
                        }
                        Spacer(minLength: 0)
                        summaryPill
                    }
                    if let subtitle {
                        Text(subtitle)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(milestones.enumerated()), id: \.element.id) { index, milestone in
                        compactRow(milestone, isLast: index == milestones.count - 1, index: index)
                    }
                }
            }
        }
    }

    private func compactRow(_ milestone: ExplorerJourneyMilestone, isLast: Bool, index: Int) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            node(milestone.kind, diameter: 30, iconFont: TravelTypography.caption, showsLine: !isLast)

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(milestone.title)
                    .font(TravelTypography.cardTitle)
                    .lineLimit(1)
                HStack(spacing: TravelSpacing.xs) {
                    Text(milestone.kind.label)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    if let place = milestone.place {
                        Text("· \(place)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            }
            .padding(.bottom, isLast ? 0 : TravelSpacing.md)

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xxs) {
                Text(milestone.dateLabel)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                if let xp = milestone.xp {
                    Text("+\(xp) XP")
                        .font(TravelTypography.caption)
                        .foregroundStyle(milestone.kind.accent)
                }
            }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 8)
        .animation(TravelMotion.gentle.delay(Double(index) * 0.05), value: appeared)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText(milestone))
    }

    // MARK: Pieces

    /// A milestone node: an icon medallion above a continuation line. The line
    /// fills the row height (`maxHeight: .infinity`) so the spine stays connected
    /// to the next node, mirroring `PremiumTimelineConnector`.
    private func node(_ kind: JourneyMilestoneKind, diameter: CGFloat, iconFont: Font, showsLine: Bool) -> some View {
        VStack(spacing: 0) {
            Image(systemName: kind.icon)
                .font(iconFont)
                .foregroundStyle(.white)
                .frame(width: diameter, height: diameter)
                .background(
                    LinearGradient(
                        colors: [kind.accent, kind.accent.opacity(0.7)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    in: Circle()
                )
                .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
                .shadow(color: kind.accent.opacity(0.3), radius: 8, y: 4)

            if showsLine {
                Rectangle()
                    .fill(kind.accent.opacity(0.24))
                    .frame(width: 2)
                    .frame(maxHeight: .infinity)
                    .scaleEffect(x: 1, y: appeared ? 1 : 0, anchor: .top)
                    .animation(TravelMotion.gentle, value: appeared)
            }
        }
        .frame(width: diameter)
    }

    private var summaryPill: some View {
        Text(summaryLabel)
            .font(TravelTypography.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(.thinMaterial, in: Capsule())
    }

    private func rarityPill(_ rarity: AchievementRarity) -> some View {
        Text(rarity.displayName)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(rarity.accent)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(rarity.accent.opacity(0.15), in: Capsule())
    }

    private func xpPill(_ xp: Int, accent: Color) -> some View {
        Text("+\(xp) XP")
            .font(TravelTypography.caption)
            .foregroundStyle(accent)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(accent.opacity(0.15), in: Capsule())
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "map")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("Your journey begins with your first milestone.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }

    private func accessibilityText(_ milestone: ExplorerJourneyMilestone) -> String {
        var parts = [milestone.kind.label, milestone.title]
        if let place = milestone.place { parts.append(place) }
        parts.append(milestone.dateLabel)
        if let rarity = milestone.rarity { parts.append("\(rarity.displayName) reward") }
        if let xp = milestone.xp { parts.append("\(xp) XP") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct ExplorerJourneyTimeline_Previews: PreviewProvider {
    private static let journey: [ExplorerJourneyMilestone] = [
        ExplorerJourneyMilestone(
            kind: .levelUp,
            title: "Reached Explorer Level 7",
            dateLabel: "May 2025",
            xp: 0
        ),
        ExplorerJourneyMilestone(
            kind: .treasureCollected,
            title: "Secret cliff cove",
            place: "Algarve, Portugal",
            dateLabel: "Apr 2025",
            xp: 150,
            rarity: .gold
        ),
        ExplorerJourneyMilestone(
            kind: .questCompleted,
            title: "Tried five local dishes",
            place: "Oaxaca, Mexico",
            dateLabel: "Mar 2025",
            xp: 90,
            rarity: .silver
        ),
        ExplorerJourneyMilestone(
            kind: .achievementUnlocked,
            title: "Globe-trotter",
            dateLabel: "Feb 2025",
            xp: 500,
            rarity: .legendary
        ),
        ExplorerJourneyMilestone(
            kind: .stampEarned,
            title: "Bhutan",
            place: "Paro Taktsang",
            dateLabel: "Jan 2025",
            xp: 120,
            rarity: .platinum
        ),
        ExplorerJourneyMilestone(
            kind: .countryVisited,
            title: "First steps in Japan",
            place: "Kyoto, Japan",
            dateLabel: "Nov 2024",
            xp: 60
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Text("Expanded")
                        .font(TravelTypography.section)
                    ExplorerJourneyTimeline(
                        milestones: journey,
                        layout: .expanded,
                        subtitle: "Every milestone, threaded in order."
                    )

                    Divider()

                    Text("Single milestone")
                        .font(TravelTypography.section)
                    ExplorerJourneyTimeline(
                        milestones: Array(journey.prefix(1)),
                        layout: .expanded,
                        title: nil
                    )

                    Divider()

                    Text("Empty")
                        .font(TravelTypography.section)
                    ExplorerJourneyTimeline(milestones: [], layout: .expanded, title: nil)
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("ExplorerJourneyTimeline · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Text("Compact")
                        .font(TravelTypography.section)
                    ExplorerJourneyTimeline(
                        milestones: journey,
                        layout: .compact,
                        subtitle: "A condensed glance at recent progress."
                    )

                    ExplorerJourneyTimeline(
                        milestones: Array(journey.prefix(3)),
                        layout: .compact,
                        title: "Recent stops"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("ExplorerJourneyTimeline · Compact")
        }
    }
}
#endif
