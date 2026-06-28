import SwiftUI

// MARK: - Travel trip planner dashboard (Phase 103)
//
// The first premium trip-planning dashboard: it brings the itinerary, countdown,
// budget, bookings, packing, weather and Travel Essentials together into a single,
// reusable, data-driven planning experience. A caller supplies a `TripPlan` value
// and the dashboard renders the full planning page.
//
// It reuses the existing design system exclusively — `TravelDestinationShell`
// (embedded as a framed, non-interactive preview), `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumMetricTile`, `PremiumProgressBar`,
// `PremiumAdaptiveGrid`, `PremiumPillRow`, `GlassCard`, `PremiumTimelineConnector`,
// `MapTexturePlaceholder` and the tokens — and it reuses the Phase-101 presentation
// model types (`DestinationListItem`, `DestinationBudgetTier`, `DestinationAction`,
// `DestinationTimelineDay`, `DestinationStat`). `TripPlan` is a lightweight
// presentation model (not a DTO); the dashboard holds no data, networking,
// persistence, repository, view-model, navigation, AppContainer or DTO logic, and is
// not wired into any screen. The checklist, quick actions and "Continue planning"
// button are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; the checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// The full, presentation-only content for one trip plan.
struct TripPlan {
    var destinationName: String
    var countryRegion: String
    var tagline: String
    var heroSymbol: String
    var heroGradient: [Color]
    var countdownDays: Int
    var tripDates: String
    var planningProgress: Double
    var planningStepsLabel: String
    var bookings: [DestinationListItem]
    var budgetTiers: [DestinationBudgetTier]
    var budgetTotalLabel: String
    var packingDone: Int
    var packingTotal: Int
    var weatherSummary: String
    var weatherDetail: String
    var travelEssentialsBlurb: String
    var recommendations: [DestinationListItem]
    var timeline: [DestinationTimelineDay]
    var checklist: [String]
    var quickActions: [DestinationAction]
    var stats: [DestinationStat]
    /// Optional full destination to embed its shell as a framed preview.
    var destination: TravelDestination?

    var packingProgress: Double {
        guard packingTotal > 0 else { return 0 }
        return min(max(Double(packingDone) / Double(packingTotal), 0), 1)
    }
}

/// A premium, presentation-only trip-planning dashboard rendered from a `TripPlan`.
struct TravelTripPlannerDashboard: View {
    var plan: TripPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var checked: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            immersiveHero
                .modifier(PlannerAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            planningProgressCard
                .modifier(PlannerAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            section("Upcoming bookings", "What’s confirmed and what’s next.", 2) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(plan.bookings) { booking in
                        PremiumPillRow(symbol: booking.icon, accent: booking.accent, title: booking.title, subtitle: booking.detail, trailing: "Booking")
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(booking.title). \(booking.detail)")
                    }
                }
            }

            section("Budget overview", "Where the money goes, per day.", 3) {
                budgetCard
            }

            section("Packing", "How ready your bag is.", 4) {
                packingCard
            }

            section("Weather", "Conditions for your dates.", 5) {
                weatherCard
            }

            travelEssentialsShortcut
                .modifier(PlannerAppear(appeared: appeared, reduceMotion: reduceMotion, index: 6))

