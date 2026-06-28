import SwiftUI

// MARK: - Explorer weather & season guide (Phase 95)
//
// A reusable, presentation-only guide to when to visit: seasons, weather patterns
// and the best time for each activity. Each entry carries the best months, average
// conditions, traveller suitability, advantages and disadvantages, packing
// recommendations, activity suitability, a crowd level, a price impact and expert
// seasonal advice.
//
// It reuses the existing design system exclusively — `GlassCard`, `PremiumPillRow`
// (the compact summary rows) and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are caller-
// supplied mock data; the component holds no data, networking, persistence,
// view-model, repository, navigation, AppContainer or DTO usage, and is not wired
// into any screen.
//
// Accessibility: every entry exposes one combined VoiceOver label covering the
// full detail set; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion (appearance + expand) is
// disabled under Reduce Motion.

/// How busy a season or destination is.
enum CrowdLevel: CaseIterable {
    case quiet
    case moderate
    case busy

    var label: String {
        switch self {
        case .quiet: "Quiet"
        case .moderate: "Moderate"
        case .busy: "Busy"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .quiet: return theme.moss
        case .moderate: return theme.sun
        case .busy: return theme.coral
        }
    }
}

/// How a season affects prices.
enum PriceImpact: CaseIterable {
    case low
    case moderate
    case high

    var label: String {
        switch self {
        case .low: "Low"
        case .moderate: "Moderate"
        case .high: "High"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .low: return theme.moss
        case .moderate: return theme.sun
        case .high: return theme.coral
        }
    }
}

