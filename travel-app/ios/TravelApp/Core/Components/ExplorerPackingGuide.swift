import SwiftUI

// MARK: - Explorer packing guide (Phase 93)
//
// A reusable, presentation-only packing guide that helps travellers pack
// efficiently for different destinations, climates and activities. Each entry
// carries a priority (optional → essential), recommended quantity, weight impact,
// climate and activity suitability, airline considerations, carry-on vs checked
// placement, how hard it is to replace locally, an expert tip and common packing
// mistakes.
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

/// How important an item is to pack — drives the colour coding and covers the
/// optional-vs-essential distinction.
enum PackPriority: CaseIterable {
    case optional
    case recommended
    case essential

    var label: String {
        switch self {
        case .optional: "Optional"
        case .recommended: "Recommended"
        case .essential: "Essential"
        }
    }

    var icon: String {
        switch self {
        case .optional: "circle"
        case .recommended: "checkmark.circle"
        case .essential: "exclamationmark.circle.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .optional: return theme.ocean
        case .recommended: return theme.sun
        case .essential: return theme.coral
        }
    }
}

/// How much an item adds to your bag weight.
enum WeightImpact: CaseIterable {
    case light
    case medium
    case heavy

    var label: String {
        switch self {
        case .light: "Light"
        case .medium: "Medium"
        case .heavy: "Heavy"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .light: return theme.moss
        case .medium: return theme.sun
        case .heavy: return theme.coral
        }
    }
}

/// Where an item should travel.
enum BagPlacement: CaseIterable {
    case carryOn
    case checked
    case either

    var label: String {
        switch self {
        case .carryOn: "Carry-on"
        case .checked: "Checked"
        case .either: "Either"
        }
    }

    var icon: String {
        switch self {
        case .carryOn: "bag.fill"
        case .checked: "suitcase.fill"
        case .either: "arrow.left.arrow.right"
        }
    }
}

/// How hard an item is to replace locally.
enum ReplacementDifficulty: CaseIterable {
    case easy
    case moderate
    case hard

    var label: String {
        switch self {
        case .easy: "Easy to replace"
        case .moderate: "Replace: moderate"
        case .hard: "Hard to replace"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .easy: return theme.moss
        case .moderate: return theme.sun
        case .hard: return theme.coral
        }
    }
}

