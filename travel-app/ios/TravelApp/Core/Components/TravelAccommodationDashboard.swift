import SwiftUI

// MARK: - Travel accommodation dashboard (Phase 134)
//
// A flagship, presentation-only Accommodation dashboard for Indonesia: a hero ("Where
// to Stay"), at-a-glance facts, a region-filtered "by region" guide, an accommodation-
// type comparison (hostel → villa) with quality badges and price ranges, typical
// nightly prices, best areas by traveller type, booking-timing and high/low-season
// advice, a what-to-check-before-booking checklist, check-in/out tips, local etiquette,
// scam & hidden-fee warnings, booking reminders and a disclaimer. A caller supplies a
// `StayGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. The `Stay*` model names are
// deliberately distinct from `TravelAccommodationGuide`'s types to avoid any collision.
// `StayGuide` and its nested rows are lightweight presentation models (not DTOs); the
// component holds no data, networking, persistence, repository, view-model, navigation,
// AppContainer or DTO logic, and is not wired into any screen. The region filter and
// favourite stars are UI-only and all prices are illustrative.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// An accommodation quality tier — drives the quality badge label and accent.
enum StayQuality {
    case budget
    case midRange
    case luxury

    var label: String {
        switch self {
        case .budget: "Budget"
        case .midRange: "Mid-range"
        case .luxury: "Luxury"
        }
    }

    var icon: String {
        switch self {
        case .budget: "leaf.fill"
        case .midRange: "star.fill"
        case .luxury: "sparkles"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .budget: return theme.moss
        case .midRange: return theme.sun
        case .luxury: return theme.tint
        }
    }
}

/// A single at-a-glance accommodation fact.
struct StayFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// An accommodation type in the comparison, with 0–4 indicator levels.
struct StayType: Identifiable {
    let id: String
    var name: String
    var icon: String
    var price: String
    var quality: StayQuality
    var comfort: Int
    var value: Int
    var privacy: Int
    var bestFor: String
    var detail: String

    init(name: String, icon: String, price: String, quality: StayQuality, comfort: Int, value: Int, privacy: Int, bestFor: String, detail: String) {
        self.id = name
        self.name = name
        self.icon = icon
        self.price = price
        self.quality = quality
        self.comfort = comfort
        self.value = value
        self.privacy = privacy
        self.bestFor = bestFor
        self.detail = detail
    }
}

/// A "best area for this traveller type" card.
struct StayArea: Identifiable {
    let id = UUID()
    var travellerType: String
    var area: String
    var icon: String
    var detail: String
    var accent: Color
}

/// A generic accommodation guide row reused for regions, prices, timing, etiquette,
/// warnings and tips. An optional `badge` renders a coloured pill.
struct StayRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var badge: String?

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, badge: String? = nil, region: String = "") {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.badge = badge
        self.region = region
    }

    var region: String
}

/// A "what to check before booking" checklist item.
struct StayCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for an accommodation guide.
struct StayGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [StayFact]
    var regionNotes: [StayRow]
    var types: [StayType]
    var prices: [StayRow]
    var areas: [StayArea]
    var bookingTiming: [StayRow]
    var highPoints: [String]
    var lowPoints: [String]
    var checkBeforeBooking: [StayCheckItem]
    var checkInTips: [StayRow]
    var etiquette: [String]
    var warnings: [StayRow]
    var reminders: [String]
    var disclaimer: String
}

/// A premium, presentation-only accommodation dashboard rendered from a `StayGuide`.
struct TravelAccommodationDashboard: View {
    var guide: StayGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let regionFilters = ["All", "Bali", "Gili", "Lombok", "Nusa", "Komodo", "Raja Ampat"]

