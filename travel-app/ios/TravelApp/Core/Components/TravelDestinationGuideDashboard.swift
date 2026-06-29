import SwiftUI

// MARK: - Travel destination guide dashboard (Phase 114)
//
// A flagship, presentation-only Destination Guide: the single-island/region hub
// holding everything a traveller needs — a hero, at-a-glance facts (best season,
// currency, language, time zone), a weather & climate summary, a filterable
// highlights carousel, top dive and surf locations, where to stay, getting around,
// food & local dishes, a day-by-day suggested itinerary, a budget snapshot, safety
// notes, cultural & etiquette tips, local phrases, emergency information, shopping
// highlights and a map placeholder. A caller supplies a `DestinationGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumProgressBar`, `MapTexturePlaceholder`, `TravelTypography` and the tokens.
// `DestinationGuide` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository,
// view-model, navigation, AppContainer or DTO logic, and is not wired into any
// screen. The category filters and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A single at-a-glance fact (icon, label and value).
struct GuideFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A filterable highlight shown in the discover carousel.
struct GuideHighlight: Identifiable {
    let id: String
    var title: String
    var category: String
    var icon: String
    var detail: String
    var accent: Color

    init(id: String? = nil, title: String, category: String, icon: String, detail: String, accent: Color) {
        self.id = id ?? title
        self.title = title
        self.category = category
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// A generic guide place/row reused for dives, surf, stays, transport, food,
/// emergency contacts and shopping — a glyph, name, optional location, optional
/// tag pill and a short note, each independently favouritable.
struct GuidePlace: Identifiable {
    let id: String
    var name: String
    var location: String?
    var tag: String?
    var icon: String
    var detail: String
    var accent: Color

    init(id: String? = nil, name: String, location: String? = nil, tag: String? = nil, icon: String, detail: String, accent: Color) {
        self.id = id ?? name
        self.name = name
        self.location = location
        self.tag = tag
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// A single suggested-itinerary day.
struct GuideItineraryDay: Identifiable {
    let id = UUID()
    var day: String
    var title: String
    var location: String
    var detail: String
}

/// A single phrasebook entry.
struct GuidePhrase: Identifiable {
    let id = UUID()
    var english: String
    var local: String
    var pronunciation: String
}

/// A single budget-snapshot line with a fractional bar.
struct GuideBudgetLine: Identifiable {
    let id = UUID()
    var label: String
    var amount: String
    var fraction: Double
}

/// The full, presentation-only content for a destination guide.
struct DestinationGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var region: String
    var facts: [GuideFact]
    var climateSummary: String
    var climateNote: String
    var highlights: [GuideHighlight]
    var diveSites: [GuidePlace]
    var surfSites: [GuidePlace]
    var stays: [GuidePlace]
    var transport: [GuidePlace]
    var dishes: [GuidePlace]
    var itinerary: [GuideItineraryDay]
    var budgetTotal: String
    var budgetCaption: String
    var budgetLines: [GuideBudgetLine]
    var safetyNotes: [String]
    var etiquetteTips: [String]
    var phrases: [GuidePhrase]
    var emergency: [GuidePlace]
    var shopping: [GuidePlace]

    /// Distinct highlight categories, "All" first, in stable order.
    var categories: [String] {
        var seen: Set<String> = []
        var ordered: [String] = ["All"]
        for highlight in highlights where !seen.contains(highlight.category) {
            seen.insert(highlight.category)
            ordered.append(highlight.category)
        }
        return ordered
    }
}

/// A premium, presentation-only destination guide rendered from a `DestinationGuide`.
struct TravelDestinationGuideDashboard: View {
    var guide: DestinationGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedCategory = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    private var filteredHighlights: [GuideHighlight] {
        guard selectedCategory != "All" else { return guide.highlights }
        return guide.highlights.filter { $0.category == selectedCategory }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            experiencesGroup
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
            eyebrow: "Destination Guide",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: heroMetrics,
            texture: { MapTexturePlaceholder() }
        )
        .modifier(DestinationGuideAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private var heroMetrics: [HeroMetric] {
        [
            HeroMetric(value: "\(guide.diveSites.count + guide.surfSites.count)", label: "Spots"),
            HeroMetric(value: "\(guide.itinerary.count)d", label: "Itinerary"),
            HeroMetric(value: "\(guide.highlights.count)", label: "Highlights")
        ]
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "The essentials before you go.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Weather & climate", "When the conditions are best.", 2) {
                GlassCard {
                    VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                        Label(guide.climateSummary, systemImage: "cloud.sun.fill")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(theme.sky)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(guide.climateNote)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }

            section("Highlights", "Tap to filter what you love.", 3) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    categoryFilter
                    highlightsCarousel
                }
            }
        }
    }

    private var experiencesGroup: some View {
        Group {
            section("Top dive sites", "Where to get in the water.", 4) {
                placeList(guide.diveSites)
            }

            section("Top surf spots", "Best-known breaks nearby.", 5) {
                placeList(guide.surfSites)
            }

            section("Where to stay", "Areas that suit different trips.", 6) {
                placeList(guide.stays)
            }

            section("Getting around", "Moving between the highlights.", 7) {
                placeList(guide.transport)
            }

            section("Food & local dishes", "What to eat while you’re here.", 8) {
                placeList(guide.dishes)
            }
        }
    }

    private var planningGroup: some View {
        Group {
            section("Suggested itinerary", "A balanced day-by-day plan.", 9) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.itinerary) { day in
                        itineraryCard(day)
                    }
                }
            }

