import SwiftUI

// MARK: - Travel snorkel guide dashboard (Phase 116)
//
// A flagship, presentation-only Snorkel Guide: the hub for snorkelling a region —
// a hero with at-a-glance facts, a filterable list of top snorkel sites (entry type,
// recommended depth range, current strength, best tide, best time of day, ability
// badge and marine-life sightings), a marine-life spotting guide, turtle and manta
// hotspots, best time-of-day & tide windows, a gear checklist (mask, fins, rashguard,
// reef-safe sunscreen…), safety & current notes, reef-etiquette tips, a guided vs
// self-guided comparison, weather/tide placeholders and a map placeholder. A caller
// supplies a `SnorkelGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `MapTexturePlaceholder`, `TravelTypography` and the tokens.
// `SnorkelGuide` and its nested rows are lightweight presentation models (not DTOs);
// the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// site-type filters and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// How a snorkel site is reached — drives the glyph, accent and the filter.
enum SnorkelSiteType: String, CaseIterable {
    case shore
    case boat
    case drift
    case lagoon

    var label: String {
        switch self {
        case .shore: "Shore"
        case .boat: "Boat"
        case .drift: "Drift"
        case .lagoon: "Lagoon"
        }
    }

    var icon: String {
        switch self {
        case .shore: "beach.umbrella.fill"
        case .boat: "ferry.fill"
        case .drift: "wind"
        case .lagoon: "water.waves"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .shore: return theme.sun
        case .boat: return theme.ocean
        case .drift: return theme.sky
        case .lagoon: return theme.tint
        }
    }
}

/// The ability level a snorkel site suits.
enum SnorkelAbility {
    case easy
    case moderate
    case advanced

    var label: String {
        switch self {
        case .easy: "Easy"
        case .moderate: "Moderate"
        case .advanced: "Advanced"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .easy: return theme.moss
        case .moderate: return theme.sun
        case .advanced: return theme.coral
        }
    }
}

/// A single at-a-glance fact (icon, label and value).
struct SnorkelFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single snorkel site.
struct SnorkelSite: Identifiable {
    let id: String
    var name: String
    var location: String
    var type: SnorkelSiteType
    var ability: SnorkelAbility
    var entry: String
    var depthRange: String
    var current: String
    var bestTide: String
    var bestTime: String
    var sightings: [String]
    var note: String

    init(
        id: String? = nil,
        name: String,
        location: String,
        type: SnorkelSiteType,
        ability: SnorkelAbility,
        entry: String,
        depthRange: String,
        current: String,
        bestTide: String,
        bestTime: String,
        sightings: [String],
        note: String
    ) {
        self.id = id ?? "\(name)-\(location)"
        self.name = name
        self.location = location
        self.type = type
        self.ability = ability
        self.entry = entry
        self.depthRange = depthRange
        self.current = current
        self.bestTide = bestTide
        self.bestTime = bestTime
        self.sightings = sightings
        self.note = note
    }
}

/// A generic guide row reused for hotspots and marine-life entries.
struct SnorkelInfoRow: Identifiable {
    let id: String
    var name: String
    var location: String?
    var icon: String
    var detail: String
    var accent: Color

    init(id: String? = nil, name: String, location: String? = nil, icon: String, detail: String, accent: Color) {
        self.id = id ?? name
        self.name = name
        self.location = location
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// A single gear-checklist item.
struct SnorkelGearItem: Identifiable {
    let id = UUID()
    var name: String
    var packed: Bool
    var note: String
}

/// The full, presentation-only content for a snorkel guide.
struct SnorkelGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [SnorkelFact]
    var sites: [SnorkelSite]
    var marineLife: [SnorkelInfoRow]
    var turtleHotspots: [SnorkelInfoRow]
    var mantaHotspots: [SnorkelInfoRow]
    var tideWindows: [SnorkelInfoRow]
    var gear: [SnorkelGearItem]
    var guidedPoints: [String]
    var selfGuidedPoints: [String]
    var safetyNotes: [String]
    var etiquetteTips: [String]
    var weatherPlaceholder: String
    var tidePlaceholder: String
    var region: String
}

/// A premium, presentation-only snorkel guide dashboard rendered from a `SnorkelGuide`.
struct TravelSnorkelGuideDashboard: View {
    var guide: SnorkelGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedType: String = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    private var typeFilters: [String] {
        ["All"] + SnorkelSiteType.allCases.map(\.label)
    }

