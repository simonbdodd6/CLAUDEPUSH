import SwiftUI

// MARK: - Travel dive & surf guide (Phase 111)
//
// A premium Surf & Diving guide — the foundation for one of the app's flagship
// experiences. It covers best seasons, surf spots and dive sites (with skill,
// conditions, currents and visibility), marine-life highlights, a manta checklist,
// coral-reef health, equipment and certification advice, operators, boat reminders,
// surf etiquette, safety and emergency procedures, plus a UI-only favourites
// checklist. A caller supplies a `DiveSurfGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumPillRow`,
// `PremiumMetricTile`, `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and
// the tokens — and the Phase-101 `DestinationListItem`. `DiveSurfGuide` / `SurfSpot`
// / `DiveSite` are lightweight presentation models (not DTOs); the component holds
// no data, networking, persistence, repository, view-model, navigation, AppContainer
// or DTO logic, and is not wired into any screen. The checklists are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// Skill level required for a spot or site.
enum SkillLevel: CaseIterable {
    case beginner
    case intermediate
    case advanced

    var label: String {
        switch self {
        case .beginner: "Beginner"
        case .intermediate: "Intermediate"
        case .advanced: "Advanced"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .beginner: return theme.moss
        case .intermediate: return theme.sun
        case .advanced: return theme.coral
        }
    }
}

/// Strength of the current — shown as a three-segment meter.
enum CurrentStrength: CaseIterable {
    case mild
    case moderate
    case strong

    var label: String {
        switch self {
        case .mild: "Mild"
        case .moderate: "Moderate"
        case .strong: "Strong"
        }
    }

    var level: Int {
        switch self {
        case .mild: 1
        case .moderate: 2
        case .strong: 3
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .mild: return theme.moss
        case .moderate: return theme.sun
        case .strong: return theme.coral
        }
    }
}

/// A surf spot.
struct SurfSpot: Identifiable {
    let id: String
    var name: String
    var icon: String
    var skill: SkillLevel
    var waveHeight: String
    var swellDirection: String
    var bestTide: String
    var note: String
    var accent: Color

    init(id: String? = nil, name: String, icon: String = "figure.surfing", skill: SkillLevel, waveHeight: String, swellDirection: String, bestTide: String, note: String, accent: Color) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.skill = skill
        self.waveHeight = waveHeight
        self.swellDirection = swellDirection
        self.bestTide = bestTide
        self.note = note
        self.accent = accent
    }
}

/// A dive site.
struct DiveSite: Identifiable {
    let id: String
    var name: String
    var icon: String
    var skill: SkillLevel
    var depth: String
    var visibility: String
    var current: CurrentStrength
    var highlight: String
    var note: String
    var accent: Color

    init(id: String? = nil, name: String, icon: String = "water.waves", skill: SkillLevel, depth: String, visibility: String, current: CurrentStrength, highlight: String, note: String, accent: Color) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.skill = skill
        self.depth = depth
        self.visibility = visibility
        self.current = current
        self.highlight = highlight
        self.note = note
        self.accent = accent
    }
}

/// The full, presentation-only content for a dive & surf guide.
struct DiveSurfGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var bestSurfMonths: String
    var bestDiveMonths: String
    var waterTemp: String
    var favouriteLocations: [String]
    var surfSpots: [SurfSpot]
    var diveSites: [DiveSite]
    var marineLife: [DestinationListItem]
    var mantaChecklist: [String]
    var coralReefHealth: [String]
    var surfEquipment: [String]
    var diveEquipment: [String]
    var diveOperators: [DestinationListItem]
    var boatReminders: [String]
    var surfEtiquette: [String]
    var safetyAdvice: [String]
    var emergencyProcedures: [String]
}

