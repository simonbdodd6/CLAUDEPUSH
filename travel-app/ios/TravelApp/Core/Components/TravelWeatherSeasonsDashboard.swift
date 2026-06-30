import SwiftUI

// MARK: - Travel weather & seasons dashboard (Phase 124)
//
// A flagship, presentation-only Weather & Seasons dashboard: a hero with current-
// conditions placeholders (temperature, feels-like, humidity, UV), a wet vs dry season
// overview, a month-by-month climate table with rainfall/temperature mini-charts, best-
// time-to-visit guidance filtered by activity, regional micro-climate notes filtered by
// region, sea-conditions & swell placeholders, diving-visibility-by-season notes, UV &
// sun-safety reminders, monsoon & storm guidance, packing-by-season suggestions,
// sunrise/sunset & daylight placeholders, a forecast placeholder and a disclaimer. A
// caller supplies a `WeatherGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens.
// `WeatherGuide` and its nested rows are lightweight presentation models (not DTOs);
// the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The activity
// and region filters and favourite stars are UI-only, and all figures are illustrative.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A crowd level for the climate table — drives the badge label and accent.
enum WeatherCrowd {
    case low
    case medium
    case high

    var label: String {
        switch self {
        case .low: "Quiet"
        case .medium: "Steady"
        case .high: "Busy"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .low: return theme.moss
        case .medium: return theme.sun
        case .high: return theme.coral
        }
    }
}

/// A single at-a-glance / current-conditions placeholder fact.
struct WeatherFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single month in the climate table.
struct WeatherMonth: Identifiable {
    let id = UUID()
    var name: String
    var tempC: Int
    var seaTempC: Int
    var rainFraction: Double   // 0–1
    var crowd: WeatherCrowd

    /// Normalised 24–33°C band for the temperature mini-chart.
    var tempFraction: Double { min(max(Double(tempC - 24) / 9.0, 0), 1) }
}

/// A best-time-to-visit entry for one activity.
struct WeatherActivity: Identifiable {
    let id: String
    var activity: String
    var bestMonths: String
    var icon: String
    var detail: String
    var accent: Color

    init(activity: String, bestMonths: String, icon: String, detail: String, accent: Color) {
        self.id = activity
        self.activity = activity
        self.bestMonths = bestMonths
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// A generic weather guide row reused for regions, visibility, placeholders and packing.
struct WeatherInfoRow: Identifiable {
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

/// The full, presentation-only content for a weather & seasons guide.
struct WeatherGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var currentConditions: [WeatherFact]
    var dryPoints: [String]
    var wetPoints: [String]
    var months: [WeatherMonth]
    var activities: [WeatherActivity]
    var regions: [WeatherInfoRow]
    var seaConditions: [WeatherInfoRow]
    var diveVisibility: [WeatherInfoRow]
    var uvTips: [String]
    var monsoonTips: [String]
    var packingTips: [String]
    var daylight: [WeatherInfoRow]
    var disclaimer: String
}

/// A premium, presentation-only weather & seasons dashboard rendered from a `WeatherGuide`.
struct TravelWeatherSeasonsDashboard: View {
    var guide: WeatherGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedActivity = "All"
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let activityFilters = ["All", "Diving", "Surfing", "Hiking", "Festivals", "Wildlife"]
    private let regionFilters = ["All", "Bali", "Gili", "Lombok", "Komodo", "Raja Ampat"]

    private var filteredActivities: [WeatherActivity] {
        guard selectedActivity != "All" else { return guide.activities }
        return guide.activities.filter { $0.activity == selectedActivity }
    }

    private var filteredRegions: [WeatherInfoRow] {
        guard selectedRegion != "All" else { return guide.regions }
        return guide.regions.filter { $0.region == selectedRegion }
    }

    var body: some View {
        PremiumScrollView {
            hero
            nowGroup
            climateGroup
            conditionsGroup
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
            eyebrow: "Weather & Seasons",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: conditionValue("Temperature"), label: "Temp"),
                HeroMetric(value: conditionValue("Humidity"), label: "Humidity"),
                HeroMetric(value: conditionValue("UV index"), label: "UV")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(WeatherAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func conditionValue(_ label: String) -> String {
        guide.currentConditions.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var nowGroup: some View {
        Group {
            section("Now", "Live conditions need a connection.", 1) {
                conditionsCard
            }

            section("Wet vs dry", "Two seasons, no winter.", 2) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    seasonColumn("Dry", "sun.max.fill", theme.sun, "May–Sep", guide.dryPoints)
                    seasonColumn("Wet", "cloud.rain.fill", theme.ocean, "Oct–Apr", guide.wetPoints)
                }
            }
        }
    }

    private var climateGroup: some View {
        Group {
            section("Month by month", "Temperature, rain, sea and crowds.", 3) {
                VStack(spacing: TravelSpacing.md) {
                    chartsCard
                    GlassCard {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(guide.months) { month in
                                monthRow(month)
                            }
                        }
                    }
                }
            }

            section("Best time by activity", "Filter by what you’ll do.", 4) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    chipRow(activityFilters, selected: selectedActivity) { selectedActivity = $0 }
                    if filteredActivities.isEmpty {
                        emptyCard("activities")
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredActivities) { activity in
                                activityCard(activity)
                            }
                        }
                    }
                }
            }