/// A single, presentation-only packing entry.
struct PackingItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var priority: PackPriority
    var recommendedQuantity: String
    var weight: WeightImpact
    var climateSuitability: String
    var activitySuitability: String
    var airlineConsiderations: String
    var placement: BagPlacement
    var replacement: ReplacementDifficulty
    var expertTip: String
    var commonMistakes: [String]
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        priority: PackPriority,
        recommendedQuantity: String,
        weight: WeightImpact,
        climateSuitability: String,
        activitySuitability: String,
        airlineConsiderations: String,
        placement: BagPlacement,
        replacement: ReplacementDifficulty,
        expertTip: String,
        commonMistakes: [String],
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.priority = priority
        self.recommendedQuantity = recommendedQuantity
        self.weight = weight
        self.climateSuitability = climateSuitability
        self.activitySuitability = activitySuitability
        self.airlineConsiderations = airlineConsiderations
        self.placement = placement
        self.replacement = replacement
        self.expertTip = expertTip
        self.commonMistakes = commonMistakes
        self.accent = accent
    }

    var accessibilityText: String {
        [
            category,
            priority.label,
            "recommended quantity \(recommendedQuantity)",
            "weight \(weight.label)",
            "climate: \(climateSuitability)",
            "activity: \(activitySuitability)",
            "airline: \(airlineConsiderations)",
            placement.label,
            replacement.label,
            "common mistakes: \(commonMistakes.joined(separator: "; "))",
            "tip: \(expertTip)"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerPackingGuide`.
enum PackingGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only packing guide.
struct ExplorerPackingGuide: View {
    var items: [PackingItem]
    var layout: PackingGuideLayout = .expanded
    var title: String? = "Packing guide"
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
                    PackingCard(item: item, startsExpanded: index == 0)
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
                            subtitle: item.recommendedQuantity,
                            trailing: item.priority.label
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
        items.count == 1 ? "1 category" : "\(items.count) categories"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "suitcase")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No packing categories listed for this trip yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Packing card

/// A premium expandable GlassCard for one packing category: a summary (category,
/// recommended quantity, priority) that expands to reveal the full detail set. The
/// whole card is a single VoiceOver element, and all motion is disabled under
/// Reduce Motion.
private struct PackingCard: View {
    let item: PackingItem
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
                Text(item.recommendedQuantity)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                priorityBadge
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            badgeRow

            detailRow(icon: "thermometer.sun.fill", label: "Climate", value: item.climateSuitability)
            detailRow(icon: "figure.run", label: "Activity", value: item.activitySuitability)
            detailRow(icon: "airplane", label: "Airline considerations", value: item.airlineConsiderations)

            labeledList("Common mistakes", item.commonMistakes, icon: "xmark.circle.fill", tint: TravelTheme.current.coral)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Expert tip", text: item.expertTip)
        }
    }

    // MARK: Pieces

    private var badgeRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                pillBadge(icon: "scalemass.fill", text: "Weight: \(item.weight.label)", tint: item.weight.accent)
                pillBadge(icon: item.placement.icon, text: item.placement.label, tint: item.accent)
                pillBadge(icon: "arrow.triangle.2.circlepath", text: item.replacement.label, tint: item.replacement.accent)
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

    private var priorityBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: item.priority.icon)
            Text(item.priority.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(item.priority.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
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
struct ExplorerPackingGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Packing for a tropical Indonesian trip (Bali, Lombok, the islands).
    private static let categories: [PackingItem] = [
        PackingItem(
            category: "Essential documents", icon: "doc.text.fill", priority: .essential,
            recommendedQuantity: "Passport + 2 copies, insurance, cards",
            weight: .light, climateSuitability: "Any",
            activitySuitability: "All travel",
            airlineConsiderations: "Originals in carry-on, never in checked luggage.",
            placement: .carryOn, replacement: .hard,
            expertTip: "Keep a cloud copy and a printed copy separate from the originals.",
            commonMistakes: ["Packing the passport in checked luggage", "No backup copies"],
            accent: theme.ocean
        ),
        PackingItem(
            category: "Clothing", icon: "tshirt.fill", priority: .essential,
            recommendedQuantity: "5–7 light outfits + a sarong",
            weight: .medium, climateSuitability: "Hot and humid — quick-dry, breathable",
            activitySuitability: "Daily wear; a modest layer for temples",
            airlineConsiderations: "Pack light — laundry is ~Rp 15k/kg everywhere.",
            placement: .either, replacement: .easy,
            expertTip: "Quick-dry, breathable fabrics beat cotton in the tropics; a sarong is endlessly useful.",
            commonMistakes: ["Overpacking — laundry is cheap", "Heavy cotton that won’t dry", "No temple-appropriate cover-up"],
            accent: theme.sun
        ),
        PackingItem(
            category: "Electronics", icon: "powerplug.fill", priority: .recommended,
            recommendedQuantity: "Phone, charger, power bank, universal adapter",
            weight: .light, climateSuitability: "Any",
            activitySuitability: "All",
            airlineConsiderations: "Power banks in carry-on only (lithium rules).",
            placement: .carryOn, replacement: .moderate,
            expertTip: "A universal travel adapter plus a multi-port USB charger covers everything.",
            commonMistakes: ["Power bank in a checked bag (banned)", "Forgetting the adapter"],
            accent: theme.tint
        ),
        PackingItem(
            category: "Toiletries", icon: "shower.fill", priority: .recommended,
            recommendedQuantity: "Travel sizes + reef-safe sunscreen",
            weight: .light, climateSuitability: "Hot — sweat and strong sun",
            activitySuitability: "All",
            airlineConsiderations: "Liquids ≤100ml in carry-on.",
            placement: .either, replacement: .easy,
            expertTip: "Bring reef-safe sunscreen — it’s pricey and hard to find locally.",
            commonMistakes: ["Oversized liquids in carry-on", "Forgetting reef-safe SPF", "Coral-damaging sunscreen"],
            accent: theme.sky
        ),
        PackingItem(
            category: "Medication", icon: "pills.fill", priority: .essential,
            recommendedQuantity: "Personal meds + a small first-aid kit",
            weight: .light, climateSuitability: "Any",
            activitySuitability: "All",
            airlineConsiderations: "In carry-on, with a doctor’s letter for controlled meds.",
            placement: .carryOn, replacement: .hard,
            expertTip: "Carry meds in original packaging with prescriptions — some are restricted in Indonesia.",
            commonMistakes: ["Loose pills with no labels", "No doctor’s letter for controlled meds", "All meds in checked luggage"],
            accent: theme.coral
        ),
        PackingItem(
            category: "Surf equipment", icon: "figure.surfing", priority: .optional,
            recommendedQuantity: "Boardies, rash vest, reef booties (rent boards)",
            weight: .heavy, climateSuitability: "Tropical sun and reef",
            activitySuitability: "Surfing",
            airlineConsiderations: "Board bags incur oversize fees — renting is often cheaper.",
            placement: .checked, replacement: .easy,
            expertTip: "Rent boards locally; just bring a rash vest, reef booties and reef-safe SPF.",
            commonMistakes: ["Flying a board for a short trip", "No rash vest for reef cuts and sun", "Forgetting reef booties"],
            accent: theme.ocean
        ),
        PackingItem(
            category: "Diving equipment", icon: "water.waves", priority: .optional,
            recommendedQuantity: "Mask + dive computer (rent the rest)",
            weight: .medium, climateSuitability: "Warm water — a 3mm shorty",
            activitySuitability: "Diving",
            airlineConsiderations: "Dive computers and regs in carry-on (fragile).",
            placement: .carryOn, replacement: .moderate,
            expertTip: "Bring your own mask and dive computer; rent tanks, BCD and weights.",
            commonMistakes: ["Checking a fragile dive computer", "Forgetting your dive cert and log", "Over-packing rentable gear"],
            accent: theme.ocean
        ),
        PackingItem(
            category: "Hiking gear", icon: "figure.hiking", priority: .optional,
            recommendedQuantity: "Trail shoes, headtorch, warm layer",
            weight: .medium, climateSuitability: "Cold at altitude (Rinjani summit near 0°C)",
            activitySuitability: "Trekking (Batur, Rinjani)",
            airlineConsiderations: "Trekking poles must be checked, not carried on.",
            placement: .checked, replacement: .moderate,
            expertTip: "Sunrise treks are cold and dark — bring a headtorch and a warm layer.",
            commonMistakes: ["Underestimating the summit cold", "No headtorch for 2am starts", "Brand-new, unbroken-in boots"],
            accent: theme.moss
        ),
        PackingItem(
            category: "Photography / Drone gear", icon: "camera.fill", priority: .optional,
            recommendedQuantity: "Camera, spare batteries/cards, drone",
            weight: .medium, climateSuitability: "Humid — pack silica gel",
            activitySuitability: "Content and memories",
            airlineConsiderations: "Spare batteries in carry-on; check local drone rules.",
            placement: .carryOn, replacement: .hard,
            expertTip: "Check drone rules — permits and no-fly zones apply near temples, airports and some beaches.",
            commonMistakes: ["Lithium batteries in checked bags", "Flying a drone in restricted or temple areas", "No humidity protection for lenses"],
            accent: theme.tint
        ),
        PackingItem(
            category: "Kids & family", icon: "figure.2.and.child.holdinghands", priority: .optional,
            recommendedQuantity: "Child meds, ORS, snacks, sun protection",
            weight: .medium, climateSuitability: "Hot — extra sun care for children",
            activitySuitability: "Family travel",
            airlineConsiderations: "Strollers are usually gate-checked free.",
            placement: .either, replacement: .moderate,
            expertTip: "Pack child-dose meds, ORS and high-SPF — plus a familiar comfort item for the journey.",
            commonMistakes: ["Not enough sun protection for kids", "Forgetting child-dose meds and ORS", "Over-scheduling little ones"],
            accent: theme.sun
        ),
        PackingItem(
            category: "Long-term travel", icon: "suitcase.fill", priority: .optional,
            recommendedQuantity: "Capsule wardrobe, dry bag, laundry kit",
            weight: .medium, climateSuitability: "Layer-ready across regions",
            activitySuitability: "Extended trips",
            airlineConsiderations: "Stay under 7–10kg to keep your options flexible.",
            placement: .either, replacement: .easy,
            expertTip: "Pack a capsule wardrobe and do laundry weekly — you need far less than you think.",
            commonMistakes: ["Packing for ‘what if’", "Too heavy to move easily", "No dry bag for wet-season gear"],
            accent: theme.ocean
        ),
        PackingItem(
            category: "Carry-on essentials", icon: "bag.fill", priority: .essential,
            recommendedQuantity: "Docs, meds, valuables, 1 change of clothes",
            weight: .light, climateSuitability: "Any",
            activitySuitability: "All flights and ferries",
            airlineConsiderations: "Assume checked bags can be delayed or lost.",
            placement: .carryOn, replacement: .hard,
            expertTip: "Pack a day’s clothes, meds, valuables and chargers in your carry-on in case checked bags are delayed.",
            commonMistakes: ["Valuables and meds in checked luggage", "No change of clothes in carry-on", "Liquids over 100ml"],
            accent: theme.coral
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Pack smart (tap to expand)").font(TravelTypography.section)
                    ExplorerPackingGuide(
                        items: categories,
                        subtitle: "Packing light and right for tropical Bali, Lombok & the islands."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerPackingGuide(items: [], title: "Packing guide")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Packing · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerPackingGuide(
                        items: categories,
                        layout: .compact,
                        title: "Packing guide"
                    )

                    Text("Compact · The essentials").font(TravelTypography.section)
                    ExplorerPackingGuide(
                        items: categories.filter { $0.priority == .essential },
                        layout: .compact,
                        title: "Don’t-forget essentials"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Packing · Compact")

            ScrollView {
                ExplorerPackingGuide(items: Array(categories.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Packing · Dynamic Type XL")
        }
    }
}
#endif
