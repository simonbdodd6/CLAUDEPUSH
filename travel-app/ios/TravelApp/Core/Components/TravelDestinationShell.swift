import SwiftUI

// MARK: - Travel destination shell (Phase 101)
//
// The reusable destination shell that every destination in Travel Intelligence
// will eventually use (Bali, Lombok, Gili Air, Komodo, Raja Ampat, Japan, …). It is
// a presentation-only, data-driven `View`: a caller supplies a `TravelDestination`
// value and the shell renders the full immersive destination page.
//
// It reuses the existing design system exclusively — `FeatureHeroScaffold`,
// `PremiumScrollView`, `PremiumSection`, `PremiumAdaptiveGrid`, `PremiumMetricTile`,
// `PremiumProgressBar`, `PremiumPillRow`, `GlassCard`, `PremiumTimelineConnector`,
// `MapTexturePlaceholder` and the tokens. `TravelDestination` is a lightweight
// presentation model (not a DTO); the shell holds no data, networking, persistence,
// repository, view-model, navigation, AppContainer or DTO logic, and is not wired
// into any screen. The countdown, quick actions, Travel Essentials shortcut and
// "Continue planning" button are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; text uses the Dynamic
// Type-scaling `TravelTypography` styles and wraps rather than truncating; and all
// motion is disabled under Reduce Motion.

// MARK: - Presentation model

/// A simple, presentation-only summary entry (icon, title, detail).
struct DestinationListItem: Identifiable {
    let id: String
    var icon: String
    var title: String
    var detail: String
    var accent: Color

    init(id: String? = nil, icon: String, title: String, detail: String, accent: Color = TravelTheme.current.tint) {
        self.id = id ?? title
        self.icon = icon
        self.title = title
        self.detail = detail
        self.accent = accent
    }
}

/// A daily-budget tier row.
struct DestinationBudgetTier: Identifiable {
    let id: String
    var label: String
    var cost: String
    var accent: Color

    init(id: String? = nil, label: String, cost: String, accent: Color) {
        self.id = id ?? label
        self.label = label
        self.cost = cost
        self.accent = accent
    }
}

/// A quick-action chip.
struct DestinationAction: Identifiable {
    let id: String
    var icon: String
    var label: String
    var accent: Color

    init(id: String? = nil, icon: String, label: String, accent: Color) {
        self.id = id ?? label
        self.icon = icon
        self.label = label
        self.accent = accent
    }
}

/// A top-experience tile.
struct DestinationExperienceItem: Identifiable {
    let id: String
    var title: String
    var icon: String
    var gradient: [Color]

    init(id: String? = nil, title: String, icon: String, gradient: [Color]) {
        self.id = id ?? title
        self.title = title
        self.icon = icon
        self.gradient = gradient
    }
}

/// A timeline day.
struct DestinationTimelineDay: Identifiable {
    let id: String
    var day: String
    var title: String
    var detail: String

    init(id: String? = nil, day: String, title: String, detail: String) {
        self.id = id ?? "\(day)-\(title)"
        self.day = day
        self.title = title
        self.detail = detail
    }
}

/// A statistics-strip value.
struct DestinationStat: Identifiable {
    let id: String
    var value: String
    var label: String

    init(id: String? = nil, value: String, label: String) {
        self.id = id ?? label
        self.value = value
        self.label = label
    }
}

/// The full, presentation-only content for one destination.
struct TravelDestination {
    var name: String
    var country: String
    var region: String
    var tagline: String
    var heroSymbol: String
    var heroGradient: [Color]
    var countdownDays: Int
    var tripDates: String
    var planningProgress: Double
    var weatherSummary: String
    var weatherDetail: String
    var recommendations: [DestinationListItem]
    var budgetTiers: [DestinationBudgetTier]
    var quickActions: [DestinationAction]
    var travelEssentialsBlurb: String
    var experiences: [DestinationExperienceItem]
    var accommodation: [DestinationListItem]
    var foodAndDrink: [DestinationListItem]
    var transport: [DestinationListItem]
    var ferries: [DestinationListItem]
    var safety: [DestinationListItem]
    var packingReminders: [String]
    var timeline: [DestinationTimelineDay]
    var stats: [DestinationStat]

    var countryRegion: String { "\(country) · \(region)" }
}

// MARK: - Shell

