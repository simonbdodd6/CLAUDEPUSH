import SwiftUI

// MARK: - Travel transport & getting-around dashboard (Phase 126)
//
// A flagship, presentation-only Transport & Getting Around dashboard: a hero with
// at-a-glance facts (best ride-hailing app, typical scooter/day, airport-transfer cost,
// drive side, licence requirements), a category-filtered transport-options comparison
// with cost/speed/convenience/safety indicators, a presentation-only journey-cost
// calculator, ride-hailing guidance (Gojek/Grab), scooter-rental & safety guidance,
// taxi guidance (Bluebird), private-driver norms, airport-transfer options, an inter-
// island ferry recap, domestic-flight tips, road-safety reminders, region-filtered
// traffic notes, a fare-estimate placeholder and a disclaimer. A caller supplies a
// `TransportGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. `TransportGuide` and its
// nested rows are lightweight presentation models (not DTOs); the component holds no
// data, networking, persistence, repository, view-model, navigation, AppContainer or
// DTO logic, and is not wired into any screen. The calculator computes locally against
// illustrative rates; the category and region filters and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A way to get around — drives the badge glyph, accent and the category filter.
enum GettingAroundMode: String, CaseIterable {
    case rideHailing
    case scooter
    case taxi
    case privateDriver
    case ferry
    case flight

    var label: String {
        switch self {
        case .rideHailing: "Ride-hailing"
        case .scooter: "Scooter"
        case .taxi: "Taxi"
        case .privateDriver: "Private driver"
        case .ferry: "Ferry"
        case .flight: "Flights"
        }
    }

    var icon: String {
        switch self {
        case .rideHailing: "iphone.gen3"
        case .scooter: "scooter"
        case .taxi: "car.fill"
        case .privateDriver: "steeringwheel"
        case .ferry: "ferry.fill"
        case .flight: "airplane"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .rideHailing: return theme.tint
        case .scooter: return theme.sun
        case .taxi: return theme.ocean
        case .privateDriver: return theme.moss
        case .ferry: return theme.sky
        case .flight: return theme.coral
        }
    }
}

/// A single at-a-glance transport fact.
struct TransportFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A transport option in the comparison, with 0–4 indicator levels.
struct GettingAroundOption: Identifiable {
    let id: String
    var mode: GettingAroundMode
    var name: String
    var cost: Int
    var speed: Int
    var convenience: Int
    var safety: Int
    var summary: String

    init(mode: GettingAroundMode, name: String, cost: Int, speed: Int, convenience: Int, safety: Int, summary: String) {
        self.id = mode.label
        self.mode = mode
        self.name = name
        self.cost = cost
        self.speed = speed
        self.convenience = convenience
        self.safety = safety
        self.summary = summary
    }
}

/// A journey-cost calculator mode (illustrative rates).
struct TransportCalcMode: Identifiable {
    let id = UUID()
    var name: String
    var icon: String
    var base: Int      // Rp
    var perKm: Int     // Rp
}

/// A generic transport guide row reused for ride-hailing, scooter, taxi, driver,
/// airport, ferry, flights and traffic notes.
struct TransportInfoRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var region: String

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, region: String = "") {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.region = region
    }
}

/// The full, presentation-only content for a transport & getting-around guide.
struct TransportGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [TransportFact]
    var options: [GettingAroundOption]
    var calcModes: [TransportCalcMode]
    var rideHailing: [TransportInfoRow]
    var scooter: [TransportInfoRow]
    var taxi: [TransportInfoRow]
    var privateDriver: [TransportInfoRow]
    var airport: [TransportInfoRow]
    var ferry: [TransportInfoRow]
    var flights: [TransportInfoRow]
    var roadSafety: [String]
    var trafficNotes: [TransportInfoRow]
    var disclaimer: String
}

/// A premium, presentation-only transport dashboard rendered from a `TransportGuide`.
struct TravelTransportGettingAroundDashboard: View {
    var guide: TransportGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedMode = "All"
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []
    @State private var calcModeIndex = 0
    @State private var calcKm = 10

