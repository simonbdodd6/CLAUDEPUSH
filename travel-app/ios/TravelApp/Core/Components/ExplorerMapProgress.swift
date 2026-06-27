import SwiftUI

// MARK: - Explorer map progress (Phase 73)
//
// A reusable, presentation-only "world progress" card that visualises how much of
// the world an explorer has seen — in the spirit of how Duolingo shows language
// progress, but for travel. It deliberately uses NO MapKit: the world is a
// stylised, deterministic dot-field rendered with `Canvas`, where each continent
// occupies a soft elliptical region and its dots light up in palette accents in
// proportion to how much of that continent has been explored.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumProgressBar` (the same bar `PremiumLevelProgress` is built on),
// `PremiumAdaptiveGrid` and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are
// caller-supplied mock data; the component holds no data, scoring, networking,
// persistence, view-model or navigation logic, and is not wired into any screen.
// Animations are subtle appearance polish only (a fade-and-rise map and
// progress/ring fills that ease in on appear).

/// A continent region with a fixed, stylised position in the map field. Drives
/// the dot-field layout and the accent (existing palette colours only).
enum WorldRegion: String, CaseIterable, Identifiable {
    case northAmerica
    case southAmerica
    case europe
    case africa
    case asia
    case oceania
    case antarctica

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .northAmerica: "N. America"
        case .southAmerica: "S. America"
        case .europe: "Europe"
        case .africa: "Africa"
        case .asia: "Asia"
        case .oceania: "Oceania"
        case .antarctica: "Antarctica"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .northAmerica: return theme.ocean
        case .southAmerica: return theme.moss
        case .europe: return theme.tint
        case .africa: return theme.sun
        case .asia: return theme.coral
        case .oceania: return theme.sky
        case .antarctica: return theme.sky
        }
    }

    /// Normalised centre (0...1) of the region within the map field.
    var center: CGPoint {
        switch self {
        case .northAmerica: CGPoint(x: 0.20, y: 0.34)
        case .southAmerica: CGPoint(x: 0.30, y: 0.74)
        case .europe: CGPoint(x: 0.50, y: 0.30)
        case .africa: CGPoint(x: 0.55, y: 0.60)
        case .asia: CGPoint(x: 0.74, y: 0.36)
        case .oceania: CGPoint(x: 0.85, y: 0.76)
        case .antarctica: CGPoint(x: 0.50, y: 0.95)
        }
    }

    /// Normalised radii (0...1) of the region's ellipse within the map field.
    var radii: CGSize {
        switch self {
        case .northAmerica: CGSize(width: 0.13, height: 0.20)
        case .southAmerica: CGSize(width: 0.08, height: 0.17)
        case .europe: CGSize(width: 0.07, height: 0.11)
        case .africa: CGSize(width: 0.10, height: 0.19)
        case .asia: CGSize(width: 0.17, height: 0.18)
        case .oceania: CGSize(width: 0.08, height: 0.09)
        case .antarctica: CGSize(width: 0.45, height: 0.06)
        }
    }
}

/// A single, presentation-only continent progress entry.
struct ExplorerContinent: Identifiable {
    var region: WorldRegion
    var visited: Int
    var total: Int

    var id: String { region.id }
    var accent: Color { region.accent }

    var fraction: Double {
        guard total > 0 else { return 0 }
        return min(max(Double(visited) / Double(total), 0), 1)
    }
}

/// Layout density for an `ExplorerMapProgress`.
enum ExplorerMapLayout {
    case compact
    case expanded
}

/// A premium, presentation-only world-progress card.
struct ExplorerMapProgress: View {
    var continents: [ExplorerContinent]
    var countriesVisited: Int
    var countriesTarget: Int
    var nextDestination: String? = nil
    var streakDays: Int? = nil
    var layout: ExplorerMapLayout = .expanded
    var title: String? = "World progress"
    var subtitle: String? = nil

    @State private var appeared = false

    // MARK: Derived

    private var overallProgress: Double {
        guard countriesTarget > 0 else { return 0 }
        return min(max(Double(countriesVisited) / Double(countriesTarget), 0), 1)
    }

    private var animatedProgress: Double { appeared ? overallProgress : 0 }
    private var percent: Int { Int((overallProgress * 100).rounded()) }
    private var exploredContinents: Int { continents.filter { $0.visited > 0 }.count }
    private var accent: Color { TravelTheme.current.tint }

