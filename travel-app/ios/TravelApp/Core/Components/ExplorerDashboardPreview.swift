import SwiftUI

#if DEBUG

// MARK: - Explorer dashboard preview (Phase 66, extended Phases 68, 70 & 72)
//
// A DEBUG-only assembly screen that composes the reusable components built so far
// into a premium travel dashboard, using mock data only. The entire screen lives
// inside `#if DEBUG`, so it does not exist in release/production builds, is not
// wired into navigation, and modifies no production screen. It references the
// existing components exactly as built — no duplicated component UI, only layout
// glue (`PremiumScrollView`, `PremiumSection`, `GlassCard`).
//
// Phase 68 adds a forward-looking "Current quests" section composed from the
// existing `TravelQuestCard`, placed just below the profile header so the
// "what next" surfaces sit above the earned achievements and rewards.
//
// Phase 70 adds a "Journey" section beneath the quests, composing the existing
// `ExplorerJourneyTimeline` over rich mock travel history that covers every
// milestone kind (countries, stamps, achievements, treasure, quests, level-ups),
// shown in both the expanded rail and the condensed compact recap.
//
// Phase 72 adds a "Statistics" section beneath the journey, composing the existing
// `ExplorerStatisticsDashboard` over realistic lifetime travel metrics, shown in
// both the expanded (featured + tile grid) and compact recap layouts. The preview
// now reads top-to-bottom as a complete explorer overview:
// Profile → Quests → Journey → Statistics.

struct ExplorerDashboardPreview: View {
    var body: some View {
        PremiumScrollView {
            ExplorerProfileHeader(
                name: "Simon Dodd",
                title: "Seasoned Voyager",
                level: 7,
                currentXP: 320,
                requiredXP: 500,
                countriesVisited: 24,
                citiesVisited: 68,
                achievementsUnlocked: 19,
                streakDays: 12,
                latestStampCountry: "Japan",
                latestStampDate: "2025"
            )

            PremiumSection(
                title: "Current quests",
                subtitle: "Objectives in progress — earned, never nagged."
            ) {
                VStack(spacing: TravelSpacing.md) {
                    TravelQuestCard(
                        category: .explore,
                        state: .active,
                        layout: .hero,
                        title: "Visit three new cities",
                        detail: "Set foot somewhere you have never been this season.",
                        current: 2,
                        target: 3,
                        xp: 150,
                        rarity: .gold
                    )
                    TravelQuestCard(
                        category: .seasonal,
                        state: .expiring,
                        layout: .hero,
                        title: "Spring expedition",
                        detail: "A limited-time challenge for this travel season.",
                        current: 4,
                        target: 6,
                        xp: 350,
                        rarity: .legendary,
                        timeRemaining: "3 days left"
                    )
                    TravelQuestCard(
                        category: .taste,
                        state: .completed,
                        layout: .compact,
                        title: "Try five local dishes",
                        current: 5,
                        target: 5,
                        xp: 90,
                        rarity: .silver
                    )
                    TravelQuestCard(
                        category: .wander,
                        state: .locked,
                        layout: .compact,
                        title: "Reach Explorer Level 10",
                        current: 0,
                        target: 1,
                        xp: 500,
                        rarity: .platinum
                    )
                }
            }

            PremiumSection(
                title: "Journey",
                subtitle: "Your travels, threaded in order — the full story so far."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerJourneyTimeline(
                        milestones: journeyMilestones,
                        layout: .expanded,
                        title: nil
                    )

                    ExplorerJourneyTimeline(
                        milestones: Array(journeyMilestones.prefix(4)),
                        layout: .compact,
                        title: "At a glance",
                        subtitle: "A condensed recap of recent progress."
                    )
                }
            }

            PremiumSection(
                title: "Statistics",
                subtitle: "A lifetime of travel, measured."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerStatisticsDashboard(
                        title: nil,
                        stats: explorerStats,
                        rank: ExplorerStatRank(
                            level: 7,
                            rankTitle: "Seasoned Voyager",
                            currentXP: 320,
                            requiredXP: 500,
                            accent: TravelTheme.current.tint
                        ),
                        layout: .expanded
                    )

                    ExplorerStatisticsDashboard(
                        title: "At a glance",
                        subtitle: "The headline numbers, condensed.",
                        stats: explorerStats,
                        layout: .compact
                    )
                }
            }

            PremiumSection(
                title: "Season pass",
                subtitle: "Progress resets each travel season."
            ) {
                PremiumLevelProgress(
                    level: 3,
                    currentXP: 1240,
                    requiredXP: 2000,
                    rankTitle: "Spring Expedition",
                    accent: TravelTheme.current.moss,
                    layout: .hero
                )
            }

