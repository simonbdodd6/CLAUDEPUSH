import SwiftUI

// MARK: - Premium treasure chest (Phase 61)
//
// A reusable, presentation-only reward "treasure chest" surface with six states,
// an optional reward preview, an optional glow override and optional appearance
// sparkles. Premium glassmorphism from the existing design tokens only, in
// compact or hero layouts. Animations are appearance/decoration only — no
// gameplay logic, data, networking, persistence or navigation — and it is not
// wired into any screen.

/// Visual state of a `TreasureChest`.
enum TreasureChestState: CaseIterable {
    case closed
    case opening
    case opened
    case locked
    case rare
    case legendary

    /// Medallion gradient — existing palette colours only.
    var gradient: [Color] {
        let theme = TravelTheme.current
        switch self {
        case .closed: [theme.sun, theme.coral.opacity(0.7)]
        case .opening: [theme.sun, theme.coral]
        case .opened: [theme.sun, theme.paper.opacity(0.85)]
        case .locked: [theme.sky, theme.ocean]
        case .rare: [theme.sky, theme.ocean]
        case .legendary: [theme.coral, theme.sun, theme.sky]
        }
    }

    /// Short caption describing the state.
    var label: String {
        switch self {
        case .closed: "Sealed"
        case .opening: "Opening"
        case .opened: "Opened"
        case .locked: "Locked"
        case .rare: "Rare"
        case .legendary: "Legendary"
        }
    }

    /// Default glow intensity (`0...1`); callers may override.
    var defaultGlow: Double {
        switch self {
        case .closed: 0.3
        case .opening: 0.7
        case .opened: 0.85
        case .locked: 0.0
        case .rare: 0.6
        case .legendary: 1.0
        }
    }

    /// Whether sparkles are shown by default; callers may override.
    var defaultSparkles: Bool {
        switch self {
        case .closed, .locked: false
        case .opening, .opened, .rare, .legendary: true
        }
    }

    var isLocked: Bool { self == .locked }
}

/// Layout density for a `TreasureChest`.
enum TreasureChestLayout {
    case compact
    case hero
}

/// A small reward preview shown alongside an unlocked chest.
struct TreasureReward {
    var icon: String
    var label: String
}

/// A premium, presentation-only treasure-chest reward surface.
struct TreasureChest: View {
    var state: TreasureChestState = .closed
    var layout: TreasureChestLayout = .hero
    var title: String? = nil
    var reward: TreasureReward? = nil
    /// Overrides the state's default glow intensity (`0...1`).
    var glow: Double? = nil
    /// Overrides whether appearance sparkles are shown.
    var showsSparkles: Bool? = nil

    @State private var appeared = false
    @State private var twinkle = false

    private var effectiveGlow: Double { min(max(glow ?? state.defaultGlow, 0), 1) }
    private var effectiveSparkles: Bool { showsSparkles ?? state.defaultSparkles }
    private var accent: Color { state.gradient.first ?? TravelTheme.current.sun }
    private var showsReward: Bool { reward != nil && !state.isLocked }