    var body: some View {
        Group {
            switch layout {
            case .expanded: expanded
            case .compact: compact
            }
        }
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Expanded

    private var expanded: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        if let title {
                            Text(title).font(TravelTypography.section)
                        }
                        if let subtitle {
                            Text(subtitle)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    Spacer(minLength: 0)
                    if let streakDays {
                        streakBadge(streakDays, compact: false)
                    }
                }

                worldMap(height: 188)

                progressSummary

                if !continents.isEmpty {
                    PremiumAdaptiveGrid(minimumWidth: 132) {
                        ForEach(continents) { continent in
                            continentChip(continent)
                        }
                    }
                }

                if let nextDestination {
                    nextDestinationCallout(nextDestination)
                }
            }
        }
    }

    // MARK: Compact

    private var compact: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                worldMap(height: 92)
                    .frame(width: 128)

                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    HStack(spacing: TravelSpacing.xs) {
                        if let title {
                            Text(title)
                                .font(TravelTypography.cardTitle)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                        if let streakDays {
                            streakBadge(streakDays, compact: true)
                        }
                    }

                    Text("\(countriesVisited)/\(countriesTarget) countries · \(percent)%")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()

                    PremiumProgressBar(
                        progress: animatedProgress,
                        colors: [accent, TravelTheme.current.sky],
                        height: TravelSpacing.xs
                    )

                    Text("\(exploredContinents)/\(continents.count) continents explored")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)

                    if let nextDestination {
                        Label("Next · \(nextDestination)", systemImage: "location.north.circle.fill")
                            .font(TravelTypography.caption)
                            .foregroundStyle(accent)
                            .lineLimit(1)
                    }
                }
            }
        }
    }

    // MARK: Map field

    private func worldMap(height: CGFloat) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            TravelTheme.current.ocean.opacity(0.22),
                            TravelTheme.current.sky.opacity(0.12)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Canvas { context, size in
                let cols = 30
                let rows = 18
                let cellW = size.width / CGFloat(cols)
                let cellH = size.height / CGFloat(rows)
                let dotR = min(cellW, cellH) * 0.34

                for row in 0..<rows {
                    for col in 0..<cols {
                        let nx = (CGFloat(col) + 0.5) / CGFloat(cols)
                        let ny = (CGFloat(row) + 0.5) / CGFloat(rows)
                        guard let region = region(atX: Double(nx), y: Double(ny)) else { continue }
                        let lit = hash01(col, row) < fraction(for: region)
                        let rect = CGRect(
                            x: nx * size.width - dotR,
                            y: ny * size.height - dotR,
                            width: dotR * 2,
                            height: dotR * 2
                        )
                        context.fill(
                            Path(ellipseIn: rect),
                            with: .color(lit ? region.accent : Color.primary.opacity(0.13))
                        )
                    }
                }
            }
            .padding(TravelSpacing.sm)
        }
        .frame(height: height)
        .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                .stroke(.white.opacity(0.3), lineWidth: 1)
        )
        .opacity(appeared ? 1 : 0)
        .scaleEffect(appeared ? 1 : 0.98)
        .animation(TravelMotion.gentle, value: appeared)
        .accessibilityHidden(true)
    }

    // MARK: Pieces

    private var progressSummary: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(countriesVisited) of \(countriesTarget) countries")
                    .font(TravelTypography.cardTitle)
                    .monospacedDigit()
                Spacer(minLength: TravelSpacing.sm)
                Text("\(percent)%")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            PremiumProgressBar(
                progress: animatedProgress,
                colors: [accent, TravelTheme.current.sky],
                height: TravelSpacing.sm
            )
            Text("\(exploredContinents) of \(continents.count) continents explored")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func continentChip(_ continent: ExplorerContinent) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            ring(continent.fraction, accent: continent.accent, diameter: 30)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(continent.region.displayName)
                    .font(TravelTypography.caption)
                    .lineLimit(1)
                Text("\(continent.visited)/\(continent.total)")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(continent.region.displayName), \(continent.visited) of \(continent.total) countries")
    }

    private func ring(_ fraction: Double, accent: Color, diameter: CGFloat) -> some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.18), lineWidth: 3)
            Circle()
                .trim(from: 0, to: appeared ? fraction : 0)
                .stroke(accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(TravelMotion.gentle, value: appeared)
        }
        .frame(width: diameter, height: diameter)
    }

    private func streakBadge(_ days: Int, compact: Bool) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "flame.fill")
                .foregroundStyle(TravelTheme.current.coral)
            Text("\(days)")
                .monospacedDigit()
            if !compact {
                Text("day streak")
                    .foregroundStyle(.secondary)
            }
        }
        .font(TravelTypography.caption)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(.thinMaterial, in: Capsule())
    }

    private func nextDestinationCallout(_ name: String) -> some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: "location.north.circle.fill")
                .font(TravelTypography.title)
                .foregroundStyle(accent)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text("Next destination")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(name)
                    .font(TravelTypography.cardTitle)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            Image(systemName: "airplane")
                .foregroundStyle(.secondary)
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }

    // MARK: Geometry & determinism

    /// The region whose stylised ellipse contains the normalised point, if any.
    private func region(atX nx: Double, y ny: Double) -> WorldRegion? {
        for region in WorldRegion.allCases {
            let dx = (nx - Double(region.center.x)) / Double(region.radii.width)
            let dy = (ny - Double(region.center.y)) / Double(region.radii.height)
            if dx * dx + dy * dy <= 1 { return region }
        }
        return nil
    }

    private func fraction(for region: WorldRegion) -> Double {
        continents.first { $0.region == region }?.fraction ?? 0
    }

    /// A stable, deterministic hash in `0..<1` for a grid cell (no `Math.random`
    /// / no `UUID()`), so the same progress always lights the same dots.
    private func hash01(_ x: Int, _ y: Int) -> Double {
        let a = UInt64(bitPattern: Int64(x))
        let b = UInt64(bitPattern: Int64(y))
        var h: UInt64 = 14695981039346656037
        h = (h ^ (a &+ 1)) &* 1099511628211
        h = (h ^ (b &+ 1)) &* 1099511628211
        h ^= h >> 33
        return Double(h % 100000) / 100000.0
    }

    private var accessibilityText: String {
        var parts = [
            title ?? "World progress",
            "\(countriesVisited) of \(countriesTarget) countries, \(percent) percent",
            "\(exploredContinents) of \(continents.count) continents explored"
        ]
        if let streakDays { parts.append("\(streakDays) day streak") }
        if let nextDestination { parts.append("next destination \(nextDestination)") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct ExplorerMapProgress_Previews: PreviewProvider {

    private static func continent(_ region: WorldRegion, _ visited: Int, _ total: Int) -> ExplorerContinent {
        ExplorerContinent(region: region, visited: visited, total: total)
    }

    /// A seasoned traveller, mid-journey.
    private static let voyager: [ExplorerContinent] = [
        continent(.northAmerica, 3, 23),
        continent(.southAmerica, 4, 12),
        continent(.europe, 11, 44),
        continent(.africa, 2, 54),
        continent(.asia, 4, 48),
        continent(.oceania, 0, 14)
    ]

    /// A brand-new explorer.
    private static let newExplorer: [ExplorerContinent] = [
        continent(.europe, 3, 44),
        continent(.northAmerica, 0, 23),
        continent(.asia, 0, 48)
    ]

    /// A legendary globetrotter, nearly complete.
    private static let globetrotter: [ExplorerContinent] = [
        continent(.northAmerica, 22, 23),
        continent(.southAmerica, 12, 12),
        continent(.europe, 44, 44),
        continent(.africa, 41, 54),
        continent(.asia, 45, 48),
        continent(.oceania, 11, 14),
        continent(.antarctica, 1, 1)
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Seasoned Voyager")
                        .font(TravelTypography.section)
                    ExplorerMapProgress(
                        continents: voyager,
                        countriesVisited: 24,
                        countriesTarget: 50,
                        nextDestination: "Iceland",
                        streakDays: 12,
                        layout: .expanded,
                        subtitle: "Five continents touched, more on the horizon."
                    )

                    Divider()

                    Text("Expanded · New Explorer")
                        .font(TravelTypography.section)
                    ExplorerMapProgress(
                        continents: newExplorer,
                        countriesVisited: 3,
                        countriesTarget: 30,
                        nextDestination: "Portugal",
                        layout: .expanded,
                        title: "Your world",
                        subtitle: "Every country fills in another piece."
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Map progress · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Globetrotter")
                        .font(TravelTypography.section)
                    ExplorerMapProgress(
                        continents: globetrotter,
                        countriesVisited: 97,
                        countriesTarget: 100,
                        streakDays: 365,
                        layout: .expanded,
                        subtitle: "All seven continents — the world, very nearly complete."
                    )

                    Text("Compact · Voyager")
                        .font(TravelTypography.section)
                    ExplorerMapProgress(
                        continents: voyager,
                        countriesVisited: 24,
                        countriesTarget: 50,
                        nextDestination: "Iceland",
                        streakDays: 12,
                        layout: .compact
                    )

                    Text("Compact · New Explorer")
                        .font(TravelTypography.section)
                    ExplorerMapProgress(
                        continents: newExplorer,
                        countriesVisited: 3,
                        countriesTarget: 30,
                        layout: .compact,
                        title: "World progress"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Map progress · Globetrotter & Compact")
        }
    }
}
#endif