            section("Regional micro-climates", "Filter by region.", 5) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    chipRow(regionFilters, selected: selectedRegion) { selectedRegion = $0 }
                    if filteredRegions.isEmpty {
                        emptyCard("regions")
                    } else {
                        infoList(filteredRegions)
                    }
                }
            }
        }
    }

    private var conditionsGroup: some View {
        Group {
            section("Sea & swell", "On the water.", 6) {
                infoList(guide.seaConditions)
            }

            section("Diving visibility", "Clarity through the year.", 7) {
                infoList(guide.diveVisibility)
            }

            section("UV & sun safety", "The equatorial sun is fierce.", 8) {
                bulletCard(guide.uvTips, icon: "sun.max.trianglebadge.exclamationmark.fill", tint: theme.coral)
            }

            section("Monsoon & storms", "When the weather turns.", 8) {
                bulletCard(guide.monsoonTips, icon: "cloud.bolt.rain.fill", tint: theme.ocean)
            }
        }
    }

    private var prepGroup: some View {
        Group {
            section("Packing by season", "Dress for the sky.", 8) {
                bulletCard(guide.packingTips, icon: "bag.fill", tint: theme.tint)
            }

            section("Daylight", "Sunrise, sunset and hours.", 8) {
                infoList(guide.daylight)
            }

            section("Forecast", "Live weather.", 8) {
                forecastCard
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(WeatherAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Current conditions

    private var conditionsCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                PremiumAdaptiveGrid(minimumWidth: 104) {
                    ForEach(guide.currentConditions) { fact in
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Label(fact.value, systemImage: fact.icon)
                                .font(TravelTypography.cardTitle)
                                .foregroundStyle(theme.tint)
                            Text(fact.label)
                                .font(TravelTypography.eyebrow)
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(TravelSpacing.sm)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                    }
                }
                Text("Indicative typical values — connect for a live reading.")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Current conditions placeholder. " + guide.currentConditions.map { "\($0.label) \($0.value)" }.joined(separator: ", "))
    }

    // MARK: Season columns

    private func seasonColumn(_ title: String, _ icon: String, _ accent: Color, _ months: String, _ points: [String]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Label(title, systemImage: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(accent)
                Text(months)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
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
        .accessibilityLabel("\(title) season, \(months): \(points.joined(separator: ", "))")
    }

    // MARK: Climate charts & month rows

    private var chartsCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text("Rainfall")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                miniBars(guide.months.map(\.rainFraction), theme.ocean)
                Text("Temperature")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                miniBars(guide.months.map(\.tempFraction), theme.sun)
                HStack(spacing: 3) {
                    ForEach(guide.months) { month in
                        Text(String(month.name.prefix(1)))
                            .font(.system(size: 8))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Mini charts of rainfall and temperature across the twelve months.")
    }

    private func miniBars(_ values: [Double], _ color: Color) -> some View {
        HStack(alignment: .bottom, spacing: 3) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(LinearGradient(colors: [color, color.opacity(0.55)], startPoint: .top, endPoint: .bottom))
                    .frame(maxWidth: .infinity)
                    .frame(height: max(4, CGFloat(value) * 40))
            }
        }
        .frame(height: 40, alignment: .bottom)
        .accessibilityHidden(true)
    }

    private func monthRow(_ month: WeatherMonth) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            Text(month.name)
                .font(TravelTypography.caption)
                .frame(width: 38, alignment: .leading)
            VStack(alignment: .leading, spacing: 2) {
                Label("\(month.tempC)°C", systemImage: "thermometer.medium")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
                PremiumProgressBar(progress: appeared ? month.rainFraction : 0, colors: [theme.ocean, theme.sky], height: 6)
                    .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
            }
            Label("\(month.seaTempC)°", systemImage: "water.waves")
                .font(TravelTypography.eyebrow)
                .foregroundStyle(.secondary)
                .frame(width: 52, alignment: .leading)
            Text(month.crowd.label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(month.crowd.accent)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xxs)
                .background(month.crowd.accent.opacity(0.15), in: Capsule())
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(month.name): air \(month.tempC) degrees, sea \(month.seaTempC) degrees, rainfall \(Int((month.rainFraction * 100).rounded())) percent, crowds \(month.crowd.label).")
    }

    // MARK: Activity cards

    private func activityCard(_ activity: WeatherActivity) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(activity.icon, activity.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(activity.activity)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(activity.bestMonths, activity.accent)
                    }
                    Text(activity.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton(activity.id, activity.activity)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(activity.activity), best \(activity.bestMonths). \(activity.detail)")
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

    private func emptyCard(_ what: String) -> some View {
        GlassCard {
            Text("No \(what) for that filter.")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: Generic info list

    private func infoList(_ rows: [WeatherInfoRow]) -> some View {
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

    // MARK: Forecast placeholder

    private var forecastCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "cloud.sun.bolt.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Live forecast")
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
        .accessibilityLabel("Live forecast. \(guide.disclaimer)")
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
        .accessibilityLabel(isFav ? "Saved note: \(name)" : "Save note \(name)")
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

// MARK: - Weather appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct WeatherAppear: ViewModifier {
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
extension WeatherGuide {
    /// A deterministic sample weather guide for Indonesia (illustrative figures).
    static var sampleIndonesia: WeatherGuide {
        let theme = TravelTheme.current
        return WeatherGuide(
            heroTitle: "Indonesia · Weather",
            heroSubtitle: "Warm and tropical all year — it’s really a choice between the dry and the wet season.",
            heroSymbol: "cloud.sun.fill",
            heroGradient: [theme.sky, theme.tint, theme.sun],
            currentConditions: [
                WeatherFact(icon: "thermometer.medium", label: "Temperature", value: "30°C"),
                WeatherFact(icon: "thermometer.sun.fill", label: "Feels like", value: "34°C"),
                WeatherFact(icon: "humidity.fill", label: "Humidity", value: "78%"),
                WeatherFact(icon: "sun.max.fill", label: "UV index", value: "11 · Extreme")
            ],
            dryPoints: [
                "Less rain and lower humidity",
                "Best for diving, surfing and trekking",
                "Busiest in July, August and New Year",
                "Clearer skies and calmer seas"
            ],
            wetPoints: [
                "Short, heavy afternoon downpours",
                "Lush scenery and fewer crowds",
                "Wettest December to February",
                "Better value on rooms and tours"
            ],
            months: [
                WeatherMonth(name: "Jan", tempC: 29, seaTempC: 29, rainFraction: 0.90, crowd: .high),
                WeatherMonth(name: "Feb", tempC: 29, seaTempC: 29, rainFraction: 0.85, crowd: .medium),
                WeatherMonth(name: "Mar", tempC: 29, seaTempC: 29, rainFraction: 0.70, crowd: .medium),
                WeatherMonth(name: "Apr", tempC: 29, seaTempC: 29, rainFraction: 0.50, crowd: .medium),
                WeatherMonth(name: "May", tempC: 28, seaTempC: 28, rainFraction: 0.30, crowd: .medium),
                WeatherMonth(name: "Jun", tempC: 28, seaTempC: 27, rainFraction: 0.20, crowd: .high),
                WeatherMonth(name: "Jul", tempC: 27, seaTempC: 27, rainFraction: 0.15, crowd: .high),
                WeatherMonth(name: "Aug", tempC: 27, seaTempC: 27, rainFraction: 0.15, crowd: .high),
                WeatherMonth(name: "Sep", tempC: 28, seaTempC: 27, rainFraction: 0.25, crowd: .medium),
                WeatherMonth(name: "Oct", tempC: 28, seaTempC: 28, rainFraction: 0.45, crowd: .medium),
                WeatherMonth(name: "Nov", tempC: 29, seaTempC: 29, rainFraction: 0.65, crowd: .low),
                WeatherMonth(name: "Dec", tempC: 29, seaTempC: 29, rainFraction: 0.85, crowd: .high)
            ],
            activities: [
                WeatherActivity(activity: "Diving", bestMonths: "Apr–Oct", icon: "water.waves", detail: "Dry season brings the best visibility; Komodo mantas peak now. Raja Ampat is calmest Oct–Apr.", accent: theme.ocean),
                WeatherActivity(activity: "Surfing", bestMonths: "May–Sep", icon: "figure.surfing", detail: "Dry-season swells light up the west coast (Uluwatu, Desert Point). The east coast works in the wet.", accent: theme.sky),
                WeatherActivity(activity: "Hiking", bestMonths: "May–Oct", icon: "figure.hiking", detail: "Volcano treks (Rinjani, Batur, Agung) are clearest and safest in the dry; Rinjani closes in the wet.", accent: theme.moss),
                WeatherActivity(activity: "Festivals", bestMonths: "Mar, Jun–Aug", icon: "sparkles", detail: "Nyepi (March), the Bali Arts Festival (Jun–Jul) and Independence Day (17 Aug).", accent: theme.coral),
                WeatherActivity(activity: "Wildlife", bestMonths: "Apr–Jun", icon: "tortoise.fill", detail: "Komodo dragons are active year-round but the shoulder months are cooler for walking.", accent: theme.sun)
            ],
            regions: [
                WeatherInfoRow(title: "Bali", subtitle: "South vs highlands", icon: "leaf.fill", detail: "The south is sunnier; the central mountains are cooler and noticeably wetter.", accent: theme.tint, region: "Bali"),
                WeatherInfoRow(title: "Gili Islands", subtitle: "Hot & dry", icon: "beach.umbrella.fill", detail: "Low rainfall and reliable sun; Apr–Oct is the sweet spot.", accent: theme.sun, region: "Gili"),
                WeatherInfoRow(title: "Lombok", subtitle: "Drier south", icon: "mountain.2.fill", detail: "Kuta Lombok is dry and breezy; the north and Rinjani catch more rain.", accent: theme.moss, region: "Lombok"),
                WeatherInfoRow(title: "Komodo", subtitle: "Savannah climate", icon: "sun.max.fill", detail: "Hot and arid, especially Sep–Nov; best diving and sailing Apr–Oct.", accent: theme.coral, region: "Komodo"),
                WeatherInfoRow(title: "Raja Ampat", subtitle: "No true dry season", icon: "cloud.rain.fill", detail: "Rain all year, but the seas are calmest and clearest Oct–Apr.", accent: theme.ocean, region: "Raja Ampat")
            ],
            seaConditions: [
                WeatherInfoRow(title: "Sea temperature", subtitle: "Year-round", icon: "thermometer.water", detail: "Warm 27–29°C; a 3mm wetsuit is plenty, with a thicker option for cool Nusa Penida upwellings.", accent: theme.ocean),
                WeatherInfoRow(title: "Swell & surf", subtitle: "Placeholder", icon: "water.waves", detail: "Dry-season SE swells favour west coasts. Live swell and tide data need a connection.", accent: theme.sky),
                WeatherInfoRow(title: "Crossings", subtitle: "Wind-driven", icon: "ferry.fill", detail: "Open-water boat crossings get choppier in the wet season and afternoon winds.", accent: theme.tint)
            ],
            diveVisibility: [
                WeatherInfoRow(title: "Dry season", subtitle: "May–Oct", icon: "eye.fill", detail: "Generally the clearest water — 15–30m+ at many sites.", accent: theme.moss),
                WeatherInfoRow(title: "Wet season", subtitle: "Nov–Apr", icon: "eye.slash.fill", detail: "Run-off can cut visibility near rivers and after heavy rain.", accent: theme.sun),
                WeatherInfoRow(title: "Raja Ampat", subtitle: "Oct–Apr", icon: "sparkles", detail: "Calmest seas and best clarity here run opposite to much of Indonesia.", accent: theme.ocean)
            ],
            uvTips: [
                "UV is extreme year-round near the equator — treat every day as high risk.",
                "Use high-SPF reef-safe sunscreen and reapply after swimming.",
                "Cover up and seek shade between 11am and 3pm.",
                "Sunburn happens fast even on cloudy or hazy days."
            ],
            monsoonTips: [
                "The wet season (Oct–Apr) brings short, intense afternoon thunderstorms.",
                "Build buffer days around boat travel — crossings can be cancelled in storms.",
                "Flash flooding and landslides are possible in the heaviest months.",
                "Mosquitoes (and dengue risk) increase after the rains — pack repellent."
            ],
            packingTips: [
                "Year-round: light breathable clothes, reef-safe sunscreen, hat and sunglasses.",
                "Dry season: a light layer for cool highland evenings and early dives.",
                "Wet season: a packable rain jacket, quick-dry clothes and dry bags.",
                "Always: sandals, insect repellent and a refillable water bottle."
            ],
            daylight: [
                WeatherInfoRow(title: "Sunrise & sunset", subtitle: "Placeholder", icon: "sunrise.fill", detail: "Near the equator the sun rises ~06:00 and sets ~18:00 with little seasonal change.", accent: theme.sun),
                WeatherInfoRow(title: "Daylight hours", subtitle: "≈ 12 hours", icon: "clock.fill", detail: "About twelve hours of daylight all year; dusk is short, so plan boat returns before dark.", accent: theme.tint)
            ],
            disclaimer: "Forecast information requires internet connection."
        )
    }
}

struct TravelWeatherSeasonsDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelWeatherSeasonsDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Weather & seasons · Indonesia")

            TravelWeatherSeasonsDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Weather & seasons · Dynamic Type XL")
        }
    }
}
#endif
