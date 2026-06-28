import SwiftUI

#if DEBUG

// MARK: - Destination overview dashboard (Phase 99)
//
// A DEBUG-only premium dashboard that feels like the first screen a traveller sees
// after selecting a destination (Gili Air). The whole file lives inside `#if
// DEBUG`, so it does not exist in release builds, is not wired into navigation, and
// modifies no production screen.
//
// It is composition glue only — it reuses the existing design system
// (`PremiumScrollView`, `PremiumSection`, `FeatureHeroScaffold`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumPillRow`, `PremiumMetricTile`,
// `PremiumProgressBar`, `PremiumTimelineConnector` and the design tokens) and
// references the existing `DestinationGuidePreview` and `TravelEssentialsHubPreview`
// (embedded as fixed-height, non-interactive visual previews — full-screen scroll
// views can't be nested interactively). The countdown, quick actions and
// "Continue planning" button are UI-only; nothing performs real navigation, data,
// networking, persistence, view-model or DTO work.
//
// Accessibility: cards expose combined VoiceOver labels; text uses the Dynamic
// Type-scaling `TravelTypography` styles and wraps rather than truncating; and all
// motion is disabled under Reduce Motion.

private struct OverviewExperience: Identifiable {
    let id: String
    let title: String
    let icon: String
    let gradient: [Color]
}

