import SwiftUI

// MARK: - Premium treasure reward card (Phase 64)
//
// A reusable, presentation-only "reward" card revealed from a treasure chest:
// eight travel reward categories, a reward rarity (reusing the Phase-57
// `AchievementRarity`), an optional XP bonus and a New / Collected state, in
// compact or hero layouts. Premium glassmorphism from the existing design tokens
// only. Animations are appearance/highlight polish only — no gameplay logic,
// data, networking, persistence or navigation — and it is not wired into any
// screen.

/// A category of travel reward.
enum TreasureRewardCategory: CaseIterable {
    case hiddenPlace
    case localTip
    case foodDiscovery
    case wildlife
    case diveSite
    case surfBreak
    case viewpoint
    case mysteryReward

    var displayName: String {
        switch self {
        case .hiddenPlace: "Hidden Place"
        case .localTip: "Local Tip"
        case .foodDiscovery: "Food Discovery"
        case .wildlife: "Wildlife"
        case .diveSite: "Dive Site"
        case .surfBreak: "Surf Break"
        case .viewpoint: "Viewpoint"
        case .mysteryReward: "Mystery Reward"
        }
    }

    var icon: String {
        switch self {
        case .hiddenPlace: "mappin.and.ellipse"
        case .localTip: "lightbulb.fill"
        case .foodDiscovery: "fork.knife"
        case .wildlife: "pawprint.fill"
        case .diveSite: "water.waves"
        case .surfBreak: "figure.surfing"
        case .viewpoint: "binoculars.fill"
        case .mysteryReward: "questionmark.diamond.fill"
        }
    }

    /// Category accent — existing palette colours only.
    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .hiddenPlace: return theme.ocean
        case .localTip: return theme.sun
        case .foodDiscovery: return theme.coral
        case .wildlife: return theme.moss
        case .diveSite: return theme.sky
        case .surfBreak: return theme.tint
        case .viewpoint: return theme.ocean
        case .mysteryReward: return theme.coral
        }
    }
}

/// Collection state for a `TreasureRewardCard`.
enum TreasureRewardState {
    case new
    case collected

    var label: String { self == .new ? "New" : "Collected" }
    var isNew: Bool { self == .new }
}

/// Layout density for a `TreasureRewardCard`.
enum TreasureRewardLayout {
    case compact
    case hero
}

/// A premium, presentation-only treasure reward card.
struct TreasureRewardCard: View {
    var category: TreasureRewardCategory
    var rarity: AchievementRarity = .gold
    var state: TreasureRewardState = .new
    var layout: TreasureRewardLayout = .hero
    var title: String
    var description: String? = nil
    var xp: Int? = nil

    @State private var appeared = false
    @State private var highlight = false

    var body: some View {
        GlassCard(prominence: layout == .hero ? .hero : .standard) {
            content
        }
        .scaleEffect(appeared ? 1 : 0.96)
        .opacity(appeared ? 1 : 0)
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
                if let description {
                    Text(description)
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: TravelSpacing.sm) {
                    rarityPill
                    if xp != nil { xpPill }
                }
            }
        case .compact:
            HStack(spacing: TravelSpacing.md) {
                medallion(glyphFont: TravelTypography.title, padding: TravelSpacing.sm)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                        .lineLimit(1)
                    HStack(spacing: TravelSpacing.xs) {
                        rarityPill
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
        Image(systemName: category.icon)
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
            .shadow(color: category.accent.opacity(0.3), radius: 10, y: 5)
    }

    private var rarityPill: some View {
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

    private var stateBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: state.isNew ? "sparkles" : "checkmark.circle.fill")
            Text(state.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(state.isNew ? .white : .secondary)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(
            state.isNew ? AnyShapeStyle(category.accent) : AnyShapeStyle(.thinMaterial),
            in: Capsule()
        )
        .shadow(
            color: state.isNew ? category.accent.opacity(highlight ? 0.6 : 0.2) : .clear,
            radius: state.isNew ? (highlight ? 8 : 4) : 0
        )
    }

    private var accessibilityText: String {
        var parts = [category.displayName, title, "\(rarity.displayName) rarity", state.label]
        if let xp { parts.append("\(xp) XP bonus") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct TreasureRewardCard_Previews: PreviewProvider {
    private static let heroColumns = [GridItem(.adaptive(minimum: 320), spacing: TravelSpacing.md)]
    private static let compactColumns = [GridItem(.adaptive(minimum: 280), spacing: TravelSpacing.md)]
    private static let rarities = AchievementRarity.allCases

    private static func demoTitle(_ category: TreasureRewardCategory) -> String {
        switch category {
        case .hiddenPlace: "Secret cliff cove"
        case .localTip: "Ask for the back room"
        case .foodDiscovery: "Night-market dumplings"
        case .wildlife: "Sea-turtle nesting bay"
        case .diveSite: "Coral cathedral"
        case .surfBreak: "Dawn point break"
        case .viewpoint: "Ridge-line overlook"
        case .mysteryReward: "Sealed reward"
        }
    }

    private static func demoDescription(_ category: TreasureRewardCategory) -> String {
        switch category {
        case .hiddenPlace: "A quiet inlet reachable only at low tide."
        case .localTip: "Locals queue here long before sunrise."
        case .foodDiscovery: "Hand-folded, twelve to a steaming basket."
        case .wildlife: "Hatchlings emerge along the sand after dusk."
        case .diveSite: "A thirty-metre wall draped in soft coral."
        case .surfBreak: "Long rights that peel for two hundred metres."
        case .viewpoint: "The whole valley opens up at golden hour."
        case .mysteryReward: "Open to reveal what lies inside."
        }
    }

    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Hero · every reward type")
                    .font(TravelTypography.section)
                LazyVGrid(columns: heroColumns, spacing: TravelSpacing.md) {
                    ForEach(Array(TreasureRewardCategory.allCases.enumerated()), id: \.element) { index, category in
                        TreasureRewardCard(
                            category: category,
                            rarity: rarities[index % rarities.count],
                            state: index.isMultiple(of: 2) ? .new : .collected,
                            layout: .hero,
                            title: demoTitle(category),
                            description: demoDescription(category),
                            xp: 50 + index * 25
                        )
                    }
                }

                Divider()

                Text("Compact · every reward type")
                    .font(TravelTypography.section)
                LazyVGrid(columns: compactColumns, spacing: TravelSpacing.md) {
                    ForEach(Array(TreasureRewardCategory.allCases.enumerated()), id: \.element) { index, category in
                        TreasureRewardCard(
                            category: category,
                            rarity: rarities[index % rarities.count],
                            state: index.isMultiple(of: 2) ? .collected : .new,
                            layout: .compact,
                            title: demoTitle(category),
                            xp: 75 + index * 20
                        )
                    }
                }

                Divider()

                Text("Variations")
                    .font(TravelTypography.section)
                TreasureRewardCard(category: .mysteryReward, rarity: .legendary, state: .new, layout: .hero, title: "Legendary mystery", description: "No XP shown — purely a discovery.")
                TreasureRewardCard(category: .foodDiscovery, rarity: .bronze, state: .collected, layout: .hero, title: "Already collected", description: "Calm, no highlight pulse.", xp: 40)
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("TreasureRewardCard")
    }
}
#endif
