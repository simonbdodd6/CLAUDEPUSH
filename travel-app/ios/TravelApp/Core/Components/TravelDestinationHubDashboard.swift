import SwiftUI

// MARK: - Travel destination hub dashboard (Phase 137)
//
// A flagship, presentation-only Destination Hub: the primary landing page when a
// traveller opens a destination (e.g. Bali). It gathers an immersive hero, a
// destination-readiness score with best-time and current-weather placeholders, at-a-
// glance facts, top experiences, a grid of module snapshots (accommodation, food,
// transport, ferries, surf, diving, snorkelling, wildlife, health & safety, currency,
// connectivity, visa, culture, weather), a suggested-itinerary preview, a trip-timeline
// preview, a nearby-islands preview, island-comparison and emergency-info shortcuts, an
// interactive map placeholder and a continue-exploring button. A caller supplies a
// `HubGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumMetricTile`, `PremiumProgressBar`, `PremiumRingProgress`,
// `PremiumAdaptiveGrid`, `MapTexturePlaceholder`, `TravelTypography` and the tokens.
// The `Hub*` model names are deliberately distinct from earlier phases to avoid any
// collision. `HubGuide` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// shortcuts, favourite toggle and continue button are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button kept
// independently focusable; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion is disabled under Reduce Motion.

/// A single at-a-glance destination fact.
struct HubFact: Identifiable {
    let id = UUID()
    var value: String
    var label: String
}

/// A module snapshot tile, with an optional 0–4 rating.
struct HubSnapshot: Identifiable {
    let id: String
    var title: String
    var icon: String
    var headline: String
    var detail: String
    var accent: Color
    var rating: Int?

    init(title: String, icon: String, headline: String, detail: String, accent: Color, rating: Int? = nil) {
        self.id = title
        self.title = title
        self.icon = icon
        self.headline = headline
        self.detail = detail
        self.accent = accent
        self.rating = rating
    }
}

/// A top-experience card.
struct HubExperience: Identifiable {
    let id: String
    var title: String
    var category: String
    var icon: String
    var detail: String
    var accent: Color