    private var filteredSites: [SnorkelSite] {
        guard selectedType != "All" else { return guide.sites }
        return guide.sites.filter { $0.type.label == selectedType }
    }

    var body: some View {
        PremiumScrollView {
            hero
            sitesGroup
            lifeGroup
            planningGroup
            practicalGroup
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
            eyebrow: "Snorkel Guide",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: "\(guide.sites.count)", label: "Sites"),
                HeroMetric(value: "\(guide.turtleHotspots.count + guide.mantaHotspots.count)", label: "Hotspots"),
                HeroMetric(value: "\(guide.marineLife.count)", label: "Species")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(SnorkelGuideAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var sitesGroup: some View {
        Group {
            section("At a glance", "The essentials before you swim.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Top snorkel sites", "Filter by how you get in.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    typeFilter
                    if filteredSites.isEmpty {
                        GlassCard {
                            Text("No \(selectedType.lowercased()) sites here.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredSites) { site in
                                siteCard(site)
                            }
                        }
                    }
                }
            }
        }
    }

    private var lifeGroup: some View {
        Group {
            section("Marine-life spotting", "What you’ll likely see, and where.", 3) {
                infoList(guide.marineLife)
            }

            section("Turtle hotspots", "Best odds of a turtle encounter.", 4) {
                infoList(guide.turtleHotspots)
            }

            section("Manta hotspots", "Where the mantas gather.", 5) {
                infoList(guide.mantaHotspots)
            }
        }
    }

    private var planningGroup: some View {
        Group {
            section("Best time & tides", "When conditions are kindest.", 6) {
                infoList(guide.tideWindows)
            }

            section("Gear checklist", "Pack before you head out.", 7) {
                gearCard
            }

            section("Guided vs self-guided", "Pick what suits the day.", 8) {
                comparisonCard
            }
        }
    }

    private var practicalGroup: some View {
        Group {
            section("Safety & currents", "Snorkel within your limits.", 8) {
                bulletCard(guide.safetyNotes, icon: "shield.lefthalf.filled", tint: theme.coral)
            }

            section("Reef etiquette", "Protect what you came to see.", 8) {
                bulletCard(guide.etiquetteTips, icon: "leaf.fill", tint: theme.moss)
            }

            section("Conditions", "Today’s window at a glance.", 8) {
                conditionsCard
            }

            section("Map", "Find your way around.", 8) {
                mapPlaceholder
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(SnorkelGuideAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: At-a-glance facts

    private func factTile(_ fact: SnorkelFact) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Image(systemName: fact.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                Text(fact.value)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(fact.label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(fact.label): \(fact.value)")
    }

    // MARK: Filters

    private var typeFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(typeFilters, id: \.self) { filter in
                    filterChip(filter)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedType
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedType = filter }
        } label: {
            Text(filter)
                .font(TravelTypography.caption)
                .foregroundStyle(selected ? .white : .secondary)
                .padding(.horizontal, TravelSpacing.md)
                .padding(.vertical, TravelSpacing.xs)
                .background(
                    selected ? AnyShapeStyle(theme.tint) : AnyShapeStyle(.thinMaterial),
                    in: Capsule()
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(filter) filter")
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    // MARK: Site cards

    private func siteCard(_ site: SnorkelSite) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(site.type.icon, site.type.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            tagPill(site.type.label, site.type.accent)
                            tagPill(site.ability.label, site.ability.accent)
                        }
                        Text(site.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Label(site.location, systemImage: "mappin.and.ellipse")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(site.id, site.name)
                }

                PremiumAdaptiveGrid(minimumWidth: 104) {
                    siteMetric("figure.pool.swim", site.entry, "Entry")
                    siteMetric("arrow.down.to.line", site.depthRange, "Depth")
                    siteMetric("wind", site.current, "Current")
                    siteMetric("water.waves", site.bestTide, "Tide")
                }

                chip("sun.max.fill", "Best: \(site.bestTime)", theme.sun)

                if !site.sightings.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: TravelSpacing.xs) {
                            ForEach(site.sightings, id: \.self) { sighting in
                                chip("fish.fill", sighting, theme.tint)
                            }
                        }
                    }
                }

                Text(site.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(siteAccessibility(site))
    }

    private func siteAccessibility(_ site: SnorkelSite) -> String {
        var parts = [
            site.type.label, site.ability.label, site.name, site.location,
            "entry \(site.entry)", "depth \(site.depthRange)", "current \(site.current)",
            "best tide \(site.bestTide)", "best time \(site.bestTime)"
        ]
        if !site.sightings.isEmpty { parts.append("see \(site.sightings.joined(separator: ", "))") }
        parts.append(site.note)
        return parts.joined(separator: ", ")
    }

    private func siteMetric(_ icon: String, _ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Label(value, systemImage: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.primary)
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

    // MARK: Generic info list & row

    private func infoList(_ rows: [SnorkelInfoRow]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                infoRow(row)
            }
        }
    }

    private func infoRow(_ row: SnorkelInfoRow) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(row.icon, row.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(row.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    if let location = row.location {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Text(row.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton(row.id, row.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(row.name)\(row.location.map { ", \($0)" } ?? ""), \(row.detail)")
    }

    // MARK: Gear

    private var gearCard: some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(guide.gear) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Image(systemName: item.packed ? "checkmark.circle.fill" : "circle")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(item.packed ? theme.moss : Color.secondary)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(item.name)
                                .font(TravelTypography.caption)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(item.note)
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.name), \(item.packed ? "packed" : "not packed"). \(item.note)")
                }
            }
        }
    }

    // MARK: Guided vs self-guided

    private var comparisonCard: some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            comparisonColumn("Guided tour", "person.2.fill", theme.ocean, guide.guidedPoints)
            comparisonColumn("Self-guided", "figure.pool.swim", theme.tint, guide.selfGuidedPoints)
        }
    }

