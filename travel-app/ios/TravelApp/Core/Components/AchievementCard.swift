import SwiftUI

// MARK: - Premium achievement card (Phase 60)
//
// A reusable, presentation-only achievement card built on the Phase-57
// `AchievementRarity` palette. It complements `AchievementBadge` (a compact
// medallion) with a richer card surface: icon, title, optional description, XP
// reward, optional completion / progress bar and an optional "NEW" ribbon, in
// compact or expanded layouts. Premium glassmorphism from the existing design
// tokens only. Animations are appearance/highlight polish only — no gameplay
// logic, data, networking, persistence or navigation, and it is not wired into
// any screen.

/// Unlock state for an `AchievementCard`.
enum AchievementCardState {
    case locked
    case unlocked
    case newlyUnlocked

    var isUnlocked: Bool { self != .locked }
    var isNew: Bool { self == .newlyUnlocked }
}

/// Layout density for an `AchievementCard`.
enum AchievementCardLayout {
    case compact
    case expanded
}

/// A premium, presentation-only achievement card.
struct AchievementCard: View {
    var rarity: AchievementRarity
    var state: AchievementCardState = .unlocked
    var layout: AchievementCardLayout = .expanded
    var icon: String = "rosette"
    var title: String
    var description: String? = nil
    var xp: Int
    /// Completion in `0...1`. Renders a percentage (compact) or a labelled
    /// progress bar (expanded) when supplied.
    var completion: Double? = nil
    /// Overrides the ribbon visibility; defaults to the `.newlyUnlocked` state.
    var showsNewRibbon: Bool? = nil

    @State private var appeared = false
    @State private var highlight = false

    private var showsRibbon: Bool { showsNewRibbon ?? state.isNew }

    private var cardRadius: CGFloat {
        layout == .expanded ? TravelRadius.hero : TravelRadius.md
    }

    var body: some View {
        GlassCard(prominence: layout == .expanded ? .hero : .standard) {
            content
        }
        .overlay {
            if state.isNew {
                RoundedRectangle(cornerRadius: cardRadius, style: .continuous)
                    .stroke(rarity.accent.opacity(highlight ? 0.8 : 0.3), lineWidth: 2)
            }
        }
        .overlay(alignment: .topTrailing) {
            if showsRibbon {
                newRibbon
            }
        }
        .scaleEffect(appeared ? 1 : 0.96)
        .opacity(appeared ? (state.isUnlocked ? 1 : 0.92) : 0)
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
            if state.isNew {
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
        case .compact:
            HStack(spacing: TravelSpacing.md) {
                medallion(glyphFont: TravelTypography.title, padding: TravelSpacing.sm)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                        .lineLimit(1)
                    HStack(spacing: TravelSpacing.xs) {
                        xpPill
                        if let completion {
                            Text("\(percent(completion))%")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        case .expanded:
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(glyphFont: TravelTypography.display, padding: TravelSpacing.md)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(rarity.displayName)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                        Text(title)
                            .font(TravelTypography.section)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    xpPill
                }
                if let description {
                    Text(description)
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let completion {
                    progressBlock(completion)
                }
            }
        }
    }

    // MARK: Pieces

    private func medallion(glyphFont: Font, padding: CGFloat) -> some View {
        Image(systemName: state.isUnlocked ? icon : "lock.fill")
            .font(glyphFont)
            .foregroundStyle(.white)
            .padding(padding)
            .background(
                LinearGradient(
                    colors: rarity.gradient,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
            .grayscale(state.isUnlocked ? 0 : 1)
            .saturation(state.isUnlocked ? 1 : 0)
            .shadow(color: rarity.accent.opacity(state.isUnlocked ? 0.3 : 0), radius: 10, y: 5)
    }

    private var xpPill: some View {
        Text("+\(xp) XP")
            .font(TravelTypography.caption)
            .foregroundStyle(rarity.accent)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(rarity.accent.opacity(0.15), in: Capsule())
    }

    private func progressBlock(_ value: Double) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            PremiumProgressBar(
                progress: value,
                colors: rarity.gradient,
                height: TravelSpacing.xs
            )
            Text("\(percent(value))% complete")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var newRibbon: some View {
        Text("NEW")
            .font(TravelTypography.eyebrow)
            .foregroundStyle(.white)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(rarity.accent, in: Capsule())
            .shadow(color: rarity.accent.opacity(highlight ? 0.6 : 0.2), radius: highlight ? 10 : 4)
            .padding(TravelSpacing.sm)
    }

    // MARK: Helpers

    private func percent(_ value: Double) -> Int {
        Int((min(max(value, 0), 1) * 100).rounded())
    }

    private var accessibilityText: String {
        let stateWord: String
        switch state {
        case .locked: stateWord = "locked"
        case .unlocked: stateWord = "unlocked"
        case .newlyUnlocked: stateWord = "newly unlocked"
        }
        var parts = ["\(rarity.displayName) achievement", title, stateWord, "\(xp) XP"]
        if let completion { parts.append("\(percent(completion))% complete") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct AchievementCard_Previews: PreviewProvider {
    private static let columns = [GridItem(.adaptive(minimum: 320), spacing: TravelSpacing.md)]

    private static func expandedGrid(state: AchievementCardState) -> some View {
        LazyVGrid(columns: columns, spacing: TravelSpacing.md) {
            ForEach(AchievementRarity.allCases, id: \.self) { rarity in
                AchievementCard(
                    rarity: rarity,
                    state: state,
                    layout: .expanded,
                    icon: "airplane.departure",
                    title: "\(rarity.displayName) Explorer",
                    description: "Visit destinations across the globe to climb the ranks.",
                    xp: 120,
                    completion: state.isUnlocked ? 1.0 : 0.45
                )
            }
        }
    }

    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Group {
                    Text("Expanded · Unlocked")
                        .font(TravelTypography.section)
                    expandedGrid(state: .unlocked)
                }

                Group {
                    Divider()

                    Text("Expanded · Locked")
                        .font(TravelTypography.section)
                    expandedGrid(state: .locked)
                }

                Group {
                    Divider()

                    Text("Expanded · Newly unlocked (NEW ribbon)")
                        .font(TravelTypography.section)
                    expandedGrid(state: .newlyUnlocked)
                }

                Divider()

                Text("Compact · all rarities & states")
                    .font(TravelTypography.section)
                LazyVGrid(columns: columns, spacing: TravelSpacing.md) {
                    AchievementCard(rarity: .bronze, state: .unlocked, layout: .compact, icon: "figure.walk", title: "First Steps", xp: 50)
                    AchievementCard(rarity: .silver, state: .locked, layout: .compact, icon: "map.fill", title: "Trailblazer", xp: 80, completion: 0.6)
                    AchievementCard(rarity: .gold, state: .newlyUnlocked, layout: .compact, icon: "star.fill", title: "Globetrotter", xp: 150)
                    AchievementCard(rarity: .platinum, state: .unlocked, layout: .compact, icon: "crown.fill", title: "Voyager", xp: 250)
                    AchievementCard(rarity: .legendary, state: .newlyUnlocked, layout: .compact, icon: "sparkles", title: "Legend", xp: 500, completion: 1.0)
                }
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("AchievementCard")
    }
}
#endif