    private var filteredRegionNotes: [StayRow] {
        guard selectedRegion != "All" else { return guide.regionNotes }
        return guide.regionNotes.filter { $0.region == selectedRegion }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            typesGroup
            planGroup
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
            eyebrow: "Accommodation",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("From"), label: "From"),
                HeroMetric(value: factValue("Book ahead"), label: "Booking"),
                HeroMetric(value: factValue("Best value"), label: "Value")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(StayAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Where to stay, in brief.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("By region", "Filter to where you’re headed.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    regionFilter
                    if filteredRegionNotes.isEmpty {
                        GlassCard {
                            Text("No notes for that region.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        infoList(filteredRegionNotes)
                    }
                }
            }
        }
    }

    private var typesGroup: some View {
        Group {
            section("Types of stay", "Hostel to private villa.", 3) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.types) { type in
                        typeCard(type)
                    }
                }
            }

            section("Typical prices", "Rough nightly ranges.", 4) {
                infoList(guide.prices)
            }

            section("Best areas for you", "By traveller type.", 5) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.areas) { area in
                        areaCard(area)
                    }
                }
            }
        }
    }

    private var planGroup: some View {
        Group {
            section("Booking timing", "When to lock it in.", 6) {
                infoList(guide.bookingTiming)
            }

            section("High vs low season", "Plan around the crowds.", 7) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    comparisonColumn("High season", "sun.max.fill", theme.coral, guide.highPoints)
                    comparisonColumn("Low / shoulder", "cloud.sun.fill", theme.moss, guide.lowPoints)
                }
            }

            section("Check before booking", "Don’t get caught out.", 8) {
                checklistCard(guide.checkBeforeBooking)
            }

            section("Check-in & out", "Arrival tips.", 8) {
                infoList(guide.checkInTips)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Local etiquette", "Be a good guest.", 8) {
                bulletCard(guide.etiquette, icon: "hands.sparkles.fill", tint: theme.moss)
            }

            section("Scams & hidden fees", "Read the small print.", 8) {
                infoList(guide.warnings)
            }

            section("Booking reminders", "Before you pay.", 8) {
                bulletCard(guide.reminders, icon: "checkmark.circle.fill", tint: theme.tint)
            }

            section("Good to know", "About these prices.", 8) {
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
        .modifier(StayAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: StayFact) -> some View {
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

    // MARK: Type cards

    private func typeCard(_ type: StayType) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(type.icon, type.quality.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            Text(type.name)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                            qualityBadge(type.quality)
                        }
                        Text(type.price)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(type.id, type.name)
                }
                PremiumAdaptiveGrid(minimumWidth: 132) {
                    ratingRow("Comfort", type.comfort, theme.tint)
                    ratingRow("Value", type.value, theme.moss)
                    ratingRow("Privacy", type.privacy, theme.ocean)
                }
                Label("Best for: \(type.bestFor)", systemImage: "star.circle.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(theme.tint)
                    .fixedSize(horizontal: false, vertical: true)
                Text(type.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(type.name), \(type.quality.label), \(type.price). Comfort \(type.comfort) of 4, value \(type.value), privacy \(type.privacy). Best for \(type.bestFor). \(type.detail)")
    }

    private func qualityBadge(_ quality: StayQuality) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: quality.icon)
            Text(quality.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(quality.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(quality.accent.opacity(0.15), in: Capsule())
    }

    private func ratingRow(_ label: String, _ level: Int, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            HStack(spacing: 3) {
                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .fill(index < level ? tint : Color.secondary.opacity(0.25))
                        .frame(width: 7, height: 7)
                }
            }
        }
        .padding(.vertical, TravelSpacing.xxs)
    }

    // MARK: Area cards

    private func areaCard(_ area: StayArea) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(area.icon, area.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(area.travellerType)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(area.area, area.accent)
                    }
                    Text(area.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("area-\(area.travellerType)", area.travellerType)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(area.travellerType), best area \(area.area). \(area.detail)")
    }

    // MARK: Comparison columns

    private func comparisonColumn(_ title: String, _ icon: String, _ accent: Color, _ points: [String]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Label(title, systemImage: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    ForEach(points, id: \.self) { point in
                        HStack(alignment: .top, spacing: TravelSpacing.xs) {
                            Image(systemName: "circle.fill")
                                .font(.system(size: 5))
                                .foregroundStyle(accent)
                                .padding(.top, 6)
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

    // MARK: Region filter

    private var regionFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(regionFilters, id: \.self) { region in
                    let selected = region == selectedRegion
                    Button {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedRegion = region }
                    } label: {
                        Text(region)
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
                    .accessibilityLabel("\(region) filter")
                    .accessibilityValue(selected ? "Selected" : "Not selected")
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    // MARK: Generic info list

    private func infoList(_ rows: [StayRow]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(row.icon, row.accent)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(row.title)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let badge = row.badge {
                                    tagPill(badge, row.accent)
                                }
                            }
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
                        favouriteButton(row.id, row.title)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? "")\(row.badge.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Checklist

    private func checklistCard(_ items: [StayCheckItem]) -> some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(items) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(item.done ? theme.moss : Color.secondary)
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
                    .accessibilityLabel("\(item.name), \(item.done ? "checked" : "to check"). \(item.note)")
                }
            }
        }
    }

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "info.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Prices & availability vary")
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
        .accessibilityLabel("Prices and availability vary. \(guide.disclaimer)")
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
        .accessibilityLabel(isFav ? "Saved stay: \(name)" : "Save stay \(name)")
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

