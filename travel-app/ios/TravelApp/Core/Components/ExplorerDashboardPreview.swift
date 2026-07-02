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
// both the expanded (featured + tile grid) and compact recap layouts.
//
// Phase 74 adds a "World progress" section composing the existing
// `ExplorerMapProgress` directly beneath the profile header — the world map is a
// "where have I been" identity surface, so it pairs naturally with the profile —
// shown in both the expanded map card and the compact recap.
//
// Phase 76 adds a "Travel score" hero summary composing the existing
// `ExplorerTravelScoreCard` directly beneath the profile header — one headline
// rating for the whole explorer experience — shown in both expanded and compact.
// Its mock values are kept consistent with the profile and world-progress data
// (Explorer rank, Level 7, 320/500 XP, 24 countries, 12-day streak).
//
// Phase 78 adds an "Achievements" trophy shelf composing the existing
// `ExplorerAchievementShelf` beneath the Travel score, curating the best unlocked
// milestones (a subset of the profile's 19, including the Globe-trotter and
// Frequent Flyer trophies shown elsewhere), in both expanded and compact.
//
// Phase 80 adds a "Dream destinations" section composing the existing
// `ExplorerDestinationWishlist` between Achievements and World progress — the
// forward-looking counterpart to the earned trophies — with Iceland as the
// next-trip pick, consistent with the world-progress "next destination".
//
// Phase 82 adds a "Travel goals" section composing the existing
// `ExplorerTravelGoals` between Dream Destinations and World progress, with goal
// progress kept consistent with the rest of the dashboard (24/50 countries, 5/7
// continents, 11/25 UNESCO sites). The preview now reads top-to-bottom as a
// complete explorer overview:
// Profile → Travel Score → Achievements → Dream Destinations → Travel Goals → World progress → Quests → Journey → Statistics.

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

            Group {
            PremiumSection(
                title: "Travel score",
                subtitle: "Your overall explorer rating, earned across every journey."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerTravelScoreCard(
                        score: 540,
                        rank: .explorer,
                        level: 7,
                        currentXP: 320,
                        requiredXP: 500,
                        countriesVisited: 24,
                        xpEarned: 8_420,
                        streakDays: 12,
                        nextMilestone: "Reach Level 8",
                        layout: .expanded,
                        title: nil
                    )

                    ExplorerTravelScoreCard(
                        score: 540,
                        rank: .explorer,
                        level: 7,
                        currentXP: 320,
                        requiredXP: 500,
                        countriesVisited: 24,
                        xpEarned: 8_420,
                        streakDays: 12,
                        nextMilestone: "Reach Level 8",
                        layout: .compact,
                        title: "At a glance"
                    )
                }
            }

            PremiumSection(
                title: "Achievements",
                subtitle: "Your finest milestones, on the trophy shelf."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerAchievementShelf(
                        achievements: shelfAchievements,
                        layout: .expanded,
                        title: nil
                    )

                    ExplorerAchievementShelf(
                        achievements: shelfAchievements,
                        layout: .compact,
                        title: "At a glance"
                    )
                }
            }

            PremiumSection(
                title: "Dream destinations",
                subtitle: "Where you're headed next — and where you're dreaming of."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerDestinationWishlist(
                        destinations: wishlistDestinations,
                        layout: .expanded,
                        title: nil
                    )

                    ExplorerDestinationWishlist(
                        destinations: wishlistDestinations,
                        layout: .compact,
                        title: "At a glance"
                    )
                }
            }

            PremiumSection(
                title: "Travel goals",
                subtitle: "The long-term ambitions you're working toward."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerTravelGoals(
                        goals: travelGoals,
                        layout: .expanded,
                        title: nil
                    )

                    ExplorerTravelGoals(
                        goals: travelGoals,
                        layout: .compact,
                        title: "At a glance"
                    )
                }
            }

            PremiumSection(
                title: "World progress",
                subtitle: "How much of the world you've seen — and where next."
            ) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerMapProgress(
                        continents: worldContinents,
                        countriesVisited: 24,
                        countriesTarget: 50,
                        nextDestination: "Iceland",
                        streakDays: 12,
                        layout: .expanded,
                        title: nil,
                        subtitle: "Five continents touched, more on the horizon."
                    )

                    ExplorerMapProgress(
                        continents: worldContinents,
                        countriesVisited: 24,
                        countriesTarget: 50,
                        nextDestination: "Iceland",
                        streakDays: 12,
                        layout: .compact,
                        title: "At a glance"
                    )
                }
            }

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

            }

            Group {
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

    /// Deterministic long-term travel goals. Progress mirrors the rest of the
    /// dashboard — 24/50 countries, 5/7 continents and 11/25 UNESCO sites match the
    /// profile header, world-progress card and statistics dashboard respectively.
    private var travelGoals: [TravelGoal] {
        [
            TravelGoal(title: "Visit 50 countries", icon: "globe.europe.africa.fill", current: 24, target: 50, targetYear: "2030", accent: TravelTheme.current.ocean),
            TravelGoal(title: "Visit every continent", icon: "globe.americas.fill", current: 5, target: 7, accent: TravelTheme.current.coral),
            TravelGoal(title: "Dive with manta rays", icon: "water.waves", current: 1, target: 1, targetYear: "2024", accent: TravelTheme.current.sky),
            TravelGoal(title: "Surf 100 waves", icon: "figure.surfing", current: 8, target: 100, accent: TravelTheme.current.tint),
            TravelGoal(title: "Visit 25 UNESCO sites", icon: "building.columns.fill", current: 11, target: 25, targetYear: "2032", accent: TravelTheme.current.sun)
        ]
    }

    /// Deterministic dream-destination wishlist. Iceland is the next-trip pick,
    /// matching the world-progress card's `nextDestination` so the dashboard stays
    /// internally consistent.
    private var wishlistDestinations: [WishlistDestination] {
        [
            WishlistDestination(name: "Reykjavík", country: "Iceland", status: .nextTrip, priority: .topPick, progress: 0.8, targetYear: "2025", symbol: "snowflake", gradient: [TravelTheme.current.ocean, TravelTheme.current.sky]),
            WishlistDestination(name: "Patagonia", country: "Argentina", status: .planned, priority: .topPick, progress: 0.45, targetYear: "2026", symbol: "figure.hiking", gradient: [TravelTheme.current.moss, TravelTheme.current.ocean]),
            WishlistDestination(name: "Santorini", country: "Greece", status: .dreaming, priority: .soon, progress: 0.2, symbol: "sun.max.fill", gradient: [TravelTheme.current.sun, TravelTheme.current.coral]),
            WishlistDestination(name: "Serengeti", country: "Tanzania", status: .dreaming, priority: .someday, progress: 0.15, targetYear: "2027", symbol: "pawprint.fill", gradient: [TravelTheme.current.sun, TravelTheme.current.moss])
        ]
    }

    /// Curated best unlocked achievements for the trophy shelf — a deterministic
    /// subset of the profile's 19, reusing the Globe-trotter and Frequent Flyer
    /// trophies shown in the "Recent achievements" section so the dashboard stays
    /// internally consistent.
    private var shelfAchievements: [ShelfAchievement] {
        [
            ShelfAchievement(title: "Globe-trotter", icon: "globe.europe.africa.fill", rarity: .legendary, xp: 500, unlockedDate: "Feb 2025", category: "Exploration"),
            ShelfAchievement(title: "Summit Seeker", icon: "mountain.2.fill", rarity: .platinum, xp: 300, unlockedDate: "Oct 2024", category: "Adventure"),
            ShelfAchievement(title: "Frequent Flyer", icon: "airplane", rarity: .gold, xp: 200, unlockedDate: "Jan 2025", category: "Travel"),
            ShelfAchievement(title: "Deep Diver", icon: "water.waves", rarity: .gold, xp: 180, unlockedDate: "Sep 2024", category: "Ocean"),
            ShelfAchievement(title: "Night Owl", icon: "moon.stars.fill", rarity: .bronze, xp: 60, unlockedDate: "Nov 2024", category: "Culture")
        ]
    }

    /// Realistic, deterministic mock world progress. The per-continent visited
    /// counts sum to 24 — matching the profile header's `countriesVisited` — so
    /// the map, the progress summary and the profile all tell the same story.
    private var worldContinents: [ExplorerContinent] {
        [
            ExplorerContinent(region: .northAmerica, visited: 3, total: 23),
            ExplorerContinent(region: .southAmerica, visited: 4, total: 12),
            ExplorerContinent(region: .europe, visited: 11, total: 44),
            ExplorerContinent(region: .africa, visited: 2, total: 54),
            ExplorerContinent(region: .asia, visited: 4, total: 48),
            ExplorerContinent(region: .oceania, visited: 0, total: 14)
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
