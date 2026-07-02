import SwiftUI

// MARK: - Travel quest card (Phase 67)
//
// A reusable, presentation-only "quest" / objective card — the forward-looking
// counterpart to the achievement and treasure cards. Where `AchievementCard` and
// `TreasureRewardCard` show what an explorer has *earned*, a `TravelQuestCard`
// shows what they are *working toward*: a category, a title, a current / target
// progress bar, an optional XP and rarity reward, and a calm lifecycle state
// (active, completed, locked, ending-soon). It reuses the existing design tokens,
// `GlassCard`, `PremiumProgressBar` and the Phase-57 `AchievementRarity` palette
// only — no new colours, type or spacing. Animations are appearance / highlight
// polish only; it carries no data, scoring, networking, persistence or
// navigation, and is not wired into any screen. The "ending soon" hint is a
// deliberately quiet capsule, in keeping with the rewards-feel-earned-not-spammy
// design philosophy.

/// A category of travel quest / objective. Drives the medallion glyph and accent
/// (existing palette colours only).
enum TravelQuestCategory: CaseIterable {
    case explore
    case taste
    case capture
    case wander
    case collect
    case seasonal

    var displayName: String {
        switch self {
        case .explore: "Explore"
        case .taste: "Taste"
        case .capture: "Capture"
        case .wander: "Wander"
        case .collect: "Collect"
        case .seasonal: "Seasonal"
        }
    }

    var icon: String {
        switch self {
        case .explore: "map.fill"
        case .taste: "fork.knife"
        case .capture: "camera.fill"
        case .wander: "figure.hiking"
        case .collect: "square.stack.3d.up.fill"
        case .seasonal: "calendar.badge.clock"
        }
    }

    /// Category accent — existing palette colours only.
    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .explore: return theme.ocean
        case .taste: return theme.coral
        case .capture: return theme.sky
        case .wander: return theme.moss
        case .collect: return theme.sun
        case .seasonal: return theme.tint
        }
    }
}

/// Lifecycle state of a `TravelQuestCard`.
enum TravelQuestState {
    /// Underway, with progress toward the target.
    case active
    /// Target reached; renders a full bar and a completed badge.
    case completed
    /// Not yet available; renders a muted, locked medallion.
    case locked
    /// Active but time-limited and ending soon; pairs with `timeRemaining`.
    case expiring

    var label: String {
        switch self {
        case .active: "In progress"
        case .completed: "Completed"
        case .locked: "Locked"
        case .expiring: "Ending soon"
        }
    }

    var badgeIcon: String {
        switch self {
        case .active: "target"
        case .completed: "checkmark.circle.fill"
        case .locked: "lock.fill"
        case .expiring: "clock.fill"
        }
    }

    var isLocked: Bool { self == .locked }
    var isCompleted: Bool { self == .completed }
    /// Whether the state should draw attention (filled badge + gentle pulse).
    var isEmphasised: Bool { self == .completed || self == .expiring }
}

/// Layout density for a `TravelQuestCard`.
enum TravelQuestLayout {
    case compact
    case hero
}

/// A premium, presentation-only travel quest / objective card.
///
/// `current` / `target` describe progress toward the objective; the bar shows
/// `current / target`, except when `state == .completed`, which always renders a
/// full bar. All values are caller-supplied — the card holds no quest logic.
struct TravelQuestCard: View {
    var category: TravelQuestCategory
    var state: TravelQuestState = .active
    var layout: TravelQuestLayout = .hero
    var title: String
    var detail: String? = nil
    var current: Int
    var target: Int
    /// Optional XP reward shown as a pill.
    var xp: Int? = nil
    /// Optional reward tier; renders a rarity pill when supplied.
    var rarity: AchievementRarity? = nil
    /// Optional calm "time left" hint, surfaced for the `.expiring` state.
    var timeRemaining: String? = nil

    @State private var appeared = false
    @State private var highlight = false

    // MARK: Derived progress

    private var fraction: Double {
        if state.isCompleted { return 1 }
        guard target > 0 else { return 0 }
        return min(max(Double(current) / Double(target), 0), 1)
    }

    /// Animates from empty to `fraction` on appear (bar fill polish only).
    private var animatedFraction: Double { appeared ? fraction : 0 }

    private var percent: Int { Int((fraction * 100).rounded()) }