/// A premium, presentation-only surf & diving guide rendered from a `DiveSurfGuide`.
struct TravelDiveSurfGuide: View {
    var guide: DiveSurfGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []
    @State private var mantasSeen: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: guide.heroSymbol,
                title: guide.heroTitle,
                subtitle: guide.heroSubtitle,
                gradient: guide.heroGradient,
                metrics: [
                    HeroMetric(value: guide.bestSurfMonths, label: "Best surf"),
                    HeroMetric(value: guide.bestDiveMonths, label: "Best dive"),
                    HeroMetric(value: guide.waterTemp, label: "Water")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(DiveSurfAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            seasonsGroup
            spotsGroup
            gearGroup
            safetyGroup
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Scroll sections (grouped to stay within the ViewBuilder arity limit)

    private var seasonsGroup: some View {
        Group {
            section("Seasons", "When the conditions are best.", 1) {
                GlassCard {
                    PremiumAdaptiveGrid(minimumWidth: 120) {
                        PremiumMetricTile(value: guide.bestSurfMonths, label: "Best surf")
                        PremiumMetricTile(value: guide.bestDiveMonths, label: "Best dive")
                        PremiumMetricTile(value: guide.waterTemp, label: "Water temp")
                    }
                }
                .accessibilityElement(children: .contain)
            }

            section("Favourite locations", "Tick your bucket-list spots.", 2) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(guide.favouriteLocations, id: \.self) { place in
                            checkRow(place, isOn: favourites.contains(place)) { toggle(&favourites, place) }
                        }
                    }
                }
            }
        }
    }

    private var spotsGroup: some View {
        Group {
            section("Surf spots", "Where and how to surf.", 3) {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(guide.surfSpots) { spot in
                        surfSpotCard(spot)
                    }
                }
            }

            section("Dive sites", "The reefs and pinnacles.", 4) {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(guide.diveSites) { site in
                        diveSiteCard(site)
                    }
                }
            }

            listSection("Marine life highlights", "What you’ll see down there.", guide.marineLife, tag: "Wildlife", 5)

            section("Manta ray checklist", "Tick off where you’ve seen them.", 6) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(guide.mantaChecklist, id: \.self) { spot in
                            checkRow(spot, isOn: mantasSeen.contains(spot)) { toggle(&mantasSeen, spot) }
                        }
                    }
                }
            }

            section("Coral reef health", "Protect what you came to see.", 7) {
                bulletCard(guide.coralReefHealth, icon: "leaf.fill", tint: theme.moss)
            }
        }
    }

    private var gearGroup: some View {
        Group {
            section("Surf equipment & boards", "What to ride and bring.", 8) {
                bulletCard(guide.surfEquipment, icon: "figure.surfing", tint: theme.sky)
            }

            section("Dive equipment & certification", "Gear up correctly.", 9) {
                bulletCard(guide.diveEquipment, icon: "water.waves", tint: theme.ocean)
            }

            listSection("Dive operators", "Reputable centres to book.", guide.diveOperators, tag: "Operator", 10)

            section("Boat departures", "Be ready on time.", 11) {
                bulletCard(guide.boatReminders, icon: "ferry.fill", tint: theme.tint)
            }

            section("Surf etiquette", "Respect the lineup.", 12) {
                bulletCard(guide.surfEtiquette, icon: "hand.raised.fill", tint: theme.sun)
            }
        }
    }

    private var safetyGroup: some View {
        Group {
            section("Safety advice", "Dive and surf within limits.", 13) {
                bulletCard(guide.safetyAdvice, icon: "checkmark.shield.fill", tint: theme.moss)
            }

            section("Emergency procedures", "If something goes wrong.", 14) {
                numberedCard(guide.emergencyProcedures, tint: theme.coral)
            }
        }
    }

    // MARK: Section helpers

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(DiveSurfAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
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

    // MARK: Spot & site cards

    private func surfSpotCard(_ spot: SurfSpot) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(spot.icon, spot.accent)
                    Spacer(minLength: 0)
                    skillBadge(spot.skill)
                }
                Text(spot.name)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                statLine("Wave height", spot.waveHeight)
                statLine("Swell", spot.swellDirection)
                statLine("Best tide", spot.bestTide)
                Text(spot.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(spot.name), \(spot.skill.label). Wave height \(spot.waveHeight), swell \(spot.swellDirection), best tide \(spot.bestTide). \(spot.note)")
    }

    private func diveSiteCard(_ site: DiveSite) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(site.icon, site.accent)
                    Spacer(minLength: 0)
                    skillBadge(site.skill)
                }
                Text(site.name)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                statLine("Depth", site.depth)
                statLine("Visibility", site.visibility)
                currentMeter(site.current)
                statLine("Highlight", site.highlight)
                Text(site.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(site.name), \(site.skill.label). Depth \(site.depth), visibility \(site.visibility), \(site.current.label) current. Highlight \(site.highlight). \(site.note)")
    }

    private func statLine(_ label: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Spacer(minLength: TravelSpacing.sm)
            Text(value)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func currentMeter(_ current: CurrentStrength) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            Text("Current")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Spacer(minLength: TravelSpacing.sm)
            HStack(spacing: TravelSpacing.xxs) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index < current.level ? current.accent : Color.secondary.opacity(0.22))
                        .frame(width: 14, height: 5)
                }
                Text(current.label)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func skillBadge(_ skill: SkillLevel) -> some View {
        Text(skill.label)
            .textCase(.uppercase)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(.white)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(skill.accent, in: Capsule())
            .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    // MARK: Generic cards & rows

    private func bulletCard(_ points: [String], icon: String, tint: Color) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                ForEach(points, id: \.self) { point in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(point)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func numberedCard(_ steps: [String], tint: Color) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Text("\(index + 1)")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.white)
                            .frame(width: 22, height: 22)
                            .background(tint, in: Circle())
                        Text(step)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func checkRow(_ item: String, isOn: Bool, _ action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { action() }
        } label: {
            HStack(alignment: .top, spacing: TravelSpacing.sm) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isOn ? theme.moss : Color.secondary)
                Text(item)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isOn ? .secondary : .primary)
                    .strikethrough(isOn, color: .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item)
        .accessibilityValue(isOn ? "Done" : "Not done")
        .accessibilityHint("Double tap to toggle")
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

    private func toggle(_ set: inout Set<String>, _ key: String) {
        if set.contains(key) { set.remove(key) } else { set.insert(key) }
    }
}

