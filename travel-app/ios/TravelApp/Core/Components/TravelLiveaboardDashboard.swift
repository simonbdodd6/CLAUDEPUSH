import SwiftUI

// MARK: - Travel liveaboard dashboard (Phase 118)
//
// A flagship, presentation-only Liveaboard Trip dashboard for Komodo / Raja Ampat
// style dive cruises: a vessel hero with at-a-glance facts (boat name, length, cabins,
// guests, crew, nights), a booking & payment status card, a day-by-day itinerary with
// dive sites and a dive-deck schedule (dives per day, night dives), cabin/deck
// information, crew & guide profiles, an included vs not-included comparison, gear
// rental & nitrox options, marine-life expectations, a meals & dietary placeholder, a
// pre-trip checklist (passport, certification, logbook, insurance/DAN), safety &
// emergency briefing notes, weather/sea-state placeholders and a route map
// placeholder. A caller supplies a `LiveaboardTrip` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `MapTexturePlaceholder`, `TravelTypography` and the tokens —
// and the Phase-104 `BookingStatus` / `BookingPayment` badges. `LiveaboardTrip` and
// its nested rows are lightweight presentation models (not DTOs); the component holds
// no data, networking, persistence, repository, view-model, navigation, AppContainer
// or DTO logic, and is not wired into any screen. The day filters and favourite stars
// are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A single at-a-glance vessel fact (icon, label and value).
struct LiveaboardFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single day of the liveaboard itinerary.
struct LiveaboardDay: Identifiable {
    let id: String
    var day: String
    var area: String
    var sites: [String]
    var diveCount: Int
    var hasNightDive: Bool
    var note: String

    init(id: String? = nil, day: String, area: String, sites: [String], diveCount: Int, hasNightDive: Bool, note: String) {
        self.id = id ?? day
        self.day = day
        self.area = area
        self.sites = sites
        self.diveCount = diveCount
        self.hasNightDive = hasNightDive
        self.note = note
    }
}

/// A cabin / deck information row.
struct LiveaboardCabin: Identifiable {
    let id = UUID()
    var name: String
    var deck: String
    var icon: String
    var detail: String
}

/// A crew or guide profile.
struct LiveaboardCrew: Identifiable {
    let id = UUID()
    var name: String
    var role: String
    var icon: String
    var detail: String
}

