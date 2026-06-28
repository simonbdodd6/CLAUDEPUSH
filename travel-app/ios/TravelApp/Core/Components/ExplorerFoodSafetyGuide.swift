import SwiftUI

// MARK: - Explorer food safety guide (Phase 91)
//
// A reusable, presentation-only guide to eating safely while still enjoying
// authentic local food. Each entry carries a safety rating, recommended practices,
// common mistakes, warning signs, an expected price range, the best time to eat,
// hygiene indicators, local etiquette, payment expectations, traveller suitability,
// an expert tip and common myths. Entries are colour-coded by safety rating.
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

/// How safe a food category generally is — drives the colour coding.
enum FoodSafetyRating: CaseIterable {
    case caution
    case moderate
    case safe

    var label: String {
        switch self {
        case .caution: "Eat with care"
        case .moderate: "Generally fine"
        case .safe: "Very safe"
        }
    }

    var icon: String {
        switch self {
        case .caution: "exclamationmark.triangle.fill"
        case .moderate: "hand.raised.fill"
        case .safe: "checkmark.seal.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .caution: return theme.coral
        case .moderate: return theme.sun
        case .safe: return theme.moss
        }
    }
}

/// A single, presentation-only food-safety entry.
struct FoodSafetyItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var rating: FoodSafetyRating
    var recommendedPractices: [String]
    var commonMistakes: [String]
    var warningSigns: [String]
    var priceRange: String
    var bestTimeToEat: String
    var hygieneIndicators: [String]
    var localEtiquette: String
    var paymentExpectations: String
    var suitability: String
    var expertTip: String
    var commonMyths: [String]
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        rating: FoodSafetyRating,
        recommendedPractices: [String],
        commonMistakes: [String],
        warningSigns: [String],
        priceRange: String,
        bestTimeToEat: String,
        hygieneIndicators: [String],
        localEtiquette: String,
        paymentExpectations: String,
        suitability: String,
        expertTip: String,
        commonMyths: [String],
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.rating = rating
        self.recommendedPractices = recommendedPractices
        self.commonMistakes = commonMistakes
        self.warningSigns = warningSigns
        self.priceRange = priceRange
        self.bestTimeToEat = bestTimeToEat
        self.hygieneIndicators = hygieneIndicators
        self.localEtiquette = localEtiquette
        self.paymentExpectations = paymentExpectations
        self.suitability = suitability
        self.expertTip = expertTip
        self.commonMyths = commonMyths
        self.accent = accent
    }

    var accessibilityText: String {
        [
            category,
            rating.label,
            "price \(priceRange)",
            "best time \(bestTimeToEat)",
            "recommended: \(recommendedPractices.joined(separator: "; "))",
            "hygiene signs: \(hygieneIndicators.joined(separator: "; "))",
            "warning signs: \(warningSigns.joined(separator: "; "))",
            "common mistakes: \(commonMistakes.joined(separator: "; "))",
            "etiquette: \(localEtiquette)",
            "payment: \(paymentExpectations)",
            "best for \(suitability)",
            "tip: \(expertTip)",
            "myths: \(commonMyths.joined(separator: "; "))"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerFoodSafetyGuide`.
enum FoodSafetyLayout {
    case compact
    case expanded
}

/// A premium, presentation-only food-safety guide.
struct ExplorerFoodSafetyGuide: View {
    var items: [FoodSafetyItem]
    var layout: FoodSafetyLayout = .expanded
    var title: String? = "Food & water safety"
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
                    FoodSafetyCard(item: item, startsExpanded: index == 0)
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
                            subtitle: item.rating.label,
                            trailing: item.priceRange
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
                Image(systemName: "fork.knife")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No food-safety notes listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Food safety card

/// A premium expandable GlassCard for one food category: a summary (category,
/// price, safety rating) that expands to reveal the full detail set. The whole
/// card is a single VoiceOver element, and all motion is disabled under Reduce
/// Motion.
private struct FoodSafetyCard: View {
    let item: FoodSafetyItem
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
                Text(item.priceRange)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                ratingBadge
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            labeledList("Recommended practices", item.recommendedPractices, icon: "checkmark.circle.fill", tint: TravelTheme.current.moss)

            labeledList("Good hygiene signs", item.hygieneIndicators, icon: "sparkles", tint: item.accent)

            labeledList("Warning signs", item.warningSigns, icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.coral)

            labeledList("Common mistakes", item.commonMistakes, icon: "xmark.circle.fill", tint: TravelTheme.current.coral)

            detailRow(icon: "clock", label: "Best time to eat", value: item.bestTimeToEat)
            detailRow(icon: "hands.sparkles.fill", label: "Local etiquette", value: item.localEtiquette)
            detailRow(icon: "creditcard.fill", label: "Payment", value: item.paymentExpectations)
            detailRow(icon: "person.fill.checkmark", label: "Best for", value: item.suitability)

            labeledList("Common myths", item.commonMyths, icon: "questionmark.circle.fill", tint: TravelTheme.current.sky)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Expert tip", text: item.expertTip)
        }
    }

    // MARK: Pieces

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

    private var ratingBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: item.rating.icon)
            Text(item.rating.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(item.rating.accent, in: Capsule())
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
struct ExplorerFoodSafetyGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Eating well and safely across Bali, Lombok and the islands.
    private static let foods: [FoodSafetyItem] = [
        FoodSafetyItem(
            category: "Street food", icon: "takeoutbag.and.cup.and.straw.fill", rating: .moderate,
            recommendedPractices: ["Eat where there’s a long local queue", "Choose freshly cooked, piping-hot dishes", "Watch it cooked in front of you"],
            commonMistakes: ["Eating from empty, slow stalls", "Choosing pre-cooked food left sitting out"],
            warningSigns: ["Lukewarm food", "Flies and no covers", "Reused, greasy oil"],
            priceRange: "Rp 15–35k", bestTimeToEat: "When it’s busiest — high turnover means fresh",
            hygieneIndicators: ["Clean prep surface", "Cook handles cash and food separately", "Covered ingredients"],
            localEtiquette: "Point to order; eat with a spoon and fork (fork pushes, spoon goes to mouth).",
            paymentExpectations: "Cash only; small notes appreciated. Some use QRIS.",
            suitability: "Adventurous eaters; ease in gradually on a first trip.",
            expertTip: "Nasi Goreng, Mie Goreng and Satay cooked fresh on a busy cart are a safe, delicious start.",
            commonMyths: ["‘All street food is risky’ — busy, hot-cooked stalls are often the freshest"],
            accent: theme.sun
        ),
        FoodSafetyItem(
            category: "Restaurants", icon: "fork.knife", rating: .safe,
            recommendedPractices: ["Pick busy places with turnover", "Check it’s clean and well-run", "Tap water still isn’t safe — order bottled"],
            commonMistakes: ["Assuming pricier always means safer", "Drinking tap water or unfiltered refills"],
            warningSigns: ["Empty at peak times", "Strong off smells", "Dirty tableware"],
            priceRange: "Rp 60–200k", bestTimeToEat: "Anytime",
            hygieneIndicators: ["Clean restrooms", "Sealed bottled water", "Tidy kitchen pass"],
            localEtiquette: "A service charge and tax (often 15–21%) may be added — check the menu.",
            paymentExpectations: "Cards widely accepted; cash always works.",
            suitability: "Everyone, including nervous first-timers.",
            expertTip: "Warungs (family eateries) give the most authentic food at a fraction of resort prices.",
            commonMyths: ["‘Western food is safer’ — local dishes cooked fresh are often the better bet"],
            accent: theme.coral
        ),
        FoodSafetyItem(
            category: "Seafood", icon: "fish.fill", rating: .moderate,
            recommendedPractices: ["Eat where seafood sells fast", "Choose it cooked thoroughly", "Jimbaran grills are a classic, fresh option"],
            commonMistakes: ["Eating undercooked or raw shellfish", "Buying from quiet stalls in the heat"],
            warningSigns: ["Fishy ammonia smell", "Dull eyes, dry shells", "Seafood sitting unrefrigerated"],
            priceRange: "Rp 80–300k", bestTimeToEat: "Lunch or early dinner, freshly landed",
            hygieneIndicators: ["On ice and busy", "Cooked to order", "Clean grilling area"],
            localEtiquette: "Often priced per 100g at the counter — confirm the weight and price first.",
            paymentExpectations: "Cash at beach grills; cards at restaurants.",
            suitability: "Seafood lovers; the cautious should stick to well-cooked fish.",
            expertTip: "Pick the fish yourself, watch it weighed, and have it grilled straight away.",
            commonMyths: ["‘Fresh means safe to eat raw’ — tropical raw shellfish is the higher risk"],
            accent: theme.ocean
        ),
        FoodSafetyItem(
            category: "Drinking water", icon: "drop.fill", rating: .caution,
            recommendedPractices: ["Drink sealed bottled or properly filtered water", "Use refill stations (Refill Bali) to cut plastic", "Brush teeth with bottled water if sensitive"],
            commonMistakes: ["Drinking tap water", "Trusting an unsealed ‘refilled’ bottle"],
            warningSigns: ["Broken bottle seal", "Cloudy water", "No known filter source"],
            priceRange: "Rp 5k per bottle", bestTimeToEat: "Always — stay ahead of the heat",
            hygieneIndicators: ["Intact factory seal", "Reputable brand (Aqua, Le Minerale)", "Known filtered refill"],
            localEtiquette: "Carrying a refillable bottle is welcomed and increasingly expected.",
            paymentExpectations: "Cash or QRIS at minimarkets.",
            suitability: "Everyone — this is the single biggest thing to get right.",
            expertTip: "Tap water is not potable anywhere in Indonesia — stick to sealed or filtered.",
            commonMyths: ["‘A little tap water is fine’ — it’s the most common cause of traveller illness"],
            accent: theme.sky
        ),
        FoodSafetyItem(
            category: "Ice safety", icon: "snowflake", rating: .moderate,
            recommendedPractices: ["Prefer tube ice (cylindrical, with a hole) — factory-made", "Have ice at established cafés and bars", "If unsure, order drinks without ice"],
            commonMistakes: ["Assuming all ice is risky", "Taking crushed ice from unknown roadside stalls"],
            warningSigns: ["Cloudy, irregular blocks", "Ice stored on the floor", "Hand-chipped from a big block"],
            priceRange: "Usually included", bestTimeToEat: "At reputable venues",
            hygieneIndicators: ["Uniform tube ice", "Clean ice scoop", "Sealed ice bags delivered"],
            localEtiquette: "It’s normal to ask ‘es batu kristal?’ (factory ice) at smaller places.",
            paymentExpectations: "Part of the drink price.",
            suitability: "Most travellers; the very cautious can skip ice early in a trip.",
            expertTip: "Tube ice with a hole through the middle is mass-produced from filtered water — it’s safe.",
            commonMyths: ["‘All ice will make you sick’ — commercial tube ice is generally fine"],
            accent: theme.sky
        ),
        FoodSafetyItem(
            category: "Fruit", icon: "leaf.fill", rating: .safe,
            recommendedPractices: ["Favour fruit you peel yourself", "Wash hands before peeling", "Buy whole, not pre-cut, where possible"],
            commonMistakes: ["Eating pre-cut fruit washed in tap water", "Skipping a hand wash before peeling"],
            warningSigns: ["Pre-cut fruit sitting warm", "Bruised, fermenting flesh", "Flies on cut surfaces"],
            priceRange: "Rp 10–40k", bestTimeToEat: "Markets in the morning, at their freshest",
            hygieneIndicators: ["Whole, unblemished fruit", "Kept shaded and cool", "Clean cutting board"],
            localEtiquette: "Salak (snake fruit), mangosteen and rambutan are great peel-yourself choices.",
            paymentExpectations: "Cash at markets; light haggling is normal.",
            suitability: "Everyone — peelable tropical fruit is a safe daily treat.",
            expertTip: "Mangosteen, salak and rambutan are safe, seasonal and delicious — peel and enjoy.",
            commonMyths: ["‘All fruit is risky’ — fruit you peel yourself is one of the safest foods"],
            accent: theme.moss
        ),
        FoodSafetyItem(
            category: "Buffets", icon: "tray.full.fill", rating: .caution,
            recommendedPractices: ["Eat early, when food is freshly stocked", "Choose hot food that’s steaming", "Avoid items sitting at room temperature"],
            commonMistakes: ["Eating late from a depleted, lukewarm buffet", "Loading up on cold, sauce-heavy dishes"],
            warningSigns: ["Tepid hot trays", "Crusted, dried-out food", "No sneeze guards"],
            priceRange: "Included or Rp 100k+", bestTimeToEat: "Right when it opens",
            hygieneIndicators: ["Hot trays genuinely hot", "Frequent restocking", "Covered dishes and clean tongs"],
            localEtiquette: "Take a clean plate for each trip at hotel buffets.",
            paymentExpectations: "Usually included with the room or a fixed price.",
            suitability: "Fine for most if you eat early and choose hot dishes.",
            expertTip: "Buffets are about temperature and turnover — be first, pick steaming-hot food.",
            commonMyths: ["‘Hotel buffets are always safe’ — food left out too long is a classic culprit"],
            accent: theme.sun
        ),
        FoodSafetyItem(
            category: "Food allergies", icon: "allergens", rating: .moderate,
            recommendedPractices: ["Carry an Indonesian allergy card", "Flag nuts (often in satay sauce) and shrimp paste", "Confirm with staff before ordering"],
            commonMistakes: ["Assuming dishes are nut-free", "Not mentioning hidden shrimp paste (terasi)"],
            warningSigns: ["Vague answers about ingredients", "Shared fryers and woks", "No English menu detail"],
            priceRange: "n/a", bestTimeToEat: "n/a",
            hygieneIndicators: ["Staff who check the kitchen", "Clear ingredient knowledge", "Separate prep on request"],
            localEtiquette: "Say ‘saya alergi …’ (I’m allergic to …); peanuts feature heavily in Gado-Gado and satay.",
            paymentExpectations: "As per the venue.",
            suitability: "Allergy sufferers — preparation and a translation card are essential.",
            expertTip: "Peanuts are everywhere (satay sauce, Gado-Gado) — carry a written Indonesian allergy card.",
            commonMyths: ["‘They’ll understand “no nuts” in English’ — always show it written in Indonesian"],
            accent: theme.coral
        ),
        FoodSafetyItem(
            category: "Vegetarian / Vegan", icon: "carrot.fill", rating: .safe,
            recommendedPractices: ["Lean on tempeh, tahu (tofu) and Gado-Gado", "Ask about terasi (shrimp paste) and fish sauce", "Specify ‘tanpa daging’ (no meat)"],
            commonMistakes: ["Assuming sambal and sauces are veg", "Missing hidden shrimp paste or chicken stock"],
            warningSigns: ["Shared stock pots", "Uncertainty about sambal contents"],
            priceRange: "Rp 20–60k", bestTimeToEat: "Anytime",
            hygieneIndicators: ["Clearly labelled veg menu", "Staff who know the ingredients"],
            localEtiquette: "‘Saya vegetarian, tanpa daging dan ikan’ — vegetarian, no meat or fish.",
            paymentExpectations: "Cash at warungs; cards at cafés.",
            suitability: "Easy for vegetarians; vegans should watch egg, shrimp paste and honey.",
            expertTip: "Gado-Gado, tempeh and tofu make Indonesia very vegetarian-friendly — just check the sambal.",
            commonMyths: ["‘There are no veg options’ — Indonesia has a rich plant-based tradition"],
            accent: theme.moss
        ),
        FoodSafetyItem(
            category: "Food poisoning", icon: "cross.case.fill", rating: .caution,
            recommendedPractices: ["Rest and rehydrate with oralit (ORS)", "Stick to plain rice, bananas, crackers", "See a doctor if symptoms are severe or persistent"],
            commonMistakes: ["Ignoring dehydration", "Taking strong anti-diarrhoeals too early"],
            warningSigns: ["High fever", "Blood in stool", "Signs of dehydration"],
            priceRange: "ORS Rp 5–15k", bestTimeToEat: "Ease back slowly once recovering",
            hygieneIndicators: ["Sealed ORS sachets", "Clean clinic or pharmacy"],
            localEtiquette: "Pharmacies (apotek) sell oralit and basic remedies over the counter.",
            paymentExpectations: "Cash at pharmacies; card at clinics.",
            suitability: "Be prepared — even careful travellers get ‘Bali belly’.",
            expertTip: "Pack oralit/ORS; rehydration matters more than any pill — escalate to a doctor if it worsens.",
            commonMyths: ["‘Spicy food caused it’ — it’s usually water, ice or under-cooked food, not chilli"],
            accent: theme.coral
        ),
        FoodSafetyItem(
            category: "Local dishes", icon: "fork.knife.circle.fill", rating: .safe,
            recommendedPractices: ["Try freshly cooked classics", "Eat Babi Guling and Soto Ayam where it’s made fresh daily", "Go where locals eat"],
            commonMistakes: ["Eating reheated meat dishes left out", "Skipping the best warungs for tourist cafés"],
            warningSigns: ["Lukewarm meat", "Slow turnover", "Reused garnishes"],
            priceRange: "Rp 20–60k", bestTimeToEat: "Babi Guling is best at lunch when freshly roasted",
            hygieneIndicators: ["Fresh daily batches", "Hot, made-to-order serving", "Busy with locals"],
            localEtiquette: "Many dishes come with sambal — it can be very spicy; ask ‘tidak pedas’ for mild.",
            paymentExpectations: "Cash at warungs; QRIS increasingly common.",
            suitability: "Everyone — this is the heart of Indonesian food.",
            expertTip: "Soto Ayam, Babi Guling, Nasi Goreng and Satay from a busy warung are the must-tries.",
            commonMyths: ["‘Local meat dishes are unsafe’ — freshly cooked, high-turnover ones are excellent"],
            accent: theme.tint
        ),
        FoodSafetyItem(
            category: "Markets", icon: "basket.fill", rating: .moderate,
            recommendedPractices: ["Go early for the freshest produce", "Buy cooked food that’s hot and fresh", "Wash or peel produce with safe water"],
            commonMistakes: ["Eating pre-cut produce washed in tap water", "Shopping late when food has sat in the heat"],
            warningSigns: ["Flies and strong smells", "Warm, wilting produce", "Standing water and poor drainage"],
            priceRange: "Rp 10–50k", bestTimeToEat: "Early morning, when everything is freshest",
            hygieneIndicators: ["Brisk turnover", "Shaded, cool stalls", "Clean, busy cooked-food vendors"],
            localEtiquette: "Polite haggling is expected; a smile goes a long way at the pasar.",
            paymentExpectations: "Cash, small notes; QRIS at some stalls.",
            suitability: "Great for the curious; eat cooked-to-order and peel your own produce.",
            expertTip: "Traditional markets (pasar) are a highlight — eat the hot, freshly-cooked stalls.",
            commonMyths: ["‘Markets are dirty and unsafe’ — the busy cooked-food stalls are often the freshest"],
            accent: theme.sun
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Eat well, eat safely (tap to expand)").font(TravelTypography.section)
                    ExplorerFoodSafetyGuide(
                        items: foods,
                        subtitle: "Authentic Indonesian food, enjoyed safely — Bali, Lombok & beyond."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerFoodSafetyGuide(items: [], title: "Food & water safety")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Food safety · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerFoodSafetyGuide(
                        items: foods,
                        layout: .compact,
                        title: "Food & water safety"
                    )

                    Text("Compact · The essentials").font(TravelTypography.section)
                    ExplorerFoodSafetyGuide(
                        items: Array(foods.prefix(5)),
                        layout: .compact,
                        title: "Eat-safe essentials"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Food safety · Compact")

            ScrollView {
                ExplorerFoodSafetyGuide(items: Array(foods.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Food safety · Dynamic Type XL")
        }
    }
}
#endif
