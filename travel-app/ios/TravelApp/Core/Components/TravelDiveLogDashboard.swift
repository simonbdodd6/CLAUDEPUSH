import SwiftUI

// MARK: - Travel dive log dashboard (Phase 115)
//
// A flagship, presentation-only Dive Log: a diver's career hub holding a hero with
// career stats (total dives, bottom time, max depth, certifications), personal-best
// highlights, next-certification progress, a filterable logbook timeline of logged
// dives (site, date, depth, duration, water temperature, visibility, buddy, gas
// in/out, safety stop, surface interval and marine-life sightings), certification
// badges, a gear/equipment-readiness checklist and a map placeholder. A caller
// supplies a `DiveLog` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `PremiumTimelineConnector`,
// `MapTexturePlaceholder`, `TravelTypography` and the tokens. `DiveLog` and its
// nested rows are lightweight presentation models (not DTOs); the component holds no
// data, networking, persistence, repository, view-model, navigation, AppContainer or
// DTO logic, and is not wired into any screen. The dive-type filters and favourite
// stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// The kind of a logged dive — drives the glyph, accent and the logbook filter.
enum DiveKind: String, CaseIterable {
    case reef
    case wall
    case drift
    case wreck
    case night
    case muck

    var label: String {
        switch self {
        case .reef: "Reef"
        case .wall: "Wall"
        case .drift: "Drift"
        case .wreck: "Wreck"
        case .night: "Night"
        case .muck: "Muck"
        }
    }

    var icon: String {
        switch self {
        case .reef: "fish.fill"
        case .wall: "mountain.2.fill"
        case .drift: "wind"
        case .wreck: "ferry.fill"
        case .night: "moon.stars.fill"
        case .muck: "drop.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .reef: return theme.tint
        case .wall: return theme.ocean
        case .drift: return theme.sky
        case .wreck: return theme.coral
        case .night: return theme.ink
        case .muck: return theme.moss
        }
    }
}

/// Whether a certification has been earned or is still in progress.
enum DiveCertStatus {
    case earned
    case inProgress

    var label: String { self == .earned ? "Earned" : "In progress" }
    var icon: String { self == .earned ? "checkmark.seal.fill" : "hourglass" }
    var accent: Color { self == .earned ? TravelTheme.current.moss : TravelTheme.current.sun }
}

/// A single career-stat or personal-best tile (icon, value and label).
struct DiveStat: Identifiable {
    let id = UUID()
    var icon: String
    var value: String
    var label: String
    var detail: String?

    init(icon: String, value: String, label: String, detail: String? = nil) {
        self.icon = icon
        self.value = value
        self.label = label
        self.detail = detail
    }
}

/// A single logged dive.
struct LoggedDive: Identifiable {
    let id: String
    var number: Int
    var site: String
    var location: String
    var date: String
    var kind: DiveKind
    var depth: String
    var duration: String
    var waterTemp: String
    var visibility: String
    var buddy: String
    var gasIn: String
    var gasOut: String
    var safetyStop: String
    var surfaceInterval: String
    var sightings: [String]
    var note: String

    init(
        id: String? = nil,
        number: Int,
        site: String,
        location: String,
        date: String,
        kind: DiveKind,
        depth: String,
        duration: String,
        waterTemp: String,
        visibility: String,
        buddy: String,
        gasIn: String,
        gasOut: String,
        safetyStop: String,
        surfaceInterval: String,
        sightings: [String],
        note: String
    ) {
        self.id = id ?? "\(number)-\(site)"
        self.number = number
        self.site = site
        self.location = location
        self.date = date
        self.kind = kind
        self.depth = depth
        self.duration = duration
        self.waterTemp = waterTemp
        self.visibility = visibility
        self.buddy = buddy
        self.gasIn = gasIn
        self.gasOut = gasOut
        self.safetyStop = safetyStop
        self.surfaceInterval = surfaceInterval
        self.sightings = sightings
        self.note = note
    }
}

/// A single certification badge.
struct DiveCertBadge: Identifiable {
    let id = UUID()
    var name: String
    var agency: String
    var status: DiveCertStatus
    var icon: String
}

/// A single gear-readiness checklist item.
struct DiveGearItem: Identifiable {
    let id = UUID()
    var name: String
    var ready: Bool
    var note: String
}