            section("Budget snapshot", "A rough daily guide per person.", 10) {
                budgetCard
            }
        }
    }

    private var practicalGroup: some View {
        Group {
            section("Safety notes", "Stay aware and prepared.", 11) {
                bulletCard(guide.safetyNotes, icon: "shield.lefthalf.filled", tint: theme.coral)
            }

            section("Culture & etiquette", "Travel respectfully.", 12) {
                bulletCard(guide.etiquetteTips, icon: "hands.sparkles.fill", tint: theme.moss)
            }

            section("Local phrases", "A few words go a long way.", 13) {
                phrasesCard
            }

            section("Emergency information", "Keep these to hand.", 14) {
                placeList(guide.emergency)
            }

            section("Shopping highlights", "Worth taking home.", 15) {
                placeList(guide.shopping)
            }

            section("Map", "Find your way around.", 16) {
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
        .modifier(DestinationGuideAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: At-a-glance facts

    private func factTile(_ fact: GuideFact) -> some View {
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

    // MARK: Highlights

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(guide.categories, id: \.self) { category in
                    categoryChip(category)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func categoryChip(_ category: String) -> some View {
        let selected = category == selectedCategory
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedCategory = category }
        } label: {
            Text(category)
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
        .accessibilityLabel("\(category) filter")
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    private var highlightsCarousel: some View {
        Group {
            if filteredHighlights.isEmpty {
                GlassCard {
                    Text("No \(selectedCategory.lowercased()) highlights.")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.md) {
                        ForEach(filteredHighlights) { highlight in
                            highlightCard(highlight)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }
        }
    }

    private func highlightCard(_ highlight: GuideHighlight) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.sm) {
                    medallion(highlight.icon, highlight.accent)
                    Spacer(minLength: 0)
                    favouriteButton(highlight.id, highlight.title)
                }
                Text(highlight.category.uppercased())
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(highlight.accent)
                Text(highlight.title)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(highlight.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(width: 220, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(highlight.category) highlight, \(highlight.title), \(highlight.detail)")
    }

    // MARK: Generic place list & card

    private func placeList(_ places: [GuidePlace]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(places) { place in
                placeCard(place)
            }
        }
    }

    private func placeCard(_ place: GuidePlace) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(place.icon, place.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(place.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        if let tag = place.tag { tagPill(tag, place.accent) }
                    }
                    if let location = place.location {
                        Label(location, systemImage: "mappin.and.ellipse")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Text(place.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton(place.id, place.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(placeAccessibility(place))
    }

    private func placeAccessibility(_ place: GuidePlace) -> String {
        var parts = [place.name]
        if let location = place.location { parts.append(location) }
        if let tag = place.tag { parts.append(tag) }
        parts.append(place.detail)
        return parts.joined(separator: ", ")
    }

    // MARK: Itinerary

    private func itineraryCard(_ day: GuideItineraryDay) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("\(day.day)", theme.tint, isText: true)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(day.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Label(day.location, systemImage: "mappin.and.ellipse")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                    Text(day.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Day \(day.day), \(day.title), \(day.location), \(day.detail)")
    }

    // MARK: Budget

    private var budgetCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text(guide.budgetTotal)
                        .font(TravelTypography.display)
                        .foregroundStyle(theme.tint)
                    Text(guide.budgetCaption)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.budgetLines) { line in
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack {
                                Text(line.label)
                                    .font(TravelTypography.caption)
                                Spacer(minLength: 0)
                                Text(line.amount)
                                    .font(TravelTypography.caption)
                                    .foregroundStyle(.secondary)
                            }
                            PremiumProgressBar(
                                progress: appeared ? line.fraction : 0,
                                colors: [theme.tint, theme.sky]
                            )
                            .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(line.label), \(line.amount)")
                    }
                }
            }
        }
    }

    // MARK: Phrases

    private var phrasesCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                ForEach(Array(guide.phrases.enumerated()), id: \.element.id) { index, phrase in
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(phrase.english)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                        HStack(spacing: TravelSpacing.xs) {
                            Text(phrase.local)
                                .font(TravelTypography.cardTitle)
                            Text("· \(phrase.pronunciation)")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(phrase.english): \(phrase.local), pronounced \(phrase.pronunciation)")
                    if index < guide.phrases.count - 1 {
                        Divider().opacity(0.4)
                    }
                }
            }
        }
    }

    // MARK: Map placeholder

    private var mapPlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("\(guide.region) · interactive map coming soon", systemImage: "map.fill")
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
        .accessibilityLabel(isFav ? "Saved: \(name)" : "Save \(name)")
    }

    private func medallion(_ glyph: String, _ accent: Color, isText: Bool = false) -> some View {
        Group {
            if isText {
                Text(glyph).font(TravelTypography.cardTitle)
            } else {
                Image(systemName: glyph).font(TravelTypography.cardTitle)
            }
        }
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

// MARK: - Destination guide appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct DestinationGuideAppear: ViewModifier {
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
extension DestinationGuide {
    /// A deterministic sample guide for Raja Ampat, West Papua.
    static var sampleRajaAmpat: DestinationGuide {
        let theme = TravelTheme.current
        return DestinationGuide(
            heroTitle: "Raja Ampat",
            heroSubtitle: "The crown jewel of the Coral Triangle — 1,500 islands of jungle karst and the richest reefs on Earth.",
            heroSymbol: "globe.asia.australia.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            region: "Raja Ampat, West Papua",
            facts: [
                GuideFact(icon: "sun.max.fill", label: "Best season", value: "Oct–Apr"),
                GuideFact(icon: "banknote.fill", label: "Currency", value: "Rupiah (IDR)"),
                GuideFact(icon: "character.bubble.fill", label: "Language", value: "Bahasa Indonesia"),
                GuideFact(icon: "clock.fill", label: "Time zone", value: "WIT (UTC+9)")
            ],
            climateSummary: "Warm 27–31°C year-round, sea around 29°C.",
            climateNote: "Calmest seas and best visibility run October to April; May to September brings stronger winds and the occasional squall. There is no true dry season — pack a light rain layer whenever you travel.",
            highlights: [
                GuideHighlight(title: "Piaynemo viewpoint", category: "Nature", icon: "mountain.2.fill", detail: "The iconic karst-lagoon panorama after a short boardwalk climb.", accent: theme.moss),
                GuideHighlight(title: "Manta Sandy", category: "Diving", icon: "water.waves", detail: "A cleaning station where reef mantas circle in formation.", accent: theme.ocean),
                GuideHighlight(title: "Arborek jetty", category: "Diving", icon: "fish.fill", detail: "A shallow pier swarming with fish — superb snorkelling.", accent: theme.tint),
                GuideHighlight(title: "Pasir Timbul sandbar", category: "Beaches", icon: "beach.umbrella.fill", detail: "A pop-up white sandbar that appears at low tide.", accent: theme.sun),
                GuideHighlight(title: "Sawinggrai village", category: "Culture", icon: "bird.fill", detail: "Walk into the forest at dawn to spot wild birds-of-paradise.", accent: theme.coral)
            ],
            diveSites: [
                GuidePlace(name: "Cape Kri", location: "Dampier Strait", tag: "Advanced", icon: "water.waves", detail: "Holds the record fish count for a single dive — schooling everything in current.", accent: theme.ocean),
                GuidePlace(name: "Blue Magic", location: "Dampier Strait", tag: "Advanced", icon: "water.waves", detail: "A current-swept seamount with mantas, barracuda and the occasional wobbegong.", accent: theme.ocean),
                GuidePlace(name: "Manta Sandy", location: "Mansuar", tag: "Intermediate", icon: "fish.fill", detail: "Stay behind the rope and let the reef mantas come to the cleaning station.", accent: theme.tint)
            ],
            surfSites: [
                GuidePlace(name: "Wai (Nyande) reef", location: "Misool, south", tag: "Seasonal", icon: "figure.surfing", detail: "A remote right-hander that fires on rare southern swells — boat access only.", accent: theme.sky),
                GuidePlace(name: "Ayau atoll lefts", location: "Far north", tag: "Experts", icon: "figure.surfing", detail: "Fickle, very remote reef breaks for self-sufficient charter trips only.", accent: theme.sky)
            ],
            stays: [
                GuidePlace(name: "Waisai", location: "Gateway town", tag: "Budget", icon: "building.2.fill", detail: "Ferry port with guesthouses — handy for permits and resupply.", accent: theme.moss),
                GuidePlace(name: "Gam & Kri homestays", location: "Dampier Strait", tag: "Mid", icon: "house.fill", detail: "Family-run overwater bungalows close to the best dive sites.", accent: theme.tint),
                GuidePlace(name: "Misool eco resort", location: "Southern Raja Ampat", tag: "Luxury", icon: "sparkles", detail: "Remote private-island lodge inside a no-take marine reserve.", accent: theme.sun)
            ],
            transport: [
                GuidePlace(name: "Fly to Sorong (SOQ)", icon: "airplane", detail: "Connect via Jakarta, Makassar or Manado; the regional gateway airport.", accent: theme.sky),
                GuidePlace(name: "Ferry to Waisai", location: "Sorong → Waisai", icon: "ferry.fill", detail: "Daily fast ferry, roughly two hours across to the islands.", accent: theme.ocean),
                GuidePlace(name: "Local longboats", tag: "Charter", icon: "sailboat.fill", detail: "Hire a homestay boat between islands — agree the price up front.", accent: theme.tint)
            ],
            dishes: [
                GuidePlace(name: "Ikan bakar", icon: "flame.fill", detail: "Fresh reef fish grilled over coconut husk with lime and sambal.", accent: theme.coral),
                GuidePlace(name: "Papeda", icon: "fork.knife", detail: "A Papuan sago-starch porridge, traditionally served with yellow fish soup.", accent: theme.sun),
                GuidePlace(name: "Sambal colo-colo", icon: "leaf.fill", detail: "A bright raw chilli, tomato and citrus relish served alongside everything.", accent: theme.moss)
            ],
            itinerary: [
                GuideItineraryDay(day: "1", title: "Arrive & settle in", location: "Sorong → Waisai", detail: "Fly into Sorong, take the afternoon ferry and check into your homestay."),
                GuideItineraryDay(day: "2", title: "First dives", location: "Dampier Strait", detail: "Two warm-up dives at Cape Kri and Sardine Reef to find your buoyancy."),
                GuideItineraryDay(day: "3", title: "Manta day", location: "Manta Sandy", detail: "Morning manta dive, then snorkel the Arborek jetty in the afternoon."),
                GuideItineraryDay(day: "4", title: "Piaynemo & sandbars", location: "Fam Islands", detail: "Climb the Piaynemo viewpoint and swim at the Pasir Timbul sandbar."),
                GuideItineraryDay(day: "5", title: "Village & birds", location: "Sawinggrai", detail: "Dawn birds-of-paradise walk, a slow village morning, then a sunset paddle.")
            ],
            budgetTotal: "≈ £95/day",
            budgetCaption: "homestay, two dives, meals and boat share per person",
            budgetLines: [
                GuideBudgetLine(label: "Homestay (full board)", amount: "£35", fraction: 0.37),
                GuideBudgetLine(label: "Two boat dives", amount: "£45", fraction: 0.47),
                GuideBudgetLine(label: "Transfers & permit", amount: "£15", fraction: 0.16)
            ],
            safetyNotes: [
                "Buy the marine-park entry tag (Pin) in Waisai — it funds conservation and is checked.",
                "ATMs are unreliable past Sorong; carry enough rupiah in cash for your whole stay.",
                "Dive within your training — strong currents make many sites advanced-only.",
                "The nearest hyperbaric chamber is in Sorong; dive conservatively and stay well hydrated."
            ],
            etiquetteTips: [
                "Ask before photographing villagers, homes or ceremonies.",
                "Dress modestly away from the beach, especially in villages and churches.",
                "Never touch or stand on coral, and take all rubbish back out with you.",
                "A few words of Bahasa Indonesia are warmly received everywhere."
            ],
            phrases: [
                GuidePhrase(english: "Thank you", local: "Terima kasih", pronunciation: "tuh-REE-ma KA-see"),
                GuidePhrase(english: "How much?", local: "Berapa harganya?", pronunciation: "buh-RA-pa har-GA-nya"),
                GuidePhrase(english: "Delicious", local: "Enak", pronunciation: "EH-nak"),
                GuidePhrase(english: "Where is…?", local: "Di mana…?", pronunciation: "dee MA-na")
            ],
            emergency: [
                GuidePlace(name: "Emergency services", tag: "112", icon: "phone.fill", detail: "National emergency number; coverage is limited on the outer islands.", accent: theme.coral),
                GuidePlace(name: "Waisai clinic (Puskesmas)", location: "Waisai", icon: "cross.case.fill", detail: "Basic care on the main island; serious cases evacuate to Sorong.", accent: theme.coral),
                GuidePlace(name: "Dive emergency / DAN", tag: "Hotline", icon: "stethoscope", detail: "Carry your insurer and DAN numbers; confirm chamber access before deep dives.", accent: theme.coral)
            ],
            shopping: [
                GuidePlace(name: "Noken bags", location: "Village stalls", icon: "bag.fill", detail: "Hand-knotted Papuan carry bags — a UNESCO-listed craft.", accent: theme.moss),
                GuidePlace(name: "Woven pandan ware", icon: "leaf.fill", detail: "Mats and baskets woven from local pandan leaves.", accent: theme.sun),
                GuidePlace(name: "Sorong market spices", location: "Sorong", icon: "basket.fill", detail: "Stock up on nutmeg, cloves and dried fish before the ferry.", accent: theme.tint)
            ]
        )
    }
}

struct TravelDestinationGuideDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDestinationGuideDashboard(guide: .sampleRajaAmpat)
                .previewDisplayName("Destination · Raja Ampat")

            TravelDestinationGuideDashboard(guide: .sampleRajaAmpat)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Destination · Dynamic Type XL")
        }
    }
}
#endif