    init(title: String, category: String, icon: String, detail: String, accent: Color) {
        self.id = title
        self.title = title
        self.category = category
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// A generic destination row reused for itinerary, timeline and nearby-islands previews.
struct HubRow: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
}

/// The full, presentation-only content for a destination hub.
struct HubGuide {
    var destination: String
    var subtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var bestTime: String
    var weatherNow: String
    var bestFor: String
    var readiness: Double
    var facts: [HubFact]
    var experiences: [HubExperience]
    var snapshots: [HubSnapshot]
    var itineraryPreview: [HubRow]
    var timelinePreview: [HubRow]
    var nearbyIslands: [HubRow]
    var disclaimer: String
}

/// A premium, presentation-only destination hub rendered from a `HubGuide`.
struct TravelDestinationHubDashboard: View {
    var guide: HubGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var isFavourite = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            hero
            topGroup
            experienceGroup
            snapshotsGroup
            previewGroup
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
            eyebrow: "Destination Hub",
            symbol: guide.heroSymbol,
            title: guide.destination,
            subtitle: guide.subtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: "\(percent(guide.readiness))%", label: "Ready"),
                HeroMetric(value: guide.bestTime, label: "Best time"),
                HeroMetric(value: "\(guide.snapshots.count)", label: "Guides")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(HubAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var topGroup: some View {
        Group {
            section("Destination ready", "How set up you are for here.", 1) {
                readinessCard
            }

            section("At a glance", "The essentials.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        PremiumMetricTile(value: fact.value, label: fact.label)
                    }
                }
            }
        }
    }

    private var experienceGroup: some View {
        Group {
            section("Top experiences", "The unmissables.", 3) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.experiences) { experience in
                        experienceCard(experience)
                    }
                }
            }
        }
    }

    private var snapshotsGroup: some View {
        Group {
            section("Everything here", "A snapshot of each guide.", 4) {
                PremiumAdaptiveGrid(minimumWidth: 168) {
                    ForEach(guide.snapshots) { snapshot in
                        snapshotTile(snapshot)
                    }
                }
            }
        }
    }

    private var previewGroup: some View {
        Group {
            section("Suggested itinerary", "A taste of the days.", 5) {
                infoList(guide.itineraryPreview)
            }

            section("Trip timeline", "How it flows.", 6) {
                infoList(guide.timelinePreview)
            }

            section("Nearby islands", "Where to go next.", 7) {
                infoList(guide.nearbyIslands)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Jump to", "Handy shortcuts.", 8) {
                HStack(spacing: TravelSpacing.md) {
                    shortcutCard("Compare islands", "map.fill", theme.tint)
                    shortcutCard("Emergency info", "cross.case.fill", theme.coral)
                }
            }

            section("Map", "Explore the area.", 8) {
                mapPlaceholder
            }

            section("Keep exploring", "Dive into the detail.", 8) {
                continueCard
            }

            section("Good to know", "About this hub.", 8) {
                disclaimerCard
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(HubAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Readiness card

    private var readinessCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(spacing: TravelSpacing.lg) {
                    PremiumRingProgress(
                        progress: appeared ? guide.readiness : 0,
                        colors: [theme.tint, theme.moss],
                        trackColor: Color.secondary.opacity(0.14),
                        lineWidth: 9
                    ) {
                        Text("\(percent(guide.readiness))%")
                            .font(TravelTypography.cardTitle)
                    }
                    .frame(width: 92, height: 92)
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text("Best for \(guide.bestFor)")
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(percent(guide.readiness))% of your guides are ready.")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    favouriteButton
                }
                HStack(spacing: TravelSpacing.xs) {
                    chip("sun.max.fill", "Best: \(guide.bestTime)", theme.sun)
                    chip("cloud.sun.fill", guide.weatherNow, theme.sky)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Destination readiness \(percent(guide.readiness)) percent. Best for \(guide.bestFor). Best time \(guide.bestTime). Weather now \(guide.weatherNow).")
    }

    private var favouriteButton: some View {
        Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { isFavourite.toggle() }
        } label: {
            Image(systemName: isFavourite ? "heart.fill" : "heart")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(isFavourite ? theme.coral : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFavourite ? "Saved destination \(guide.destination)" : "Save destination \(guide.destination)")
    }

    // MARK: Experience cards

    private func experienceCard(_ experience: HubExperience) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(experience.icon, experience.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(experience.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(experience.category, experience.accent)
                    }
                    Text(experience.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteStar("exp-\(experience.id)", experience.title)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(experience.title), \(experience.category). \(experience.detail)")
    }

    // MARK: Snapshot tiles

    private func snapshotTile(_ snapshot: HubSnapshot) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                HStack(alignment: .top, spacing: TravelSpacing.sm) {
                    Image(systemName: snapshot.icon)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(snapshot.accent)
                    Spacer(minLength: 0)
                    if let rating = snapshot.rating {
                        dots(rating, snapshot.accent)
                    }
                }
                Text(snapshot.title)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(snapshot.headline)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(snapshot.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(snapshot.title): \(snapshot.headline)\(snapshot.rating.map { ", \($0) of 4" } ?? ""). \(snapshot.detail)")
    }

    private func dots(_ level: Int, _ tint: Color) -> some View {
        HStack(spacing: 3) {
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .fill(index < level ? tint : Color.secondary.opacity(0.25))
                    .frame(width: 7, height: 7)
            }
        }
        .accessibilityHidden(true)
    }

    // MARK: Shortcuts

    private func shortcutCard(_ title: String, _ icon: String, _ accent: Color) -> some View {
        Button { } label: {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Image(systemName: icon)
                    .font(TravelTypography.title)
                    .foregroundStyle(accent)
                Text(title)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Label("Open", systemImage: "arrow.right")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(TravelSpacing.md)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title). Placeholder shortcut.")
    }

    // MARK: Continue button

    private var continueCard: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(TravelTypography.title)
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Continue exploring \(guide.destination)")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Open the full guides for everything here.")
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
        .accessibilityLabel("Continue exploring \(guide.destination). Placeholder button.")
    }

    // MARK: Map placeholder

    private var mapPlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("Interactive map of \(guide.destination) coming soon", systemImage: "map.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Interactive map of \(guide.destination). Placeholder.")
    }

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "info.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("A snapshot, not the full story")
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(guide.disclaimer)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("A snapshot, not the full story. \(guide.disclaimer)")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [HubRow]) -> some View {
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

    private func chip(_ icon: String, _ text: String, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: icon)
            Text(text)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
    }

    private func tagPill(_ text: String, _ tint: Color) -> some View {
        Text(text)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(tint)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(tint.opacity(0.15), in: Capsule())
    }

    private func favouriteStar(_ id: String, _ name: String) -> some View {
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
        .accessibilityLabel(isFav ? "Saved: \(name)" : "Save \(name)")
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

// MARK: - Destination hub appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct HubAppear: ViewModifier {
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
extension HubGuide {
    /// A deterministic sample destination hub for Bali.
    static var sampleBali: HubGuide {
        let theme = TravelTheme.current
        return HubGuide(
            destination: "Bali",
            subtitle: "Temples, surf, rice terraces and a launchpad to every island — your Bali home base.",
            heroSymbol: "leaf.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sun],
            bestTime: "Apr–Oct",
            weatherNow: "Sunny 30°C",
            bestFor: "first-timers & variety",
            readiness: 0.82,
            facts: [
                HubFact(value: "Apr–Oct", label: "Best time"),
                HubFact(value: "30°C", label: "Now"),
                HubFact(value: "IDR", label: "Currency"),
                HubFact(value: "Bahasa", label: "Language")
            ],
            experiences: [
                HubExperience(title: "Uluwatu temple & surf", category: "Iconic", icon: "figure.surfing", detail: "Clifftop temple, kecak fire dance at sunset and world-class waves below.", accent: theme.sky),
                HubExperience(title: "Ubud rice terraces", category: "Nature", icon: "leaf.fill", detail: "Tegallalang terraces, jungle villas and the Sacred Monkey Forest.", accent: theme.moss),
                HubExperience(title: "Mount Batur sunrise", category: "Adventure", icon: "mountain.2.fill", detail: "A pre-dawn volcano trek for sunrise above the clouds.", accent: theme.coral),
                HubExperience(title: "Nusa Penida day trip", category: "Day trip", icon: "water.waves", detail: "Kelingking Beach and manta snorkelling, a fast boat from Sanur.", accent: theme.ocean)
            ],
            snapshots: [
                HubSnapshot(title: "Accommodation", icon: "bed.double.fill", headline: "£8–£500/night", detail: "Hostels, homestays, hotels and private-pool villas everywhere.", accent: theme.tint),
                HubSnapshot(title: "Food", icon: "fork.knife", headline: "Rp 25k warungs", detail: "Cheap local warungs to beach clubs and fine dining.", accent: theme.sun),
                HubSnapshot(title: "Transport", icon: "car.fill", headline: "Gojek / Grab + driver", detail: "Ride apps, scooters and great-value private drivers.", accent: theme.ocean),
                HubSnapshot(title: "Ferries", icon: "ferry.fill", headline: "Hub to all islands", detail: "Fast boats from Sanur and Padang Bai to the Nusas, Gilis and Lombok.", accent: theme.sky),
                HubSnapshot(title: "Surf", icon: "figure.surfing", headline: "World-class", detail: "Uluwatu, Canggu and Keramas for every level.", accent: theme.sky, rating: 4),
                HubSnapshot(title: "Diving", icon: "water.waves", headline: "Good", detail: "Amed, Tulamben’s wreck and Nusa Penida’s mantas.", accent: theme.ocean, rating: 3),
                HubSnapshot(title: "Snorkelling", icon: "fish.fill", headline: "Good", detail: "Menjangan, Amed and the Nusa reefs.", accent: theme.tint, rating: 3),
                HubSnapshot(title: "Wildlife", icon: "pawprint.fill", headline: "Some", detail: "Monkeys, birds and rich marine life offshore.", accent: theme.moss, rating: 2),
                HubSnapshot(title: "Health & safety", icon: "cross.case.fill", headline: "Good hospitals", detail: "BIMC and Siloam; mind scooters and dengue.", accent: theme.coral),
                HubSnapshot(title: "Currency", icon: "banknote.fill", headline: "£1≈Rp20.4k", detail: "Cash and cards both widely used in towns.", accent: theme.moss),
                HubSnapshot(title: "Connectivity", icon: "wifi", headline: "Strong 4G", detail: "eSIMs and fast café Wi-Fi across the south.", accent: theme.tint, rating: 4),
                HubSnapshot(title: "Visa", icon: "doc.text.fill", headline: "VoA / e-VOA 30d", detail: "Visa on arrival for most, extendable once.", accent: theme.ocean),
                HubSnapshot(title: "Culture", icon: "hands.sparkles.fill", headline: "Hindu island", detail: "Temples, daily offerings and frequent ceremonies.", accent: theme.coral),
                HubSnapshot(title: "Weather", icon: "cloud.sun.fill", headline: "Dry Apr–Oct", detail: "Warm 30°C; wetter and humid Nov–Mar.", accent: theme.sun)
            ],
            itineraryPreview: [
                HubRow(title: "Days 1–2 · Canggu", subtitle: "Settle in", icon: "figure.surfing", detail: "Surf, cafés and sunset beach bars.", accent: theme.sky),
                HubRow(title: "Days 3–4 · Ubud", subtitle: "Culture", icon: "leaf.fill", detail: "Rice terraces, temples and a jungle villa.", accent: theme.moss),
                HubRow(title: "Day 5 · Nusa Penida", subtitle: "Day trip", icon: "water.waves", detail: "Kelingking Beach and manta snorkelling.", accent: theme.ocean),
                HubRow(title: "Day 6 · Uluwatu", subtitle: "Iconic", icon: "sunset.fill", detail: "Clifftop temple and the kecak dance.", accent: theme.coral)
            ],
            timelinePreview: [
                HubRow(title: "Arrive DPS", subtitle: "Day 1", icon: "airplane.arrival", detail: "Transfer to Canggu and unwind.", accent: theme.sky),
                HubRow(title: "Explore the south", subtitle: "Days 1–4", icon: "map.fill", detail: "Beaches, surf and Ubud’s culture.", accent: theme.tint),
                HubRow(title: "Island day trips", subtitle: "Days 5–6", icon: "ferry.fill", detail: "Nusa Penida and clifftop sunsets.", accent: theme.ocean),
                HubRow(title: "Onward to the islands", subtitle: "Day 7", icon: "arrow.right.circle.fill", detail: "Hop to the Gilis, Lombok or Komodo.", accent: theme.moss)
            ],
            nearbyIslands: [
                HubRow(title: "Nusa Penida", subtitle: "30–45 min", icon: "mountain.2.fill", detail: "Dramatic cliffs and manta snorkelling.", accent: theme.ocean),
                HubRow(title: "Nusa Lembongan", subtitle: "30 min", icon: "water.waves", detail: "Laid-back surf and snorkel island.", accent: theme.sky),
                HubRow(title: "Gili Islands", subtitle: "1.5–2.5 h", icon: "beach.umbrella.fill", detail: "Turtles, diving and no traffic.", accent: theme.moss),
                HubRow(title: "Lombok", subtitle: "Boat or flight", icon: "mountain.2.fill", detail: "Surf, Rinjani and quieter beaches.", accent: theme.sun)
            ],
            disclaimer: "This hub aggregates illustrative sample data to give a quick overview of a destination. Open the full guides and confirm current details with providers before you plan or book."
        )
    }
}

struct TravelDestinationHubDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDestinationHubDashboard(guide: .sampleBali)
                .previewDisplayName("Destination hub · Bali")

            TravelDestinationHubDashboard(guide: .sampleBali)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Destination hub · Dynamic Type XL")
        }
    }
}
#endif
