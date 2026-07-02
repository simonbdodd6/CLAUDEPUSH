import SwiftUI

// MARK: - Travel island guide dashboard (Phase 135)
//
// A flagship, presentation-only Island Guide that helps travellers compare and choose
// Indonesian islands: a hero ("Choose Your Island"), at-a-glance facts, region- and
// activity-filtered island comparison cards (best-for, crowd/budget, twelve activity &
// vibe ratings, stay duration, ferry/airport access, best season, highlights and
// things to avoid), a comparison matrix, "perfect for you" and recommendation cards,
// suggested itineraries, a travel-time comparison, an interactive map placeholder and a
// disclaimer. A caller supplies an `IslandGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `MapTexturePlaceholder`, `TravelTypography` and the tokens.
// The `Island*` model names are deliberately distinct from earlier phases to avoid any
// collision. `IslandGuide` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The region
// and activity filters and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A single at-a-glance island fact.
struct IslandFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A named 0–4 rating for an island (activity or vibe).
struct IslandRating: Identifiable {
    let id = UUID()
    var key: String
    var value: Int
}

/// A full island profile.
struct IslandProfile: Identifiable {
    let id: String
    var name: String
    var tagline: String
    var icon: String
    var accent: Color
    var region: String
    var bestFor: String
    var crowd: Int
    var budget: Int
    var ratings: [IslandRating]
    var stayDuration: String
    var ferryAccess: String
    var airportAccess: String
    var bestSeason: String
    var highlights: [String]
    var avoid: [String]

    init(name: String, tagline: String, icon: String, accent: Color, region: String, bestFor: String, crowd: Int, budget: Int, ratings: [IslandRating], stayDuration: String, ferryAccess: String, airportAccess: String, bestSeason: String, highlights: [String], avoid: [String]) {
        self.id = name
        self.name = name
        self.tagline = tagline
        self.icon = icon
        self.accent = accent
        self.region = region
        self.bestFor = bestFor
        self.crowd = crowd
        self.budget = budget
        self.ratings = ratings
        self.stayDuration = stayDuration
        self.ferryAccess = ferryAccess
        self.airportAccess = airportAccess
        self.bestSeason = bestSeason
        self.highlights = highlights
        self.avoid = avoid
    }

    func rating(_ key: String) -> Int { ratings.first { $0.key == key }?.value ?? 0 }
}

/// An island recommendation card.
struct IslandRecommendation: Identifiable {
    let id = UUID()
    var title: String
    var islands: String
    var icon: String
    var detail: String
    var accent: Color
}

/// A suggested multi-island itinerary.
struct IslandItinerary: Identifiable {
    let id = UUID()
    var name: String
    var days: String
    var route: String
    var detail: String
    var icon: String
}

/// A generic island guide row reused for travel-time comparison.
struct IslandRow: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
}

/// The full, presentation-only content for an island guide.
struct IslandGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [IslandFact]
    var islands: [IslandProfile]
    var matrixKeys: [String]
    var recommendations: [IslandRecommendation]
    var itineraries: [IslandItinerary]
    var travelTimes: [IslandRow]
    var region: String
    var disclaimer: String
    /// Practical, deterministic transport guidance per island (M51). Defaulted so
    /// existing constructors remain source-compatible; the section is only shown
    /// when populated.
    var transportEssentials: [TravelTransportEssential] = []
}

/// A premium, presentation-only island guide dashboard rendered from an `IslandGuide`.
struct TravelIslandGuideDashboard: View {
    var guide: IslandGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedRegion = "All"
    @State private var selectedActivity = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let regionFilters = ["All", "Bali", "Nusa", "Gili", "Lombok", "Komodo", "Raja Ampat"]
    private let activityFilters = ["All", "Surf", "Diving", "Snorkelling", "Beaches", "Nightlife", "Relaxation"]

