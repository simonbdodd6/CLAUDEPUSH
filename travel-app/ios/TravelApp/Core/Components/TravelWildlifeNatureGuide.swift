import SwiftUI

// MARK: - Travel wildlife & nature guide (Phase 105)
//
// A premium Wildlife & Nature guide: animals to see, marine life, creatures to
// treat with caution, insects and bite prevention, plant/coral/reef safety,
// responsible wildlife behaviour and first-aid for bites and stings. A caller
// supplies a `WildlifeGuide` value; the component offers a premium expandable
// layout and a compact summary layout.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumPillRow`,
// `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and the tokens — and the
// Phase-101 `DestinationListItem` for the first-aid rows. `WildlifeGuide` /
// `WildlifeItem` are lightweight presentation models (not DTOs); the component holds
// no data, networking, persistence, repository, view-model, navigation,
// AppContainer or DTO logic, and is not wired into any screen. The spotting
// checklist toggles are UI-only (presentation `@State`).
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// How dangerous a creature is — drives the safety badge.
enum WildlifeSafety: CaseIterable {
    case safe
    case caution
    case danger

    var label: String {
        switch self {
        case .safe: "Safe"
        case .caution: "Caution"
        case .danger: "Dangerous"
        }
    }

    var icon: String {
        switch self {
        case .safe: "checkmark.seal.fill"
        case .caution: "exclamationmark.triangle.fill"
        case .danger: "exclamationmark.octagon.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .safe: return theme.moss
        case .caution: return theme.sun
        case .danger: return theme.coral
        }
    }
}

/// Where a creature fits in the guide — drives the section grouping (in order).
enum WildlifeCategory: CaseIterable {
    case marine
    case land
    case caution
    case insect
    case plant

    var title: String {
        switch self {
        case .marine: "Marine life"
        case .land: "On land"
        case .caution: "Creatures to avoid"
        case .insect: "Insects & bites"
        case .plant: "Plants, coral & reef"
        }
    }
}

/// A single, presentation-only wildlife entry.
struct WildlifeItem: Identifiable {
    let id: String
    var name: String
    var icon: String
    var category: WildlifeCategory
    var safety: WildlifeSafety
    var overview: String
    var whereToSee: String
    var behaviour: [String]
    var ifEncountered: String
    var expertTip: String
    var accent: Color

    init(
        id: String? = nil,
        name: String,
        icon: String,
        category: WildlifeCategory,
        safety: WildlifeSafety,
        overview: String,
        whereToSee: String,
        behaviour: [String],
        ifEncountered: String,
        expertTip: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.category = category
        self.safety = safety
        self.overview = overview
        self.whereToSee = whereToSee
        self.behaviour = behaviour
        self.ifEncountered = ifEncountered
        self.expertTip = expertTip
        self.accent = accent
    }

    var accessibilityText: String {
        [
            name,
            safety.label,
            "overview: \(overview)",
            "where to see: \(whereToSee)",
            "behaviour: \(behaviour.joined(separator: "; "))",
            "if encountered: \(ifEncountered)",
            "tip: \(expertTip)"
        ].joined(separator: ", ")
    }
}

/// The full, presentation-only content for a wildlife guide.
struct WildlifeGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var spottingChecklist: [String]
    var items: [WildlifeItem]
    var responsibleBehaviour: [String]
    var firstAid: [DestinationListItem]
}

/// Layout density for a `TravelWildlifeNatureGuide`.
enum WildlifeLayout {
    case compact
    case expanded
}

