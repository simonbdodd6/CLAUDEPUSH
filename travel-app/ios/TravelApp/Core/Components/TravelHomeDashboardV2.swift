import SwiftUI

// MARK: - Travel home dashboard V2 (Phase 139)
//
// The flagship, presentation-only Home dashboard for the Travel Intelligence app: a
// personalised hero, next-trip countdown and overall travel-readiness score, an active-
// journey (planning) summary, an upcoming-bookings summary, a budget summary, a weather
// placeholder, a grid of module shortcuts (destination hub, journey, trip planner,
// document wallet, offline essentials, ferries, accommodation, currency, connectivity,
// health & safety, culture, island guide, weather), a quick-actions grid, favourite
// destinations, a recent-activity feed, upcoming reminders, travel statistics and a
// continue-planning button. A caller supplies a `HomeV2Plan` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumMetricTile`, `PremiumProgressBar`, `PremiumRingProgress`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. The `HomeV2*` model names
// are deliberately distinct from the existing Home dashboard's types to avoid any
// collision. `HomeV2Plan` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// shortcuts, quick actions, favourites and continue button are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with favourite buttons kept
// independently focusable; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion is disabled under Reduce Motion.

/// A single travel statistic.
struct HomeV2Stat: Identifiable {
    let id = UUID()
    var value: String
    var label: String
}

/// A module shortcut tile.
struct HomeV2Shortcut: Identifiable {
    let id: String
    var title: String
    var icon: String
    var accent: Color

    init(title: String, icon: String, accent: Color) {
        self.id = title
        self.title = title
        self.icon = icon
        self.accent = accent
    }
}

/// A quick-action tile.
struct HomeV2Action: Identifiable {
    let id = UUID()
    var title: String
    var icon: String
    var accent: Color
}

/// A favourite destination card.
struct HomeV2Destination: Identifiable {
    let id: String
    var name: String
    var subtitle: String
    var icon: String
    var accent: Color

    init(name: String, subtitle: String, icon: String, accent: Color) {
        self.id = name
        self.name = name
        self.subtitle = subtitle
        self.icon = icon
        self.accent = accent
    }
}

/// A generic home row reused for bookings, reminders and the activity feed.
struct HomeV2Row: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
}

/// The full, presentation-only content for the V2 home dashboard.
struct HomeV2Plan {
    var greeting: String
    var travellerName: String
    var heroSymbol: String
    var heroGradient: [Color]
    var nextTripTitle: String
    var nextTripSubtitle: String
    var daysToNextTrip: Int
    var departureLabel: String
    var readiness: Double
    var stats: [HomeV2Stat]
    var activeJourneyTitle: String
    var activeJourneyDetail: String
    var activeJourneyProgress: Double
    var bookings: [HomeV2Row]
    var budgetSpent: String
    var budgetTotal: String
    var budgetFraction: Double
    var budgetNote: String
    var weatherPlaceholder: String
    var shortcuts: [HomeV2Shortcut]
    var quickActions: [HomeV2Action]
    var favourites: [HomeV2Destination]
    var recentActivity: [HomeV2Row]
    var reminders: [HomeV2Row]
}

/// A premium, presentation-only V2 home dashboard rendered from a `HomeV2Plan`.
struct TravelHomeDashboardV2: View {
    var plan: HomeV2Plan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            hero
            topGroup
            summaryGroup
            shortcutsGroup
            listsGroup
            footerGroup
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Hero

    private var hero: some View {
        FeatureHeroScaffold(
            eyebrow: "Travel Intelligence",
            symbol: plan.heroSymbol,
            title: "\(plan.greeting), \(plan.travellerName)",
            subtitle: plan.nextTripSubtitle,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: "\(plan.daysToNextTrip)d", label: "Next trip"),
                HeroMetric(value: "\(percent(plan.readiness))%", label: "Ready"),
                HeroMetric(value: "\(plan.favourites.count)", label: "Saved")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(HomeV2Appear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var topGroup: some View {
        Group {
            section("Next trip", "The countdown is on.", 1) {
                countdownCard
            }

            section("Your travels", "Lifetime stats.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(plan.stats) { stat in
                        PremiumMetricTile(value: stat.value, label: stat.label)
                    }
                }
            }
        }
    }

