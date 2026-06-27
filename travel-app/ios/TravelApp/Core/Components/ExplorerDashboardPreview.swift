import SwiftUI

#if DEBUG

// MARK: - Explorer dashboard preview (Phase 66, extended Phase 68)
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