            PremiumSection(
                title: "Recent achievements",
                subtitle: "Milestones unlocked on your travels."
            ) {
                VStack(spacing: TravelSpacing.md) {
                    AchievementCard(
                        rarity: .legendary,
                        state: .newlyUnlocked,
                        layout: .expanded,
                        icon: "globe.europe.africa.fill",
                        title: "Globe-trotter",
                        description: "Set foot on five continents.",
                        xp: 500,
                        completion: 1.0
                    )
                    AchievementCard(
                        rarity: .gold,
                        state: .unlocked,
                        layout: .compact,
                        icon: "airplane",
                        title: "Frequent Flyer",
                        xp: 200
                    )
                    AchievementCard(
                        rarity: .silver,
                        state: .locked,
                        layout: .compact,
                        icon: "map.fill",
                        title: "Cartographer",
                        xp: 120,
                        completion: 0.6
                    )
                }
            }

            PremiumSection(
                title: "Treasure rewards",
                subtitle: "Discoveries waiting to be collected."
            ) {
                VStack(spacing: TravelSpacing.md) {
                    TreasureRewardCard(
                        category: .hiddenPlace,
                        rarity: .gold,
                        state: .new,
                        layout: .hero,
                        title: "Secret cliff cove",
                        description: "A quiet inlet reachable only at low tide.",
                        xp: 150
                    )
                    TreasureRewardCard(
                        category: .foodDiscovery,
                        rarity: .silver,
                        state: .collected,
                        layout: .compact,
                        title: "Night-market dumplings",
                        xp: 80
                    )
                    TreasureRewardCard(
                        category: .wildlife,
                        rarity: .platinum,
                        state: .new,
                        layout: .compact,
                        title: "Sea-turtle nesting bay",
                        xp: 120
                    )
                }
            }

            PremiumSection(
                title: "Passport",
                subtitle: "Your most recent stamps."
            ) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.lg) {
                        PassportStamp(state: .visited, style: .circular, destination: "Japan", date: "2025")
                        PassportStamp(state: .rare, style: .circular, destination: "Bhutan", date: "2024")
                        PassportStamp(state: .eventExclusive, style: .circular, destination: "Rio", date: "2023")
                        PassportStamp(state: .visited, style: .circular, destination: "Norway", date: "2025")
                        PassportStamp(state: .wishlist, style: .circular, destination: "Iceland")
                    }
                    .padding(.vertical, TravelSpacing.xs)
                }
            }

            PremiumSection(
                title: "Rate recent trips",
                subtitle: "How were your latest journeys?"
            ) {
                GlassCard {
                    VStack(spacing: TravelSpacing.md) {
                        ratingRow("Kyoto, Japan", rating: 4.5)
                        Divider()
                        ratingRow("Reykjavík, Iceland", rating: 5.0)
                        Divider()
                        ratingRow("Lisbon, Portugal", rating: 4.0)
                    }
                }
            }
        }
    }

    /// Rich, deterministic mock travel history (most recent first) covering every
    /// `JourneyMilestoneKind`: countries visited, passport stamps, achievements,
    /// treasure rewards, completed quests and level-ups.
    private var journeyMilestones: [ExplorerJourneyMilestone] {
        [
            ExplorerJourneyMilestone(
                kind: .levelUp,
                title: "Reached Explorer Level 7",
                dateLabel: "May 2025"
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
                kind: .countryVisited,
                title: "First steps in Iceland",
                place: "Reykjavík, Iceland",
                dateLabel: "Apr 2025",
                xp: 60
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
            ),
            ExplorerJourneyMilestone(
                kind: .levelUp,
                title: "Reached Explorer Level 5",
                dateLabel: "Oct 2024"
            )
        ]
    }

    /// Realistic, deterministic mock lifetime travel statistics covering every
    /// requested metric. The first three are promoted to featured cards by
    /// `ExplorerStatisticsDashboard`'s expanded layout, so the headline reach
    /// (countries, cities, continents) leads.
    private var explorerStats: [ExplorerStat] {
        [
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
    }

    private func ratingRow(_ trip: String, rating: Double) -> some View {
        HStack(spacing: TravelSpacing.md) {
            Text(trip)
                .font(TravelTypography.cardTitle)
                .lineLimit(1)
            Spacer(minLength: 0)
            PremiumRatingView(
                rating: rating,
                size: .small,
                label: String(format: "%.1f", rating)
            )
        }
    }
}

struct ExplorerDashboardPreview_Previews: PreviewProvider {
    static var previews: some View {
        ExplorerDashboardPreview()
            .previewDisplayName("Explorer dashboard")
    }
}

#endif
