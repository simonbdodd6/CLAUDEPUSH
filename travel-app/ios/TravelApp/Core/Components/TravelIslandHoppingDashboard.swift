import SwiftUI

// MARK: - Travel island-hopping dashboard (Phase 117)
//
// A flagship, presentation-only Island-Hopping Planner: the hub for a multi-island
// route — a hero with totals (islands, legs, sea time, distance), an island-to-island
// route overview, a filterable list of per-leg cards (from→to, transport type,
// departure & arrival, duration, crossing conditions, operator, fare and a booking
// status badge), recommended nights per island, ferry/fast-boat timetable
// placeholders, connection/transfer warnings, sea-sickness & crossing tips,
// luggage/transfer notes, seasonal-conditions notes, alternative-route options and a
// map placeholder. A caller supplies an `IslandHopPlan` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `MapTexturePlaceholder`, `TravelTypography` and the tokens —
// and the Phase-104 `BookingStatus` badge. `IslandHopPlan` and its nested rows are
// lightweight presentation models (not DTOs); the component holds no data,
// networking, persistence, repository, view-model, navigation, AppContainer or DTO
// logic, and is not wired into any screen. The transport-type filters and favourite
// stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// How an island-hop leg is travelled — drives the glyph, accent and the filter.
enum HopTransport: String, CaseIterable {
    case fastBoat
    case ferry
    case charter
    case flight

    var label: String {
        switch self {
        case .fastBoat: "Fast boat"
        case .ferry: "Ferry"
        case .charter: "Charter"
        case .flight: "Flight"
        }
    }

    var icon: String {
        switch self {
        case .fastBoat: "ferry.fill"
        case .ferry: "sailboat.fill"
        case .charter: "water.waves"
        case .flight: "airplane"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .fastBoat: return theme.sky
        case .ferry: return theme.ocean
        case .charter: return theme.tint
        case .flight: return theme.coral
        }
    }
}

/// A single leg of the island-hop route.
struct IslandHopLeg: Identifiable {
    let id: String
    var from: String
    var to: String
    var transport: HopTransport
    var departure: String
    var arrival: String
    var duration: String
    var crossing: String
    var operatorName: String
    var fare: String
    var status: BookingStatus
    var warning: String?
    var note: String

    init(
        id: String? = nil,
        from: String,
        to: String,
        transport: HopTransport,
        departure: String,
        arrival: String,
        duration: String,
        crossing: String,
        operatorName: String,
        fare: String,
        status: BookingStatus,
        warning: String? = nil,
        note: String
    ) {
        self.id = id ?? "\(from)-\(to)"
        self.from = from
        self.to = to
        self.transport = transport
        self.departure = departure
        self.arrival = arrival
        self.duration = duration
        self.crossing = crossing
        self.operatorName = operatorName
        self.fare = fare
        self.status = status
        self.warning = warning
        self.note = note
    }
}

/// A recommended-nights entry for a single island.
struct IslandStay: Identifiable {
    let id = UUID()
    var island: String
    var nights: Int
    var icon: String
    var detail: String
}

/// A generic guide row reused for timetables, alternatives and warnings.
struct IslandHopRow: Identifiable {
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

/// The full, presentation-only content for an island-hopping plan.
struct IslandHopPlan {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var islandCount: Int
    var seaTime: String
    var distance: String
    var routeSequence: [String]
    var legs: [IslandHopLeg]
    var stays: [IslandStay]
    var timetables: [IslandHopRow]
    var warnings: [String]
    var seaSicknessTips: [String]
    var luggageNotes: [String]
    var seasonalNotes: [String]
    var alternatives: [IslandHopRow]
    var region: String
}

/// A premium, presentation-only island-hopping dashboard rendered from an `IslandHopPlan`.
struct TravelIslandHoppingDashboard: View {
    var plan: IslandHopPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedTransport: String = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    private var transportFilters: [String] {
        ["All"] + HopTransport.allCases.map(\.label)
    }

    private var filteredLegs: [IslandHopLeg] {
        guard selectedTransport != "All" else { return plan.legs }
        return plan.legs.filter { $0.transport.label == selectedTransport }
    }