/// A premium, presentation-only wildlife & nature guide.
struct TravelWildlifeNatureGuide: View {
    var guide: WildlifeGuide
    var layout: WildlifeLayout = .expanded

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var spotted: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        Group {
            switch layout {
            case .expanded: expanded
            case .compact: compact
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

    // MARK: Expanded

    private var expanded: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: guide.heroSymbol,
                title: guide.heroTitle,
                subtitle: guide.heroSubtitle,
                gradient: guide.heroGradient,
                metrics: [
                    HeroMetric(value: "\(guide.items.count)", label: "Species"),
                    HeroMetric(value: "\(guide.items.filter { $0.safety == .danger }.count)", label: "To respect"),
                    HeroMetric(value: "\(guide.spottingChecklist.count)", label: "To spot")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(WildlifeAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            section("Spotting checklist", "Tick off what you see.", 1) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(guide.spottingChecklist, id: \.self) { species in
                            spottingRow(species)
                        }
                    }
                }
            }

            ForEach(Array(WildlifeCategory.allCases.enumerated()), id: \.offset) { offset, category in
                let items = guide.items.filter { $0.category == category }
                if !items.isEmpty {
                    section(category.title, "\(items.count) to know.", offset + 2) {
                        VStack(spacing: TravelSpacing.md) {
                            ForEach(items) { item in
                                WildlifeCard(item: item, startsExpanded: false)
                            }
                        }
                    }
                }
            }

            section("Responsible wildlife behaviour", "Be a guest, not a disruptor.", 8) {
                bulletCard(guide.responsibleBehaviour, icon: "leaf.fill", tint: theme.moss)
            }

            section("If bitten or stung", "Act fast and stay calm.", 9) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.firstAid) { item in
                        firstAidRow(item)
                    }
                }
            }
        }
    }

    // MARK: Compact

    private var compact: some View {
        PremiumScrollView {
            section("Wildlife at a glance", "Every creature, with its safety level.", 0) {
                GlassCard {
                    VStack(spacing: TravelSpacing.sm) {
                        ForEach(guide.items) { item in
                            PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.name, subtitle: item.whereToSee, trailing: item.safety.label)
                                .accessibilityElement(children: .ignore)
                                .accessibilityLabel("\(item.name), \(item.safety.label). \(item.whereToSee)")
                        }
                    }
                }
            }

            section("Responsible behaviour", "The essentials.", 1) {
                bulletCard(guide.responsibleBehaviour, icon: "leaf.fill", tint: theme.moss)
            }

            section("If bitten or stung", "Quick first aid.", 2) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.firstAid) { item in
                        firstAidRow(item)
                    }
                }
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(WildlifeAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Pieces

    private func spottingRow(_ species: String) -> some View {
        let isSpotted = spotted.contains(species)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isSpotted { spotted.remove(species) } else { spotted.insert(species) }
            }
        } label: {
            HStack(spacing: TravelSpacing.sm) {
                Image(systemName: isSpotted ? "checkmark.circle.fill" : "circle")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isSpotted ? theme.moss : Color.secondary)
                Text(species)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isSpotted ? .secondary : .primary)
                    .strikethrough(isSpotted, color: .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Spotted \(species)")
        .accessibilityValue(isSpotted ? "Yes" : "No")
        .accessibilityHint("Double tap to toggle")
    }

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

    private func firstAidRow(_ item: DestinationListItem) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: item.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(
                        LinearGradient(colors: [item.accent, item.accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    )
                    .accessibilityHidden(true)
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
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(item.title). \(item.detail)")
    }
}

// MARK: - Wildlife card

