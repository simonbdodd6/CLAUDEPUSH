import SwiftUI

// MARK: - Explorer achievement shelf (Phase 77)
//
// A reusable, presentation-only "trophy shelf" that showcases a traveller's best
// achievements in a polished horizontal row — in the spirit of how Apple Fitness
// and Duolingo celebrate milestones. Each trophy is rendered with the existing
// `AchievementBadge` (its medallion, rarity styling and sheen), so there is no
// duplicated badge UI; the shelf adds the horizontal layout, a summary metric row
// and per-trophy accessibility.
//
// It reuses the existing design system exclusively — `AchievementBadge`,
// `GlassCard`, `PremiumMetricTile`, the `AchievementRarity` palette and the tokens
// (`TravelTheme`, `TravelSpacing`, `TravelRadius`, `TravelTypography`,
// `TravelMotion`). All values are caller-supplied mock data; the component holds
// no data, scoring, networking, persistence, view-model or navigation logic, and
// is not wired into any screen. Animations are subtle appearance polish only (the
// header/summary fade-and-rise; each badge keeps its own gentle appearance).

/// A single, presentation-only achievement shown on the shelf.
struct ShelfAchievement: Identifiable {
    let id: String
    var title: String
    var icon: String
    var rarity: AchievementRarity
    var xp: Int
    var unlockedDate: String
    var category: String?

    /// `id` defaults to the title, matching the codebase's deterministic
    /// conventions (no `UUID()`); pass an explicit id for non-unique titles.
    init(
        id: String? = nil,
        title: String,
        icon: String,
        rarity: AchievementRarity,
        xp: Int,
        unlockedDate: String,
        category: String? = nil
    ) {
        self.id = id ?? title
        self.title = title
        self.icon = icon
        self.rarity = rarity
        self.xp = xp
        self.unlockedDate = unlockedDate
        self.category = category
    }

    /// Secondary line shown beneath the title: "Category · Date", or just the date.
    var subtitleText: String {
        if let category { return "\(category) · \(unlockedDate)" }
        return unlockedDate
    }