    var body: some View {
        GlassCard(prominence: layout == .hero ? .hero : .standard) {
            content
        }
        .scaleEffect(appeared ? 1 : 0.96)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
            twinkle = true
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch layout {
        case .hero:
            VStack(spacing: TravelSpacing.md) {
                chest(glyphFont: TravelTypography.display, padding: TravelSpacing.lg)
                    .padding(.top, TravelSpacing.sm)
                stateLabel
                if let title {
                    Text(title)
                        .font(TravelTypography.section)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let reward, showsReward {
                    rewardChip(reward)
                }
            }
            .frame(maxWidth: .infinity)
        case .compact:
            HStack(spacing: TravelSpacing.md) {
                chest(glyphFont: TravelTypography.title, padding: TravelSpacing.sm)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    if let title {
                        Text(title)
                            .font(TravelTypography.cardTitle)
                            .lineLimit(1)
                    }
                    Text(state.label)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if let reward, showsReward {
                    rewardChip(reward)
                }
            }
        }
    }

    // MARK: Pieces

    private func chest(glyphFont: Font, padding: CGFloat) -> some View {
        Image(systemName: "gift.fill")
            .font(glyphFont)
            .foregroundStyle(.white)
            .padding(padding)
            .background(
                LinearGradient(
                    colors: state.gradient,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
            .grayscale(state.isLocked ? 1 : 0)
            .saturation(state.isLocked ? 0 : 1)
            .overlay(alignment: .bottomTrailing) {
                if state.isLocked { lockBadge }
            }
            .overlay {
                if effectiveSparkles { sparkleOverlay }
            }
            .background {
                Circle()
                    .fill(accent)
                    .blur(radius: 22)
                    .opacity(effectiveGlow * (twinkle ? 0.55 : 0.4))
                    .scaleEffect(1.3)
                    .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: twinkle)
            }
    }

    private var lockBadge: some View {
        Image(systemName: "lock.fill")
            .font(TravelTypography.caption)
            .foregroundStyle(.white)
            .padding(TravelSpacing.xs)
            .background(TravelTheme.current.ink.opacity(0.7), in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private var sparkleOverlay: some View {
        ZStack {
            sparkle(dx: -TravelSpacing.xl, dy: -TravelSpacing.lg, delay: 0.0)
            sparkle(dx: TravelSpacing.lg, dy: -TravelSpacing.xl, delay: 0.3)
            sparkle(dx: TravelSpacing.xl, dy: TravelSpacing.md, delay: 0.6)
            sparkle(dx: -TravelSpacing.lg, dy: TravelSpacing.lg, delay: 0.15)
        }
        .allowsHitTesting(false)
    }

    private func sparkle(dx: CGFloat, dy: CGFloat, delay: Double) -> some View {
        Image(systemName: "sparkle")
            .font(TravelTypography.caption)
            .foregroundStyle(.white)
            .opacity(twinkle ? 0.9 : 0.2)
            .scaleEffect(twinkle ? 1.0 : 0.6)
            .offset(x: dx, y: dy)
            .animation(
                .easeInOut(duration: 1.2).repeatForever(autoreverses: true).delay(delay),
                value: twinkle
            )
    }

    private var stateLabel: some View {
        Text(state.label)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(.thinMaterial, in: Capsule())
    }

    private func rewardChip(_ reward: TreasureReward) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            Image(systemName: reward.icon)
                .font(TravelTypography.caption)
                .foregroundStyle(accent)
            Text(reward.label)
                .font(TravelTypography.caption)
        }
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xs)
        .background(.thinMaterial, in: Capsule())
    }

    private var accessibilityText: String {
        var parts: [String] = []
        if let title { parts.append(title) }
        parts.append("Treasure chest, \(state.label)")
        if let reward, showsReward { parts.append("reward \(reward.label)") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct TreasureChest_Previews: PreviewProvider {
    private static let columns = [GridItem(.adaptive(minimum: 240), spacing: TravelSpacing.md)]
    private static let demoReward = TreasureReward(icon: "star.fill", label: "+250 XP")

    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Hero · every state")
                    .font(TravelTypography.section)
                LazyVGrid(columns: columns, spacing: TravelSpacing.md) {
                    ForEach(TreasureChestState.allCases, id: \.self) { state in
                        TreasureChest(
                            state: state,
                            layout: .hero,
                            title: "\(state.label) chest",
                            reward: demoReward
                        )
                    }
                }

                Divider()

                Text("Compact · every state")
                    .font(TravelTypography.section)
                LazyVGrid(columns: columns, spacing: TravelSpacing.md) {
                    ForEach(TreasureChestState.allCases, id: \.self) { state in
                        TreasureChest(
                            state: state,
                            layout: .compact,
                            title: "\(state.label) chest",
                            reward: demoReward
                        )
                    }
                }

                Divider()

                Text("Variations")
                    .font(TravelTypography.section)
                TreasureChest(state: .legendary, layout: .hero, title: "Max glow override", reward: demoReward, glow: 1.0)
                TreasureChest(state: .closed, layout: .hero, title: "Sparkles forced on", showsSparkles: true)
                TreasureChest(state: .rare, layout: .compact, title: "No reward")
                TreasureChest(state: .opened, layout: .hero, title: "Custom reward", reward: TreasureReward(icon: "airplane", label: "Free upgrade"))
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("TreasureChest")
    }
}
#endif
