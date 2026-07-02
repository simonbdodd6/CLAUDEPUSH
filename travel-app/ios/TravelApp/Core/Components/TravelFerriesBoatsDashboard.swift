import SwiftUI

// MARK: - Travel ferries & boats dashboard (Phase 132)
//
// A flagship, presentation-only Ferries & Boats dashboard for Indonesia: a hero
// ("Getting Between Islands"), at-a-glance facts, a region-filtered list of popular
// routes (travel times, price ranges, booking windows, trusted-operator examples and a
// crossing-safety badge), a fast-boat vs public-ferry comparison, a port-arrival
// checklist, a boarding-process timeline, sea-sickness advice, weather & cancellation
// warnings, luggage guidance, QR-ticket and book-before-arrival reminders, important
// tips and a disclaimer. A caller supplies a `FerryGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. The `Ferry*` model names
// are deliberately distinct from `ExplorerFerryGuide`'s `FerryRoute` to avoid any
// collision. `FerryGuide` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The region
// filter and favourite stars are UI-only, and all figures are illustrative.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A crossing-safety level — drives the badge label and accent.
enum FerrySafety {
    case sheltered
    case choppy
    case exposed

    var label: String {
        switch self {
        case .sheltered: "Sheltered"
        case .choppy: "Can be choppy"
        case .exposed: "Exposed crossing"
        }
    }

    var icon: String {
        switch self {
        case .sheltered: "checkmark.shield.fill"
        case .choppy: "wind"
        case .exposed: "exclamationmark.triangle.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .sheltered: return theme.moss
        case .choppy: return theme.sun
        case .exposed: return theme.coral
        }
    }
}

/// A single at-a-glance ferry fact.
struct FerryFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A popular ferry/boat route.
struct FerryConnection: Identifiable {
    let id: String
    var from: String
    var to: String
    var region: String
    var type: String
    var duration: String
    var price: String
    var bookWindow: String
    var operatorName: String
    var safety: FerrySafety
    var note: String

    init(id: String? = nil, from: String, to: String, region: String, type: String, duration: String, price: String, bookWindow: String, operatorName: String, safety: FerrySafety, note: String) {
        self.id = id ?? "\(from)-\(to)"
        self.from = from
        self.to = to
        self.region = region
        self.type = type
        self.duration = duration
        self.price = price
        self.bookWindow = bookWindow
        self.operatorName = operatorName
        self.safety = safety
        self.note = note
    }
}

/// A generic ferry guide row reused for warnings, luggage, reminders and operators.
struct FerryRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var safety: FerrySafety?

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, safety: FerrySafety? = nil) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.safety = safety
    }
}

/// A numbered boarding-process step.
struct FerryStep: Identifiable {
    let id = UUID()
    var step: Int
    var title: String
    var detail: String
}

/// A port-arrival checklist item.
struct FerryCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for a ferries & boats guide.
struct FerryGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [FerryFact]
    var routes: [FerryConnection]
    var fastBoatPoints: [String]
    var publicFerryPoints: [String]
    var portChecklist: [FerryCheckItem]
    var boarding: [FerryStep]
    var seaSicknessTips: [String]
    var weatherWarnings: [FerryRow]
    var luggage: [FerryRow]
    var reminders: [FerryRow]
    var tips: [String]
    var disclaimer: String
}

/// A premium, presentation-only ferries & boats dashboard rendered from a `FerryGuide`.
struct TravelFerriesBoatsDashboard: View {
    var guide: FerryGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let regionFilters = ["All", "Bali", "Nusa", "Gili", "Lombok", "Komodo"]