    /// Progress count shown as text; clamps to the target once completed.
    private var displayCurrent: Int {
        state.isCompleted ? target : min(max(current, 0), target)
    }

    private var showsProgress: Bool { !state.isLocked }
    private var showsExpiry: Bool { state == .expiring && timeRemaining != nil }

    var body: some View {
        GlassCard(prominence: layout == .hero ? .hero : .standard) {
            content
        }
        .scaleEffect(appeared ? 1 : 0.96)
        .opacity(appeared ? (state.isLocked ? 0.92 : 1) : 0)
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
            if state.isEmphasised {
                withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                    highlight = true
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch layout {
        case .hero:
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(glyphFont: TravelTypography.display, padding: TravelSpacing.md)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(category.displayName)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text(title)
                            .font(TravelTypography.section)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    stateBadge
                }
                if let detail {
                    Text(detail)
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if showsProgress {
                    progressBlock
                }
                if hasRewards || showsExpiry {
                    HStack(spacing: TravelSpacing.sm) {
                        if let rarity { rarityPill(rarity) }
                        if xp != nil { xpPill }
                        Spacer(minLength: 0)
                        if showsExpiry, let timeRemaining { expiryChip(timeRemaining) }
                    }
                }
            }
        case .compact:
            HStack(spacing: TravelSpacing.md) {
                medallion(glyphFont: TravelTypography.title, padding: TravelSpacing.sm)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                        .lineLimit(1)
                    if showsProgress {
                        PremiumProgressBar(
                            progress: animatedFraction,
                            colors: barColors,
                            height: TravelSpacing.xs
                        )
                    }
                    HStack(spacing: TravelSpacing.xs) {
                        if showsProgress {
                            Text("\(displayCurrent)/\(target)")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }
                        if let xp {
                            Text("+\(xp) XP")
                                .font(TravelTypography.caption)
                                .foregroundStyle(category.accent)
                        }
                    }
                }
                Spacer(minLength: 0)
                stateBadge
            }
        }
    }

    // MARK: Pieces

    private func medallion(glyphFont: Font, padding: CGFloat) -> some View {
        Image(systemName: state.isLocked ? "lock.fill" : category.icon)
            .font(glyphFont)
            .foregroundStyle(.white)
            .padding(padding)
            .background(
                LinearGradient(
                    colors: [category.accent, category.accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
            .grayscale(state.isLocked ? 1 : 0)
            .saturation(state.isLocked ? 0 : 1)
            .shadow(color: category.accent.opacity(state.isLocked ? 0 : 0.3), radius: 10, y: 5)
    }

    private var progressBlock: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            PremiumProgressBar(
                progress: animatedFraction,
                colors: barColors,
                height: TravelSpacing.sm
            )
            HStack {
                Text("\(displayCurrent) / \(target)")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                Spacer()
                Text(state.isCompleted ? "Complete" : "\(percent)%")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
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

    private var xpPill: some View {
        Text("+\(xp ?? 0) XP")
            .font(TravelTypography.caption)
            .foregroundStyle(category.accent)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(category.accent.opacity(0.15), in: Capsule())
    }

    private func expiryChip(_ text: String) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "clock")
            Text(text)
        }
        .font(TravelTypography.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(.thinMaterial, in: Capsule())
        .opacity(highlight ? 1 : 0.7)
    }

    private var stateBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: state.badgeIcon)
            Text(state.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(state.isEmphasised ? .white : .secondary)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(
            state.isEmphasised ? AnyShapeStyle(badgeAccent) : AnyShapeStyle(.thinMaterial),
            in: Capsule()
        )
        .shadow(
            color: state.isEmphasised ? badgeAccent.opacity(highlight ? 0.6 : 0.2) : .clear,
            radius: state.isEmphasised ? (highlight ? 8 : 4) : 0
        )
    }

    // MARK: Helpers

    private var hasRewards: Bool { rarity != nil || xp != nil }

    /// Progress bar colours: the rarity gradient when a reward tier is set,
    /// otherwise the category accent.
    private var barColors: [Color] {
        rarity?.gradient ?? [category.accent, category.accent]
    }

    /// Filled-badge accent: moss for completed, sun for ending-soon.
    private var badgeAccent: Color {
        state.isCompleted ? TravelTheme.current.moss : TravelTheme.current.sun
    }

    private var accessibilityText: String {
        var parts = ["\(category.displayName) quest", title, state.label]
        if showsProgress {
            parts.append("\(displayCurrent) of \(target), \(percent)%")
        }
        if let rarity { parts.append("\(rarity.displayName) reward") }
        if let xp { parts.append("\(xp) XP") }
        if showsExpiry, let timeRemaining { parts.append(timeRemaining) }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct TravelQuestCard_Previews: PreviewProvider {
    private static let heroColumns = [GridItem(.adaptive(minimum: 320), spacing: TravelSpacing.md)]
    private static let compactColumns = [GridItem(.adaptive(minimum: 280), spacing: TravelSpacing.md)]
    private static let rarities = AchievementRarity.allCases

    private static func demoTitle(_ category: TravelQuestCategory) -> String {
        switch category {
        case .explore: "Visit three new cities"
        case .taste: "Try five local dishes"
        case .capture: "Photograph a sunrise"
        case .wander: "Walk 50 km off the map"
        case .collect: "Earn four passport stamps"
        case .seasonal: "Spring expedition"
        }
    }

    private static func demoDetail(_ category: TravelQuestCategory) -> String {
        switch category {
        case .explore: "Set foot somewhere you have never been."
        case .taste: "Seek out the dishes locals actually queue for."
        case .capture: "Be up before the light to catch the quiet hour."
        case .wander: "Trade the main road for the long way round."
        case .collect: "Each new country adds a stamp to your book."
        case .seasonal: "A limited-time challenge for this travel season."
        }
    }

    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Group {
                Text("Hero · every category")
                    .font(TravelTypography.section)
                LazyVGrid(columns: heroColumns, spacing: TravelSpacing.md) {
                    ForEach(Array(TravelQuestCategory.allCases.enumerated()), id: \.offset) { index, category in
                        TravelQuestCard(
                            category: category,
                            state: .active,
                            layout: .hero,
                            title: demoTitle(category),
                            detail: demoDetail(category),
                            current: index,
                            target: max(index + 2, 3),
                            xp: 80 + index * 20,
                            rarity: rarities[index % rarities.count]
                        )
                    }
                }

                }

                Group {
                Divider()

                Text("States")
                    .font(TravelTypography.section)
                TravelQuestCard(
                    category: .collect,
                    state: .completed,
                    layout: .hero,
                    title: "Earn four passport stamps",
                    detail: "Objective reached — collect your reward.",
                    current: 4,
                    target: 4,
                    xp: 200,
                    rarity: .gold
                )
                TravelQuestCard(
                    category: .seasonal,
                    state: .expiring,
                    layout: .hero,
                    title: "Spring expedition",
                    detail: "A calm reminder, never a nag.",
                    current: 2,
                    target: 5,
                    xp: 350,
                    rarity: .legendary,
                    timeRemaining: "3 days left"
                )
                TravelQuestCard(
                    category: .wander,
                    state: .locked,
                    layout: .hero,
                    title: "Reach Explorer Level 10",
                    detail: "Unlocks once you reach the next rank.",
                    current: 0,
                    target: 1,
                    xp: 500,
                    rarity: .platinum
                )

                }

                Group {
                Divider()

                Text("Compact")
                    .font(TravelTypography.section)
                LazyVGrid(columns: compactColumns, spacing: TravelSpacing.md) {
                    TravelQuestCard(category: .explore, state: .active, layout: .compact, title: "Visit three new cities", current: 1, target: 3, xp: 120)
                    TravelQuestCard(category: .taste, state: .completed, layout: .compact, title: "Try five local dishes", current: 5, target: 5, xp: 90, rarity: .silver)
                    TravelQuestCard(category: .capture, state: .expiring, layout: .compact, title: "Photograph a sunrise", current: 0, target: 1, xp: 60, timeRemaining: "Today")
                    TravelQuestCard(category: .wander, state: .locked, layout: .compact, title: "Reach Level 10", current: 0, target: 1, xp: 500)
                }

                }

                Group {
                Divider()

                Text("Edge cases")
                    .font(TravelTypography.section)
                TravelQuestCard(category: .explore, state: .active, layout: .hero, title: "No reward, no detail", current: 7, target: 10)
                TravelQuestCard(category: .seasonal, state: .active, layout: .hero, title: "Zero target (guards divide-by-zero)", current: 0, target: 0, xp: 50)
                }
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("TravelQuestCard")
    }
}
#endif