            section("Today’s recommendations", "What to sort out next.", 7) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(plan.recommendations) { item in
                        recommendationCard(item)
                    }
                }
            }

            section("Trip timeline", "A rough shape for your days.", 8) {
                VStack(spacing: 0) {
                    ForEach(Array(plan.timeline.enumerated()), id: \.element.id) { index, day in
                        timelineRow(day, isLast: index == plan.timeline.count - 1)
                    }
                }
            }

            section("Checklist", "Tick these off as you plan.", 9) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(plan.checklist, id: \.self) { item in
                            checklistRow(item)
                        }
                    }
                }
            }

            section("Quick actions", "Jump straight to what you need.", 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.md) {
                        ForEach(plan.quickActions) { action in
                            actionChip(action)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }

            section("Trip at a glance", "Your plan in numbers.", 11) {
                PremiumAdaptiveGrid(minimumWidth: 120) {
                    ForEach(plan.stats) { stat in
                        statTile(stat)
                    }
                }
            }

            if let destination = plan.destination {
                section("Destination", "Your full destination guide.", 12) {
                    destinationEmbed(destination)
                }
            }

            continuePlanningButton
                .modifier(PlannerAppear(appeared: appeared, reduceMotion: reduceMotion, index: 13))
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(PlannerAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Hero & progress

    private var immersiveHero: some View {
        FeatureHeroScaffold(
            eyebrow: plan.countryRegion,
            symbol: plan.heroSymbol,
            title: plan.destinationName,
            subtitle: plan.tagline,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: "\(plan.countdownDays) days", label: "Until you go"),
                HeroMetric(value: plan.weatherSummary, label: "Weather"),
                HeroMetric(value: "\(Int((plan.planningProgress * 100).rounded()))%", label: "Planned")
            ],
            texture: { MapTexturePlaceholder() }
        )
    }

    private var planningProgressCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Planning progress")
                        .font(TravelTypography.cardTitle)
                    Spacer(minLength: TravelSpacing.sm)
                    Text("\(Int((min(max(plan.planningProgress, 0), 1)) * 100).rounded())%")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                        .monospacedDigit()
                }
                PremiumProgressBar(
                    progress: appeared ? min(max(plan.planningProgress, 0), 1) : 0,
                    colors: [theme.tint, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                HStack {
                    Text(plan.planningStepsLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text("\(plan.countdownDays) days · \(plan.tripDates)")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Planning progress \(Int((plan.planningProgress * 100).rounded())) percent. \(plan.planningStepsLabel). Trip in \(plan.countdownDays) days.")
    }

    // MARK: Cards & rows

    private var budgetCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                VStack(spacing: TravelSpacing.xs) {
                    ForEach(plan.budgetTiers) { tier in
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
                Divider()
                HStack {
                    Text("Estimated total")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text(plan.budgetTotalLabel)
                        .font(TravelTypography.cardTitle)
                        .monospacedDigit()
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Estimated total \(plan.budgetTotalLabel)")
            }
        }
    }

    private var packingCard: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                medallion("suitcase.fill", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Packing progress")
                            .font(TravelTypography.cardTitle)
                        Spacer(minLength: TravelSpacing.sm)
                        Text("\(plan.packingDone)/\(plan.packingTotal)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    PremiumProgressBar(
                        progress: appeared ? plan.packingProgress : 0,
                        colors: [theme.moss, theme.sky],
                        height: TravelSpacing.xs
                    )
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Packing progress, \(plan.packingDone) of \(plan.packingTotal) items packed.")
    }

    private var weatherCard: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                medallion("cloud.sun.fill", theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(plan.weatherSummary)
                        .font(TravelTypography.cardTitle)
                    Text(plan.weatherDetail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Weather: \(plan.weatherSummary). \(plan.weatherDetail)")
    }

    private var travelEssentialsShortcut: some View {
        GlassCard(prominence: .hero) {
            HStack(spacing: TravelSpacing.md) {
                medallion("square.grid.2x2.fill", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Travel Essentials")
                        .font(TravelTypography.cardTitle)
                    Text(plan.travelEssentialsBlurb)
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
        .accessibilityLabel("Travel Essentials. \(plan.travelEssentialsBlurb)")
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

    private func checklistRow(_ item: String) -> some View {
        let isChecked = checked.contains(item)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isChecked { checked.remove(item) } else { checked.insert(item) }
            }
        } label: {
            HStack(alignment: .top, spacing: TravelSpacing.sm) {
                Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isChecked ? theme.moss : Color.secondary)
                Text(item)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isChecked ? .secondary : .primary)
                    .strikethrough(isChecked, color: .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item)
        .accessibilityValue(isChecked ? "Done" : "Not done")
        .accessibilityHint("Double tap to toggle")
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

    private func statTile(_ stat: DestinationStat) -> some View {
        PremiumMetricTile(value: stat.value, label: stat.label)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(stat.value) \(stat.label)")
    }

    private func destinationEmbed(_ destination: TravelDestination) -> some View {
        TravelDestinationShell(destination: destination)
            .frame(height: 380)
            .clipShape(RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .stroke(.white.opacity(0.25), lineWidth: 1)
            )
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(destination.name) destination guide. Visual preview.")
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

// MARK: - Planner appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct PlannerAppear: ViewModifier {
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
extension TripPlan {
    /// A deterministic sample trip plan (Gili Air) for previews.
    static var sampleGiliAir: TripPlan {
        let theme = TravelTheme.current
        return TripPlan(
            destinationName: "Gili Air",
            countryRegion: "Indonesia · Lombok",
            tagline: "Your 10-night island escape — calm reefs, sunset swings and no traffic.",
            heroSymbol: "beach.umbrella.fill",
            heroGradient: [theme.ocean, theme.sky, theme.sun.opacity(0.6)],
            countdownDays: 14,
            tripDates: "12–22 Aug 2025",
            planningProgress: 0.7,
            planningStepsLabel: "7 of 10 steps complete",
            bookings: [
                DestinationListItem(icon: "airplane", title: "Flights to Bali", detail: "Confirmed · 12 Aug, 09:40", accent: theme.sky),
                DestinationListItem(icon: "ferry.fill", title: "Fast boat to Gili Air", detail: "To book · morning crossing", accent: theme.ocean),
                DestinationListItem(icon: "bed.double.fill", title: "Beach bungalow", detail: "Confirmed · 10 nights", accent: theme.sun)
            ],
            budgetTiers: [
                DestinationBudgetTier(label: "Backpacker", cost: "Rp 350–600k", accent: theme.moss),
                DestinationBudgetTier(label: "Mid-range", cost: "Rp 800k–1.5m", accent: theme.sun),
                DestinationBudgetTier(label: "Premium", cost: "Rp 2.5m+", accent: theme.coral)
            ],
            budgetTotalLabel: "≈ Rp 12m",
            packingDone: 8,
            packingTotal: 14,
            weatherSummary: "29°C · Sunny",
            weatherDetail: "Dry season — calm seas and great visibility for your dates.",
            travelEssentialsBlurb: "Transport, ferries, safety and connectivity — the practical guides for Gili Air.",
            recommendations: [
                DestinationListItem(icon: "ferry.fill", title: "Book your fast boat", detail: "Morning crossings are calmest — reserve ahead.", accent: theme.ocean),
                DestinationListItem(icon: "simcard.fill", title: "Sort your SIM on Bali", detail: "Buy a Telkomsel SIM before you cross.", accent: theme.sky),
                DestinationListItem(icon: "drop.fill", title: "Pack reef-safe sunscreen", detail: "Pricey and hard to find locally — bring your own.", accent: theme.coral)
            ],
            timeline: [
                DestinationTimelineDay(day: "Day 1", title: "Arrive Gili Air", detail: "Fast boat in, settle in, sunset swim."),
                DestinationTimelineDay(day: "Day 3", title: "Dive & snorkel", detail: "Turtle reefs and an afternoon freedive."),
                DestinationTimelineDay(day: "Day 6", title: "Island & Lombok", detail: "Bike the loop, then a day trip to Lombok."),
                DestinationTimelineDay(day: "Day 10", title: "Depart", detail: "Morning boat back to Bali for your flight.")
            ],
            checklist: [
                "Book the fast boat to Gili Air",
                "Withdraw cash on Bali",
                "Confirm travel insurance covers diving",
                "Download offline maps & translation",
                "Buy a Telkomsel SIM"
            ],
            quickActions: [
                DestinationAction(icon: "book.closed.fill", label: "Guides", accent: theme.tint),
                DestinationAction(icon: "map.fill", label: "Map", accent: theme.ocean),
                DestinationAction(icon: "banknote.fill", label: "Budget", accent: theme.moss),
                DestinationAction(icon: "suitcase.fill", label: "Packing", accent: theme.sun),
                DestinationAction(icon: "cross.case.fill", label: "Emergency", accent: theme.coral)
            ],
            stats: [
                DestinationStat(value: "10", label: "Nights"),
                DestinationStat(value: "3", label: "Islands"),
                DestinationStat(value: "5", label: "Dives"),
                DestinationStat(value: "Rp 12m", label: "Budget")
            ],
            destination: .sampleGiliAir
        )
    }
}

struct TravelTripPlannerDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelTripPlannerDashboard(plan: .sampleGiliAir)
                .previewDisplayName("Trip planner · Gili Air")

            TravelTripPlannerDashboard(plan: .sampleGiliAir)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Trip planner · Dynamic Type XL")
        }
    }
}
#endif