/// The full, presentation-only content for a dive log.
struct DiveLog {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var totalDives: Int
    var bottomTime: String
    var maxDepth: String
    var certCount: Int
    var careerStats: [DiveStat]
    var personalBests: [DiveStat]
    var nextCertTitle: String
    var nextCertDetail: String
    var nextCertProgress: Double
    var dives: [LoggedDive]
    var certifications: [DiveCertBadge]
    var gear: [DiveGearItem]
    var region: String

    /// Gear items marked ready, used for the equipment-readiness summary.
    var gearReadyCount: Int { gear.filter(\.ready).count }
    var gearReadiness: Double {
        guard !gear.isEmpty else { return 0 }
        return Double(gearReadyCount) / Double(gear.count)
    }
}

/// A premium, presentation-only dive log dashboard rendered from a `DiveLog`.
struct TravelDiveLogDashboard: View {
    var log: DiveLog

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedKind: String = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    private var kindFilters: [String] {
        ["All"] + DiveKind.allCases.map(\.label)
    }

    private var filteredDives: [LoggedDive] {
        guard selectedKind != "All" else { return log.dives }
        return log.dives.filter { $0.kind.label == selectedKind }
    }

    var body: some View {
        PremiumScrollView {
            hero
            statsGroup
            logbookGroup
            readinessGroup
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
            eyebrow: "Dive Log",
            symbol: log.heroSymbol,
            title: log.heroTitle,
            subtitle: log.heroSubtitle,
            gradient: log.heroGradient,
            metrics: [
                HeroMetric(value: "\(log.totalDives)", label: "Dives"),
                HeroMetric(value: log.maxDepth, label: "Max depth"),
                HeroMetric(value: "\(log.certCount)", label: "Certs")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(DiveLogAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var statsGroup: some View {
        Group {
            section("Career stats", "Your diving so far.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(log.careerStats) { stat in
                        statTile(stat)
                    }
                }
            }

            section("Personal bests", "Milestones worth remembering.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(log.personalBests) { best in
                        statTile(best)
                    }
                }
            }

            section("Next certification", "Working toward your next card.", 3) {
                nextCertCard
            }
        }
    }

