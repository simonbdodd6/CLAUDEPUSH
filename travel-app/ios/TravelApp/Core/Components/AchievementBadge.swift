import SwiftUI

// MARK: - Achievement badge design system (Phase 57)
//
// A reusable, presentation-only achievement badge: rarity styling, locked /
// unlocked states, optional XP and completion, optional icon and title/subtitle.
// Premium glassmorphism built from the existing design tokens only. It carries
// subtle presentation animations (appear + sheen) suitable for later use, but no
// gameplay logic, data, networking or navigation.

/// Rarity tier for an `AchievementBadge`. Each tier maps to a gradient built
/// from the existing brand palette.
enum AchievementRarity: CaseIterable {
    case bronze
    case silver
    case gold
    case platinum
    case legendary

    var displayName: String {
        switch self {
        case .bronze: "Bronze"
        case .silver: "Silver"
        case .gold: "Gold"
        case .platinum: "Platinum"
        case .legendary: "Legendary"
        }
    }

    /// The medallion gradient — existing palette colours only.
    var gradient: [Color] {
        let theme = TravelTheme.current
        switch self {
        case .bronze: [theme.coral, theme.sun.opacity(0.7)]
        case .silver: [theme.sky, theme.paper]
        case .gold: [theme.sun, theme.paper.opacity(0.85)]
        case .platinum: [theme.ocean, theme.sky]
        case .legendary: [theme.coral, theme.sun, theme.sky]
        }
    }

    /// A representative accent used for XP text, glow and the completion bar.
    var accent: Color {
        switch self {
        case .bronze: TravelTheme.current.coral
        case .silver: TravelTheme.current.sky
        case .gold: TravelTheme.current.sun
        case .platinum: TravelTheme.current.ocean
        case .legendary: TravelTheme.current.coral
        }
    }
}

/// A premium, presentation-only achievement badge.
struct AchievementBadge: View {
    var rarity: AchievementRarity
    var isUnlocked: Bool = true
    var icon: String? = nil
    var title: String? = nil
    var subtitle: String? = nil
    var xp: Int? = nil
    /// Completion in `0...1`, shown as a small progress bar when supplied.
    var completion: Double? = nil

    @State private var appeared = false
    @State private var sheen = false

    var body: some View {
        GlassCard {
            VStack(spacing: TravelSpacing.md) {
                medallion

                Text(rarity.displayName)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xxs)
                    .background(.thinMaterial, in: Capsule())

                if title != nil || subtitle != nil {
                    VStack(spacing: TravelSpacing.xxs) {
                        if let title {
                            Text(title)
                                .font(TravelTypography.cardTitle)
                                .multilineTextAlignment(.center)
                        }
                        if let subtitle {
                            Text(subtitle)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }

                if xp != nil || completion != nil {
                    footer
                }
            }
            .frame(maxWidth: .infinity)
        }
        .scaleEffect(appeared ? 1 : 0.94)
        .opacity(appeared ? (isUnlocked ? 1 : 0.9) : 0)
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
            if isUnlocked {
                withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                    sheen = true
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var medallion: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: rarity.gradient,
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            if isUnlocked {
                // Subtle continuous sheen, behind the ring and glyph.
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [.clear, .white.opacity(0.3), .clear],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .rotationEffect(.degrees(sheen ? 360 : 0))
                    .blendMode(.softLight)
            }

            Circle()
                .stroke(.white.opacity(0.5), lineWidth: 2)

            Image(systemName: isUnlocked ? (icon ?? "rosette") : "lock.fill")
                .font(.system(size: TravelIconSize.statusGlyph, weight: .semibold))
                .foregroundStyle(.white)
        }
        .frame(width: TravelIconSize.statusBadge, height: TravelIconSize.statusBadge)
        .grayscale(isUnlocked ? 0 : 1)
        .saturation(isUnlocked ? 1 : 0)
        .shadow(color: rarity.accent.opacity(isUnlocked ? 0.35 : 0), radius: 12, y: 6)
    }

    @ViewBuilder
    private var footer: some View {
        VStack(spacing: TravelSpacing.xs) {
            if let xp {
                Text("\(xp) XP")
                    .font(TravelTypography.caption)
                    .foregroundStyle(rarity.accent)
            }
            if let completion {
                PremiumProgressBar(
                    progress: completion,
                    colors: rarity.gradient,
                    height: TravelSpacing.xs
                )
            }
        }
    }

    private var accessibilityText: String {
        var parts: [String] = []
        if let title { parts.append(title) }
        parts.append("\(rarity.displayName) achievement, \(isUnlocked ? "unlocked" : "locked")")
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct AchievementBadge_Previews: PreviewProvider {
    private static let columns = [GridItem(.adaptive(minimum: 156), spacing: TravelSpacing.md)]

    private static func grid(unlocked: Bool) -> some View {
        LazyVGrid(columns: columns, spacing: TravelSpacing.md) {
            ForEach(AchievementRarity.allCases, id: \.self) { rarity in
                AchievementBadge(
                    rarity: rarity,
                    isUnlocked: unlocked,
                    icon: "star.fill",
                    title: rarity.displayName,
                    subtitle: "Demo achievement",
                    xp: 120,
                    completion: unlocked ? 1.0 : 0.45
                )
            }
        }
    }

    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Unlocked")
                    .font(TravelTypography.section)
                grid(unlocked: true)

                Divider()

                Text("Locked")
                    .font(TravelTypography.section)
                grid(unlocked: false)

                Divider()

                Text("Variations")
                    .font(TravelTypography.section)
                LazyVGrid(columns: columns, spacing: TravelSpacing.md) {
                    AchievementBadge(rarity: .gold, title: "Title only")
                    AchievementBadge(rarity: .silver, icon: "airplane.departure")
                    AchievementBadge(rarity: .platinum, title: "Progress", subtitle: "In progress", completion: 0.7)
                    AchievementBadge(rarity: .legendary, icon: "globe.europe.africa.fill", title: "Globe-trotter", subtitle: "Visit 5 continents", xp: 500, completion: 0.8)
                }
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("AchievementBadge")
    }
}
#endif