    var body: some View {
        PremiumScrollView {
            hero
            routeGroup
            planningGroup
            tipsGroup
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
            eyebrow: "Island Hopping",
            symbol: plan.heroSymbol,
            title: plan.heroTitle,
            subtitle: plan.heroSubtitle,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: "\(plan.islandCount)", label: "Islands"),
                HeroMetric(value: "\(plan.legs.count)", label: "Legs"),
                HeroMetric(value: plan.seaTime, label: "Sea time")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(IslandHopAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var routeGroup: some View {
        Group {
            section("Route overview", "\(plan.distance) across \(plan.islandCount) islands.", 1) {
                routeOverviewCard
            }

            section("Legs", "Filter by how you travel.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    transportFilter
                    if filteredLegs.isEmpty {
                        GlassCard {
                            Text("No \(selectedTransport.lowercased()) legs on this route.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredLegs) { leg in
                                legCard(leg)
                            }
                        }
                    }
                }
            }
        }
    }

    private var planningGroup: some View {
        Group {
            section("Nights per island", "A suggested split for the trip.", 3) {
                staysList
            }

            section("Timetables", "Typical departures — confirm locally.", 4) {
                infoList(plan.timetables)
            }

            section("Connection warnings", "Mind these transfers.", 5) {
                bulletCard(plan.warnings, icon: "exclamationmark.triangle.fill", tint: theme.coral)
            }

            section("Alternative routes", "Other ways to link it up.", 6) {
                infoList(plan.alternatives)
            }
        }
    }

    private var tipsGroup: some View {
        Group {
            section("Crossing & sea-sickness", "Stay comfortable on the water.", 7) {
                bulletCard(plan.seaSicknessTips, icon: "heart.text.square.fill", tint: theme.ocean)
            }

            section("Luggage & transfers", "Moving bags between boats.", 8) {
                bulletCard(plan.luggageNotes, icon: "suitcase.rolling.fill", tint: theme.tint)
            }

            section("Seasonal conditions", "When the seas change.", 8) {
                bulletCard(plan.seasonalNotes, icon: "calendar", tint: theme.sun)
            }

            section("Map", "Picture the whole route.", 8) {
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
        .modifier(IslandHopAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Route overview

    private var routeOverviewCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(plan.routeSequence.enumerated()), id: \.offset) { index, island in
                            HStack(spacing: TravelSpacing.xs) {
                                Text(island)
                                    .font(TravelTypography.caption)
                                    .foregroundStyle(.primary)
                                    .padding(.horizontal, TravelSpacing.sm)
                                    .padding(.vertical, TravelSpacing.xs)
                                    .background(.thinMaterial, in: Capsule())
                                if index < plan.routeSequence.count - 1 {
                                    Image(systemName: "arrow.right")
                                        .font(TravelTypography.eyebrow)
                                        .foregroundStyle(theme.tint)
                                }
                            }
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
                HStack(spacing: TravelSpacing.md) {
                    routeStat("map", plan.distance, "Distance")
                    routeStat("clock.fill", plan.seaTime, "Sea time")
                    routeStat("ferry.fill", "\(plan.legs.count)", "Legs")
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Route: \(plan.routeSequence.joined(separator: " to ")). \(plan.distance), \(plan.seaTime) at sea, \(plan.legs.count) legs.")
    }

    private func routeStat(_ icon: String, _ value: String, _ label: String) -> some View {
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
    }

    // MARK: Filters

    private var transportFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(transportFilters, id: \.self) { filter in
                    filterChip(filter)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedTransport
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedTransport = filter }
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

    // MARK: Leg cards

    private func legCard(_ leg: IslandHopLeg) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(leg.transport.icon, leg.transport.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        tagPill(leg.transport.label, leg.transport.accent)
                        Text("\(leg.from) → \(leg.to)")
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Label(leg.operatorName, systemImage: "building.2.fill")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(leg.id, "\(leg.from) to \(leg.to)")
                }

                statusBadge(leg.status)

                PremiumAdaptiveGrid(minimumWidth: 104) {
                    legMetric("airplane.departure", leg.departure, "Depart")
                    legMetric("airplane.arrival", leg.arrival, "Arrive")
                    legMetric("timer", leg.duration, "Duration")
                    legMetric("banknote.fill", leg.fare, "Fare")
                }

                chip("water.waves", leg.crossing, theme.ocean)

                if let warning = leg.warning {
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(theme.coral)
                        Text(warning)
                            .font(TravelTypography.caption)
                            .foregroundStyle(theme.coral)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(TravelSpacing.sm)
                    .background(theme.coral.opacity(0.1), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                }

                Text(leg.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(legAccessibility(leg))
    }

    private func legAccessibility(_ leg: IslandHopLeg) -> String {
        var parts = [
            leg.transport.label, "\(leg.from) to \(leg.to)", leg.operatorName, leg.status.label,
            "departs \(leg.departure)", "arrives \(leg.arrival)", "duration \(leg.duration)",
            "fare \(leg.fare)", "crossing \(leg.crossing)"
        ]
        if let warning = leg.warning { parts.append("warning: \(warning)") }
        parts.append(leg.note)
        return parts.joined(separator: ", ")
    }

    private func legMetric(_ icon: String, _ value: String, _ label: String) -> some View {
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

    // MARK: Nights per island

    private var staysList: some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(plan.stays) { stay in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(stay.icon, theme.tint)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(stay.island)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                tagPill("\(stay.nights) \(stay.nights == 1 ? "night" : "nights")", theme.sun)
                            }
                            Text(stay.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(stay.island), \(stay.nights) nights. \(stay.detail)")
            }
        }
    }

    // MARK: Generic info list & row

    private func infoList(_ rows: [IslandHopRow]) -> some View {
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

    // MARK: Map placeholder

    private var mapPlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("\(plan.region) · route map coming soon", systemImage: "map.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Route map of \(plan.region). Placeholder.")
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
        .accessibilityLabel(isFav ? "Saved leg: \(name)" : "Save leg \(name)")
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

// MARK: - Island-hop appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct IslandHopAppear: ViewModifier {
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
extension IslandHopPlan {
    /// A deterministic sample route: Bali → Nusa Lembongan → Gili Air → Gili Meno
    /// → Lombok, plus a flight on to Komodo (Labuan Bajo).
    static var sampleIndonesia: IslandHopPlan {
        let theme = TravelTheme.current
        return IslandHopPlan(
            heroTitle: "Island Hopping",
            heroSubtitle: "Bali to Komodo by boat and a short flight — across the Lombok Strait and the Gilis.",
            heroSymbol: "ferry.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            islandCount: 6,
            seaTime: "≈ 3h 30m",
            distance: "≈ 520 km",
            routeSequence: ["Bali", "Lembongan", "Gili Air", "Gili Meno", "Lombok", "Komodo"],
            legs: [
                IslandHopLeg(from: "Sanur, Bali", to: "Nusa Lembongan", transport: .fastBoat, departure: "08:00", arrival: "08:35", duration: "35 min", crossing: "Usually calm AM", operatorName: "Scoot Fast Cruises", fare: "£18", status: .confirmed, note: "Earliest crossing is the smoothest — book the front-of-boat seats."),
                IslandHopLeg(from: "Nusa Lembongan", to: "Gili Air", transport: .fastBoat, departure: "10:30", arrival: "12:45", duration: "2h 15m", crossing: "Open-water swell", operatorName: "Kuda Hitam Express", fare: "£32", status: .confirmed, warning: "Open crossing of the Lombok Strait — can be rough midday.", note: "Direct boat avoids backtracking to Bali; sit centre and low for the swell."),
                IslandHopLeg(from: "Gili Air", to: "Gili Meno", transport: .charter, departure: "Flexible", arrival: "+15 min", duration: "15 min", crossing: "Sheltered", operatorName: "Local hopping boat", fare: "£6", status: .pending, note: "Short island-hop charter; agree the fare before stepping aboard."),
                IslandHopLeg(from: "Gili Meno", to: "Bangsal, Lombok", transport: .ferry, departure: "11:15", arrival: "11:45", duration: "30 min", crossing: "Choppy on the wind", operatorName: "Public slow boat", fare: "£3", status: .needsAttention, warning: "Public boat leaves only when full — allow a flexible buffer.", note: "Cheapest option; no fixed timetable, so don’t pair it with a same-day flight."),
                IslandHopLeg(from: "Lombok (LOP)", to: "Labuan Bajo (LBJ)", transport: .flight, departure: "13:20", arrival: "14:30", duration: "1h 10m", crossing: "Short hop east", operatorName: "Wings Air", fare: "£64", status: .confirmed, note: "The gateway flight to Komodo; baggage allowance is tight on the ATR.")
            ],
            stays: [
                IslandStay(island: "Nusa Lembongan", nights: 2, icon: "sun.max.fill", detail: "Snorkel Mangrove Point and watch sunset from the bridge to Ceningan."),
                IslandStay(island: "Gili Air", nights: 3, icon: "beach.umbrella.fill", detail: "The liveliest-but-mellow Gili — great house reef and easy day pace."),
                IslandStay(island: "Gili Meno", nights: 1, icon: "leaf.fill", detail: "The quiet honeymoon island; one slow night by the turtle point."),
                IslandStay(island: "Lombok (Kuta)", nights: 2, icon: "figure.surfing", detail: "Surf beaches and a launch pad for the Komodo flight."),
                IslandStay(island: "Komodo (Labuan Bajo)", nights: 3, icon: "water.waves", detail: "Liveaboard or day trips to the dragons, Padar and Manta Point.")
            ],
            timetables: [
                IslandHopRow(title: "Sanur ⇄ Lembongan", subtitle: "Fast boat", icon: "ferry.fill", detail: "Roughly hourly 08:00–16:30; first and last fill up fast in season.", accent: theme.sky),
                IslandHopRow(title: "Lembongan ⇄ Gili Air", subtitle: "Fast boat", icon: "ferry.fill", detail: "One or two direct departures daily — book ahead, they sell out.", accent: theme.sky),
                IslandHopRow(title: "Gili ⇄ Bangsal", subtitle: "Public boat", icon: "sailboat.fill", detail: "No timetable; departs when full, mostly mornings.", accent: theme.ocean)
            ],
            warnings: [
                "Don’t connect a no-timetable public boat to a same-day flight — leave a night’s buffer.",
                "Bangsal harbour transfers are on foot over sand; pack light or use a porter.",
                "Fast-boat schedules slip in rough weather — keep the Komodo flight a day clear.",
                "Some operators overbook; reconfirm every leg the day before."
            ],
            seaSicknessTips: [
                "Take motion-sickness tablets 30–60 minutes before boarding.",
                "Sit low and central, near the waterline, and look at the horizon.",
                "Travel on the earliest crossing when seas are calmest.",
                "Stay hydrated and avoid heavy, greasy food before a long crossing."
            ],
            luggageNotes: [
                "Pack in a soft duffel — easier to pass along boat decks than hard cases.",
                "Use dry bags; spray soaks bags stowed on open bows.",
                "Flights to Labuan Bajo limit checked bags to ~15–20 kg — weigh ahead.",
                "Keep valuables and documents in your daypack, not the stowed luggage."
            ],
            seasonalNotes: [
                "Dry season (May–Oct): calmer seas, the most reliable crossings.",
                "Wet season (Nov–Mar): bigger swell and more cancellations on open legs.",
                "Strong winds can close the Lombok Strait crossing at short notice.",
                "Peak July–Aug and New Year: book every boat and flight well ahead."
            ],
            alternatives: [
                IslandHopRow(title: "Via Padangbai", subtitle: "Alternative start", icon: "arrow.triangle.branch", detail: "Slower public ferry from east Bali to Lombok — cheap but a long day.", accent: theme.tint),
                IslandHopRow(title: "Bali → Gili direct", subtitle: "Skip the Nusas", icon: "arrow.right.circle.fill", detail: "Direct fast boats run Bali to Gili Trawangan if you’re short on time.", accent: theme.tint),
                IslandHopRow(title: "Fly Bali → Labuan Bajo", subtitle: "Skip the boats", icon: "airplane", detail: "A 1h 15m flight straight to Komodo if seas or time are against you.", accent: theme.coral)
            ],
            region: "Indonesia · Bali to Komodo"
        )
    }
}

struct TravelIslandHoppingDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelIslandHoppingDashboard(plan: .sampleIndonesia)
                .previewDisplayName("Island hopping · Indonesia")

            TravelIslandHoppingDashboard(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Island hopping · Dynamic Type XL")
        }
    }
}
#endif