    private var filteredRoutes: [FerryConnection] {
        guard selectedRegion != "All" else { return guide.routes }
        return guide.routes.filter { $0.region == selectedRegion }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            routesGroup
            processGroup
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
            eyebrow: "Ferries & Boats",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: "\(guide.routes.count)", label: "Routes"),
                HeroMetric(value: factValue("Book ahead"), label: "Booking"),
                HeroMetric(value: factValue("Luggage"), label: "Luggage")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(FerryAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Island-hopping basics.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Fast boat vs ferry", "Pick what suits the day.", 2) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    comparisonColumn("Fast boat", "ferry.fill", theme.sky, guide.fastBoatPoints)
                    comparisonColumn("Public ferry", "sailboat.fill", theme.ocean, guide.publicFerryPoints)
                }
            }
        }
    }

    private var routesGroup: some View {
        Group {
            section("Popular routes", "Filter by region.", 3) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    regionFilter
                    if filteredRoutes.isEmpty {
                        GlassCard {
                            Text("No routes for that region.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredRoutes) { route in
                                routeCard(route)
                            }
                        }
                    }
                }
            }
        }
    }

    private var processGroup: some View {
        Group {
            section("Port arrival", "Don’t miss the boat.", 4) {
                checklistCard(guide.portChecklist)
            }

            section("Boarding", "How it usually goes.", 5) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.boarding) { step in
                        stepCard(step)
                    }
                }
            }

            section("Weather & cancellations", "The sea has the final say.", 6) {
                infoList(guide.weatherWarnings)
            }
        }
    }

    private var tipsGroup: some View {
        Group {
            section("Sea-sickness", "Stay comfortable.", 7) {
                bulletCard(guide.seaSicknessTips, icon: "heart.text.square.fill", tint: theme.ocean)
            }

            section("Luggage", "Bags on boats.", 8) {
                infoList(guide.luggage)
            }

            section("Tickets & booking", "QR and timing.", 8) {
                infoList(guide.reminders)
            }

            section("Travel tips", "Smooth crossings.", 8) {
                bulletCard(guide.tips, icon: "lightbulb.fill", tint: theme.sun)
            }

            section("Good to know", "About these crossings.", 8) {
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
        .modifier(FerryAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: FerryFact) -> some View {
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

    // MARK: Comparison

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

    // MARK: Route cards

    private func routeCard(_ route: FerryConnection) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("ferry.fill", route.safety.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            tagPill(route.type, theme.tint)
                            safetyBadge(route.safety)
                        }
                        Text("\(route.from) → \(route.to)")
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Label(route.operatorName, systemImage: "building.2.fill")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(route.id, "\(route.from) to \(route.to)")
                }
                PremiumAdaptiveGrid(minimumWidth: 104) {
                    routeMetric("clock.fill", route.duration, "Time")
                    routeMetric("banknote.fill", route.price, "Price")
                    routeMetric("calendar", route.bookWindow, "Book")
                }
                Text(route.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(route.type), \(route.from) to \(route.to), \(route.safety.label). Time \(route.duration), price \(route.price), book \(route.bookWindow). Operator \(route.operatorName). \(route.note)")
    }

    private func routeMetric(_ icon: String, _ value: String, _ label: String) -> some View {
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

    private func safetyBadge(_ safety: FerrySafety) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: safety.icon)
            Text(safety.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(safety.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(safety.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Boarding steps

    private func stepCard(_ step: FerryStep) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallionText("\(step.step)", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(step.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(step.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(step.step), \(step.title). \(step.detail)")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [FerryRow]) -> some View {
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
                                if let safety = row.safety {
                                    safetyBadge(safety)
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
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? "")\(row.safety.map { ", \($0.label)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Checklist

    private func checklistCard(_ items: [FerryCheckItem]) -> some View {
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
                    .accessibilityLabel("\(item.name), \(item.done ? "done" : "to do"). \(item.note)")
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
                    Text("Schedules & seas change")
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
        .accessibilityLabel("Schedules and seas change. \(guide.disclaimer)")
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

    private func medallionText(_ text: String, _ accent: Color) -> some View {
        Text(text)
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

// MARK: - Ferry appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct FerryAppear: ViewModifier {
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
extension FerryGuide {
    /// A deterministic sample ferries & boats guide for Indonesia (illustrative figures).
    static var sampleIndonesia: FerryGuide {
        let theme = TravelTheme.current
        return FerryGuide(
            heroTitle: "Getting Between Islands",
            heroSubtitle: "Fast boats and ferries link Bali, the Nusas, the Gilis, Lombok and Komodo — here’s how to ride them.",
            heroSymbol: "ferry.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            facts: [
                FerryFact(icon: "point.topleft.down.to.point.bottomright.curvepath.fill", label: "Routes", value: "Dozens daily"),
                FerryFact(icon: "speedometer", label: "Fast vs ferry", value: "Quick vs cheap"),
                FerryFact(icon: "calendar", label: "Book ahead", value: "Peak season"),
                FerryFact(icon: "bag.fill", label: "Luggage", value: "Soft bags best")
            ],
            routes: [
                FerryConnection(from: "Padang Bai", to: "Gili Trawangan", region: "Gili", type: "Fast boat", duration: "1.5–2 h", price: "Rp 300–600k", bookWindow: "1–3 days", operatorName: "Gili Gili / Wahana", safety: .exposed, note: "An open crossing of the Lombok Strait — can be rough midday; sit centre and low."),
                FerryConnection(from: "Sanur", to: "Nusa Penida", region: "Nusa", type: "Fast boat", duration: "30–45 min", price: "Rp 150–250k", bookWindow: "Same day", operatorName: "Maruti / Angel Billabong", safety: .choppy, note: "Frequent departures from Sanur’s beach pier; the earliest boats are calmest."),
                FerryConnection(from: "Sanur", to: "Nusa Lembongan", region: "Nusa", type: "Fast boat", duration: "30 min", price: "Rp 150–200k", bookWindow: "Same day", operatorName: "Scoot / Rocky", safety: .choppy, note: "Quick hop; a short wade to the boat, so keep a dry bag handy."),
                FerryConnection(from: "Bangsal", to: "Gili Air", region: "Gili", type: "Public boat", duration: "15–20 min", price: "Rp 20–40k", bookWindow: "At the port", operatorName: "Public ferry (leaves when full)", safety: .sheltered, note: "Cheapest option, but it departs only when full — don’t pair it with a same-day flight."),
                FerryConnection(from: "Padang Bai", to: "Lembar (Lombok)", region: "Lombok", type: "Public ferry", duration: "4–5 h", price: "Rp 50k", bookWindow: "At the port", operatorName: "ASDP", safety: .choppy, note: "Slow vehicle ferry running around the clock — cheap, with no need to book."),
                FerryConnection(from: "Sanur", to: "Gili Air", region: "Gili", type: "Fast boat", duration: "2–2.5 h", price: "Rp 350–600k", bookWindow: "1–3 days", operatorName: "Kuda Hitam Express", safety: .exposed, note: "Direct boat avoids backtracking via Padang Bai; the open leg can be lively."),
                FerryConnection(from: "Labuan Bajo", to: "Komodo & Padar", region: "Komodo", type: "Day boat", duration: "Full day", price: "Rp 150k+ shared", bookWindow: "1–2 days", operatorName: "Licensed day-trip operators", safety: .exposed, note: "Shared or private speedboats to the national park — open water, so check the forecast.")
            ],
            fastBoatPoints: [
                "Much quicker, tourist-focused",
                "Pricier per crossing",
                "More weather-sensitive",
                "Book ahead in peak season"
            ],
            publicFerryPoints: [
                "Far cheaper",
                "Slower, with more sailings",
                "Carry vehicles and locals",
                "Buy at the port, no booking"
            ],
            portChecklist: [
                FerryCheckItem(name: "Arrive 45–60 min early", done: true, note: "Piers get busy and chaotic"),
                FerryCheckItem(name: "Ticket / QR ready", done: true, note: "Screenshot it — no signal at piers"),
                FerryCheckItem(name: "Passport / ID handy", done: false, note: "Sometimes checked on boarding"),
                FerryCheckItem(name: "Luggage labelled", done: false, note: "Bags are stacked together on deck"),
                FerryCheckItem(name: "Confirm the boat & operator", done: false, note: "Board only your booked boat")
            ],
            boarding: [
                FerryStep(step: 1, title: "Check in & scan", detail: "Find your operator’s desk or beach point and have your ticket QR scanned."),
                FerryStep(step: 2, title: "Hand over luggage", detail: "Larger bags go to porters and are stacked on the bow or roof — keep valuables with you."),
                FerryStep(step: 3, title: "Wait to be called", detail: "Boats often board straight off the beach; listen for your destination."),
                FerryStep(step: 4, title: "Board & sit low", detail: "Sit central and low near the waterline for the most stable, comfortable ride."),
                FerryStep(step: 5, title: "Disembark carefully", detail: "Watch the gangway or wade in; collect your bag from the pile before leaving.")
            ],
            seaSicknessTips: [
                "Take motion-sickness tablets 30–60 minutes before boarding.",
                "Sit low and central, near the waterline, and keep your eyes on the horizon.",
                "Travel on the earliest crossing, when the sea is usually calmest.",
                "Stay hydrated and avoid heavy, greasy food before a long crossing."
            ],
            weatherWarnings: [
                FerryRow(title: "Wet-season swell", subtitle: "Nov–Mar", icon: "cloud.rain.fill", detail: "Bigger seas and more cancellations on the open crossings during the rains.", accent: theme.ocean, safety: .exposed),
                FerryRow(title: "Cancellations happen", subtitle: "Short notice", icon: "xmark.octagon.fill", detail: "Strong winds can close crossings with little warning — keep a buffer day before flights.", accent: theme.coral, safety: .exposed),
                FerryRow(title: "Don’t cut it fine", subtitle: "Connections", icon: "clock.badge.exclamationmark.fill", detail: "Never pair a no-timetable public boat with a same-day onward flight.", accent: theme.sun, safety: .choppy)
            ],
            luggage: [
                FerryRow(title: "Soft bags win", subtitle: "Packing", icon: "bag.fill", detail: "Duffels pass along decks and into piles far more easily than hard cases.", accent: theme.tint),
                FerryRow(title: "Dry bags for spray", subtitle: "Stay dry", icon: "drop.fill", detail: "Bows get soaked — protect electronics and clothes in a dry bag.", accent: theme.ocean),
                FerryRow(title: "Mind the weight", subtitle: "Small boats", icon: "scalemass.fill", detail: "Pack light for public boats and beach boardings where you carry your own bag.", accent: theme.sun),
                FerryRow(title: "Keep valuables on you", subtitle: "Security", icon: "lock.fill", detail: "Stowed bags are out of sight — keep documents, cash and electronics in your daypack.", accent: theme.coral)
            ],
            reminders: [
                FerryRow(title: "Screenshot your QR", subtitle: "No signal at piers", icon: "qrcode", detail: "Save the ticket to your photos so you can board even with no data.", accent: theme.tint),
                FerryRow(title: "Book before arrival", subtitle: "Fast boats", icon: "calendar.badge.plus", detail: "Popular fast boats sell out in July–August and around New Year — reserve ahead.", accent: theme.ocean),
                FerryRow(title: "Public boats at the port", subtitle: "Flexible", icon: "ticket.fill", detail: "No need to pre-book ASDP ferries or local boats — just turn up and buy.", accent: theme.moss),
                FerryRow(title: "Reconfirm the day before", subtitle: "Avoid surprises", icon: "checkmark.circle.fill", detail: "Operators reshuffle times in poor weather — reconfirm your departure.", accent: theme.sun)
            ],
            tips: [
                "Use reputable, licensed operators — avoid the cheapest unknown boats on exposed crossings.",
                "Check there are enough life jackets and that you know where they are.",
                "Build buffer time into island connections; the sea sets the schedule.",
                "Ignore touts at piers and go to your operator’s own desk or beach point."
            ],
            disclaimer: "Routes, times, prices and operators change with the season and the weather, and crossings can be cancelled at short notice. These figures are illustrative only — confirm current schedules and conditions with the operator before you travel."
        )
    }
}

struct TravelFerriesBoatsDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelFerriesBoatsDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Ferries & boats · Indonesia")

            TravelFerriesBoatsDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Ferries & boats · Dynamic Type XL")
        }
    }
}
#endif
