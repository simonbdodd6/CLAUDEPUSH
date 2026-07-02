import SwiftUI

// MARK: - Premium level progress (Phase 62)
//
// A reusable, presentation-only player-progression surface: a level medallion,
// optional rank title, and an XP progress bar toward the next level. It consumes
// the same XP currency awarded by `AchievementCard` / `TreasureChest`, reuses
// `PremiumProgressBar` and `GlassCard`, and is built from the existing design
// tokens only. It carries no data, scoring or business logic — `currentXP` /
// `requiredXP` are caller-supplied — and is not wired into any screen.

/// Layout density for a `PremiumLevelProgress`.
enum LevelProgressLayout {
    case compact
    case hero
}

/// A premium, presentation-only level + XP progression view.
///
/// `currentXP` is progress within the current level and `requiredXP` is the XP
/// needed to reach the next level; the bar shows `currentXP / requiredXP`.
struct PremiumLevelProgress: View {
    var level: Int
    var currentXP: Int
    var requiredXP: Int
    var rankTitle: String? = nil
    var accent: Color = TravelTheme.current.tint
    var layout: LevelProgressLayout = .hero

    @State private var appeared = false

    private var progress: Double {
        guard requiredXP > 0 else { return 0 }
        return min(max(Double(currentXP) / Double(requiredXP), 0), 1)
    }

    /// Animates from empty to `progress` on appear (bar fill polish only).
    private var animatedProgress: Double { appeared ? progress : 0 }

    private var percent: Int { Int((progress * 100).rounded()) }

    var body: some View {
        GlassCard(prominence: layout == .hero ? .hero : .standard) {
            content
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
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
                HStack(spacing: TravelSpacing.md) {
                    levelBadge(glyphFont: TravelTypography.title, padding: TravelSpacing.md)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text("Level \(level)")
                            .font(TravelTypography.section)
                        if let rankTitle {
                            Text(rankTitle)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    Spacer(minLength: 0)
                }
                progressBlock(barHeight: TravelSpacing.sm, showsCaption: true)
            }
        case .compact:
            HStack(spacing: TravelSpacing.md) {
                levelBadge(glyphFont: TravelTypography.cardTitle, padding: TravelSpacing.sm)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(rankTitle ?? "Level \(level)")
                            .font(TravelTypography.cardTitle)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Text("\(currentXP)/\(requiredXP)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    PremiumProgressBar(
                        progress: animatedProgress,
                        colors: [accent, accent],
                        height: TravelSpacing.xs
                    )
                }
            }
        }
    }

    // MARK: Pieces

    private func levelBadge(glyphFont: Font, padding: CGFloat) -> some View {
        Text("\(level)")
            .font(glyphFont)
            .foregroundStyle(.white)
            .monospacedDigit()
            .padding(padding)
            .background(
                LinearGradient(
                    colors: [accent, accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 1.5))
            .shadow(color: accent.opacity(0.3), radius: 10, y: 5)
    }

    private func progressBlock(barHeight: CGFloat, showsCaption: Bool) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            PremiumProgressBar(
                progress: animatedProgress,
                colors: [accent, accent],
                height: barHeight
            )
            if showsCaption {
                HStack {
                    Text("\(currentXP) / \(requiredXP) XP")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                    Spacer()
                    Text("\(percent)% to Level \(level + 1)")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var accessibilityText: String {
        var parts = ["Level \(level)"]
        if let rankTitle { parts.append(rankTitle) }
        parts.append("\(currentXP) of \(requiredXP) XP, \(percent)% to level \(level + 1)")
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct PremiumLevelProgress_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Group {
                    Text("Hero")
                        .font(TravelTypography.section)
                    PremiumLevelProgress(level: 7, currentXP: 320, requiredXP: 500, rankTitle: "Seasoned Voyager")
                    PremiumLevelProgress(level: 1, currentXP: 0, requiredXP: 100, rankTitle: "New Explorer", accent: TravelTheme.current.moss)
                    PremiumLevelProgress(level: 24, currentXP: 980, requiredXP: 1000, rankTitle: "Globetrotter", accent: TravelTheme.current.coral)
                }

                Group {
                    Divider()

                    Text("Compact")
                        .font(TravelTypography.section)
                    PremiumLevelProgress(level: 7, currentXP: 320, requiredXP: 500, rankTitle: "Seasoned Voyager", layout: .compact)
                    PremiumLevelProgress(level: 12, currentXP: 150, requiredXP: 600, accent: TravelTheme.current.sun, layout: .compact)
                }

                Group {
                    Divider()

                    Text("Edge cases")
                        .font(TravelTypography.section)
                    PremiumLevelProgress(level: 99, currentXP: 1000, requiredXP: 1000, rankTitle: "Legend")
                    PremiumLevelProgress(level: 3, currentXP: 0, requiredXP: 0, rankTitle: "Zero required (guards divide-by-zero)")
                }
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("PremiumLevelProgress")
    }
}
#endif