    private var logbookGroup: some View {
        Group {
            section("Filter", "Show just one type of dive.", 4) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(kindFilters, id: \.self) { filter in
                            filterChip(filter)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }

            section("Logbook", "Every dive, most recent first.", 5) {
                if filteredDives.isEmpty {
                    GlassCard {
                        Text("No \(selectedKind.lowercased()) dives logged yet.")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(filteredDives.enumerated()), id: \.element.id) { index, dive in
                            logbookRow(dive, isLast: index == filteredDives.count - 1)
                        }
                    }
                }
            }
        }
    }

    private var readinessGroup: some View {
        Group {
            section("Certifications", "Cards in your wallet.", 6) {
                PremiumAdaptiveGrid(minimumWidth: 168) {
                    ForEach(log.certifications) { cert in
                        certBadge(cert)
                    }
                }
            }

            section("Gear & readiness", "\(log.gearReadyCount) of \(log.gear.count) items ready.", 7) {
                gearCard
            }

            section("Map", "Where you’ve been diving.", 8) {
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
        .modifier(DiveLogAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Stat tiles

    private func statTile(_ stat: DiveStat) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Image(systemName: stat.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                Text(stat.value)
                    .font(TravelTypography.title)
                    .fixedSize(horizontal: false, vertical: true)
                Text(stat.label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                if let detail = stat.detail {
                    Text(detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(stat.label): \(stat.value)\(stat.detail.map { ", \($0)" } ?? "")")
    }

    // MARK: Next certification

    private var nextCertCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Label(log.nextCertTitle, systemImage: "rosette")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                    .fixedSize(horizontal: false, vertical: true)
                Text(log.nextCertDetail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                PremiumProgressBar(
                    progress: appeared ? log.nextCertProgress : 0,
                    colors: [theme.tint, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("\(Int((log.nextCertProgress * 100).rounded()))% complete")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Next certification, \(log.nextCertTitle), \(Int((log.nextCertProgress * 100).rounded())) percent complete. \(log.nextCertDetail)")
    }

    // MARK: Logbook

    private func logbookRow(_ dive: LoggedDive, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            PremiumTimelineConnector(accent: dive.kind.accent, showsLine: !isLast)
            diveCard(dive)
                .padding(.bottom, isLast ? 0 : TravelSpacing.md)
        }
    }

    private func diveCard(_ dive: LoggedDive) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                diveHeader(dive)

                PremiumAdaptiveGrid(minimumWidth: 104) {
                    diveMetric("arrow.down.to.line", dive.depth, "Depth")
                    diveMetric("timer", dive.duration, "Duration")
                    diveMetric("thermometer.medium", dive.waterTemp, "Water")
                    diveMetric("eye.fill", dive.visibility, "Viz")
                }

                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    detailRow("person.2.fill", "Buddy", dive.buddy)
                    detailRow("gauge.with.dots.needle.bottom.50percent", "Gas", "\(dive.gasIn) → \(dive.gasOut)")
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        chip("arrow.up.forward", "Safety \(dive.safetyStop)", theme.moss)
                        chip("clock.arrow.circlepath", "SI \(dive.surfaceInterval)", theme.sky)
                    }
                }

                if !dive.sightings.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: TravelSpacing.xs) {
                            ForEach(dive.sightings, id: \.self) { sighting in
                                chip("fish.fill", sighting, theme.tint)
                            }
                        }
                    }
                }

                Text(dive.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(diveAccessibility(dive))
    }

    private func diveHeader(_ dive: LoggedDive) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            medallion("\(dive.number)", dive.kind.accent, isText: true)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                HStack(spacing: TravelSpacing.xs) {
                    Text(dive.date)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    tagPill(dive.kind.label, dive.kind.accent)
                }
                Text(dive.site)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Label(dive.location, systemImage: "mappin.and.ellipse")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            favouriteButton(dive.id, dive.site)
        }
    }

    private func diveAccessibility(_ dive: LoggedDive) -> String {
        var parts = [
            "Dive \(dive.number)", dive.kind.label, dive.site, dive.location, dive.date,
            "depth \(dive.depth)", "duration \(dive.duration)", "water \(dive.waterTemp)",
            "visibility \(dive.visibility)", "buddy \(dive.buddy)",
            "gas \(dive.gasIn) to \(dive.gasOut)", "safety stop \(dive.safetyStop)",
            "surface interval \(dive.surfaceInterval)"
        ]
        if !dive.sightings.isEmpty { parts.append("saw \(dive.sightings.joined(separator: ", "))") }
        parts.append(dive.note)
        return parts.joined(separator: ", ")
    }

    private func diveMetric(_ icon: String, _ value: String, _ label: String) -> some View {
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

    private func detailRow(_ icon: String, _ label: String, _ value: String) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(theme.tint)
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            Text(value)
                .font(TravelTypography.caption)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: Filters

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedKind
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedKind = filter }
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

    // MARK: Certifications

    private func certBadge(_ cert: DiveCertBadge) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                HStack(alignment: .top, spacing: TravelSpacing.sm) {
                    medallion(cert.icon, cert.status.accent)
                    Spacer(minLength: 0)
                    Image(systemName: cert.status.icon)
                        .font(TravelTypography.caption)
                        .foregroundStyle(cert.status.accent)
                }
                Text(cert.name)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(cert.agency)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                Text(cert.status.label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(cert.status.accent)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xxs)
                    .background(cert.status.accent.opacity(0.15), in: Capsule())
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(cert.name), \(cert.agency), \(cert.status.label)")
    }

    // MARK: Gear & readiness

    private var gearCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Equipment readiness")
                            .font(TravelTypography.cardTitle)
                        Spacer(minLength: 0)
                        Text("\(Int((log.gearReadiness * 100).rounded()))%")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(theme.tint)
                    }
                    PremiumProgressBar(
                        progress: appeared ? log.gearReadiness : 0,
                        colors: [theme.tint, theme.moss],
                        height: TravelSpacing.sm
                    )
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                }
                VStack(spacing: TravelSpacing.xs) {
                    ForEach(log.gear) { item in
                        gearRow(item)
                    }
                }
            }
        }
    }

    private func gearRow(_ item: DiveGearItem) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: item.ready ? "checkmark.circle.fill" : "circle")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(item.ready ? theme.moss : Color.secondary)
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
        .accessibilityLabel("\(item.name), \(item.ready ? "ready" : "not ready"). \(item.note)")
    }

    // MARK: Map placeholder

    private var mapPlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 168)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("\(log.region) · dive-site map coming soon", systemImage: "map.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Map of \(log.region). Placeholder.")
    }

    // MARK: Shared bits

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
        .accessibilityLabel(isFav ? "Saved dive: \(name)" : "Save dive \(name)")
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