    private let theme = TravelTheme.current
    private let modeFilters = ["All", "Ride-hailing", "Scooter", "Taxi", "Private driver", "Ferry", "Flights"]
    private let regionFilters = ["All", "Bali", "Gili", "Lombok", "Komodo"]

    private var filteredOptions: [GettingAroundOption] {
        guard selectedMode != "All" else { return guide.options }
        return guide.options.filter { $0.mode.label == selectedMode }
    }

    private var filteredTraffic: [TransportInfoRow] {
        guard selectedRegion != "All" else { return guide.trafficNotes }
        return guide.trafficNotes.filter { $0.region == selectedRegion }
    }

    private var calcMode: TransportCalcMode? {
        guard guide.calcModes.indices.contains(calcModeIndex) else { return guide.calcModes.first }
        return guide.calcModes[calcModeIndex]
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            guidesGroup
            modesGroup
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
            eyebrow: "Getting Around",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Best app"), label: "App"),
                HeroMetric(value: factValue("Scooter/day"), label: "Scooter"),
                HeroMetric(value: factValue("Drive side"), label: "Drive")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(TransportAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Transport basics.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Compare options", "Filter by how you travel.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    chipRow(modeFilters, selected: selectedMode) { selectedMode = $0 }
                    if filteredOptions.isEmpty {
                        emptyCard("options")
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredOptions) { option in
                                optionCard(option)
                            }
                        }
                    }
                }
            }

            section("Journey cost", "A rough fare estimate.", 3) {
                calculatorCard
            }
        }
    }

    private var guidesGroup: some View {
        Group {
            section("Ride-hailing", "Gojek & Grab.", 4) {
                infoList(guide.rideHailing)
            }

            section("Scooter rental", "Freedom — with care.", 5) {
                infoList(guide.scooter)
            }

            section("Taxis", "Metered and reliable.", 6) {
                infoList(guide.taxi)
            }

            section("Private driver", "A day on your terms.", 7) {
                infoList(guide.privateDriver)
            }
        }
    }

    private var modesGroup: some View {
        Group {
            section("Airport transfers", "From the terminal.", 8) {
                infoList(guide.airport)
            }

            section("Ferries & fast boats", "Between the islands.", 8) {
                infoList(guide.ferry)
            }

            section("Domestic flights", "Across the archipelago.", 8) {
                infoList(guide.flights)
            }

            section("Road safety", "Ride and cross carefully.", 8) {
                bulletCard(guide.roadSafety, icon: "exclamationmark.triangle.fill", tint: theme.coral)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Traffic by region", "Filter by where you are.", 8) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    chipRow(regionFilters, selected: selectedRegion) { selectedRegion = $0 }
                    if filteredTraffic.isEmpty {
                        emptyCard("notes")
                    } else {
                        infoList(filteredTraffic)
                    }
                }
            }

            section("Fares", "Live pricing.", 8) {
                fareCard
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(TransportAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: TransportFact) -> some View {
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

    // MARK: Option cards

    private func optionCard(_ option: GettingAroundOption) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(option.mode.icon, option.mode.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        tagPill(option.mode.label, option.mode.accent)
                        Text(option.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(option.id, option.name)
                }
                PremiumAdaptiveGrid(minimumWidth: 132) {
                    ratingRow("Cost", option.cost, theme.sun)
                    ratingRow("Speed", option.speed, theme.sky)
                    ratingRow("Convenience", option.convenience, theme.tint)
                    ratingRow("Safety", option.safety, theme.moss)
                }
                Text(option.summary)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option.name), \(option.mode.label). Cost \(option.cost) of 4, speed \(option.speed), convenience \(option.convenience), safety \(option.safety). \(option.summary)")
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

    // MARK: Journey-cost calculator

    private var calculatorCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(guide.calcModes.enumerated()), id: \.element.id) { index, mode in
                            calcChip(index, mode)
                        }
                    }
                }
                HStack {
                    Text("Distance")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    stepperButton("minus") { if calcKm > 1 { calcKm -= 1 } }
                    Text("\(calcKm) km")
                        .font(TravelTypography.cardTitle)
                        .frame(minWidth: 56)
                    stepperButton("plus") { if calcKm < 200 { calcKm += 1 } }
                }
                Divider().opacity(0.4)
                if let calcMode {
                    VStack(spacing: TravelSpacing.xxs) {
                        Text("≈ Rp \(grouped(calcMode.base + calcMode.perKm * calcKm))")
                            .font(TravelTypography.display)
                            .foregroundStyle(theme.tint)
                        Text("\(calcMode.name) · base Rp \(grouped(calcMode.base)) + Rp \(grouped(calcMode.perKm))/km")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Illustrative only — not a live fare.")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(calcMode.map { "Journey cost. \($0.name) for \(calcKm) kilometres is about \(grouped($0.base + $0.perKm * calcKm)) rupiah." } ?? "Journey cost calculator.")
    }

    private func calcChip(_ index: Int, _ mode: TransportCalcMode) -> some View {
        let selected = index == calcModeIndex
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { calcModeIndex = index }
        } label: {
            Label(mode.name, systemImage: mode.icon)
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
        .accessibilityLabel("\(mode.name) rate")
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    private func stepperButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { action() }
        } label: {
            Image(systemName: icon)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(theme.tint)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon == "plus" ? "Increase distance" : "Decrease distance")
    }

    // MARK: Filter chips & empty

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

    private func emptyCard(_ what: String) -> some View {
        GlassCard {
            Text("No \(what) for that filter.")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: Generic info list

    private func infoList(_ rows: [TransportInfoRow]) -> some View {
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
                        favouriteButton(row.id, row.title)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Fare placeholder

    private var fareCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "dollarsign.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Live fare estimates")
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
        .accessibilityLabel("Live fare estimates. \(guide.disclaimer)")
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
        .accessibilityLabel(isFav ? "Saved route: \(name)" : "Save route \(name)")
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

    /// Inserts thousands separators without depending on a locale formatter.
    private func grouped(_ value: Int) -> String {
        let digits = Array(String(value))
        var out = ""
        for (index, character) in digits.enumerated() {
            if index > 0 && (digits.count - index) % 3 == 0 { out.append(",") }
            out.append(character)
        }
        return out
    }
}

// MARK: - Transport appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct TransportAppear: ViewModifier {
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
extension TransportGuide {
    /// A deterministic sample transport guide for Indonesia (illustrative rates).
    static var sampleIndonesia: TransportGuide {
        let theme = TravelTheme.current
        return TransportGuide(
            heroTitle: "Indonesia · Getting Around",
            heroSubtitle: "Apps, scooters, drivers and boats — how to move around the islands cheaply and safely.",
            heroSymbol: "car.2.fill",
            heroGradient: [theme.tint, theme.ocean, theme.sun],
            facts: [
                TransportFact(icon: "iphone.gen3", label: "Best app", value: "Gojek / Grab"),
                TransportFact(icon: "scooter", label: "Scooter/day", value: "Rp 70–90k"),
                TransportFact(icon: "airplane.arrival", label: "Airport (Bali)", value: "Rp 150–300k"),
                TransportFact(icon: "arrow.left.and.right", label: "Drive side", value: "Left"),
                TransportFact(icon: "person.text.rectangle.fill", label: "Licence", value: "IDP + bike")
            ],
            options: [
                GettingAroundOption(mode: .rideHailing, name: "Gojek / Grab", cost: 1, speed: 3, convenience: 4, safety: 3, summary: "Cheap, app-priced rides by car or bike — the default for towns and cities."),
                GettingAroundOption(mode: .scooter, name: "Rental scooter", cost: 1, speed: 3, convenience: 4, safety: 1, summary: "Total freedom and very cheap, but by far the riskiest option — ride within your limits."),
                GettingAroundOption(mode: .taxi, name: "Bluebird taxi", cost: 2, speed: 3, convenience: 3, safety: 3, summary: "Trusted metered taxis; use the official app and insist on the meter."),
                GettingAroundOption(mode: .privateDriver, name: "Private driver", cost: 3, speed: 3, convenience: 4, safety: 4, summary: "Car, driver and fuel for the day — ideal for sightseeing and groups."),
                GettingAroundOption(mode: .ferry, name: "Fast boat / ferry", cost: 2, speed: 2, convenience: 2, safety: 2, summary: "The way between islands; fast boats save time, public ferries save money."),
                GettingAroundOption(mode: .flight, name: "Domestic flight", cost: 3, speed: 4, convenience: 3, safety: 3, summary: "Best for long hops like Bali to Komodo or Raja Ampat.")
            ],
            calcModes: [
                TransportCalcMode(name: "Bike (GoRide)", icon: "scooter", base: 4_000, perKm: 2_500),
                TransportCalcMode(name: "Car (GoCar)", icon: "car.fill", base: 10_000, perKm: 5_000),
                TransportCalcMode(name: "Taxi (metered)", icon: "car.top.radiowaves.rear.right.fill", base: 7_500, perKm: 6_500)
            ],
            rideHailing: [
                TransportInfoRow(title: "Gojek", subtitle: "Super-app", icon: "scooter", detail: "GoRide (bike) is cheapest, GoCar for comfort, plus food and payments — top up at minimarts.", accent: theme.tint),
                TransportInfoRow(title: "Grab", subtitle: "Alternative", icon: "car.fill", detail: "Near-identical coverage; handy where one app has more drivers than the other.", accent: theme.ocean),
                TransportInfoRow(title: "Fixed in-app price", subtitle: "No haggling", icon: "tag.fill", detail: "The app sets the fare up front, so there’s nothing to negotiate on arrival.", accent: theme.moss),
                TransportInfoRow(title: "Pickup restrictions", subtitle: "Local zones", icon: "exclamationmark.triangle.fill", detail: "Some areas and airports limit app pickups; walk to a marked point if asked.", accent: theme.coral)
            ],
            scooter: [
                TransportInfoRow(title: "Licence & IDP", subtitle: "Required", icon: "person.text.rectangle.fill", detail: "You legally need a motorcycle licence plus an International Driving Permit; police do check.", accent: theme.coral),
                TransportInfoRow(title: "Always wear a helmet", subtitle: "Law & sense", icon: "shield.lefthalf.filled", detail: "Helmets are legally required and life-saving; insist the rental provides a good one.", accent: theme.sun),
                TransportInfoRow(title: "Insurance", subtitle: "Check cover", icon: "checkmark.shield.fill", detail: "Travel insurance is often void if you ride without a valid licence — verify your policy.", accent: theme.ocean),
                TransportInfoRow(title: "Fuel", subtitle: "Cheap & easy", icon: "fuelpump.fill", detail: "Fill at Pertamina stations or roadside bottles (eceran); around Rp 10–15k a litre.", accent: theme.moss),
                TransportInfoRow(title: "Inspect before you ride", subtitle: "Avoid disputes", icon: "camera.fill", detail: "Photograph existing damage and check brakes, lights and tyres before taking the bike.", accent: theme.tint)
            ],
            taxi: [
                TransportInfoRow(title: "Bluebird", subtitle: "Most trusted", icon: "car.top.radiowaves.rear.right.fill", detail: "Reputable metered taxis in Bali, Jakarta and Lombok — book via the official app.", accent: theme.ocean),
                TransportInfoRow(title: "Use the meter", subtitle: "‘Argo’", icon: "gauge.with.dots.needle.bottom.50percent", detail: "Insist on the meter, or agree a fair fixed price before setting off.", accent: theme.tint),
                TransportInfoRow(title: "Avoid touts", subtitle: "Unmarked cars", icon: "exclamationmark.triangle.fill", detail: "Skip drivers shouting ‘taxi’ with no meter — they quote inflated flat fares.", accent: theme.coral)
            ],
            privateDriver: [
                TransportInfoRow(title: "Day hire", subtitle: "≈ Rp 600–800k", icon: "steeringwheel", detail: "Car, driver and fuel for roughly 8–10 hours — superb value for sightseeing and groups.", accent: theme.moss),
                TransportInfoRow(title: "Booking", subtitle: "Hotel or WhatsApp", icon: "message.fill", detail: "Arrange through your hotel or a recommended driver; agree the route and price up front.", accent: theme.tint),
                TransportInfoRow(title: "Tipping", subtitle: "Appreciated", icon: "hand.thumbsup.fill", detail: "A tip of Rp 50–100k for a good day’s driving is generous and welcome.", accent: theme.sun)
            ],
            airport: [
                TransportInfoRow(title: "Pre-booked transfer", subtitle: "Easiest", icon: "airplane.arrival", detail: "Arrange a hotel pickup or a private transfer to skip the arrivals scrum.", accent: theme.tint),
                TransportInfoRow(title: "Official taxi counter", subtitle: "Fixed price", icon: "car.fill", detail: "Pay at the airport taxi desk for a set fare; Bali (DPS) to Kuta is ~Rp 150–300k.", accent: theme.ocean),
                TransportInfoRow(title: "App pickup zone", subtitle: "Cheaper", icon: "iphone.gen3", detail: "Gojek/Grab can be cheaper but may require walking to a designated pickup area.", accent: theme.moss)
            ],
            ferry: [
                TransportInfoRow(title: "Fast boats", subtitle: "Quick", icon: "ferry.fill", detail: "Bali ↔ Nusa, Gili and Lombok in well under two hours; Rp 150–600k, weather permitting.", accent: theme.sky),
                TransportInfoRow(title: "Public ferries (ASDP)", subtitle: "Cheap & slow", icon: "sailboat.fill", detail: "Routes like Padangbai–Lembar cost little but take hours — great for tight budgets.", accent: theme.ocean),
                TransportInfoRow(title: "Book ahead in season", subtitle: "Avoid sell-outs", icon: "calendar", detail: "Popular fast boats fill up in July–August and around New Year — reserve early.", accent: theme.coral)
            ],
            flights: [
                TransportInfoRow(title: "Airlines", subtitle: "Full vs budget", icon: "airplane", detail: "Garuda is full-service; Lion, Wings, Batik and Citilink are budget options.", accent: theme.tint),
                TransportInfoRow(title: "Baggage limits", subtitle: "Often strict", icon: "suitcase.fill", detail: "Allowances can be ~15–20kg, and smaller on ATR turboprops to Labuan Bajo and Sorong.", accent: theme.sun),
                TransportInfoRow(title: "Book early", subtitle: "Best fares", icon: "tag.fill", detail: "Domestic fares rise close to departure and in peak season — book ahead.", accent: theme.moss)
            ],
            roadSafety: [
                "Traffic is dense and unpredictable — ride and cross defensively.",
                "Wear a helmet on every scooter trip, even short ones.",
                "Avoid riding at night on unlit rural roads; watch for dogs and potholes.",
                "Tourist scooter accidents are common — don’t ride beyond your experience.",
                "Carry your licence and IDP; police stops and fines do happen."
            ],
            trafficNotes: [
                TransportInfoRow(title: "South Bali", subtitle: "Congested", icon: "car.2.fill", detail: "Canggu, Kuta and Seminyak gridlock at peak times — allow plenty of extra time.", accent: theme.coral, region: "Bali"),
                TransportInfoRow(title: "Gili Islands", subtitle: "No vehicles", icon: "bicycle", detail: "No cars or motorbikes — get around on foot, by bicycle or by cidomo (pony cart).", accent: theme.moss, region: "Gili"),
                TransportInfoRow(title: "Lombok", subtitle: "Lighter traffic", icon: "road.lanes", detail: "Quieter roads but long distances; a driver or scooter suits day trips.", accent: theme.tint, region: "Lombok"),
                TransportInfoRow(title: "Labuan Bajo", subtitle: "Small town", icon: "ferry.fill", detail: "Compact and walkable; boats matter far more than roads for the islands.", accent: theme.ocean, region: "Komodo")
            ],
            disclaimer: "Live fares, routes and availability need an internet connection and change often. The rates here are illustrative estimates only — confirm in the app or with the operator."
        )
    }
}

struct TravelTransportGettingAroundDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelTransportGettingAroundDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Getting around · Indonesia")

            TravelTransportGettingAroundDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Getting around · Dynamic Type XL")
        }
    }
}
#endif