/// A single, presentation-only weather / season entry.
struct WeatherItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var bestMonths: String
    var averageConditions: String
    var suitability: String
    var advantages: [String]
    var disadvantages: [String]
    var packing: [String]
    var activitySuitability: String
    var crowd: CrowdLevel
    var priceImpact: PriceImpact
    var expertAdvice: String
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        bestMonths: String,
        averageConditions: String,
        suitability: String,
        advantages: [String],
        disadvantages: [String],
        packing: [String],
        activitySuitability: String,
        crowd: CrowdLevel,
        priceImpact: PriceImpact,
        expertAdvice: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.bestMonths = bestMonths
        self.averageConditions = averageConditions
        self.suitability = suitability
        self.advantages = advantages
        self.disadvantages = disadvantages
        self.packing = packing
        self.activitySuitability = activitySuitability
        self.crowd = crowd
        self.priceImpact = priceImpact
        self.expertAdvice = expertAdvice
        self.accent = accent
    }

    var accessibilityText: String {
        [
            category,
            "best months \(bestMonths)",
            "average conditions \(averageConditions)",
            "best for \(suitability)",
            "advantages: \(advantages.joined(separator: "; "))",
            "disadvantages: \(disadvantages.joined(separator: "; "))",
            "packing: \(packing.joined(separator: "; "))",
            "activities: \(activitySuitability)",
            "crowds \(crowd.label)",
            "prices \(priceImpact.label)",
            "advice: \(expertAdvice)"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerWeatherSeasonGuide`.
enum WeatherSeasonLayout {
    case compact
    case expanded
}

/// A premium, presentation-only weather & season guide.
struct ExplorerWeatherSeasonGuide: View {
    var items: [WeatherItem]
    var layout: WeatherSeasonLayout = .expanded
    var title: String? = "Weather & seasons"
    var subtitle: String? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        Group {
            if items.isEmpty {
                emptyState
            } else {
                switch layout {
                case .expanded: expanded
                case .compact: compact
                }
            }
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Expanded (expandable cards)

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)

            VStack(spacing: TravelSpacing.md) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    WeatherCard(item: item, startsExpanded: index == 0)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                }
            }
        }
    }

    // MARK: Compact (summary card)

    private var compact: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                    if let title {
                        Text(title).font(TravelTypography.cardTitle)
                    }
                    Spacer(minLength: 0)
                    Text(countLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: TravelSpacing.sm) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        PremiumPillRow(
                            symbol: item.icon,
                            accent: item.accent,
                            title: item.category,
                            subtitle: item.averageConditions,
                            trailing: item.bestMonths
                        )
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)
                        .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(item.accessibilityText)
                    }
                }
            }
        }
    }

    // MARK: Pieces

    @ViewBuilder
    private func header(titleFont: Font) -> some View {
        if title != nil || subtitle != nil {
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.md) {
                    if let title {
                        Text(title).font(titleFont)
                    }
                    Spacer(minLength: 0)
                    Text(countLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                if let subtitle {
                    Text(subtitle)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var countLabel: String {
        items.count == 1 ? "1 topic" : "\(items.count) topics"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "cloud.sun")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No seasonal information listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Weather card

/// A premium expandable GlassCard for one season / weather topic: a summary
/// (category and best months) that expands to reveal the full detail set. The
/// whole card is a single VoiceOver element, and all motion is disabled under
/// Reduce Motion.
private struct WeatherCard: View {
    let item: WeatherItem
    var startsExpanded: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var expanded = false

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                summary
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { expanded.toggle() }
                    }

                if expanded {
                    Divider()
                    detail
                }
            }
        }
        .onAppear { expanded = startsExpanded }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.accessibilityText)
        .accessibilityHint(expanded ? "Showing details" : "Double tap to show details")
    }

    private var summary: some View {
        HStack(spacing: TravelSpacing.md) {
            medallion

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(item.category)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Best: \(item.bestMonths)")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            Image(systemName: "chevron.down")
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .rotationEffect(.degrees(expanded ? 180 : 0))
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            badgeRow

            detailRow(icon: "thermometer.sun.fill", label: "Average conditions", value: item.averageConditions)
            detailRow(icon: "figure.run", label: "Activities", value: item.activitySuitability)
            detailRow(icon: "person.fill.checkmark", label: "Best for", value: item.suitability)

            labeledList("Advantages", item.advantages, icon: "checkmark.circle.fill", tint: TravelTheme.current.moss)
            labeledList("Disadvantages", item.disadvantages, icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.coral)
            labeledList("Packing", item.packing, icon: "suitcase.fill", tint: item.accent)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Seasonal advice", text: item.expertAdvice)
        }
    }

    // MARK: Pieces

    private var badgeRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                pillBadge(icon: "person.3.fill", text: "Crowds: \(item.crowd.label)", tint: item.crowd.accent)
                pillBadge(icon: "banknote.fill", text: "Prices: \(item.priceImpact.label)", tint: item.priceImpact.accent)
            }
        }
    }

    private func pillBadge(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: icon)
            Text(text)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
    }

    private var medallion: some View {
        Image(systemName: item.icon)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(
                    colors: [item.accent, item.accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: item.accent.opacity(0.3), radius: 8, y: 4)
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .frame(width: 18)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(TravelTypography.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
    }

    private func labeledList(_ label: String, _ items: [String], icon: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                ForEach(items, id: \.self) { entry in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(entry)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func calloutRow(icon: String, tint: Color, label: String, text: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(label)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(text)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

#if DEBUG
struct ExplorerWeatherSeasonGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Seasonal patterns across Bali, Lombok, the Gilis, Komodo, Raja Ampat & Java.
    private static let seasons: [WeatherItem] = [
        WeatherItem(
            category: "Dry season", icon: "sun.max.fill",
            bestMonths: "Apr–Oct", averageConditions: "Sunny, 27–32°C, low rain, gentle sea breeze",
            suitability: "Almost everyone — the classic time to visit",
            advantages: ["Reliable sunshine", "Best for surfing the west coast and trekking", "Calm seas for island hops"],
            disadvantages: ["Peak crowds Jul–Aug", "Highest prices", "Popular spots book out"],
            packing: ["Reef-safe SPF and a hat", "Light, breathable clothing", "A warm layer for Rinjani/Bromo"],
            activitySuitability: "Surfing (west), diving, hiking, island-hopping",
            crowd: .busy, priceImpact: .high,
            expertAdvice: "Book accommodation and Komodo/Rinjani trips well ahead for Jul–Aug.",
            accent: theme.sun
        ),
        WeatherItem(
            category: "Wet season", icon: "cloud.rain.fill",
            bestMonths: "Nov–Mar (greenest)", averageConditions: "Hot, humid, short intense afternoon downpours",
            suitability: "Budget and flexible travellers who don’t mind rain",
            advantages: ["Lush, green landscapes", "Fewer crowds", "Lower prices and easier bookings"],
            disadvantages: ["Daily heavy showers (often afternoon)", "Rougher seas; some ferry cancellations", "Higher dengue risk"],
            packing: ["Lightweight rain jacket", "Dry bag", "Quick-dry clothes and mosquito repellent"],
            activitySuitability: "East-coast surfing, spa days, waterfalls, cultural sights",
            crowd: .quiet, priceImpact: .low,
            expertAdvice: "Plan outdoor activities for the morning — rain usually comes in the afternoon.",
            accent: theme.ocean
        ),
        WeatherItem(
            category: "Shoulder season", icon: "cloud.sun.fill",
            bestMonths: "Apr–Jun & Sep–Oct", averageConditions: "Warm and mostly dry, occasional shower",
            suitability: "The sweet spot for most travellers",
            advantages: ["Great weather with fewer crowds", "Better prices than peak", "Everything open and running"],
            disadvantages: ["The odd rainy day", "Some festival dates can spike demand"],
            packing: ["Light clothing + SPF", "A compact rain layer just in case"],
            activitySuitability: "Everything — the best all-round window",
            crowd: .moderate, priceImpact: .moderate,
            expertAdvice: "Aim for May–June or September for the ideal balance of weather, crowds and price.",
            accent: theme.moss
        ),
        WeatherItem(
            category: "Surf season", icon: "figure.surfing",
            bestMonths: "Apr–Oct (west) · Nov–Mar (east)", averageConditions: "Dry-season swell hits the west; wet season favours the east",
            suitability: "Surfers of all levels — there’s a coast for every season",
            advantages: ["World-class west-coast breaks in dry season", "East coast and Lombok fire in wet season", "Warm water year-round"],
            disadvantages: ["Top breaks get crowded in peak", "Reef breaks suit experienced surfers only"],
            packing: ["Rash vest and reef booties", "Reef-safe SPF", "Ding repair kit if bringing a board"],
            activitySuitability: "Uluwatu/Bingin (dry) · Sanur/Keramas/Lombok (wet)",
            crowd: .busy, priceImpact: .high,
            expertAdvice: "Chase the dry season on the west coast; switch to the east coast in the wet.",
            accent: theme.sky
        ),
        WeatherItem(
            category: "Diving season", icon: "water.waves",
            bestMonths: "Year-round · Komodo Apr–Nov · Raja Ampat Oct–Apr", averageConditions: "Warm water 27–29°C; visibility varies by region/season",
            suitability: "Certified divers — pick the region by season",
            advantages: ["Gili/Amed dive well all year", "Komodo manta season Apr–Nov", "Raja Ampat peak Oct–Apr"],
            disadvantages: ["Stronger currents in some seasons", "Liveaboards book out far ahead", "Wet-season visibility can dip"],
            packing: ["Mask + dive computer", "3mm shorty", "Logbook and certification"],
            activitySuitability: "Mantas (Komodo), biodiversity (Raja Ampat), turtles (Gilis)",
            crowd: .moderate, priceImpact: .high,
            expertAdvice: "Match the region to the season: Komodo Apr–Nov, Raja Ampat Oct–Apr, Gilis anytime.",
            accent: theme.ocean
        ),
        WeatherItem(
            category: "Hiking season", icon: "figure.hiking",
            bestMonths: "May–Oct (dry)", averageConditions: "Clear, cool at altitude; summits can near 0°C",
            suitability: "Trekkers — dry season only for the big climbs",
            advantages: ["Clear sunrise views (Batur, Rinjani, Bromo)", "Safer, drier trails", "Rinjani is open"],
            disadvantages: ["Rinjani usually closes Jan–Mar (wet/safety)", "Cold, dark 2am starts", "Busy in peak"],
            packing: ["Headtorch and warm layers", "Broken-in trail shoes", "Gloves/hat for summits"],
            activitySuitability: "Batur sunrise, Rinjani multi-day, Ijen/Bromo (Java)",
            crowd: .moderate, priceImpact: .moderate,
            expertAdvice: "Avoid Jan–Mar for Rinjani — it’s often closed for safety; Batur runs most of the year.",
            accent: theme.moss
        ),
        WeatherItem(
            category: "Wildlife season", icon: "pawprint.fill",
            bestMonths: "Year-round, region-dependent", averageConditions: "Tropical; marine life and dragons viewable all year",
            suitability: "Nature lovers and divers",
            advantages: ["Komodo dragons year-round", "Manta aggregations in season", "Turtles on the Gilis anytime"],
            disadvantages: ["Some species are seasonal", "Remote parks need planning", "Park fees apply"],
            packing: ["Binoculars and a zoom lens", "Silica gel for humidity", "Closed shoes for Komodo trails"],
            activitySuitability: "Komodo NP, Raja Ampat reefs, Gili turtles, Java’s orang-utans (further afield)",
            crowd: .moderate, priceImpact: .moderate,
            expertAdvice: "For Komodo mantas, target April–November; dragons can be seen any time of year.",
            accent: theme.sun
        ),
        WeatherItem(
            category: "Festival season", icon: "party.popper.fill",
            bestMonths: "Mar (Nyepi) · Jun–Jul (Arts Festival)", averageConditions: "Cultural calendar runs all year; some movable Balinese dates",
            suitability: "Culture seekers — plan around the big dates",
            advantages: ["Nyepi (Day of Silence) is unique", "Galungan/Kuningan temple celebrations", "Bali Arts Festival (Jun–Jul)"],
            disadvantages: ["Nyepi closes the island for ~24h (incl. the airport)", "Holidays spike demand and prices", "Some sites busy or restricted"],
            packing: ["A temple-appropriate sarong and sash", "Modest clothing", "Patience for road closures"],
            activitySuitability: "Temple ceremonies, processions, arts and dance",
            crowd: .busy, priceImpact: .high,
            expertAdvice: "Around Nyepi, stock up the day before — everything (including the airport) closes.",
            accent: theme.coral
        ),
        WeatherItem(
            category: "Crowds", icon: "person.3.fill",
            bestMonths: "Quietest: Feb & Nov", averageConditions: "Peaks Jul–Aug, Christmas/New Year and Easter",
            suitability: "Crowd-averse travellers",
            advantages: ["Feb and Nov are calm and cheaper", "Shoulder months feel relaxed", "Easier last-minute bookings off-peak"],
            disadvantages: ["Jul–Aug and Dec are very busy", "Traffic and queues in hotspots", "Premium prices in peak"],
            packing: ["Patience for peak traffic", "Pre-booked tickets for big sights"],
            activitySuitability: "Off-peak suits quiet exploring; peak suits nightlife and events",
            crowd: .busy, priceImpact: .high,
            expertAdvice: "Travel in February or November for the best balance of calm, cost and decent weather.",
            accent: theme.tint
        ),
        WeatherItem(
            category: "Temperature", icon: "thermometer.sun.fill",
            bestMonths: "Consistent all year", averageConditions: "Lowlands 26–32°C year-round; cooler in Ubud; cold on summits",
            suitability: "Everyone — heat management matters more than season",
            advantages: ["Warm and stable all year", "Cooler highlands (Ubud, Munduk)", "Warm sea for swimming"],
            disadvantages: ["High heat + humidity is tiring", "Strong midday sun", "Summit cold catches people out"],
            packing: ["Breathable clothing and SPF", "A warm layer for highlands/summits", "Electrolytes for the heat"],
            activitySuitability: "Beaches and water anytime; hike high spots early",
            crowd: .moderate, priceImpact: .moderate,
            expertAdvice: "It’s warm year-round — plan strenuous activity for the cooler morning hours.",
            accent: theme.coral
        ),
        WeatherItem(
            category: "Rainfall", icon: "cloud.heavyrain.fill",
            bestMonths: "Driest: Jun–Sep", averageConditions: "Wet Nov–Mar (peak Dec–Jan); short, intense afternoon showers",
            suitability: "Plan activities around the daily rhythm",
            advantages: ["Rain is usually brief and afternoon", "Mornings often clear even in the wet", "Landscapes are lush after rain"],
            disadvantages: ["Dec–Jan downpours and flooding risk", "Rougher seas affect ferries", "Humidity spikes"],
            packing: ["Compact rain jacket", "Dry bag for electronics", "Quick-dry footwear"],
            activitySuitability: "Outdoor mornings; spas, culture and food in the afternoon",
            crowd: .quiet, priceImpact: .low,
            expertAdvice: "Even in the wet season, front-load your day — mornings are usually dry.",
            accent: theme.ocean
        ),
        WeatherItem(
            category: "Humidity", icon: "humidity.fill",
            bestMonths: "Lowest: Jun–Aug", averageConditions: "High all year (70–85%), highest in the wet season",
            suitability: "Everyone — it affects comfort and gear",
            advantages: ["Dry season feels less sticky", "Coastal breezes ease it", "Highlands are fresher"],
            disadvantages: ["Sweaty, draining heat", "Gear and clothes dry slowly", "Mould/mildew on kit"],
            packing: ["Quick-dry, moisture-wicking fabrics", "Silica gel for cameras", "Electrolytes and extra water"],
            activitySuitability: "Water-based activities feel best; pace land activities",
            crowd: .moderate, priceImpact: .moderate,
            expertAdvice: "Pack moisture-wicking clothes and silica gel — humidity is relentless year-round.",
            accent: theme.sky
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · When to go (tap to expand)").font(TravelTypography.section)
                    ExplorerWeatherSeasonGuide(
                        items: seasons,
                        subtitle: "Best times and seasonal conditions across Bali, Lombok, Komodo, Raja Ampat & Java."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerWeatherSeasonGuide(items: [], title: "Weather & seasons")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Weather · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerWeatherSeasonGuide(
                        items: seasons,
                        layout: .compact,
                        title: "Weather & seasons"
                    )

                    Text("Compact · The seasons").font(TravelTypography.section)
                    ExplorerWeatherSeasonGuide(
                        items: Array(seasons.prefix(3)),
                        layout: .compact,
                        title: "Dry, wet & shoulder"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Weather · Compact")

            ScrollView {
                ExplorerWeatherSeasonGuide(items: Array(seasons.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Weather · Dynamic Type XL")
        }
    }
}
#endif