// MARK: - Dive log appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct DiveLogAppear: ViewModifier {
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
extension DiveLog {
    /// A deterministic sample dive log across Raja Ampat, Komodo, the Gilis,
    /// Nusa Penida and Nusa Lembongan.
    static var sampleIndonesia: DiveLog {
        let theme = TravelTheme.current
        return DiveLog(
            heroTitle: "Dive Log",
            heroSubtitle: "142 dives across Indonesia — from Raja Ampat’s currents to Komodo’s walls and the Gili reefs.",
            heroSymbol: "water.waves",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            totalDives: 142,
            bottomTime: "118h",
            maxDepth: "39m",
            certCount: 5,
            careerStats: [
                DiveStat(icon: "number", value: "142", label: "Total dives", detail: "8 logged this trip"),
                DiveStat(icon: "clock.fill", value: "118h", label: "Bottom time"),
                DiveStat(icon: "arrow.down.to.line", value: "39m", label: "Max depth", detail: "Blue Magic, Raja Ampat"),
                DiveStat(icon: "rosette", value: "5", label: "Certifications")
            ],
            personalBests: [
                DiveStat(icon: "arrow.down.to.line", value: "39m", label: "Deepest", detail: "Blue Magic"),
                DiveStat(icon: "timer", value: "71 min", label: "Longest dive", detail: "Manta Sandy"),
                DiveStat(icon: "thermometer.snowflake", value: "23°C", label: "Coldest", detail: "Crystal Bay"),
                DiveStat(icon: "eye.fill", value: "40m", label: "Best viz", detail: "Cape Kri")
            ],
            nextCertTitle: "Working toward: Rescue Diver",
            nextCertDetail: "Rescue scenarios and first-aid refresher complete; final assessment dive outstanding.",
            nextCertProgress: 0.7,
            dives: [
                LoggedDive(number: 142, site: "Cape Kri", location: "Dampier Strait, Raja Ampat", date: "24 Aug", kind: .drift, depth: "28m", duration: "54 min", waterTemp: "29°C", visibility: "40m", buddy: "Maya", gasIn: "210 bar", gasOut: "60 bar", safetyStop: "5m · 3 min", surfaceInterval: "1h 40m", sightings: ["Reef sharks", "Barracuda", "Giant trevally"], note: "Ripping current — hooked in on the ridge and watched the wall of fish stream past."),
                LoggedDive(number: 141, site: "Manta Sandy", location: "Mansuar, Raja Ampat", date: "23 Aug", kind: .reef, depth: "16m", duration: "71 min", waterTemp: "29°C", visibility: "20m", buddy: "Maya", gasIn: "200 bar", gasOut: "70 bar", safetyStop: "5m · 3 min", surfaceInterval: "2h 05m", sightings: ["Reef mantas", "Wobbegong"], note: "Knelt behind the rope at the cleaning station; four reef mantas looped overhead."),
                LoggedDive(number: 140, site: "Batu Bolong", location: "Komodo National Park", date: "20 Aug", kind: .wall, depth: "24m", duration: "47 min", waterTemp: "27°C", visibility: "25m", buddy: "Tom", gasIn: "220 bar", gasOut: "80 bar", safetyStop: "5m · 4 min", surfaceInterval: "1h 30m", sightings: ["Reef sharks", "Napoleon wrasse", "Turtles"], note: "Pinnacle dropping into blue both sides — stunning coral but a serious current."),
                LoggedDive(number: 139, site: "Blue Corner", location: "Nusa Lembongan", date: "16 Aug", kind: .drift, depth: "30m", duration: "38 min", waterTemp: "24°C", visibility: "18m", buddy: "Tom", gasIn: "200 bar", gasOut: "70 bar", safetyStop: "5m · 3 min", surfaceInterval: "1h 15m", sightings: ["Mola mola", "Bumphead parrotfish"], note: "Cold thermocline and strong down-current — advanced site, glimpsed a mola in the blue."),
                LoggedDive(number: 138, site: "Crystal Bay", location: "Nusa Penida", date: "15 Aug", kind: .wall, depth: "26m", duration: "44 min", waterTemp: "23°C", visibility: "30m", buddy: "Aria", gasIn: "210 bar", gasOut: "75 bar", safetyStop: "5m · 3 min", surfaceInterval: "1h 50m", sightings: ["Mola mola", "Eagle ray"], note: "Dropped into the cold cleaning-station water and waited; a huge mola cruised in."),
                LoggedDive(number: 137, site: "Bounty Wreck", location: "Gili Meno", date: "13 Aug", kind: .wreck, depth: "18m", duration: "49 min", waterTemp: "28°C", visibility: "15m", buddy: "Aria", gasIn: "200 bar", gasOut: "80 bar", safetyStop: "5m · 3 min", surfaceInterval: "1h 20m", sightings: ["Scorpionfish", "Glassfish", "Lionfish"], note: "Small encrusted wreck wrapped in glassfish — easy, photogenic and full of life."),
                LoggedDive(number: 136, site: "Shark Point", location: "Gili Trawangan", date: "12 Aug", kind: .night, depth: "14m", duration: "42 min", waterTemp: "28°C", visibility: "12m", buddy: "Sam", gasIn: "200 bar", gasOut: "70 bar", safetyStop: "5m · 3 min", surfaceInterval: "2h 30m", sightings: ["White-tip sharks", "Spanish dancer", "Hunting morays"], note: "First night dive of the trip — torchlight lit up Spanish dancers and hunting morays."),
                LoggedDive(number: 135, site: "Gili Air House Reef", location: "Gili Air", date: "11 Aug", kind: .muck, depth: "12m", duration: "58 min", waterTemp: "28°C", visibility: "10m", buddy: "Sam", gasIn: "200 bar", gasOut: "90 bar", safetyStop: "5m · 3 min", surfaceInterval: "—", sightings: ["Nudibranchs", "Frogfish", "Seahorse"], note: "Slow, shallow critter hunt on the sandy slope — found a frogfish and three nudis.")
            ],
            certifications: [
                DiveCertBadge(name: "Open Water Diver", agency: "PADI", status: .earned, icon: "checkmark.seal.fill"),
                DiveCertBadge(name: "Advanced Open Water", agency: "PADI", status: .earned, icon: "checkmark.seal.fill"),
                DiveCertBadge(name: "Enriched Air (Nitrox)", agency: "PADI", status: .earned, icon: "leaf.fill"),
                DiveCertBadge(name: "Deep Diver", agency: "PADI", status: .earned, icon: "arrow.down.to.line"),
                DiveCertBadge(name: "Drift Diver", agency: "PADI", status: .earned, icon: "wind"),
                DiveCertBadge(name: "Rescue Diver", agency: "PADI", status: .inProgress, icon: "cross.case.fill")
            ],
            gear: [
                DiveGearItem(name: "Regulator", ready: true, note: "Serviced Apr 2026"),
                DiveGearItem(name: "BCD", ready: true, note: "Inflator checked"),
                DiveGearItem(name: "Dive computer", ready: true, note: "Battery 90%"),
                DiveGearItem(name: "Wetsuit (3mm)", ready: true, note: "Rinsed & dry"),
                DiveGearItem(name: "Mask & fins", ready: true, note: "Spare strap packed"),
                DiveGearItem(name: "SMB & reel", ready: true, note: "Essential for drift sites"),
                DiveGearItem(name: "Torch", ready: false, note: "Charge before night dive"),
                DiveGearItem(name: "Save-a-dive kit", ready: false, note: "Restock O-rings")
            ],
            region: "Indonesia · Raja Ampat to the Gilis"
        )
    }
}

struct TravelDiveLogDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDiveLogDashboard(log: .sampleIndonesia)
                .previewDisplayName("Dive log · Indonesia")

            TravelDiveLogDashboard(log: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Dive log · Dynamic Type XL")
        }
    }
}
#endif