/// A premium, presentation-only destination page rendered from a `TravelDestination`.
struct TravelDestinationShell: View {
    var destination: TravelDestination

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            immersiveHero
                .modifier(ShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            imagePlaceholder
                .modifier(ShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            countdownCard
                .modifier(ShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: 2))

            section("Weather", "Conditions right now.", 3) {
                weatherCard
            }

            section("Today’s recommendations", "What to sort out next.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(destination.recommendations) { item in
                        recommendationCard(item)
                    }
                }
            }

            section("Daily budget", "Typical spend per person, per day.", 5) {
                budgetCard
            }

            section("Quick actions", "Jump straight to what you need.", 6) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.md) {
                        ForEach(destination.quickActions) { action in
                            actionChip(action)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }

            travelEssentialsShortcut
                .modifier(ShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: 7))

            section("Experiences", "The best of \(destination.name).", 8) {
                PremiumAdaptiveGrid(minimumWidth: 220) {
                    ForEach(destination.experiences) { experience in
                        experienceCard(experience)
                    }
                }
            }

            listSection("Where to stay", "Accommodation at a glance.", destination.accommodation, tag: "Stay", 9)
            listSection("Food & drink", "Where and what to eat.", destination.foodAndDrink, tag: "Eat", 10)
            listSection("Getting around", "Transport on the ground.", destination.transport, tag: "Travel", 11)
            listSection("Ferries", "Crossings to and from the island.", destination.ferries, tag: "Ferry", 12)
            listSection("Safety", "Stay safe and prepared.", destination.safety, tag: "Safety", 13)

            section("Packing reminders", "Don’t leave these behind.", 14) {
                packingCard
            }

            section("Trip timeline", "A rough shape for your days.", 15) {
                VStack(spacing: 0) {
                    ForEach(Array(destination.timeline.enumerated()), id: \.element.id) { index, day in
                        timelineRow(day, isLast: index == destination.timeline.count - 1)
                    }
                }
            }

            section("Trip at a glance", "Your plan in numbers.", 16) {
                PremiumAdaptiveGrid(minimumWidth: 120) {
                    ForEach(destination.stats) { stat in
                        statTile(stat)
                    }
                }
            }

            continuePlanningButton
                .modifier(ShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: 17))
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Section helpers

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(ShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    private func listSection(_ title: String, _ subtitle: String, _ items: [DestinationListItem], tag: String, _ index: Int) -> some View {
        section(title, subtitle, index) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(items) { item in
                    PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.title, subtitle: item.detail, trailing: tag)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(item.title). \(item.detail)")
                }
            }
        }
    }

    // MARK: Hero & image

    private var immersiveHero: some View {
        FeatureHeroScaffold(
            eyebrow: destination.countryRegion,
            symbol: destination.heroSymbol,
            title: destination.name,
            subtitle: destination.tagline,
            gradient: destination.heroGradient,
            metrics: [
                HeroMetric(value: "\(destination.countdownDays) days", label: "Until you go"),
                HeroMetric(value: destination.weatherSummary, label: "Weather"),
                HeroMetric(value: "\(destination.stats.first?.value ?? "—")", label: destination.stats.first?.label ?? "Trip")
            ],
            texture: { MapTexturePlaceholder() }
        )
    }

    private var imagePlaceholder: some View {
        RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
            .fill(LinearGradient(colors: destination.heroGradient, startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay(alignment: .topTrailing) {
                Image(systemName: destination.heroSymbol)
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                    .padding(TravelSpacing.lg)
            }
            .overlay(alignment: .bottomLeading) {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(destination.countryRegion.uppercased())
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.white.opacity(0.85))
                    Text(destination.name)
                        .font(TravelTypography.title)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(TravelSpacing.lg)
            }
            .frame(height: 200)
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.hero, style: .continuous)
                    .stroke(.white.opacity(0.25), lineWidth: 1)
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(destination.name), \(destination.countryRegion). Decorative destination image.")
    }

    private var countdownCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text("Your trip starts in")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text("\(destination.countdownDays)")
                        .font(TravelTypography.display)
                        .monospacedDigit()
                    Text("days")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text(destination.tripDates)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                PremiumProgressBar(
                    progress: appeared ? min(max(destination.planningProgress, 0), 1) : 0,
                    colors: [theme.tint, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("Planning \(Int((min(max(destination.planningProgress, 0), 1)) * 100).rounded())% complete")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Your trip starts in \(destination.countdownDays) days, \(destination.tripDates).")
    }

    // MARK: Cards & rows

    private var weatherCard: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                medallion("cloud.sun.fill", theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(destination.weatherSummary)
                        .font(TravelTypography.cardTitle)
                    Text(destination.weatherDetail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Weather: \(destination.weatherSummary). \(destination.weatherDetail)")
    }

    private func recommendationCard(_ item: DestinationListItem) -> some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                medallion(item.icon, item.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(item.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(item.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.title). \(item.detail)")
    }

    private var budgetCard: some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(destination.budgetTiers) { tier in
                    HStack(spacing: TravelSpacing.sm) {
                        Text(tier.label)
                            .textCase(.uppercase)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tier.accent)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(tier.accent.opacity(0.15), in: Capsule())
                        Spacer(minLength: TravelSpacing.sm)
                        Text(tier.cost)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(tier.label), \(tier.cost) per day")
                }
            }
        }
    }

    private func actionChip(_ action: DestinationAction) -> some View {
        Button { } label: {
            VStack(spacing: TravelSpacing.xs) {
                Image(systemName: action.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(action.accent)
                    .frame(width: 54, height: 54)
                    .background(.thinMaterial, in: Circle())
                    .overlay(Circle().stroke(action.accent.opacity(0.3), lineWidth: 1))
                Text(action.label)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(width: 76)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(action.label). Quick action.")
    }

    private var travelEssentialsShortcut: some View {
        GlassCard(prominence: .hero) {
            HStack(spacing: TravelSpacing.md) {
                medallion("square.grid.2x2.fill", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Travel Essentials")
                        .font(TravelTypography.cardTitle)
                    Text(destination.travelEssentialsBlurb)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.right")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Travel Essentials. \(destination.travelEssentialsBlurb)")
    }

    private func experienceCard(_ experience: DestinationExperienceItem) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: experience.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: experience.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: 92)
                Text(experience.title)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(experience.title)
    }

    private var packingCard: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("suitcase.fill", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    ForEach(destination.packingReminders, id: \.self) { item in
                        HStack(alignment: .top, spacing: TravelSpacing.xs) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(theme.moss)
                            Text(item)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func timelineRow(_ day: DestinationTimelineDay, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            PremiumTimelineConnector(accent: theme.tint, showsLine: !isLast)
            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(day.day)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(day.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(day.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, isLast ? 0 : TravelSpacing.md)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(day.day), \(day.title). \(day.detail)")
    }

    private func statTile(_ stat: DestinationStat) -> some View {
        PremiumMetricTile(value: stat.value, label: stat.label)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(stat.value) \(stat.label)")
    }

    private var continuePlanningButton: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.sm) {
                Text("Continue planning")
                    .font(TravelTypography.cardTitle)
                Image(systemName: "arrow.right")
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(TravelSpacing.md)
            .background(
                LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .leading, endPoint: .trailing),
                in: Capsule()
            )
            .overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue planning. Placeholder button.")
    }

    private func medallion(_ icon: String, _ accent: Color) -> some View {
        Image(systemName: icon)
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

// MARK: - Shell appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct ShellAppear: ViewModifier {
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
extension TravelDestination {
    /// A deterministic sample destination (Gili Air) for previews.
    static var sampleGiliAir: TravelDestination {
        let theme = TravelTheme.current
        return TravelDestination(
            name: "Gili Air",
            country: "Indonesia",
            region: "Lombok",
            tagline: "The calmest of the three Gilis — car-free white sand, turtle reefs and a laid-back pace.",
            heroSymbol: "beach.umbrella.fill",
            heroGradient: [theme.ocean, theme.sky, theme.sun.opacity(0.6)],
            countdownDays: 14,
            tripDates: "12–22 Aug 2025 · 10 nights",
            planningProgress: 0.7,
            weatherSummary: "29°C · Sunny",
            weatherDetail: "Dry season — calm seas and great visibility. Pack light, breathable clothing.",
            recommendations: [
                DestinationListItem(icon: "ferry.fill", title: "Book your fast boat", detail: "Morning crossings are calmest — reserve ahead.", accent: theme.ocean),
                DestinationListItem(icon: "simcard.fill", title: "Sort your SIM on Bali", detail: "Buy a Telkomsel SIM before you cross.", accent: theme.sky),
                DestinationListItem(icon: "drop.fill", title: "Pack reef-safe sunscreen", detail: "Pricey and hard to find locally — bring your own.", accent: theme.coral)
            ],
            budgetTiers: [
                DestinationBudgetTier(label: "Backpacker", cost: "Rp 350–600k", accent: theme.moss),
                DestinationBudgetTier(label: "Mid-range", cost: "Rp 800k–1.5m", accent: theme.sun),
                DestinationBudgetTier(label: "Premium", cost: "Rp 2.5m+", accent: theme.coral)
            ],
            quickActions: [
                DestinationAction(icon: "book.closed.fill", label: "Guides", accent: theme.tint),
                DestinationAction(icon: "map.fill", label: "Map", accent: theme.ocean),
                DestinationAction(icon: "banknote.fill", label: "Budget", accent: theme.moss),
                DestinationAction(icon: "suitcase.fill", label: "Packing", accent: theme.sun),
                DestinationAction(icon: "cross.case.fill", label: "Emergency", accent: theme.coral)
            ],
            travelEssentialsBlurb: "Transport, ferries, safety, connectivity and more — the practical guides for Gili Air.",
            experiences: [
                DestinationExperienceItem(title: "Snorkel with turtles", icon: "water.waves", gradient: [theme.ocean, theme.sky]),
                DestinationExperienceItem(title: "Sunset swings & bars", icon: "sunset.fill", gradient: [theme.coral, theme.sun]),
                DestinationExperienceItem(title: "Freediving & scuba", icon: "figure.open.water.swim", gradient: [theme.tint, theme.ocean]),
                DestinationExperienceItem(title: "Island bike loop", icon: "bicycle", gradient: [theme.moss, theme.sky])
            ],
            accommodation: [
                DestinationListItem(icon: "bed.double.fill", title: "Beach bungalows", detail: "Simple bamboo huts steps from the sand.", accent: theme.sun),
                DestinationListItem(icon: "house.fill", title: "Boutique guesthouses", detail: "Pools and aircon a little inland.", accent: theme.ocean),
                DestinationListItem(icon: "star.fill", title: "Eco-resorts", detail: "Premium villas on the quiet north side.", accent: theme.coral)
            ],
            foodAndDrink: [
                DestinationListItem(icon: "fork.knife", title: "Warungs", detail: "Cheap, fresh nasi campur and grilled fish.", accent: theme.sun),
                DestinationListItem(icon: "fish.fill", title: "Night market seafood", detail: "Pick your catch and have it grilled.", accent: theme.ocean),
                DestinationListItem(icon: "cup.and.saucer.fill", title: "Beach cafés", detail: "Smoothie bowls and good coffee.", accent: theme.coral)
            ],
            transport: [
                DestinationListItem(icon: "bicycle", title: "Bicycle", detail: "The easiest way around the car-free island.", accent: theme.moss),
                DestinationListItem(icon: "tortoise.fill", title: "Cidomo", detail: "Pony carts for luggage and longer hops.", accent: theme.tint),
                DestinationListItem(icon: "figure.walk", title: "Walking", detail: "You can circle the whole island on foot.", accent: theme.sky)
            ],
            ferries: [
                DestinationListItem(icon: "ferry.fill", title: "Fast boat from Bali", detail: "≈ 2 hrs from Padang Bai — book named operators.", accent: theme.ocean),
                DestinationListItem(icon: "ferry", title: "Public boat from Bangsal", detail: "Cheapest hop from Lombok in calm seas.", accent: theme.tint)
            ],
            safety: [
                DestinationListItem(icon: "cross.case.fill", title: "Emergency", detail: "112 nationwide; serious cases transfer to Lombok/Bali.", accent: theme.coral),
                DestinationListItem(icon: "exclamationmark.shield.fill", title: "Scams", detail: "Buy ferry tickets from official desks, not touts.", accent: theme.sun),
                DestinationListItem(icon: "drop.fill", title: "Water & sun", detail: "Sealed water only; reef-safe SPF and repellent.", accent: theme.sky)
            ],
            packingReminders: [
                "Reef-safe sunscreen, hat & sunglasses",
                "Snorkel/mask, rash vest & a dry bag",
                "Mosquito repellent & a small first-aid kit",
                "Plenty of cash — island ATMs are unreliable"
            ],
            timeline: [
                DestinationTimelineDay(day: "Day 1", title: "Arrive Gili Air", detail: "Fast boat in, settle in, sunset swim."),
                DestinationTimelineDay(day: "Day 3", title: "Dive & snorkel", detail: "Turtle reefs and an afternoon freedive."),
                DestinationTimelineDay(day: "Day 6", title: "Island & Lombok", detail: "Bike the loop, then a day trip to Lombok."),
                DestinationTimelineDay(day: "Day 10", title: "Depart", detail: "Morning boat back to Bali for your flight.")
            ],
            stats: [
                DestinationStat(value: "10", label: "Nights"),
                DestinationStat(value: "3", label: "Islands"),
                DestinationStat(value: "5", label: "Dives"),
                DestinationStat(value: "Rp 12m", label: "Budget")
            ]
        )
    }
}

struct TravelDestinationShell_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDestinationShell(destination: .sampleGiliAir)
                .previewDisplayName("Destination shell · Gili Air")

            TravelDestinationShell(destination: .sampleGiliAir)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Destination shell · Dynamic Type XL")
        }
    }
}
#endif