/// A pre-trip checklist item.
struct LiveaboardCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// A generic guide row reused for gear/nitrox options and marine-life expectations.
struct LiveaboardRow: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color

    init(title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color) {
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// The full, presentation-only content for a liveaboard trip.
struct LiveaboardTrip {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var cabins: Int
    var guests: Int
    var nights: Int
    var facts: [LiveaboardFact]
    var status: BookingStatus
    var payment: BookingPayment
    var paymentNote: String
    var itinerary: [LiveaboardDay]
    var cabinInfo: [LiveaboardCabin]
    var crew: [LiveaboardCrew]
    var includedPoints: [String]
    var notIncludedPoints: [String]
    var gearOptions: [LiveaboardRow]
    var marineLife: [LiveaboardRow]
    var checklist: [LiveaboardCheckItem]
    var safetyNotes: [String]
    var dietaryPlaceholder: String
    var weatherPlaceholder: String
    var seaStatePlaceholder: String
    var routeSequence: [String]
    var region: String

    var totalDives: Int { itinerary.reduce(0) { $0 + $1.diveCount } }
    var nightDives: Int { itinerary.filter(\.hasNightDive).count }
}

/// A premium, presentation-only liveaboard dashboard rendered from a `LiveaboardTrip`.
struct TravelLiveaboardDashboard: View {
    var trip: LiveaboardTrip

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedDay: String = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    private var dayFilters: [String] {
        ["All"] + trip.itinerary.map(\.day)
    }

    private var filteredDays: [LiveaboardDay] {
        guard selectedDay != "All" else { return trip.itinerary }
        return trip.itinerary.filter { $0.day == selectedDay }
    }

    var body: some View {
        PremiumScrollView {
            hero
            tripGroup
            itineraryGroup
            vesselGroup
            prepGroup
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
            eyebrow: "Liveaboard",
            symbol: trip.heroSymbol,
            title: trip.heroTitle,
            subtitle: trip.heroSubtitle,
            gradient: trip.heroGradient,
            metrics: [
                HeroMetric(value: "\(trip.nights)", label: "Nights"),
                HeroMetric(value: "\(trip.totalDives)", label: "Dives"),
                HeroMetric(value: "\(trip.guests)", label: "Guests")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(LiveaboardAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var tripGroup: some View {
        Group {
            section("Booking", "Your place on board.", 1) {
                bookingCard
            }

            section("At a glance", "The vessel in numbers.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(trip.facts) { fact in
                        factTile(fact)
                    }
                }
            }
        }
    }

    private var itineraryGroup: some View {
        Group {
            section("Dive-deck schedule", "How the diving runs.", 3) {
                scheduleCard
            }

            section("Itinerary", "Filter to a single day.", 4) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    dayFilter
                    VStack(spacing: TravelSpacing.sm) {
                        ForEach(filteredDays) { day in
                            dayCard(day)
                        }
                    }
                }
            }
        }
    }

    private var vesselGroup: some View {
        Group {
            section("Cabins & decks", "Where you’ll stay aboard.", 5) {
                cabinList
            }

            section("Crew & guides", "The team looking after you.", 6) {
                crewList
            }

            section("What’s included", "Included vs extra.", 7) {
                comparisonCard
            }

            section("Gear & nitrox", "Rental and gas options.", 8) {
                infoList(trip.gearOptions)
            }

            section("Marine life", "What you can hope to see.", 8) {
                infoList(trip.marineLife)
            }
        }
    }

    private var prepGroup: some View {
        Group {
            section("Meals & dietary", "Full board aboard.", 8) {
                mealsCard
            }

            section("Pre-trip checklist", "Don’t board without these.", 8) {
                checklistCard
            }

            section("Safety & briefing", "Read before the first dive.", 8) {
                bulletCard(trip.safetyNotes, icon: "shield.lefthalf.filled", tint: theme.coral)
            }

            section("Conditions", "Today’s window at a glance.", 8) {
                conditionsCard
            }

            section("Route map", "The whole cruise.", 8) {
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
        .modifier(LiveaboardAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Booking card

    private var bookingCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text(trip.heroTitle)
                    .font(TravelTypography.cardTitle)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        statusBadge(trip.status)
                        paymentBadge(trip.payment)
                    }
                }
                Text(trip.paymentNote)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Booking, \(trip.status.label), \(trip.payment.label). \(trip.paymentNote)")
    }

    // MARK: At-a-glance facts

    private func factTile(_ fact: LiveaboardFact) -> some View {
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

    // MARK: Dive-deck schedule

    private var scheduleCard: some View {
        GlassCard {
            PremiumAdaptiveGrid(minimumWidth: 104) {
                scheduleStat("figure.pool.swim", "\(trip.totalDives)", "Total dives")
                scheduleStat("calendar", "up to 4", "Per day")
                scheduleStat("moon.stars.fill", "\(trip.nightDives)", "Night dives")
                scheduleStat("wind", "Nitrox", "Available")
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Dive-deck schedule. \(trip.totalDives) total dives, up to four per day, \(trip.nightDives) night dives, nitrox available.")
    }

    private func scheduleStat(_ icon: String, _ value: String, _ label: String) -> some View {
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

    // MARK: Day filter & cards

    private var dayFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(dayFilters, id: \.self) { filter in
                    filterChip(filter)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedDay
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedDay = filter }
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

    private func dayCard(_ day: LiveaboardDay) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("water.waves", theme.ocean)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            Text(day.day)
                                .font(TravelTypography.eyebrow)
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                            tagPill("\(day.diveCount) dives", theme.tint)
                            if day.hasNightDive { tagPill("Night", theme.ink) }
                        }
                        Text(day.area)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }

                VStack(spacing: TravelSpacing.xs) {
                    ForEach(day.sites, id: \.self) { site in
                        siteRow(site)
                    }
                }

                Text(day.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(day.day), \(day.area), \(day.diveCount) dives\(day.hasNightDive ? " including a night dive" : ""). Sites: \(day.sites.joined(separator: ", ")). \(day.note)")
    }

    private func siteRow(_ site: String) -> some View {
        let isFav = favourites.contains(site)
        return HStack(spacing: TravelSpacing.sm) {
            Image(systemName: "mappin.circle.fill")
                .font(TravelTypography.caption)
                .foregroundStyle(theme.ocean)
            Text(site)
                .font(TravelTypography.caption)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button {
                withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                    if isFav { favourites.remove(site) } else { favourites.insert(site) }
                }
            } label: {
                Image(systemName: isFav ? "star.fill" : "star")
                    .font(TravelTypography.caption)
                    .foregroundStyle(isFav ? theme.sun : Color.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isFav ? "Saved dive site: \(site)" : "Save dive site \(site)")
        }
        .padding(.vertical, TravelSpacing.xxs)
        .padding(.horizontal, TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

    // MARK: Cabins

    private var cabinList: some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(trip.cabinInfo) { cabin in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(cabin.icon, theme.tint)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(cabin.name)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                tagPill(cabin.deck, theme.sky)
                            }
                            Text(cabin.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(cabin.name), \(cabin.deck). \(cabin.detail)")
            }
        }
    }

    // MARK: Crew

    private var crewList: some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(trip.crew) { member in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(member.icon, theme.ocean)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(member.name)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(member.role)
                                .font(TravelTypography.eyebrow)
                                .textCase(.uppercase)
                                .foregroundStyle(theme.tint)
                            Text(member.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(member.name), \(member.role). \(member.detail)")
            }
        }
    }

    // MARK: Included vs not included

    private var comparisonCard: some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            comparisonColumn("Included", "checkmark.circle.fill", theme.moss, trip.includedPoints)
            comparisonColumn("Not included", "xmark.circle.fill", theme.coral, trip.notIncludedPoints)
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
                            Image(systemName: icon)
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

    // MARK: Generic info list

    private func infoList(_ rows: [LiveaboardRow]) -> some View {
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

    // MARK: Meals & dietary

    private var mealsCard: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("fork.knife", theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Full board, chef-prepared")
                        .font(TravelTypography.cardTitle)
                    Text(trip.dietaryPlaceholder)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Dietary preferences form coming soon")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Meals, full board. \(trip.dietaryPlaceholder). Dietary form placeholder.")
    }

    // MARK: Checklist

    private var checklistCard: some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(trip.checklist) { item in
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
                    .accessibilityLabel("\(item.name), \(item.done ? "ready" : "outstanding"). \(item.note)")
                }
            }
        }
    }

    // MARK: Conditions placeholders

    private var conditionsCard: some View {
        HStack(spacing: TravelSpacing.md) {
            conditionTile("cloud.sun.fill", "Weather", trip.weatherPlaceholder, theme.sky)
            conditionTile("water.waves", "Sea state", trip.seaStatePlaceholder, theme.ocean)
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
                if !trip.routeSequence.isEmpty {
                    Text(trip.routeSequence.joined(separator: " → "))
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Label("\(trip.region) · cruise map coming soon", systemImage: "map.fill")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cruise route map of \(trip.region). Placeholder.")
    }

    // MARK: Badges & shared bits

    private func statusBadge(_ status: BookingStatus) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(status.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private func paymentBadge(_ payment: BookingPayment) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "creditcard.fill")
            Text(payment.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(payment.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(payment.accent.opacity(0.15), in: Capsule())
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

    private func tagPill(_ text: String, _ tint: Color) -> some View {
        Text(text)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(tint)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(tint.opacity(0.15), in: Capsule())
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

// MARK: - Liveaboard appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct LiveaboardAppear: ViewModifier {
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
extension LiveaboardTrip {
    /// A deterministic sample 7-night Raja Ampat liveaboard aboard a traditional pinisi.
    static var sampleRajaAmpat: LiveaboardTrip {
        let theme = TravelTheme.current
        return LiveaboardTrip(
            heroTitle: "Cahaya Laut · Raja Ampat",
            heroSubtitle: "Seven nights aboard a traditional pinisi through the richest reefs on Earth — north and south.",
            heroSymbol: "sailboat.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            cabins: 6,
            guests: 12,
            nights: 7,
            facts: [
                LiveaboardFact(icon: "sailboat.fill", label: "Boat", value: "Cahaya Laut"),
                LiveaboardFact(icon: "ruler.fill", label: "Length", value: "40 m pinisi"),
                LiveaboardFact(icon: "bed.double.fill", label: "Cabins", value: "6 en-suite"),
                LiveaboardFact(icon: "person.3.fill", label: "Guests", value: "12 divers"),
                LiveaboardFact(icon: "figure.sailing", label: "Crew", value: "14 incl. 3 guides"),
                LiveaboardFact(icon: "moon.stars.fill", label: "Nights", value: "7 nights")
            ],
            status: .confirmed,
            payment: .deposit,
            paymentNote: "30% deposit received — balance of £1,820 due 60 days before departure.",
            itinerary: [
                LiveaboardDay(day: "Day 1", area: "Dampier Strait", sites: ["Cape Kri", "Sardine Reef", "Arborek Jetty (night)"], diveCount: 3, hasNightDive: true, note: "Board at Sorong, check dives in the strait, easing into the current."),
                LiveaboardDay(day: "Day 2", area: "Dampier Strait", sites: ["Blue Magic", "Sawandarek", "Mioskon"], diveCount: 3, hasNightDive: false, note: "Manta cleaning station at Blue Magic; wobbegongs under the jetty."),
                LiveaboardDay(day: "Day 3", area: "Penemu", sites: ["Melissa’s Garden", "My Reef", "Galaxy"], diveCount: 3, hasNightDive: false, note: "Hard-coral gardens and the Piaynemo viewpoint between dives."),
                LiveaboardDay(day: "Day 4", area: "Crossing to Misool", sites: ["Daram (Andiamo)", "Warna Berwarna"], diveCount: 2, hasNightDive: false, note: "Overnight steam south; soft-coral walls in the afternoon."),
                LiveaboardDay(day: "Day 5", area: "Misool", sites: ["Boo Windows", "Magic Mountain", "Nudi Rock"], diveCount: 3, hasNightDive: false, note: "Magic Mountain seamount — resident and oceanic mantas."),
                LiveaboardDay(day: "Day 6", area: "Misool", sites: ["Four Kings", "Whale Rock", "Yilliet"], diveCount: 3, hasNightDive: false, note: "Pinnacles draped in soft coral and schooling fish."),
                LiveaboardDay(day: "Day 7", area: "Return north", sites: ["Wedding Cake", "Eagle Rock"], diveCount: 2, hasNightDive: false, note: "Final dives, then steam back toward Sorong for disembarkation.")
            ],
            cabinInfo: [
                LiveaboardCabin(name: "Lower-deck twin", deck: "Lower", icon: "bed.double.fill", detail: "Two single beds, en-suite, air-con — the most affordable cabins."),
                LiveaboardCabin(name: "Main-deck double", deck: "Main", icon: "bed.double.fill", detail: "Queen bed, large windows and en-suite, steps from the dive deck."),
                LiveaboardCabin(name: "Master suite", deck: "Upper", icon: "sparkles", detail: "Private upper-deck suite with a sea-view lounge and bathtub.")
            ],
            crew: [
                LiveaboardCrew(name: "Captain Yakob", role: "Captain", icon: "sailboat.fill", detail: "Papuan skipper with two decades reading Raja Ampat’s tides and channels."),
                LiveaboardCrew(name: "Wayan", role: "Cruise director / guide", icon: "figure.sailing", detail: "Marine biologist; briefs every site and leads the photo group."),
                LiveaboardCrew(name: "Marlon", role: "Dive guide", icon: "water.waves", detail: "Eagle-eyed critter spotter — pygmy seahorses are his speciality.")
            ],
            includedPoints: [
                "Up to 4 dives a day with guide",
                "Cabin, full board and snacks",
                "Tanks, weights and air fills",
                "Airport and harbour transfers"
            ],
            notIncludedPoints: [
                "Marine-park fees (≈ £85)",
                "Nitrox and equipment rental",
                "Crew gratuities",
                "Travel and dive insurance"
            ],
            gearOptions: [
                LiveaboardRow(title: "Full gear rental", subtitle: "Per day", icon: "bag.fill", detail: "BCD, regulator, computer and exposure suit available — reserve sizes ahead.", accent: theme.tint),
                LiveaboardRow(title: "Nitrox (EANx)", subtitle: "Per week", icon: "wind", detail: "Membrane nitrox on board; certification required, longer no-deco times.", accent: theme.ocean),
                LiveaboardRow(title: "15L tanks", subtitle: "On request", icon: "cylinder.fill", detail: "Larger cylinders for higher-consumption divers, subject to availability.", accent: theme.sky)
            ],
            marineLife: [
                LiveaboardRow(title: "Reef & oceanic mantas", icon: "water.waves", detail: "Cleaning stations at Blue Magic and Magic Mountain.", accent: theme.ocean),
                LiveaboardRow(title: "Pygmy seahorses", icon: "sparkles", detail: "On the sea fans at Misool — your guide will find them.", accent: theme.coral),
                LiveaboardRow(title: "Wobbegong sharks", icon: "fish.fill", detail: "Carpet sharks tucked under jetties and ledges.", accent: theme.tint),
                LiveaboardRow(title: "Schooling fish", icon: "fish.fill", detail: "Walls of fusiliers, barracuda and trevally in the currents.", accent: theme.sky)
            ],
            checklist: [
                LiveaboardCheckItem(name: "Passport (6+ months)", done: true, note: "Valid well beyond travel dates"),
                LiveaboardCheckItem(name: "Dive certification card", done: true, note: "Advanced Open Water or above"),
                LiveaboardCheckItem(name: "Logbook", done: false, note: "Bring proof of recent dives"),
                LiveaboardCheckItem(name: "Dive insurance / DAN", done: false, note: "Must cover liveaboard diving & evacuation")
            ],
            safetyNotes: [
                "Attend the full vessel and dive-deck briefing before the first dive.",
                "Carry an SMB and audible alert; many sites have strong current.",
                "Nearest hyperbaric chamber is distant — dive conservatively and use nitrox on air profiles.",
                "Know the emergency muster station and life-jacket location in your cabin."
            ],
            dietaryPlaceholder: "Buffet breakfast, hot lunch, three-course dinner; vegetarian and allergy options on request.",
            weatherPlaceholder: "Warm 30°C · scattered showers",
            seaStatePlaceholder: "Calm · light swell south",
            routeSequence: ["Sorong", "Dampier", "Penemu", "Misool", "Sorong"],
            region: "Raja Ampat, West Papua"
        )
    }

    /// A deterministic sample 4-night Komodo liveaboard.
    static var sampleKomodo: LiveaboardTrip {
        let theme = TravelTheme.current
        return LiveaboardTrip(
            heroTitle: "Sea Safari · Komodo",
            heroSubtitle: "Four nights through Komodo National Park — manta channels, current-swept pinnacles and the dragons.",
            heroSymbol: "sailboat.fill",
            heroGradient: [theme.tint, theme.ocean, theme.moss],
            cabins: 8,
            guests: 16,
            nights: 4,
            facts: [
                LiveaboardFact(icon: "sailboat.fill", label: "Boat", value: "Sea Safari"),
                LiveaboardFact(icon: "ruler.fill", label: "Length", value: "34 m"),
                LiveaboardFact(icon: "bed.double.fill", label: "Cabins", value: "8 en-suite"),
                LiveaboardFact(icon: "person.3.fill", label: "Guests", value: "16 divers"),
                LiveaboardFact(icon: "figure.sailing", label: "Crew", value: "12 incl. 4 guides"),
                LiveaboardFact(icon: "moon.stars.fill", label: "Nights", value: "4 nights")
            ],
            status: .pending,
            payment: .unpaid,
            paymentNote: "Spot held for 5 days — pay the 25% deposit to confirm your cabin.",
            itinerary: [
                LiveaboardDay(day: "Day 1", area: "North Komodo", sites: ["Batu Bolong", "Castle Rock", "Crystal Rock (night)"], diveCount: 3, hasNightDive: true, note: "Board at Labuan Bajo; current-swept pinnacles teeming with fish."),
                LiveaboardDay(day: "Day 2", area: "Central park", sites: ["The Cauldron (Shotgun)", "Siaba Besar", "Tatawa Besar"], diveCount: 3, hasNightDive: false, note: "Drift the Cauldron with mantas, then turtles on the Siaba slope."),
                LiveaboardDay(day: "Day 3", area: "South Komodo", sites: ["Manta Alley", "Cannibal Rock"], diveCount: 2, hasNightDive: false, note: "Cooler southern water — manta aggregations and rich macro."),
                LiveaboardDay(day: "Day 4", area: "Rinca & return", sites: ["Three Sisters", "Pink Beach"], diveCount: 2, hasNightDive: false, note: "Dawn dive, then a dragon walk on Rinca before heading back.")
            ],
            cabinInfo: [
                LiveaboardCabin(name: "Lower-deck twin", deck: "Lower", icon: "bed.double.fill", detail: "Twin beds, en-suite and air-con close to the dive deck."),
                LiveaboardCabin(name: "Upper-deck double", deck: "Upper", icon: "sparkles", detail: "Double bed with sea views and a private bathroom.")
            ],
            crew: [
                LiveaboardCrew(name: "Captain Hasan", role: "Captain", icon: "sailboat.fill", detail: "Knows every current line in the park after years running Komodo."),
                LiveaboardCrew(name: "Dewi", role: "Cruise director", icon: "figure.sailing", detail: "Runs the dive deck and the Rinca dragon excursion."),
                LiveaboardCrew(name: "Putu", role: "Dive guide", icon: "water.waves", detail: "Current specialist; rigs reef hooks and reads the tides.")
            ],
            includedPoints: [
                "Up to 3 dives a day with guide",
                "Cabin, full board and snacks",
                "Tanks, weights and air",
                "Rinca dragon excursion"
            ],
            notIncludedPoints: [
                "Komodo park & ranger fees",
                "Nitrox and gear rental",
                "Crew tips",
                "Insurance and evacuation cover"
            ],
            gearOptions: [
                LiveaboardRow(title: "Full gear rental", subtitle: "Per day", icon: "bag.fill", detail: "Complete kit available; reserve your sizes when you book.", accent: theme.tint),
                LiveaboardRow(title: "Nitrox (EANx)", subtitle: "Per trip", icon: "wind", detail: "Recommended for the repetitive current dives; certification required.", accent: theme.ocean),
                LiveaboardRow(title: "Reef hook", subtitle: "Provided", icon: "link", detail: "Essential at Castle and Crystal Rock — briefed on use.", accent: theme.sky)
            ],
            marineLife: [
                LiveaboardRow(title: "Reef mantas", icon: "water.waves", detail: "Manta Alley and the Cauldron drift in good numbers.", accent: theme.ocean),
                LiveaboardRow(title: "Grey reef sharks", icon: "fish.fill", detail: "Hang in the current at Castle and Crystal Rock.", accent: theme.tint),
                LiveaboardRow(title: "Macro critters", icon: "sparkles", detail: "Frogfish, nudibranchs and pygmy seahorses in the south.", accent: theme.coral),
                LiveaboardRow(title: "Komodo dragons", icon: "tortoise.fill", detail: "Seen on the guided Rinca Island walk.", accent: theme.moss)
            ],
            checklist: [
                LiveaboardCheckItem(name: "Passport (6+ months)", done: true, note: "Valid beyond travel dates"),
                LiveaboardCheckItem(name: "Dive certification card", done: true, note: "Advanced recommended for currents"),
                LiveaboardCheckItem(name: "Logbook", done: false, note: "20+ logged dives advised"),
                LiveaboardCheckItem(name: "Dive insurance / DAN", done: false, note: "Evacuation cover essential")
            ],
            safetyNotes: [
                "Komodo currents are strong — carry a reef hook, SMB and alert device.",
                "Follow guide briefings on entry timing and down-currents precisely.",
                "Southern sites are cooler; bring adequate exposure protection.",
                "Confirm the nearest chamber and evacuation plan at the briefing."
            ],
            dietaryPlaceholder: "Indonesian and western buffets; vegetarian, vegan and allergy options on request.",
            weatherPlaceholder: "Sunny 29°C · breezy",
            seaStatePlaceholder: "Moderate · stronger in channels",
            routeSequence: ["Labuan Bajo", "North", "Central", "South", "Rinca"],
            region: "Komodo National Park"
        )
    }
}

struct TravelLiveaboardDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelLiveaboardDashboard(trip: .sampleRajaAmpat)
                .previewDisplayName("Liveaboard · Raja Ampat")

            TravelLiveaboardDashboard(trip: .sampleKomodo)
                .previewDisplayName("Liveaboard · Komodo")

            TravelLiveaboardDashboard(trip: .sampleRajaAmpat)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Liveaboard · Dynamic Type XL")
        }
    }
}
#endif