/// A premium expandable GlassCard for one creature: a summary (name, safety) that
/// expands to where to see it, how to behave, what to do if encountered and an
/// expert tip. The whole card is a single VoiceOver element, and all motion is
/// disabled under Reduce Motion.
private struct WildlifeCard: View {
    let item: WildlifeItem
    var startsExpanded: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded = false

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                summary
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { expanded.toggle() }
                    }

                if expanded {
                    Divider()
                    detail
                }
            }
        }
        .onAppear { expanded = startsExpanded }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.accessibilityText)
        .accessibilityHint(expanded ? "Showing details" : "Double tap to show details")
    }

    private var summary: some View {
        HStack(spacing: TravelSpacing.md) {
            medallion

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(item.name)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.overview)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(expanded ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                safetyBadge
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            detailRow(icon: "mappin.and.ellipse", label: "Where to see", value: item.whereToSee)

            labeledList("How to behave", item.behaviour, icon: "checkmark.circle.fill", tint: TravelTheme.current.moss)

            calloutRow(icon: "cross.case.fill", tint: TravelTheme.current.coral, label: "If encountered", text: item.ifEncountered)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Expert tip", text: item.expertTip)
        }
    }

    private var medallion: some View {
        Image(systemName: item.icon)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(colors: [item.accent, item.accent.opacity(0.7)], startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: item.accent.opacity(0.3), radius: 8, y: 4)
    }

    private var safetyBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: item.safety.icon)
            Text(item.safety.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(item.safety.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(TravelTypography.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func labeledList(_ label: String, _ items: [String], icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                ForEach(items, id: \.self) { entry in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(entry)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func calloutRow(icon: String, tint: Color, label: String, text: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(text)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

// MARK: - Wildlife appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct WildlifeAppear: ViewModifier {
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
extension WildlifeGuide {
    /// A deterministic sample wildlife guide for Indonesia.
    static var sampleIndonesia: WildlifeGuide {
        let theme = TravelTheme.current
        return WildlifeGuide(
            heroTitle: "Wildlife & Nature",
            heroSubtitle: "What to see, what to respect, and how to stay safe across Bali, Lombok, the Gilis, Komodo & Raja Ampat.",
            heroSymbol: "pawprint.fill",
            heroGradient: [theme.moss, theme.ocean, theme.sky],
            spottingChecklist: ["Green turtle", "Manta ray", "Reef shark", "Komodo dragon", "Macaque", "Monitor lizard"],
            items: [
                WildlifeItem(name: "Reef sharks", icon: "fish.fill", category: .marine, safety: .safe,
                             overview: "Blacktip and whitetip reef sharks — shy and harmless to divers.",
                             whereToSee: "Gili Islands, Komodo, Raja Ampat.",
                             behaviour: ["Keep a respectful distance", "Don’t chase or corner them", "No flash photography"],
                             ifEncountered: "Harmless — stay still, breathe slowly and enjoy the sighting.",
                             expertTip: "Dawn dives at the Gilis’ Shark Point offer the best chance.", accent: theme.ocean),
                WildlifeItem(name: "Turtles", icon: "tortoise.fill", category: .marine, safety: .safe,
                             overview: "Green and hawksbill turtles graze the shallow reefs.",
                             whereToSee: "Gili Air, Gili Meno, Nusa Penida.",
                             behaviour: ["Never touch or ride them", "Stay about 3m back", "Don’t block their path to the surface"],
                             ifEncountered: "Just watch — they surface to breathe and move on.",
                             expertTip: "Gili Meno’s ‘turtle point’ is almost a guarantee.", accent: theme.moss),
                WildlifeItem(name: "Manta rays", icon: "water.waves", category: .marine, safety: .safe,
                             overview: "Giant reef mantas glide through cleaning stations.",
                             whereToSee: "Nusa Penida (Manta Point), Komodo, Raja Ampat.",
                             behaviour: ["No touching — it strips their protective coating", "Stay low and still", "Approach from the side, never above"],
                             ifEncountered: "Harmless filter feeders — keep calm and let them come to you.",
                             expertTip: "Komodo’s manta season runs April–November.", accent: theme.ocean),
                WildlifeItem(name: "Monkeys (macaques)", icon: "pawprint.fill", category: .land, safety: .caution,
                             overview: "Long-tailed macaques — clever, bold and quick to steal.",
                             whereToSee: "Ubud Monkey Forest, Uluwatu, many Bali temples.",
                             behaviour: ["Don’t feed them or make eye contact", "Hide food, sunglasses and phones", "Don’t bare your teeth — it reads as a threat"],
                             ifEncountered: "Bites or scratches are a rabies risk — wash 15 minutes and get PEP the same day.",
                             expertTip: "Leave valuables behind at Uluwatu — monkeys snatch and ‘barter’.", accent: theme.coral),
                WildlifeItem(name: "Geckos", icon: "lizard.fill", category: .land, safety: .safe,
                             overview: "Tokay and house geckos — harmless and everywhere.",
                             whereToSee: "Walls and ceilings across Bali and Lombok.",
                             behaviour: ["Leave them be — they eat mosquitoes", "Don’t try to handle them"],
                             ifEncountered: "Harmless; the loud ‘geck-o’ call at night is normal.",
                             expertTip: "A resident gecko is free pest control — welcome it.", accent: theme.moss),
                WildlifeItem(name: "Monitor lizards", icon: "lizard.fill", category: .land, safety: .caution,
                             overview: "Water monitors up to 1.5m — generally shy.",
                             whereToSee: "Bali rivers and mangroves, Komodo NP.",
                             behaviour: ["Give them plenty of space", "Don’t corner or provoke one", "Keep food sealed"],
                             ifEncountered: "Back away slowly; bites can be infectious — clean it and see a doctor.",
                             expertTip: "Often seen near water at dawn — a great photo from a distance.", accent: theme.sun),
                WildlifeItem(name: "Komodo dragons", icon: "lizard.fill", category: .land, safety: .danger,
                             overview: "The world’s largest lizard — a venomous bite and fast over short bursts.",
                             whereToSee: "Komodo and Rinca Islands only.",
                             behaviour: ["Stay with a licensed ranger at all times", "Keep well back", "Never wander off from the group"],
                             ifEncountered: "A bite is a medical emergency — rangers carry first aid; evacuate fast.",
                             expertTip: "Only ever trek Komodo with the official park ranger — non-negotiable.", accent: theme.coral),
                WildlifeItem(name: "Stray dogs", icon: "pawprint.fill", category: .caution, safety: .danger,
                             overview: "Free-roaming dogs across Bali — the main rabies risk.",
                             whereToSee: "Bali and Lombok, especially rural areas and beaches.",
                             behaviour: ["Don’t approach, pet or feed them", "Avoid eye contact and walking alone at night", "Stand still if one approaches"],
                             ifEncountered: "Any bite or scratch: wash 15 minutes and get rabies PEP the same day.",
                             expertTip: "Carry a stick or some stones on quiet beaches to deter packs.", accent: theme.coral),
                WildlifeItem(name: "Sea snakes", icon: "water.waves", category: .caution, safety: .danger,
                             overview: "Banded sea kraits — highly venomous but extremely docile.",
                             whereToSee: "Reefs across the Gilis, Komodo and Raja Ampat.",
                             behaviour: ["Look, don’t touch", "Don’t corner one in a crevice", "Give it room to surface for air"],
                             ifEncountered: "Bites are very rare; if bitten, immobilise the limb and get antivenom urgently.",
                             expertTip: "Curious and harmless if left alone — a diver favourite.", accent: theme.ocean),
                WildlifeItem(name: "Stonefish", icon: "fish.fill", category: .caution, safety: .danger,
                             overview: "The world’s most venomous fish — perfectly camouflaged on reef and sand.",
                             whereToSee: "Shallow reefs and sandy lagoons everywhere.",
                             behaviour: ["Never touch the reef or rest on the bottom", "Wear reef booties in the shallows", "Shuffle your feet in sandy shallows"],
                             ifEncountered: "A sting is agonising — immerse in hot water (≈45°C) and get medical help fast.",
                             expertTip: "Reef booties prevent most stings — wear them wading.", accent: theme.sun),
                WildlifeItem(name: "Jellyfish", icon: "drop.fill", category: .caution, safety: .caution,
                             overview: "Mostly mild seasonal stingers; box jellyfish are rare but serious.",
                             whereToSee: "Open water and some beaches, seasonally.",
                             behaviour: ["Check local conditions before swimming", "Don’t touch jellyfish, alive or beached", "A rash vest helps a lot"],
                             ifEncountered: "Rinse with vinegar (not fresh water), remove tentacles, get help if severe.",
                             expertTip: "A full rash vest blocks most minor stings.", accent: theme.ocean),
                WildlifeItem(name: "Mosquitoes", icon: "ant.fill", category: .insect, safety: .caution,
                             overview: "Daytime Aedes carry dengue; they bite at dawn and dusk too.",
                             whereToSee: "All of Indonesia, worse in the wet season.",
                             behaviour: ["Repellent (DEET/picaridin) day and night", "Cover up at dawn and dusk", "Clear standing water near you"],
                             ifEncountered: "A high fever after bites — get a dengue test promptly.",
                             expertTip: "Use repellent in the daytime too — Aedes bites by day.", accent: theme.coral),
                WildlifeItem(name: "Coral reefs", icon: "leaf.fill", category: .plant, safety: .caution,
                             overview: "Living, fragile and easily damaged — and some corals sting or cut.",
                             whereToSee: "Reefs across the Gilis, Nusa Penida, Komodo and Raja Ampat.",
                             behaviour: ["Never touch, stand on or kick the reef", "Reef-safe sunscreen only", "Watch your fins and gauges near coral"],
                             ifEncountered: "Coral cuts infect fast — clean immediately with antiseptic.",
                             expertTip: "Perfect your buoyancy before reef dives — it protects you and the reef.", accent: theme.sky)
            ],
            responsibleBehaviour: [
                "Never feed, touch or chase wild animals.",
                "Keep a respectful distance and never block an animal’s escape route.",
                "Use reef-safe sunscreen and perfect your buoyancy on reefs.",
                "Choose ethical operators — no captive-animal selfies or rides.",
                "Take only photos; leave shells, coral and animals where they are."
            ],
            firstAid: [
                DestinationListItem(icon: "pawprint.fill", title: "Animal bite or scratch", detail: "Wash 15 minutes with soap and water; get rabies PEP the same day.", accent: theme.coral),
                DestinationListItem(icon: "water.waves", title: "Stonefish / stingray sting", detail: "Immerse in hot water (≈45°C) and seek urgent medical help.", accent: theme.sun),
                DestinationListItem(icon: "drop.fill", title: "Jellyfish sting", detail: "Rinse with vinegar, remove tentacles, watch for a severe reaction.", accent: theme.ocean),
                DestinationListItem(icon: "cross.case.fill", title: "Any severe reaction", detail: "Call 112; serious cases transfer to Lombok or Bali hospitals.", accent: theme.coral)
            ]
        )
    }
}

struct TravelWildlifeNatureGuide_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelWildlifeNatureGuide(guide: .sampleIndonesia, layout: .expanded)
                .previewDisplayName("Wildlife & nature · Expanded")

            TravelWildlifeNatureGuide(guide: .sampleIndonesia, layout: .compact)
                .previewDisplayName("Wildlife & nature · Compact")

            TravelWildlifeNatureGuide(guide: .sampleIndonesia, layout: .expanded)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Wildlife & nature · Dynamic Type XL")
        }
    }
}
#endif