    var accessibilityText: String {
        var parts = ["\(rarity.displayName) achievement", title]
        if let category { parts.append(category) }
        parts.append("\(xp) XP")
        parts.append("unlocked \(unlockedDate)")
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerAchievementShelf`.
enum AchievementShelfLayout {
    case compact
    case expanded
}

/// A premium, presentation-only achievement trophy shelf.
struct ExplorerAchievementShelf: View {
    var achievements: [ShelfAchievement]
    var layout: AchievementShelfLayout = .expanded
    var title: String? = "Achievement shelf"
    var subtitle: String? = nil

    @State private var appeared = false

    // MARK: Derived

    private var totalXP: Int { achievements.map(\.xp).reduce(0, +) }

    private func rarityOrder(_ rarity: AchievementRarity) -> Int {
        AchievementRarity.allCases.firstIndex(of: rarity) ?? 0
    }

    private var bestRarity: AchievementRarity? {
        achievements.map(\.rarity).max { rarityOrder($0) < rarityOrder($1) }
    }

    var body: some View {
        Group {
            if achievements.isEmpty {
                emptyState
            } else {
                switch layout {
                case .expanded: expanded
                case .compact: compact
                }
            }
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
    }

    // MARK: Expanded

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 8)
                .animation(TravelMotion.gentle, value: appeared)

            summaryRow
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 8)
                .animation(TravelMotion.gentle.delay(0.04), value: appeared)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.md) {
                    ForEach(achievements) { achievement in
                        AchievementBadge(
                            rarity: achievement.rarity,
                            icon: achievement.icon,
                            title: achievement.title,
                            subtitle: achievement.subtitleText,
                            xp: achievement.xp
                        )
                        .frame(width: 176)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(achievement.accessibilityText)
                    }
                }
                .padding(.vertical, TravelSpacing.xs)
                .padding(.horizontal, TravelSpacing.xxs)
            }
        }
    }

    // MARK: Compact

    private var compact: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                    if let title {
                        Text(title).font(TravelTypography.cardTitle)
                    }
                    Spacer(minLength: 0)
                    Text(summaryLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.md) {
                        ForEach(achievements) { achievement in
                            AchievementBadge(
                                rarity: achievement.rarity,
                                icon: achievement.icon,
                                title: achievement.title
                            )
                            .frame(width: 124)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(achievement.accessibilityText)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private func header(titleFont: Font) -> some View {
        if title != nil || subtitle != nil {
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
    }

    private var summaryRow: some View {
        HStack(spacing: TravelSpacing.sm) {
            PremiumMetricTile(value: "\(achievements.count)", label: "Trophies")
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(achievements.count) trophies")
            PremiumMetricTile(value: grouped(totalXP), label: "XP earned")
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(totalXP) XP earned")
            PremiumMetricTile(value: bestRarity?.displayName ?? "—", label: "Best tier")
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Best tier \(bestRarity?.displayName ?? "none")")
        }
    }

    private var summaryLabel: String {
        "\(achievements.count) trophies · \(grouped(totalXP)) XP"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "trophy")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("Your trophy shelf is waiting — unlock your first achievement.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: Helpers

    /// Deterministic thousands grouping (no Locale / no formatter state).
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
}

#if DEBUG
struct ExplorerAchievementShelf_Previews: PreviewProvider {

    private static let fullShelf: [ShelfAchievement] = [
        ShelfAchievement(title: "Globe-trotter", icon: "globe.europe.africa.fill", rarity: .legendary, xp: 500, unlockedDate: "Feb 2025", category: "Exploration"),
        ShelfAchievement(title: "Summit Seeker", icon: "mountain.2.fill", rarity: .platinum, xp: 300, unlockedDate: "Oct 2024", category: "Adventure"),
        ShelfAchievement(title: "Frequent Flyer", icon: "airplane", rarity: .gold, xp: 200, unlockedDate: "Jan 2025", category: "Travel"),
        ShelfAchievement(title: "Deep Diver", icon: "water.waves", rarity: .gold, xp: 180, unlockedDate: "Sep 2024", category: "Ocean"),
        ShelfAchievement(title: "Cartographer", icon: "map.fill", rarity: .silver, xp: 120, unlockedDate: "Dec 2024", category: "Discovery"),
        ShelfAchievement(title: "Trailblazer", icon: "figure.hiking", rarity: .silver, xp: 90, unlockedDate: "Aug 2024"),
        ShelfAchievement(title: "Night Owl", icon: "moon.stars.fill", rarity: .bronze, xp: 60, unlockedDate: "Nov 2024", category: "Culture")
    ]

    private static let smallShelf: [ShelfAchievement] = [
        ShelfAchievement(title: "First Steps", icon: "figure.walk", rarity: .bronze, xp: 50, unlockedDate: "Mar 2025", category: "Beginnings"),
        ShelfAchievement(title: "Passport Stamped", icon: "seal.fill", rarity: .silver, xp: 80, unlockedDate: "Mar 2025", category: "Milestones")
    ]

    private static let legendaryShelf: [ShelfAchievement] = [
        ShelfAchievement(title: "World Wanderer", icon: "globe.americas.fill", rarity: .legendary, xp: 600, unlockedDate: "2025", category: "Mastery"),
        ShelfAchievement(title: "Seven Summits", icon: "mountain.2.fill", rarity: .legendary, xp: 700, unlockedDate: "2025", category: "Mastery"),
        ShelfAchievement(title: "Ocean Crosser", icon: "sailboat.fill", rarity: .platinum, xp: 400, unlockedDate: "2024", category: "Mastery")
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Full shelf").font(TravelTypography.section)
                    ExplorerAchievementShelf(
                        achievements: fullShelf,
                        subtitle: "Your finest milestones, on display."
                    )

                    Text("Expanded · Small shelf").font(TravelTypography.section)
                    ExplorerAchievementShelf(
                        achievements: smallShelf,
                        title: "Recent trophies"
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerAchievementShelf(achievements: [], title: "Achievement shelf")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Achievement shelf · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · Full shelf").font(TravelTypography.section)
                    ExplorerAchievementShelf(
                        achievements: fullShelf,
                        layout: .compact
                    )

                    Text("Compact · Legendary shelf").font(TravelTypography.section)
                    ExplorerAchievementShelf(
                        achievements: legendaryShelf,
                        layout: .compact,
                        title: "Hall of fame"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Achievement shelf · Compact")
        }
    }
}
#endif