struct DestinationOverviewDashboard: View {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            immersiveHero
                .modifier(DashAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            countdownCard
                .modifier(DashAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            section("Trip at a glance", "Your plan in numbers.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 120) {
                    statTile("10", "Nights")
                    statTile("3", "Islands")
                    statTile("5", "Dives")
                    statTile("Rp 12m", "Budget")
                }
            }

            section("Quick actions", "Jump straight to what you need.", 3) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.md) {
                        ForEach(Array(quickActions.enumerated()), id: \.offset) { _, action in
                            actionChip(icon: action.0, label: action.1, accent: action.2)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }

            section("Today’s recommendations", "What to sort out next.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(Array(recommendations.enumerated()), id: \.offset) { _, rec in
                        recommendationCard(icon: rec.0, title: rec.1, detail: rec.2, accent: rec.3)
                    }
                }
            }

            section("Weather & budget", "The two numbers travellers check first.", 5) {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    weatherCard
                    budgetCard
                }
            }

            section("Essential guides", "Twelve practical guides, one tap away.", 6) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(Array(guideShortcuts.enumerated()), id: \.offset) { _, guide in
                        miniGuideCard(icon: guide.0, title: guide.1, accent: guide.2)
                    }
                }
            }

            section("Top experiences", "The best of Gili Air.", 7) {
                PremiumAdaptiveGrid(minimumWidth: 220) {
                    ForEach(experiences) { experience in
                        experienceCard(experience)
                    }
                }
            }

            section("Destination snapshots", "The practical essentials, summarised.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(Array(snapshots.enumerated()), id: \.offset) { _, snap in
                        PremiumPillRow(symbol: snap.0, accent: snap.3, title: snap.1, subtitle: snap.2, trailing: "Snapshot")
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(snap.1) snapshot. \(snap.2)")
                    }
                }
            }

            section("Packing reminder", "Don’t leave these behind.", 9) {
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion("suitcase.fill", theme.tint)
                        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                            ForEach(packingReminders, id: \.self) { item in
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

            section("Trip timeline", "A rough shape for your days.", 10) {
                VStack(spacing: 0) {
                    ForEach(Array(timeline.enumerated()), id: \.offset) { index, day in
                        timelineRow(day, isLast: index == timeline.count - 1)
                    }
                }
            }

            section("Continue planning", "Open the full guides for Gili Air.", 11) {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    previewTile("Full destination guide", DestinationGuidePreview())
                    previewTile("Travel Essentials hub", TravelEssentialsHubPreview())
                    continuePlanningButton
                }
            }
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
        .modifier(DashAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Hero & countdown

    private var immersiveHero: some View {
        FeatureHeroScaffold(
            eyebrow: "Indonesia · Lombok",
            symbol: "beach.umbrella.fill",
            title: "Gili Air",
            subtitle: "Your 10-night island escape — calm turtle reefs, sunset swings and no traffic.",
            gradient: [theme.ocean, theme.sky, theme.sun.opacity(0.6)],
            metrics: [
                HeroMetric(value: "14 days", label: "Until you go"),
                HeroMetric(value: "27–31°C", label: "Weather"),
                HeroMetric(value: "10 nights", label: "Trip length")
            ],
            texture: { MapTexturePlaceholder() }
        )
    }

    private var countdownCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text("Your trip starts in")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text("14")
                        .font(TravelTypography.display)
                        .monospacedDigit()
                    Text("days")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text("12–22 Aug 2025")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                PremiumProgressBar(
                    progress: appeared ? 0.7 : 0,
                    colors: [theme.tint, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("Planning 70% complete")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Your trip starts in 14 days, 12 to 22 August 2025. Planning 70 percent complete.")
    }

    // MARK: Cards & rows

    private func statTile(_ value: String, _ label: String) -> some View {
        PremiumMetricTile(value: value, label: label)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(value) \(label)")
    }

    private func actionChip(icon: String, label: String, accent: Color) -> some View {
        Button { } label: {
            VStack(spacing: TravelSpacing.xs) {
                Image(systemName: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(accent)
                    .frame(width: 54, height: 54)
                    .background(.thinMaterial, in: Circle())
                    .overlay(Circle().stroke(accent.opacity(0.3), lineWidth: 1))
                Text(label)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(width: 76)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label). Quick action.")
    }

    private func recommendationCard(icon: String, title: String, detail: String, accent: Color) -> some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                medallion(icon, accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(detail)
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
        .accessibilityLabel("\(title). \(detail)")
    }

    private var weatherCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(spacing: TravelSpacing.sm) {
                    medallion("cloud.sun.fill", theme.sun)
                    Text("Weather")
                        .font(TravelTypography.cardTitle)
                    Spacer(minLength: 0)
                }
                PremiumAdaptiveGrid(minimumWidth: 96) {
                    statTile("29°C", "Average")
                    statTile("Low", "Rain")
                    statTile("80%", "Humidity")
                }
                Text("Dry season — sunny and calm. Pack light, breathable clothing.")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var budgetCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(spacing: TravelSpacing.sm) {
                    medallion("banknote.fill", theme.moss)
                    Text("Daily budget")
                        .font(TravelTypography.cardTitle)
                    Spacer(minLength: 0)
                }
                VStack(spacing: TravelSpacing.xs) {
                    budgetRow("Backpacker", "Rp 350–600k", theme.moss)
                    budgetRow("Mid-range", "Rp 800k–1.5m", theme.sun)
                    budgetRow("Premium", "Rp 2.5m+", theme.coral)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func budgetRow(_ level: String, _ cost: String, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            Text(level)
                .textCase(.uppercase)
                .font(TravelTypography.eyebrow)
                .foregroundStyle(tint)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xxs)
                .background(tint.opacity(0.15), in: Capsule())
            Spacer(minLength: TravelSpacing.sm)
            Text(cost)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func miniGuideCard(icon: String, title: String, accent: Color) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                medallion(icon, accent)
                Text(title)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title) guide")
    }

    private func experienceCard(_ experience: OverviewExperience) -> some View {
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

    private func timelineRow(_ day: (String, String, String), isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            PremiumTimelineConnector(accent: theme.tint, showsLine: !isLast)
            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(day.0)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(day.1)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(day.2)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, isLast ? 0 : TravelSpacing.md)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(day.0), \(day.1). \(day.2)")
    }

    private func previewTile(_ label: String, _ preview: some View) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            preview
                .frame(height: 360)
                .clipShape(RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                        .stroke(.white.opacity(0.25), lineWidth: 1)
                )
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(label). Visual preview.")
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

    // MARK: Mock content

    private let quickActions: [(String, String, Color)] = [
        ("book.closed.fill", "Guides", TravelTheme.current.tint),
        ("map.fill", "Map", TravelTheme.current.ocean),
        ("banknote.fill", "Budget", TravelTheme.current.moss),
        ("suitcase.fill", "Packing", TravelTheme.current.sun),
        ("cross.case.fill", "Emergency", TravelTheme.current.coral)
    ]

    private let recommendations: [(String, String, String, Color)] = [
        ("ferry.fill", "Book your fast boat", "Morning crossings to Gili Air are calmest — reserve ahead.", TravelTheme.current.ocean),
        ("simcard.fill", "Sort your SIM on Bali", "Buy a Telkomsel SIM before you cross — island stores are limited.", TravelTheme.current.sky),
        ("drop.fill", "Pack reef-safe sunscreen", "It’s pricey and hard to find locally — bring your own.", TravelTheme.current.coral)
    ]

    private let guideShortcuts: [(String, String, Color)] = [
        ("car.fill", "Transport", TravelTheme.current.tint),
        ("checkmark.seal.fill", "Booking", TravelTheme.current.sky),
        ("ferry.fill", "Ferry", TravelTheme.current.ocean),
        ("exclamationmark.shield.fill", "Scam & Safety", TravelTheme.current.coral),
        ("cross.case.fill", "Emergency", TravelTheme.current.coral),
        ("wifi", "Connectivity", TravelTheme.current.sky),
        ("fork.knife", "Food Safety", TravelTheme.current.sun),
        ("heart.fill", "Health", TravelTheme.current.moss),
        ("suitcase.fill", "Packing", TravelTheme.current.tint),
        ("banknote.fill", "Budget", TravelTheme.current.moss),
        ("cloud.sun.fill", "Weather", TravelTheme.current.sun),
        ("hands.sparkles.fill", "Culture", TravelTheme.current.ocean)
    ]

    private let snapshots: [(String, String, String, Color)] = [
        ("car.fill", "Transport", "Car-free island — walk, cycle or take a cidomo pony cart.", TravelTheme.current.tint),
        ("ferry.fill", "Ferry", "Fast boats from Bali and Bangsal; book named operators only.", TravelTheme.current.ocean),
        ("cross.case.fill", "Emergency", "112 reaches all services; serious cases transfer to Lombok/Bali.", TravelTheme.current.coral),
        ("wifi", "Connectivity", "Buy a SIM on the mainland; 4G and café Wi-Fi are decent.", TravelTheme.current.sky),
        ("fork.knife", "Food & health", "Warungs and seafood; sealed water only; bring repellent.", TravelTheme.current.sun),
        ("hands.sparkles.fill", "Culture", "Muslim island — dress modestly off the beach; mind prayer times.", TravelTheme.current.moss)
    ]

    private let packingReminders: [String] = [
        "Reef-safe sunscreen, hat & sunglasses",
        "Snorkel/mask, rash vest & a dry bag",
        "Mosquito repellent & a small first-aid kit",
        "Plenty of cash — island ATMs are unreliable"
    ]

    private let timeline: [(String, String, String)] = [
        ("Day 1", "Arrive Gili Air", "Fast boat in, settle into your beach bungalow, sunset swim."),
        ("Day 3", "Dive & snorkel day", "Turtle reefs in the morning, freediving in the afternoon."),
        ("Day 6", "Island & Lombok", "Bike the island loop, then a day trip across to Lombok."),
        ("Day 10", "Depart", "Morning boat back to Bali for your onward flight.")
    ]

    private var experiences: [OverviewExperience] {
        [
            OverviewExperience(id: "turtles", title: "Snorkel with turtles", icon: "water.waves", gradient: [theme.ocean, theme.sky]),
            OverviewExperience(id: "sunset", title: "Sunset swings & bars", icon: "sunset.fill", gradient: [theme.coral, theme.sun]),
            OverviewExperience(id: "freedive", title: "Freediving & scuba", icon: "figure.open.water.swim", gradient: [theme.tint, theme.ocean])
        ]
    }
}

// MARK: - Dashboard appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct DashAppear: ViewModifier {
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

struct DestinationOverviewDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            DestinationOverviewDashboard()
                .previewDisplayName("Destination overview · Gili Air")

            DestinationOverviewDashboard()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Destination overview · Dynamic Type XL")
        }
    }
}

#endif