    private func comparisonColumn(_ title: String, _ icon: String, _ accent: Color, _ points: [String]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Label(title, systemImage: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    ForEach(points, id: \.self) { point in
                        HStack(alignment: .top, spacing: TravelSpacing.xs) {
                            Image(systemName: "checkmark")
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(accent)
                            Text(point)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title): \(points.joined(separator: ", "))")
    }

    // MARK: Conditions placeholders

    private var conditionsCard: some View {
        HStack(spacing: TravelSpacing.md) {
            conditionTile("cloud.sun.fill", "Weather", guide.weatherPlaceholder, theme.sky)
            conditionTile("water.waves", "Tide", guide.tidePlaceholder, theme.tint)
        }
    }

    private func conditionTile(_ icon: String, _ label: String, _ value: String, _ tint: Color) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Image(systemName: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(tint)
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(TravelTypography.caption)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Live data coming soon")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value). Placeholder.")
    }

    // MARK: Map placeholder

    private var mapPlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("\(guide.region) · snorkel-site map coming soon", systemImage: "map.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Map of \(guide.region). Placeholder.")
    }

    // MARK: Shared bits

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
        .accessibilityLabel(isFav ? "Saved spot: \(name)" : "Save spot \(name)")
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

// MARK: - Snorkel guide appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct SnorkelGuideAppear: ViewModifier {
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
extension SnorkelGuide {
    /// A deterministic sample snorkel guide across Gili Air, Gili Meno,
    /// Nusa Lembongan, Menjangan and Komodo.
    static var sampleIndonesia: SnorkelGuide {
        let theme = TravelTheme.current
        return SnorkelGuide(
            heroTitle: "Snorkel Guide",
            heroSubtitle: "Warm, clear water and easy reefs — from Gili turtle gardens to Komodo’s manta channels.",
            heroSymbol: "figure.pool.swim",
            heroGradient: [theme.tint, theme.sky, theme.sun],
            facts: [
                SnorkelFact(icon: "thermometer.medium", label: "Water temp", value: "28–30°C"),
                SnorkelFact(icon: "eye.fill", label: "Visibility", value: "10–25m"),
                SnorkelFact(icon: "sun.max.fill", label: "Best season", value: "Apr–Oct"),
                SnorkelFact(icon: "tortoise.fill", label: "Signature", value: "Turtles & mantas")
            ],
            sites: [
                SnorkelSite(name: "Turtle Point", location: "Gili Meno", type: .shore, ability: .easy, entry: "Walk-in", depthRange: "1–5m", current: "Mild", bestTide: "High", bestTime: "Morning", sightings: ["Green turtles", "Parrotfish"], note: "Almost-guaranteed turtles grazing the seagrass just off the beach — wade in and float."),
                SnorkelSite(name: "House Reef", location: "Gili Air", type: .shore, ability: .easy, entry: "Walk-in", depthRange: "1–6m", current: "Mild", bestTide: "High", bestTime: "Morning", sightings: ["Reef fish", "Turtles", "Cuttlefish"], note: "A gentle home reef straight off the east shore — perfect for a relaxed first snorkel."),
                SnorkelSite(name: "Mangrove Point", location: "Nusa Lembongan", type: .drift, ability: .moderate, entry: "Boat drop", depthRange: "3–10m", current: "Can be strong", bestTide: "Slack", bestTime: "Late morning", sightings: ["Bumphead parrotfish", "Reef sharks"], note: "A scenic drift along the reef edge — go with a guide and watch the tidal current."),
                SnorkelSite(name: "Menjangan Wall", location: "West Bali NP", type: .boat, ability: .easy, entry: "Boat / giant stride", depthRange: "2–12m", current: "Mild", bestTide: "Any", bestTime: "Midday", sightings: ["Sea fans", "Anthias", "Turtles"], note: "A pristine drop-off wall in calm, protected water — among Bali’s clearest snorkelling."),
                SnorkelSite(name: "Manta Point", location: "Komodo NP", type: .boat, ability: .moderate, entry: "Boat / back-roll", depthRange: "3–8m", current: "Moderate", bestTide: "Incoming", bestTime: "Morning", sightings: ["Reef mantas", "Trevally"], note: "Float above the cleaning station as reef mantas glide below — surge can be lively."),
                SnorkelSite(name: "Pink Beach", location: "Komodo NP", type: .lagoon, ability: .easy, entry: "Walk-in", depthRange: "1–6m", current: "Calm", bestTide: "High", bestTime: "Midday", sightings: ["Reef fish", "Clownfish"], note: "A sheltered rose-tinted bay with easy coral right off the sand — ideal for families.")
            ],
            marineLife: [
                SnorkelInfoRow(name: "Green & hawksbill turtles", location: "Gili Air, Gili Meno", icon: "tortoise.fill", detail: "Resident on the seagrass and house reefs; calm mornings give the best sightings.", accent: theme.moss),
                SnorkelInfoRow(name: "Reef mantas", location: "Komodo, Nusa Penida", icon: "water.waves", detail: "Gather at cleaning stations on incoming tides — keep low and never chase.", accent: theme.ocean),
                SnorkelInfoRow(name: "Bumphead parrotfish", location: "Nusa Lembongan", icon: "fish.fill", detail: "Big schools graze the reef at Mangrove Point in the morning.", accent: theme.tint),
                SnorkelInfoRow(name: "Clownfish & anemones", location: "All sites", icon: "leaf.fill", detail: "Found in the shallows almost everywhere — a snorkeller’s favourite.", accent: theme.coral),
                SnorkelInfoRow(name: "Cuttlefish & octopus", location: "Gili house reefs", icon: "sparkles", detail: "Masters of camouflage on the rubble edges; look for subtle movement.", accent: theme.sun)
            ],
            turtleHotspots: [
                SnorkelInfoRow(name: "Turtle Point", location: "Gili Meno", icon: "tortoise.fill", detail: "The most reliable turtle spot in the Gilis — shallow and walk-in.", accent: theme.moss),
                SnorkelInfoRow(name: "Gili Air east reef", location: "Gili Air", icon: "tortoise.fill", detail: "Turtles feed along the drop-off most mornings.", accent: theme.moss),
                SnorkelInfoRow(name: "Turtle Heaven", location: "Gili Trawangan", icon: "tortoise.fill", detail: "A short boat hop with frequent green-turtle sightings.", accent: theme.moss)
            ],
            mantaHotspots: [
                SnorkelInfoRow(name: "Manta Point", location: "Komodo NP", icon: "water.waves", detail: "Reef mantas at the cleaning station, best on an incoming tide.", accent: theme.ocean),
                SnorkelInfoRow(name: "Karang Makassar", location: "Komodo NP", icon: "water.waves", detail: "The ‘manta highway’ — a drift where mantas cruise the channel.", accent: theme.ocean),
                SnorkelInfoRow(name: "Manta Bay", location: "Nusa Penida", icon: "water.waves", detail: "A day-trip from Lembongan; mantas feed near the surface in season.", accent: theme.ocean)
            ],
            tideWindows: [
                SnorkelInfoRow(name: "Early morning", icon: "sunrise.fill", detail: "Glassy water, best light and the most active marine life before the wind builds.", accent: theme.sun),
                SnorkelInfoRow(name: "High / slack tide", icon: "water.waves", detail: "Best visibility and the gentlest current — ideal for shore and lagoon sites.", accent: theme.tint),
                SnorkelInfoRow(name: "Avoid mid-afternoon", icon: "wind", detail: "Afternoon sea breeze brings chop and reduced visibility at exposed sites.", accent: theme.coral)
            ],
            gear: [
                SnorkelGearItem(name: "Mask", packed: true, note: "Defog and check the seal"),
                SnorkelGearItem(name: "Snorkel", packed: true, note: "Dry-top keeps splashes out"),
                SnorkelGearItem(name: "Fins", packed: true, note: "Open-heel with booties for boat entries"),
                SnorkelGearItem(name: "Rashguard / 2mm top", packed: true, note: "Sun and jellyfish protection"),
                SnorkelGearItem(name: "Reef-safe sunscreen", packed: true, note: "Oxybenzone-free — protects the coral"),
                SnorkelGearItem(name: "Snorkel vest", packed: false, note: "Recommended for drift sites"),
                SnorkelGearItem(name: "Dry bag", packed: false, note: "For phone and valuables on the boat")
            ],
            guidedPoints: [
                "Local guide reads the tides and currents",
                "Boat access to manta and drift sites",
                "Finds the turtles and hidden critters fast",
                "Reassuring for nervous or new snorkellers"
            ],
            selfGuidedPoints: [
                "Free and flexible from shore reefs",
                "Go at your own pace and timing",
                "Great for the Gili house reefs",
                "Bring your own gear and a buddy"
            ],
            safetyNotes: [
                "Always snorkel with a buddy and tell someone your plan.",
                "Check tides and currents before drift or channel sites — they can be deceptively strong.",
                "Use a brightly coloured float or vest where boats operate.",
                "Watch for boat traffic; surface near the reef edge, not in channels."
            ],
            etiquetteTips: [
                "Never touch, stand on or kick the coral — keep fins up and well clear.",
                "Don’t chase or touch turtles and mantas; keep a respectful distance.",
                "Wear reef-safe (oxybenzone-free) sunscreen or cover up instead.",
                "Take all rubbish back out and never feed the fish."
            ],
            weatherPlaceholder: "Sunny · light SE breeze",
            tidePlaceholder: "High 09:40 · Low 15:55",
            region: "Indonesia · Gilis, Nusa & Komodo"
        )
    }
}

struct TravelSnorkelGuideDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelSnorkelGuideDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Snorkel guide · Indonesia")

            TravelSnorkelGuideDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Snorkel guide · Dynamic Type XL")
        }
    }
}
#endif