// MARK: - Accommodation appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct StayAppear: ViewModifier {
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
extension StayGuide {
    /// A deterministic sample accommodation guide for Indonesia (illustrative prices).
    static var sampleIndonesia: StayGuide {
        let theme = TravelTheme.current
        return StayGuide(
            heroTitle: "Where to Stay",
            heroSubtitle: "From £8 homestays to private-pool villas — how to pick the right base across Indonesia.",
            heroSymbol: "bed.double.fill",
            heroGradient: [theme.tint, theme.ocean, theme.sun],
            facts: [
                StayFact(icon: "banknote.fill", label: "From", value: "Rp 150k"),
                StayFact(icon: "calendar", label: "Book ahead", value: "Jul–Aug"),
                StayFact(icon: "star.fill", label: "Best value", value: "Homestays"),
                StayFact(icon: "sparkles", label: "Splurge", value: "Villas / resorts")
            ],
            regionNotes: [
                StayRow(title: "Bali", subtitle: "Every budget", icon: "leaf.fill", detail: "The widest choice in Indonesia — Canggu, Seminyak and Ubud are the hotspots.", accent: theme.tint, region: "Bali"),
                StayRow(title: "Gili Islands", subtitle: "Island premium", icon: "beach.umbrella.fill", detail: "Bungalows and boutique stays; everything costs a little more as it arrives by boat.", accent: theme.sun, region: "Gili"),
                StayRow(title: "Lombok", subtitle: "Better value", icon: "mountain.2.fill", detail: "Cheaper than Bali; Kuta Lombok is the surf-and-stay base in the south.", accent: theme.moss, region: "Lombok"),
                StayRow(title: "Nusa Islands", subtitle: "Homestays & cliffs", icon: "water.waves", detail: "Lembongan and Penida have homestays and cliff villas — book ahead, they’re small.", accent: theme.ocean, region: "Nusa"),
                StayRow(title: "Komodo / Labuan Bajo", subtitle: "Town & boats", icon: "ferry.fill", detail: "Hotels in town plus liveaboards out at the islands.", accent: theme.tint, region: "Komodo"),
                StayRow(title: "Raja Ampat", subtitle: "Remote", icon: "fish.fill", detail: "Village homestays and a few eco-resorts; pricey and remote, so plan well ahead.", accent: theme.coral, region: "Raja Ampat")
            ],
            types: [
                StayType(name: "Hostel", icon: "bunkbed.fill", price: "Rp 100–250k / bed", quality: .budget, comfort: 2, value: 4, privacy: 1, bestFor: "Backpackers", detail: "Dorms and a social scene; the cheapest way to stay, with private rooms at some."),
                StayType(name: "Guesthouse", icon: "house.fill", price: "Rp 200–400k", quality: .budget, comfort: 3, value: 4, privacy: 3, bestFor: "Budget couples", detail: "Simple private rooms, often with fan or AC — friendly and inexpensive."),
                StayType(name: "Homestay", icon: "house.lodge.fill", price: "Rp 150–350k", quality: .budget, comfort: 3, value: 4, privacy: 3, bestFor: "Local experience", detail: "A room with a local family, usually with breakfast — the best value and warmth."),
                StayType(name: "Hotel", icon: "building.2.fill", price: "Rp 500k–1.5m", quality: .midRange, comfort: 4, value: 3, privacy: 4, bestFor: "Comfort", detail: "Pools, breakfast and reliable service in towns and resort areas."),
                StayType(name: "Resort", icon: "building.columns.fill", price: "Rp 2m+", quality: .luxury, comfort: 4, value: 2, privacy: 4, bestFor: "Pampering", detail: "Full facilities, beachfront and spas — relax without leaving the grounds."),
                StayType(name: "Villa", icon: "sparkles", price: "Rp 1.5m+ (split)", quality: .luxury, comfort: 4, value: 3, privacy: 4, bestFor: "Groups & families", detail: "A private pool and kitchen; superb value when a group shares the nightly rate.")
            ],
            prices: [
                StayRow(title: "Dorm bed", subtitle: "Backpacker", icon: "bunkbed.fill", detail: "Rp 100–250k a night (≈ £5–12).", accent: theme.moss),
                StayRow(title: "Private room", subtitle: "Guesthouse / homestay", icon: "house.fill", detail: "Rp 200–500k (≈ £10–25), often with breakfast.", accent: theme.tint),
                StayRow(title: "Mid-range hotel", subtitle: "Comfort", icon: "building.2.fill", detail: "Rp 500k–1.2m (≈ £25–60) with a pool.", accent: theme.ocean),
                StayRow(title: "Resort / villa", subtitle: "Luxury", icon: "sparkles", detail: "Rp 2m+ (≈ £100+); villas are great value split among a group.", accent: theme.sun)
            ],
            areas: [
                StayArea(travellerType: "Surfers", area: "Uluwatu / Kuta Lombok", icon: "figure.surfing", detail: "Stay near the breaks — Uluwatu and Canggu in Bali, Kuta Lombok in the south.", accent: theme.sky),
                StayArea(travellerType: "Divers", area: "Gili / Amed / Labuan Bajo", icon: "water.waves", detail: "Base by the dive centres — the Gilis, Amed, Nusa Penida and the Komodo gateway.", accent: theme.ocean),
                StayArea(travellerType: "Couples", area: "Ubud / Gili Meno", icon: "heart.fill", detail: "Ubud’s rice-field villas and quiet Gili Meno are the romantic picks.", accent: theme.coral),
                StayArea(travellerType: "Families", area: "Sanur / Nusa Dua", icon: "figure.2.and.child.holdinghands", detail: "Calm beaches and resort facilities make Sanur and Nusa Dua easy with kids.", accent: theme.moss),
                StayArea(travellerType: "Backpackers", area: "Canggu / Gili T", icon: "backpack.fill", detail: "Hostels, cafés and a social scene in Canggu, Kuta and Gili Trawangan.", accent: theme.sun),
                StayArea(travellerType: "Luxury", area: "Seminyak / Raja Ampat", icon: "sparkles", detail: "Seminyak and Nusa Dua for resorts; Raja Ampat eco-resorts for a remote splurge.", accent: theme.tint)
            ],
            bookingTiming: [
                StayRow(title: "Peak season", subtitle: "1–3 months ahead", icon: "calendar.badge.exclamationmark", detail: "Book early for July–August and New Year — the best places sell out.", accent: theme.coral),
                StayRow(title: "Shoulder season", subtitle: "Flexible", icon: "calendar", detail: "More availability and better deals; a week ahead is usually plenty.", accent: theme.tint),
                StayRow(title: "Homestays off-peak", subtitle: "On arrival", icon: "house.lodge.fill", detail: "Small homestays can often be booked a day or two ahead, or even on arrival.", accent: theme.moss)
            ],
            highPoints: [
                "Book well ahead — places fill",
                "Higher prices and minimum stays",
                "Busy beaches and restaurants",
                "Jul–Aug and Dec–Jan are peak"
            ],
            lowPoints: [
                "Better deals and availability",
                "Quieter, more relaxed vibe",
                "Some rain, especially Nov–Mar",
                "Feb–Jun and Sep–Nov are calmer"
            ],
            checkBeforeBooking: [
                StayCheckItem(name: "Wi-Fi speed", done: true, note: "Vital if you’re working"),
                StayCheckItem(name: "AC vs fan & hot water", done: true, note: "Comfort in the heat"),
                StayCheckItem(name: "Breakfast included", done: false, note: "Common at homestays"),
                StayCheckItem(name: "Backup generator", done: false, note: "Islands have power cuts"),
                StayCheckItem(name: "Distance to dive centre / beach", done: false, note: "Check the map pin"),
                StayCheckItem(name: "Scooter parking", done: false, note: "If you’ll rent one")
            ],
            checkInTips: [
                StayRow(title: "Check-in 14:00 / out 12:00", subtitle: "Typical", icon: "clock.fill", detail: "Standard times, but small places are usually flexible — just ask.", accent: theme.tint),
                StayRow(title: "Message ahead", subtitle: "Late arrival", icon: "message.fill", detail: "Tell your host your arrival time, especially for homestays and late flights.", accent: theme.ocean),
                StayRow(title: "Arrange a transfer", subtitle: "From airport/port", icon: "car.fill", detail: "Many stays offer pickups — handy after a long travel day.", accent: theme.moss)
            ],
            etiquette: [
                "Remove your shoes before entering rooms and homes.",
                "Respect quiet hours — many stays are family homes or villages.",
                "Conserve water and power on the islands, where both are limited.",
                "Greet your hosts warmly; a smile and ‘terima kasih’ go a long way."
            ],
            warnings: [
                StayRow(title: "‘Tax & service’ added", subtitle: "Up to 21%", icon: "percent", detail: "Many hotels add tax and service on top — check whether the rate is nett.", accent: theme.sun, badge: "Caution"),
                StayRow(title: "Photos vs reality", subtitle: "Read reviews", icon: "photo.fill", detail: "Lean on recent guest reviews rather than the listing’s best photos.", accent: theme.sun, badge: "Caution"),
                StayRow(title: "Cash-only deposits", subtitle: "Ask first", icon: "banknote.fill", detail: "Some places want a cash deposit or full payment in cash — clarify before you arrive.", accent: theme.sun, badge: "Caution"),
                StayRow(title: "Pay-off-platform requests", subtitle: "Don’t", icon: "exclamationmark.shield.fill", detail: "A host asking you to cancel and pay direct removes your protection — decline.", accent: theme.coral, badge: "Avoid")
            ],
            reminders: [
                "Read recent reviews and check the exact location on the map.",
                "Confirm the total price including taxes and service before paying.",
                "Screenshot your confirmation and address to keep them offline.",
                "Note the cancellation policy in case your plans change."
            ],
            disclaimer: "Prices, availability and facilities vary by season and change often, and live booking details need an internet connection. The figures here are illustrative only — confirm current rates and what’s included with the property before you book."
        )
    }
}

struct TravelAccommodationDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelAccommodationDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Accommodation · Indonesia")

            TravelAccommodationDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Accommodation · Dynamic Type XL")
        }
    }
}
#endif