    private var visibleIslands: [IslandProfile] {
        let regionFiltered = selectedRegion == "All" ? guide.islands : guide.islands.filter { $0.region == selectedRegion }
        guard selectedActivity != "All" else { return regionFiltered }
        return regionFiltered.sorted { $0.rating(selectedActivity) > $1.rating(selectedActivity) }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            islandsGroup
            matrixGroup
            planGroup
            transportGroup
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
            eyebrow: "Island Guide",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: "\(guide.islands.count)", label: "Islands"),
                HeroMetric(value: factValue("Easiest"), label: "Easiest"),
                HeroMetric(value: factValue("Top dive"), label: "Top dive")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(IslandGuideAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Nine islands, one trip.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }
        }
    }

    private var islandsGroup: some View {
        Group {
            section("Compare islands", "Filter by region and what you love.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    chipRow(regionFilters, selected: selectedRegion) { selectedRegion = $0 }
                    chipRow(activityFilters, selected: selectedActivity) { selectedActivity = $0 }
                    if visibleIslands.isEmpty {
                        GlassCard {
                            Text("No islands match those filters.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(visibleIslands) { island in
                                islandCard(island)
                            }
                        }
                    }
                }
            }
        }
    }

    private var matrixGroup: some View {
        Group {
            section("Comparison matrix", "Key ratings side by side.", 3) {
                matrixCard
            }
        }
    }

    private var planGroup: some View {
        Group {
            section("Perfect for you", "Tailored picks.", 4) {
                perfectForYouCard
            }

            section("Recommendations", "Quick shortlists.", 5) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.recommendations) { recommendation in
                        recommendationCard(recommendation)
                    }
                }
            }

            section("Suggested itineraries", "Stitch islands together.", 6) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.itineraries) { itinerary in
                        itineraryCard(itinerary)
                    }
                }
            }
        }
    }

    private var transportGroup: some View {
        Group {
            if !guide.transportEssentials.isEmpty {
                section("Getting around", "Ferries, taxis and island hops — with expected prices and scam warnings.", 7) {
                    TravelTransportEssentialsSection(essentials: guide.transportEssentials)
                }
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Travel times", "Hopping between islands.", 7) {
                infoList(guide.travelTimes)
            }

            section("Map", "Picture the archipelago.", 8) {
                mapPlaceholder
            }

            section("Good to know", "About these ratings.", 8) {
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
        .modifier(IslandGuideAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: IslandFact) -> some View {
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

    // MARK: Island cards

    private func islandCard(_ island: IslandProfile) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(island.icon, island.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(island.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(island.tagline)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(island.id, island.name)
                }

                Label("Best for: \(island.bestFor)", systemImage: "star.circle.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(island.accent)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: TravelSpacing.xs) {
                    tagPill("Crowd: \(crowdLabel(island.crowd))", crowdTint(island.crowd))
                    tagPill("Budget: \(budgetLabel(island.budget))", theme.sun)
                    if selectedActivity != "All" {
                        tagPill("\(selectedActivity) \(island.rating(selectedActivity))/4", theme.tint)
                    }
                }

                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(island.ratings) { rating in
                        ratingRow(rating.key, rating.value, island.accent)
                    }
                }

                PremiumAdaptiveGrid(minimumWidth: 150) {
                    factChip("clock.fill", island.stayDuration, "Stay")
                    factChip("ferry.fill", island.ferryAccess, "Ferry")
                    factChip("airplane", island.airportAccess, "Airport")
                    factChip("sun.max.fill", island.bestSeason, "Season")
                }

                miniList("Highlights", island.highlights, "sparkles", theme.moss)
                miniList("Watch out", island.avoid, "exclamationmark.triangle.fill", theme.coral)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(islandAccessibility(island))
    }

    private func islandAccessibility(_ island: IslandProfile) -> String {
        var parts = [island.name, island.tagline, "best for \(island.bestFor)", "crowd \(crowdLabel(island.crowd))", "budget \(budgetLabel(island.budget))"]
        parts.append(contentsOf: island.ratings.map { "\($0.key) \($0.value) of 4" })
        parts.append("stay \(island.stayDuration), ferry \(island.ferryAccess), airport \(island.airportAccess), best season \(island.bestSeason)")
        parts.append("highlights: \(island.highlights.joined(separator: ", "))")
        parts.append("watch out: \(island.avoid.joined(separator: ", "))")
        return parts.joined(separator: ". ")
    }

    private func ratingRow(_ label: String, _ level: Int, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            dots(level, tint)
        }
        .padding(.vertical, TravelSpacing.xxs)
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

    private func factChip(_ icon: String, _ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Label(value, systemImage: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

    private func miniList(_ title: String, _ points: [String], _ icon: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(title)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
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

    // MARK: Comparison matrix

    private var matrixCard: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.sm) {
                HStack(spacing: TravelSpacing.xs) {
                    Text("Island")
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                        .frame(width: 96, alignment: .leading)
                    ForEach(guide.matrixKeys, id: \.self) { key in
                        Text(String(key.prefix(4)))
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }
                }
                ForEach(guide.islands) { island in
                    HStack(spacing: TravelSpacing.xs) {
                        Text(island.name)
                            .font(TravelTypography.caption)
                            .lineLimit(1)
                            .frame(width: 96, alignment: .leading)
                        ForEach(guide.matrixKeys, id: \.self) { key in
                            HStack { dots(island.rating(key), island.accent) }
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(island.name): " + guide.matrixKeys.map { "\($0) \(island.rating($0)) of 4" }.joined(separator: ", "))
                }
            }
        }
    }

    // MARK: Perfect for you

    private var perfectForYouCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "wand.and.stars")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Find your perfect island")
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Tell us what you love — diving, nightlife, calm — and we’ll suggest a shortlist. Personalised matching is coming soon.")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Find your perfect island. Personalised matching placeholder, coming soon.")
    }

    // MARK: Recommendation & itinerary cards

    private func recommendationCard(_ recommendation: IslandRecommendation) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(recommendation.icon, recommendation.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(recommendation.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(recommendation.islands, recommendation.accent)
                    }
                    Text(recommendation.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("rec-\(recommendation.title)", recommendation.title)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(recommendation.title): \(recommendation.islands). \(recommendation.detail)")
    }

    private func itineraryCard(_ itinerary: IslandItinerary) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(itinerary.icon, theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(itinerary.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(itinerary.days, theme.sun)
                    }
                    Text(itinerary.route)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(itinerary.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("itin-\(itinerary.name)", itinerary.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(itinerary.name), \(itinerary.days). Route \(itinerary.route). \(itinerary.detail)")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [IslandRow]) -> some View {
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
                        favouriteButton("time-\(row.title)", row.title)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
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
                Label("Interactive island map coming soon", systemImage: "map.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Interactive island map. Placeholder.")
    }

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "info.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Ratings are subjective")
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
        .accessibilityLabel("Ratings are subjective. \(guide.disclaimer)")
    }

    // MARK: Filter chips

    private func chipRow(_ items: [String], selected: String, action: @escaping (String) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(items, id: \.self) { item in
                    let isSelected = item == selected
                    Button {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { action(item) }
                    } label: {
                        Text(item)
                            .font(TravelTypography.caption)
                            .foregroundStyle(isSelected ? .white : .secondary)
                            .padding(.horizontal, TravelSpacing.md)
                            .padding(.vertical, TravelSpacing.xs)
                            .background(
                                isSelected ? AnyShapeStyle(theme.tint) : AnyShapeStyle(.thinMaterial),
                                in: Capsule()
                            )
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(item) filter")
                    .accessibilityValue(isSelected ? "Selected" : "Not selected")
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    // MARK: Shared bits

    private func crowdLabel(_ level: Int) -> String {
        switch level {
        case 0, 1: return "Quiet"
        case 2: return "Moderate"
        default: return "Busy"
        }
    }

    private func crowdTint(_ level: Int) -> Color {
        switch level {
        case 0, 1: return theme.moss
        case 2: return theme.sun
        default: return theme.coral
        }
    }

    private func budgetLabel(_ level: Int) -> String {
        switch level {
        case 0, 1: return "Cheap"
        case 2: return "Mid"
        case 3: return "Pricey"
        default: return "High"
        }
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

// MARK: - Island guide appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct IslandGuideAppear: ViewModifier {
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
extension IslandGuide {
    private static func ratings(_ values: [Int]) -> [IslandRating] {
        let keys = ["Surf", "Diving", "Snorkelling", "Beaches", "Nightlife", "Relaxation", "Nomads", "Families", "Couples", "Honeymoon", "Adventure", "Wildlife"]
        return zip(keys, values).map { IslandRating(key: $0.0, value: $0.1) }
    }

    /// A deterministic sample island guide for Indonesia (subjective ratings).
    static var sampleIndonesia: IslandGuide {
        let theme = TravelTheme.current
        return IslandGuide(
            heroTitle: "Choose Your Island",
            heroSubtitle: "Surf, dragons, mantas or hammocks — compare Indonesia’s headline islands and build your route.",
            heroSymbol: "map.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            facts: [
                IslandFact(icon: "globe.asia.australia.fill", label: "Islands", value: "9 compared"),
                IslandFact(icon: "airplane.arrival", label: "Easiest", value: "Bali (DPS)"),
                IslandFact(icon: "water.waves", label: "Top dive", value: "Raja Ampat"),
                IslandFact(icon: "sun.max.fill", label: "Best season", value: "Apr–Oct")
            ],
            islands: [
                IslandProfile(name: "Bali", tagline: "Something for everyone", icon: "leaf.fill", accent: theme.tint, region: "Bali", bestFor: "First-timers & variety", crowd: 4, budget: 2,
                    ratings: ratings([4, 3, 3, 3, 4, 3, 4, 4, 4, 4, 4, 2]),
                    stayDuration: "5–10 days", ferryAccess: "Main hub", airportAccess: "International (DPS)", bestSeason: "Apr–Oct",
                    highlights: ["Temples & rice terraces", "Surf and beach clubs", "Ubud’s culture and jungle"],
                    avoid: ["Kuta crowds and traffic", "Peak-season congestion"]),
                IslandProfile(name: "Nusa Penida", tagline: "Dramatic cliffs", icon: "mountain.2.fill", accent: theme.ocean, region: "Nusa", bestFor: "Epic viewpoints & mantas", crowd: 3, budget: 2,
                    ratings: ratings([1, 4, 4, 4, 1, 3, 2, 2, 4, 3, 4, 3]),
                    stayDuration: "2–3 days", ferryAccess: "Fast boat from Sanur", airportAccess: "None (via Bali)", bestSeason: "Apr–Oct",
                    highlights: ["Kelingking Beach", "Manta Point", "Crystal Bay"],
                    avoid: ["Rough, steep roads", "Day-tripper crowds at viewpoints"]),
                IslandProfile(name: "Nusa Lembongan", tagline: "Laid-back island", icon: "water.waves", accent: theme.sky, region: "Nusa", bestFor: "Chilled surf & snorkel", crowd: 2, budget: 2,
                    ratings: ratings([3, 3, 4, 3, 2, 4, 3, 3, 4, 3, 3, 2]),
                    stayDuration: "2–3 days", ferryAccess: "Fast boat from Sanur", airportAccess: "None (via Bali)", bestSeason: "Apr–Oct",
                    highlights: ["Mangrove snorkelling", "Devil’s Tear sunset", "Bridge to Ceningan"],
                    avoid: ["Limited nightlife"]),
                IslandProfile(name: "Lombok", tagline: "Bali’s quieter neighbour", icon: "mountain.2.fill", accent: theme.moss, region: "Lombok", bestFor: "Surf, treks & space", crowd: 2, budget: 2,
                    ratings: ratings([4, 3, 3, 4, 2, 4, 2, 3, 3, 3, 4, 2]),
                    stayDuration: "3–5 days", ferryAccess: "Fast boat & ferry", airportAccess: "Domestic (LOP)", bestSeason: "May–Oct",
                    highlights: ["Mount Rinjani trek", "Kuta Lombok surf", "Pink Beach"],
                    avoid: ["Long transfers", "Sparse rural facilities"]),
                IslandProfile(name: "Gili Air", tagline: "Buzz meets calm", icon: "beach.umbrella.fill", accent: theme.tint, region: "Gili", bestFor: "Easygoing island vibe", crowd: 2, budget: 2,
                    ratings: ratings([1, 3, 4, 3, 2, 4, 3, 3, 4, 3, 2, 2]),
                    stayDuration: "2–4 days", ferryAccess: "Boat from Bangsal/Bali", airportAccess: "None (via Lombok)", bestSeason: "Apr–Oct",
                    highlights: ["Turtle snorkelling", "Sunset on the west side", "No motor traffic"],
                    avoid: ["Limited medical care"]),
                IslandProfile(name: "Gili Meno", tagline: "Honeymoon hideaway", icon: "heart.fill", accent: theme.coral, region: "Gili", bestFor: "Couples & total calm", crowd: 1, budget: 2,
                    ratings: ratings([1, 3, 4, 4, 1, 4, 1, 2, 4, 4, 1, 2]),
                    stayDuration: "1–3 days", ferryAccess: "Boat from Bangsal/Bali", airportAccess: "None", bestSeason: "Apr–Oct",
                    highlights: ["Turtle Point", "Underwater statues", "Empty beaches"],
                    avoid: ["Very few amenities", "Quiet after dark"]),
                IslandProfile(name: "Gili Trawangan", tagline: "Party & dive island", icon: "music.note", accent: theme.sun, region: "Gili", bestFor: "Nightlife & diving", crowd: 4, budget: 2,
                    ratings: ratings([1, 4, 3, 3, 4, 2, 3, 2, 3, 2, 3, 2]),
                    stayDuration: "2–4 days", ferryAccess: "Boat from Bali/Lombok", airportAccess: "None", bestSeason: "Apr–Oct",
                    highlights: ["Dive schools", "Sunset bars", "Night market"],
                    avoid: ["Party noise", "Crowded in high season"]),
                IslandProfile(name: "Komodo", tagline: "Dragons & big fish", icon: "lizard.fill", accent: theme.sun, region: "Komodo", bestFor: "Wildlife & liveaboard diving", crowd: 2, budget: 3,
                    ratings: ratings([0, 4, 4, 3, 2, 2, 1, 3, 3, 3, 4, 4]),
                    stayDuration: "3–5 days", ferryAccess: "Boats from Labuan Bajo", airportAccess: "Domestic (LBJ)", bestSeason: "Apr–Oct",
                    highlights: ["Komodo dragons", "Padar viewpoint", "Manta & big-fish dives"],
                    avoid: ["Strong currents (advanced dives)", "Hot, dry, little shade"]),
                IslandProfile(name: "Raja Ampat", tagline: "The richest reefs on Earth", icon: "fish.fill", accent: theme.coral, region: "Raja Ampat", bestFor: "Diving & remote nature", crowd: 1, budget: 4,
                    ratings: ratings([1, 4, 4, 4, 1, 4, 1, 2, 4, 4, 4, 4]),
                    stayDuration: "7–10 days", ferryAccess: "Ferry from Sorong", airportAccess: "Via Sorong (SOQ)", bestSeason: "Oct–Apr",
                    highlights: ["Piaynemo karst panorama", "Unreal marine biodiversity", "Homestays & liveaboards"],
                    avoid: ["High cost and remoteness", "Patchy connectivity"])
            ],
            matrixKeys: ["Surf", "Diving", "Snorkelling", "Beaches", "Nightlife"],
            recommendations: [
                IslandRecommendation(title: "First-timer", islands: "Bali + Nusa", icon: "star.fill", detail: "Ease in with Bali’s variety and a couple of nights on the Nusas.", accent: theme.tint),
                IslandRecommendation(title: "Diver", islands: "Raja Ampat · Komodo · Gili T", icon: "water.waves", detail: "World-class reefs, big fish and easy dive schools.", accent: theme.ocean),
                IslandRecommendation(title: "Honeymoon", islands: "Gili Meno · Ubud · Raja Ampat", icon: "heart.fill", detail: "Quiet beaches, jungle villas and a remote splurge.", accent: theme.coral),
                IslandRecommendation(title: "Social & budget", islands: "Gili T · Canggu", icon: "music.note", detail: "Hostels, nightlife and a backpacker scene.", accent: theme.sun),
                IslandRecommendation(title: "Off the beaten path", islands: "Komodo · Raja Ampat", icon: "binoculars.fill", detail: "Dragons, dramatic seascapes and few crowds.", accent: theme.moss)
            ],
            itineraries: [
                IslandItinerary(name: "Bali & islands taster", days: "10 days", route: "Bali → Nusa → Gili → Lombok", detail: "Culture, cliffs, turtles and surf in one easy loop.", icon: "map.fill"),
                IslandItinerary(name: "Diver’s dream", days: "14 days", route: "Bali → Komodo → Raja Ampat", detail: "Warm-up dives, then the country’s two greatest dive regions.", icon: "water.waves"),
                IslandItinerary(name: "Honeymoon escape", days: "9 days", route: "Ubud → Gili Meno → Lembongan", detail: "Jungle villas, an empty-beach island and a chilled finale.", icon: "heart.fill")
            ],
            travelTimes: [
                IslandRow(title: "Bali ↔ Nusa", subtitle: "Fast boat", icon: "ferry.fill", detail: "About 30–45 minutes from Sanur.", accent: theme.sky),
                IslandRow(title: "Bali ↔ Gili", subtitle: "Fast boat", icon: "ferry.fill", detail: "Roughly 1.5–2.5 hours, sea depending.", accent: theme.ocean),
                IslandRow(title: "Bali ↔ Lombok", subtitle: "Boat or flight", icon: "airplane", detail: "2–4 hours by boat, or a ~30-minute flight.", accent: theme.tint),
                IslandRow(title: "Bali ↔ Komodo", subtitle: "Flight", icon: "airplane", detail: "About a 1-hour flight to Labuan Bajo.", accent: theme.sun),
                IslandRow(title: "Bali ↔ Raja Ampat", subtitle: "Flights via Sorong", icon: "airplane", detail: "Half a day or more via Makassar/Sorong, then a ferry.", accent: theme.coral)
            ],
            region: "Indonesia",
            disclaimer: "Island ratings here are a subjective, illustrative guide to help you compare — not absolute scores. Conditions, crowds and prices change with the season, so check current information before you commit to a route.",
            transportEssentials: TravelTransportEssentialsDemoData().transportEssentials()
        )
    }
}

struct TravelIslandGuideDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelIslandGuideDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Island guide · Indonesia")

            TravelIslandGuideDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Island guide · Dynamic Type XL")
        }
    }
}
#endif