    private var summaryGroup: some View {
        Group {
            section("Active journey", "Where your planning stands.", 3) {
                journeyCard
            }

            section("Upcoming bookings", "What’s locked in.", 4) {
                infoList(plan.bookings)
            }

            section("Budget", "How you’re tracking.", 5) {
                budgetCard
            }

            section("Weather", "At your destination.", 6) {
                weatherCard
            }
        }
    }

    private var shortcutsGroup: some View {
        Group {
            section("Explore", "Jump to any guide.", 7) {
                PremiumAdaptiveGrid(minimumWidth: 104) {
                    ForEach(plan.shortcuts) { shortcut in
                        shortcutTile(shortcut)
                    }
                }
            }

            section("Quick actions", "Get things done.", 8) {
                PremiumAdaptiveGrid(minimumWidth: 132) {
                    ForEach(plan.quickActions) { action in
                        actionTile(action)
                    }
                }
            }
        }
    }

    private var listsGroup: some View {
        Group {
            section("Favourite destinations", "Saved for later.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(plan.favourites) { destination in
                        destinationCard(destination)
                    }
                }
            }

            section("Recent activity", "What’s changed.", 8) {
                infoList(plan.recentActivity)
            }

            section("Reminders", "Don’t forget.", 8) {
                infoList(plan.reminders)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Keep planning", "Pick up where you left off.", 8) {
                continueCard
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(HomeV2Appear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Countdown card

    private var countdownCard: some View {
        GlassCard(prominence: .hero) {
            HStack(spacing: TravelSpacing.lg) {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("\(plan.daysToNextTrip)")
                        .font(TravelTypography.display)
                        .foregroundStyle(theme.tint)
                    Text("days to go")
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(plan.nextTripTitle)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Label(plan.departureLabel, systemImage: "calendar")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                PremiumRingProgress(
                    progress: appeared ? plan.readiness : 0,
                    colors: [theme.tint, theme.moss],
                    trackColor: Color.secondary.opacity(0.14),
                    lineWidth: 9
                ) {
                    VStack(spacing: 0) {
                        Text("\(percent(plan.readiness))%")
                            .font(TravelTypography.cardTitle)
                        Text("ready")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(width: 96, height: 96)
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(plan.daysToNextTrip) days to \(plan.nextTripTitle), \(plan.departureLabel). \(percent(plan.readiness)) percent ready.")
    }

    // MARK: Active journey card

    private var journeyCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("figure.walk.motion", theme.tint)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(plan.activeJourneyTitle)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(plan.activeJourneyDetail)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Text("\(percent(plan.activeJourneyProgress))%")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                }
                PremiumProgressBar(progress: appeared ? plan.activeJourneyProgress : 0, colors: [theme.tint, theme.sky])
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(plan.activeJourneyTitle). \(plan.activeJourneyDetail). \(percent(plan.activeJourneyProgress)) percent.")
    }

    // MARK: Budget card

    private var budgetCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text(plan.budgetSpent)
                        .font(TravelTypography.title)
                        .foregroundStyle(theme.tint)
                    Text("of \(plan.budgetTotal)")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text("\(percent(plan.budgetFraction))%")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                }
                PremiumProgressBar(progress: appeared ? plan.budgetFraction : 0, colors: [theme.tint, theme.sun])
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text(plan.budgetNote)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Budget, \(plan.budgetSpent) of \(plan.budgetTotal), \(percent(plan.budgetFraction)) percent. \(plan.budgetNote)")
    }

    // MARK: Weather card

    private var weatherCard: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "cloud.sun.fill")
                    .font(TravelTypography.title)
                    .foregroundStyle(theme.sky)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(plan.weatherPlaceholder)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Live forecast needs a connection")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Weather: \(plan.weatherPlaceholder). Placeholder.")
    }

    // MARK: Shortcut & action tiles

    private func shortcutTile(_ shortcut: HomeV2Shortcut) -> some View {
        Button { } label: {
            VStack(spacing: TravelSpacing.xs) {
                Image(systemName: shortcut.icon)
                    .font(TravelTypography.title)
                    .foregroundStyle(shortcut.accent)
                Text(shortcut.title)
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
            .padding(.horizontal, TravelSpacing.sm)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(shortcut.title). Placeholder shortcut.")
    }

    private func actionTile(_ action: HomeV2Action) -> some View {
        Button { } label: {
            VStack(spacing: TravelSpacing.xs) {
                Image(systemName: action.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(action.accent)
                Text(action.title)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(TravelSpacing.md)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(action.title). Placeholder action.")
    }

    // MARK: Destination cards

    private func destinationCard(_ destination: HomeV2Destination) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(destination.icon, destination.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(destination.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(destination.subtitle)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton(destination.id, destination.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(destination.name), \(destination.subtitle)")
    }

    // MARK: Continue button

    private var continueCard: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(TravelTypography.title)
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Continue planning")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                    Text("\(percent(plan.activeJourneyProgress))% done on \(plan.nextTripTitle).")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(TravelSpacing.md)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .leading, endPoint: .trailing),
                in: RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue planning \(plan.nextTripTitle). Placeholder button.")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [HomeV2Row]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(row.icon, row.accent)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(row.title)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                            if let subtitle = row.subtitle {
                                Text(subtitle)
                                    .font(TravelTypography.eyebrow)
                                    .textCase(.uppercase)
                                    .foregroundStyle(.secondary)
                            }
                            Text(row.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Shared bits

    private func percent(_ value: Double) -> Int { Int((value * 100).rounded()) }

    private func favouriteButton(_ id: String, _ name: String) -> some View {
        let isFav = favourites.contains(id)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(id) } else { favourites.insert(id) }
            }
        } label: {
            Image(systemName: isFav ? "star.fill" : "star")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(isFav ? theme.sun : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFav ? "Saved destination \(name)" : "Save destination \(name)")
    }

    private func medallion(_ glyph: String, _ accent: Color) -> some View {
        Image(systemName: glyph)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(colors: [accent, accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: accent.opacity(0.3), radius: 8, y: 4)
            .accessibilityHidden(true)
    }
}

// MARK: - Home V2 appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct HomeV2Appear: ViewModifier {
    let appeared: Bool
    let reduceMotion: Bool
    let index: Int

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 10)
            .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
    }
}

#if DEBUG
extension HomeV2Plan {
    /// A deterministic sample home plan for a traveller with a trip coming up.
    static var sample: HomeV2Plan {
        let theme = TravelTheme.current
        return HomeV2Plan(
            greeting: "Welcome back",
            travellerName: "Simon",
            heroSymbol: "sparkles",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            nextTripTitle: "Bali & Beyond",
            nextTripSubtitle: "Your 14-night island-hop is almost here — let’s get you ready.",
            daysToNextTrip: 12,
            departureLabel: "12–26 Aug",
            readiness: 0.78,
            stats: [
                HomeV2Stat(value: "7", label: "Trips"),
                HomeV2Stat(value: "4", label: "Countries"),
                HomeV2Stat(value: "23", label: "Islands"),
                HomeV2Stat(value: "142", label: "Dives")
            ],
            activeJourneyTitle: "Planning your next trip",
            activeJourneyDetail: "Bali & Beyond — flights and stays booked, a few steps left.",
            activeJourneyProgress: 0.72,
            bookings: [
                HomeV2Row(title: "Return flight", subtitle: "DPS · 12 Aug", icon: "airplane", detail: "London to Denpasar, confirmed.", accent: theme.sky),
                HomeV2Row(title: "Canggu villa", subtitle: "12–16 Aug", icon: "bed.double.fill", detail: "First four nights booked.", accent: theme.tint),
                HomeV2Row(title: "Gili fast boat", subtitle: "16 Aug", icon: "ferry.fill", detail: "Lembongan → Gili Air, paid.", accent: theme.ocean)
            ],
            budgetSpent: "£980",
            budgetTotal: "£1,400",
            budgetFraction: 0.7,
            budgetNote: "On track at about £62/day for the trip.",
            weatherPlaceholder: "Bali · Sunny 30°C",
            shortcuts: [
                HomeV2Shortcut(title: "Destination", icon: "globe.asia.australia.fill", accent: theme.tint),
                HomeV2Shortcut(title: "Journey", icon: "figure.walk.motion", accent: theme.ocean),
                HomeV2Shortcut(title: "Planner", icon: "calendar", accent: theme.sky),
                HomeV2Shortcut(title: "Documents", icon: "wallet.bifold.fill", accent: theme.moss),
                HomeV2Shortcut(title: "Offline", icon: "arrow.down.circle.fill", accent: theme.sun),
                HomeV2Shortcut(title: "Ferries", icon: "ferry.fill", accent: theme.ocean),
                HomeV2Shortcut(title: "Stays", icon: "bed.double.fill", accent: theme.tint),
                HomeV2Shortcut(title: "Currency", icon: "banknote.fill", accent: theme.moss),
                HomeV2Shortcut(title: "Connectivity", icon: "wifi", accent: theme.tint),
                HomeV2Shortcut(title: "Health", icon: "cross.case.fill", accent: theme.coral),
                HomeV2Shortcut(title: "Culture", icon: "hands.sparkles.fill", accent: theme.sun),
                HomeV2Shortcut(title: "Islands", icon: "map.fill", accent: theme.sky),
                HomeV2Shortcut(title: "Weather", icon: "cloud.sun.fill", accent: theme.sky)
            ],
            quickActions: [
                HomeV2Action(title: "Add booking", icon: "plus.circle.fill", accent: theme.tint),
                HomeV2Action(title: "New trip", icon: "calendar.badge.plus", accent: theme.ocean),
                HomeV2Action(title: "Packing", icon: "bag.fill", accent: theme.sun),
                HomeV2Action(title: "Budget", icon: "wallet.bifold.fill", accent: theme.moss),
                HomeV2Action(title: "Search", icon: "magnifyingglass", accent: theme.sky),
                HomeV2Action(title: "Notes", icon: "square.and.pencil", accent: theme.coral)
            ],
            favourites: [
                HomeV2Destination(name: "Bali", subtitle: "Your upcoming base — temples & surf.", icon: "leaf.fill", accent: theme.tint),
                HomeV2Destination(name: "Raja Ampat", subtitle: "The richest reefs on Earth.", icon: "fish.fill", accent: theme.coral),
                HomeV2Destination(name: "Komodo", subtitle: "Dragons and big-fish diving.", icon: "lizard.fill", accent: theme.sun),
                HomeV2Destination(name: "Gili Islands", subtitle: "Turtles and no traffic.", icon: "beach.umbrella.fill", accent: theme.moss)
            ],
            recentActivity: [
                HomeV2Row(title: "Booked Gili fast boat", subtitle: "Today", icon: "ferry.fill", detail: "Lembongan → Gili Air confirmed.", accent: theme.ocean),
                HomeV2Row(title: "Updated budget", subtitle: "Yesterday", icon: "wallet.bifold.fill", detail: "Raised the daily allowance to £62.", accent: theme.moss),
                HomeV2Row(title: "Saved insurance offline", subtitle: "2 days ago", icon: "arrow.down.circle.fill", detail: "Policy added to the document wallet.", accent: theme.tint)
            ],
            reminders: [
                HomeV2Row(title: "Pay the Komodo dive balance", subtitle: "This week", icon: "banknote.fill", detail: "Confirm the liveaboard before it sells out.", accent: theme.coral),
                HomeV2Row(title: "Buy an eSIM before you fly", subtitle: "Connectivity", icon: "simcard.fill", detail: "Be online the moment you land.", accent: theme.tint),
                HomeV2Row(title: "Confirm dive insurance", subtitle: "Health", icon: "lifepreserver.fill", detail: "Check it covers your planned depths.", accent: theme.ocean)
            ]
        )
    }
}

struct TravelHomeDashboardV2_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelHomeDashboardV2(plan: .sample)
                .previewDisplayName("Home V2 · Travel Intelligence")

            TravelHomeDashboardV2(plan: .sample)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Home V2 · Dynamic Type XL")
        }
    }
}
#endif