// MARK: - Dive & surf appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct DiveSurfAppear: ViewModifier {
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
extension DiveSurfGuide {
    /// A deterministic sample surf & dive guide for Indonesia.
    static var sampleIndonesia: DiveSurfGuide {
        let theme = TravelTheme.current
        return DiveSurfGuide(
            heroTitle: "Surf & Dive",
            heroSubtitle: "World-class waves and reefs across Bali, Lombok, the Gilis, Nusa, Komodo and Raja Ampat.",
            heroSymbol: "water.waves",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            bestSurfMonths: "Apr–Oct",
            bestDiveMonths: "Year-round",
            waterTemp: "27–29°C",
            favouriteLocations: ["Uluwatu (Bali)", "Canggu (Bali)", "Desert Point (Lombok)", "Gili Shark Point", "Manta Point (Penida)", "Batu Bolong (Komodo)", "Cape Kri (Raja Ampat)"],
            surfSpots: [
                SurfSpot(name: "Uluwatu (Bali)", skill: .advanced, waveHeight: "2–4m", swellDirection: "SW swell", bestTide: "Mid–high", note: "Iconic reef left — powerful and not for beginners.", accent: theme.ocean),
                SurfSpot(name: "Padang Padang (Bali)", skill: .advanced, waveHeight: "1.5–3m", swellDirection: "SW swell", bestTide: "Mid", note: "The ‘Balinese Pipeline’ — a heavy, hollow barrel.", accent: theme.coral),
                SurfSpot(name: "Canggu / Batu Bolong (Bali)", skill: .beginner, waveHeight: "0.5–1.5m", swellDirection: "SW swell", bestTide: "All tides", note: "Forgiving beach and reef — a great place to learn.", accent: theme.moss),
                SurfSpot(name: "Desert Point (Lombok)", skill: .advanced, waveHeight: "1.5–3m", swellDirection: "SW swell", bestTide: "Mid", note: "A long, fast left — world-class but fickle.", accent: theme.ocean),
                SurfSpot(name: "Lacerations (Nusa Lembongan)", skill: .intermediate, waveHeight: "1–2m", swellDirection: "S/SW swell", bestTide: "Mid–high", note: "Punchy reef right; sharp, shallow reef below.", accent: theme.sun)
            ],
            diveSites: [
                DiveSite(name: "Shark Point (Gili Trawangan)", skill: .beginner, depth: "5–18m", visibility: "15–25m", current: .mild, highlight: "Reef sharks & turtles", note: "Easy reef dive with regular blacktip sharks.", accent: theme.ocean),
                DiveSite(name: "Turtle Point (Gili Meno)", skill: .beginner, depth: "5–15m", visibility: "15–25m", current: .mild, highlight: "Green turtles", note: "Almost-guaranteed turtle sightings.", accent: theme.moss),
                DiveSite(name: "Meno Wall (Gili Air)", skill: .intermediate, depth: "5–22m", visibility: "15–30m", current: .moderate, highlight: "Turtles & schooling fish", note: "A sloping wall with great visibility.", accent: theme.sky),
                DiveSite(name: "Manta Point (Nusa Penida)", skill: .intermediate, depth: "5–15m", visibility: "8–20m", current: .moderate, highlight: "Reef mantas", note: "A cleaning station — can be surgy.", accent: theme.ocean),
                DiveSite(name: "Crystal Bay (Nusa Penida)", skill: .advanced, depth: "5–30m", visibility: "15–30m", current: .strong, highlight: "Mola mola (Jul–Oct)", note: "Cold thermoclines and strong currents.", accent: theme.coral),
                DiveSite(name: "Batu Bolong (Komodo)", skill: .advanced, depth: "5–25m", visibility: "15–30m", current: .strong, highlight: "Reef sharks & mantas", note: "A pinnacle bursting with life; strong rips.", accent: theme.tint),
                DiveSite(name: "Cape Kri (Raja Ampat)", skill: .intermediate, depth: "5–30m", visibility: "15–30m", current: .strong, highlight: "Record fish diversity", note: "Among the richest reefs on the planet.", accent: theme.ocean)
            ],
            marineLife: [
                DestinationListItem(icon: "water.waves", title: "Manta rays", detail: "Reef mantas at Penida, Komodo & Raja Ampat — peak Apr–Nov.", accent: theme.ocean),
                DestinationListItem(icon: "fish.fill", title: "Reef sharks", detail: "Blacktip & whitetip at Gili Shark Point, Komodo, Raja Ampat — harmless.", accent: theme.tint),
                DestinationListItem(icon: "tortoise.fill", title: "Sea turtles", detail: "Green & hawksbill off Gili Air and Meno — almost guaranteed.", accent: theme.moss),
                DestinationListItem(icon: "fish.fill", title: "Mola mola (sunfish)", detail: "Seasonal (Jul–Oct) in Nusa Penida’s cold water.", accent: theme.sky),
                DestinationListItem(icon: "leaf.fill", title: "Macro life", detail: "Pygmy seahorses and critters across Raja Ampat & Komodo.", accent: theme.coral)
            ],
            mantaChecklist: ["Manta Point (Nusa Penida)", "Manta Alley (Komodo)", "Karang Makassar (Komodo)", "Manta Sandy (Raja Ampat)", "Blue Magic (Raja Ampat)"],
            coralReefHealth: [
                "Never touch, kick or stand on the reef.",
                "Reef-safe sunscreen only.",
                "Perfect your buoyancy before any reef dive.",
                "Raja Ampat and Komodo reefs are among Earth’s healthiest — keep them that way."
            ],
            surfEquipment: [
                "Beginners: a soft-top or mid-length (7–8ft) at Canggu or Kuta.",
                "Reef breaks: a performance shortboard and spare leashes.",
                "Always bring reef booties — Bali and Lombok reefs are sharp.",
                "Rent boards locally; pack a ding-repair kit if flying your own."
            ],
            diveEquipment: [
                "Open Water is fine for the Gilis; Advanced is wise for Penida/Komodo currents.",
                "Bring your own mask and dive computer; rent tanks, BCD and weights.",
                "Nitrox helps on multi-dive days.",
                "Strong currents (Komodo, Penida): a reef hook and SMB are essential."
            ],
            diveOperators: [
                DestinationListItem(icon: "water.waves", title: "Blue Marlin Dive (Gilis)", detail: "Long-established PADI/SSI centre.", accent: theme.ocean),
                DestinationListItem(icon: "water.waves", title: "Manta Dive (Gili T / Lembongan)", detail: "Well-run and eco-focused.", accent: theme.moss),
                DestinationListItem(icon: "sailboat.fill", title: "Papua Explorers (Raja Ampat)", detail: "Resort and liveaboard dive base.", accent: theme.sky),
                DestinationListItem(icon: "sailboat.fill", title: "Licensed Komodo liveaboards", detail: "For Komodo’s remote sites.", accent: theme.coral)
            ],
            boatReminders: [
                "Confirm your pickup time the night before.",
                "Morning departures have the calmest seas and best light.",
                "Check the boat carries oxygen, a radio and an SMB.",
                "Allow 18–24 hours after diving before flying."
            ],
            surfEtiquette: [
                "The surfer closest to the peak has priority — don’t drop in.",
                "Wait your turn in the lineup and respect local priority.",
                "Apologise if you make a mistake.",
                "Don’t paddle straight through the takeoff zone."
            ],
            safetyAdvice: [
                "Dive within your certification and depth limits.",
                "Never dive or surf alone; tell someone your plan.",
                "Watch for rip currents — swim parallel to shore to escape.",
                "Hydrate; tropical sun and salt water dehydrate you fast."
            ],
            emergencyProcedures: [
                "Suspected decompression sickness: stop diving, give oxygen, contact a chamber or DAN.",
                "Call 112 (general emergency) or 115 (BASARNAS sea rescue).",
                "Nearest chamber: Sanglah Hospital, Denpasar (Bali) — confirm before remote trips.",
                "Carry DAN dive insurance; serious cases evacuate to Bali."
            ]
        )
    }
}

struct TravelDiveSurfGuide_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDiveSurfGuide(guide: .sampleIndonesia)
                .previewDisplayName("Surf & dive · Indonesia")

            TravelDiveSurfGuide(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Surf & dive · Dynamic Type XL")
        }
    }
}
#endif
