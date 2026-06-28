import SwiftUI

// MARK: - Explorer budget planner guide (Phase 94)
//
// A reusable, presentation-only budget planner that helps travellers estimate and
// manage a daily travel budget. Each category shows a typical daily cost across
// three budget levels (backpacker → mid-range → premium), money-saving tips,
// common hidden costs, payment methods, seasonal price variation, local cash
// requirements, traveller suitability and an expert budgeting tip.
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

/// A traveller's budget level — drives the per-tier colour coding.
enum BudgetLevel: CaseIterable {
    case backpacker
    case midRange
    case premium

    var label: String {
        switch self {
        case .backpacker: "Backpacker"
        case .midRange: "Mid-range"
        case .premium: "Premium"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .backpacker: return theme.moss
        case .midRange: return theme.sun
        case .premium: return theme.coral
        }
    }
}

/// A single, presentation-only budget category.
struct BudgetItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var backpackerCost: String
    var midRangeCost: String
    var premiumCost: String
    var moneySavingTips: [String]
    var hiddenCosts: [String]
    var paymentMethods: [String]
    var seasonalVariation: String
    var cashRequirement: String
    var suitability: String
    var expertTip: String
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        backpackerCost: String,
        midRangeCost: String,
        premiumCost: String,
        moneySavingTips: [String],
        hiddenCosts: [String],
        paymentMethods: [String],
        seasonalVariation: String,
        cashRequirement: String,
        suitability: String,
        expertTip: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.backpackerCost = backpackerCost
        self.midRangeCost = midRangeCost
        self.premiumCost = premiumCost
        self.moneySavingTips = moneySavingTips
        self.hiddenCosts = hiddenCosts
        self.paymentMethods = paymentMethods
        self.seasonalVariation = seasonalVariation
        self.cashRequirement = cashRequirement
        self.suitability = suitability
        self.expertTip = expertTip
        self.accent = accent
    }

    func cost(for level: BudgetLevel) -> String {
        switch level {
        case .backpacker: backpackerCost
        case .midRange: midRangeCost
        case .premium: premiumCost
        }
    }

    var costRange: String { "\(backpackerCost) – \(premiumCost)" }

    var accessibilityText: String {
        [
            category,
            "backpacker \(backpackerCost)",
            "mid-range \(midRangeCost)",
            "premium \(premiumCost)",
            "money-saving tips: \(moneySavingTips.joined(separator: "; "))",
            "hidden costs: \(hiddenCosts.joined(separator: "; "))",
            "payment \(paymentMethods.joined(separator: ", "))",
            "seasonal: \(seasonalVariation)",
            "cash: \(cashRequirement)",
            "best for \(suitability)",
            "tip: \(expertTip)"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerBudgetPlannerGuide`.
enum BudgetGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only daily budget planner.
struct ExplorerBudgetPlannerGuide: View {
    var items: [BudgetItem]
    var layout: BudgetGuideLayout = .expanded
    var title: String? = "Daily budget"
    var subtitle: String? = nil
    /// Optional budget level to emphasise in each category's tier breakdown.
    var highlightLevel: BudgetLevel? = nil

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
                    BudgetCard(item: item, highlightLevel: highlightLevel, startsExpanded: index == 0)
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
                            subtitle: item.costRange,
                            trailing: item.midRangeCost
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
                Image(systemName: "wallet.pass")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No budget categories listed for this trip yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Budget card

/// A premium expandable GlassCard for one budget category: a summary (category and
/// cost range) that expands to a three-tier daily-cost breakdown plus the full
/// detail set. The whole card is a single VoiceOver element, and all motion is
/// disabled under Reduce Motion.
private struct BudgetCard: View {
    let item: BudgetItem
    var highlightLevel: BudgetLevel? = nil
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
                Text("\(item.costRange) / day")
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
            tierBreakdown

            labeledList("Money-saving tips", item.moneySavingTips, icon: "checkmark.circle.fill", tint: TravelTheme.current.moss)

            labeledList("Hidden costs", item.hiddenCosts, icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.coral)

            labeledChips("Payment", item.paymentMethods)

            detailRow(icon: "calendar", label: "Seasonal variation", value: item.seasonalVariation)
            detailRow(icon: "banknote.fill", label: "Cash needed", value: item.cashRequirement)
            detailRow(icon: "person.fill.checkmark", label: "Best for", value: item.suitability)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Budgeting tip", text: item.expertTip)
        }
    }

    // MARK: Pieces

    private var tierBreakdown: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text("Typical daily cost")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            VStack(spacing: TravelSpacing.xs) {
                ForEach(BudgetLevel.allCases, id: \.self) { level in
                    tierRow(level)
                }
            }
        }
    }

    private func tierRow(_ level: BudgetLevel) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            levelBadge(level)
            Spacer(minLength: TravelSpacing.sm)
            Text(item.cost(for: level))
                .font(TravelTypography.caption)
                .multilineTextAlignment(.trailing)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xs)
        .background(
            (level == highlightLevel ? level.accent.opacity(0.14) : Color.clear),
            in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
        )
    }

    private func levelBadge(_ level: BudgetLevel) -> some View {
        Text(level.label)
            .textCase(.uppercase)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(level.accent)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(level.accent.opacity(0.15), in: Capsule())
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

    private func labeledChips(_ label: String, _ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(items, id: \.self) { item in
                        Text(item)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.thinMaterial, in: Capsule())
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
struct ExplorerBudgetPlannerGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Realistic daily budgets across Bali, Lombok, the Gilis, Komodo & Raja Ampat.
    private static let budget: [BudgetItem] = [
        BudgetItem(
            category: "Accommodation", icon: "bed.double.fill",
            backpackerCost: "Rp 150–300k (hostel/homestay)", midRangeCost: "Rp 500k–1m (guesthouse, 3–4★)", premiumCost: "Rp 2m+ (villa/resort)",
            moneySavingTips: ["Homestays beat hotels and support locals", "Book weekly for a discount", "Stay slightly off the beach strip"],
            hiddenCosts: ["10–21% tax + service at hotels", "Airport/late-night transfers"],
            paymentMethods: ["Card", "Cash", "Bank transfer"],
            seasonalVariation: "Peak (Jul–Aug, Dec) prices jump 30–60%; Raja Ampat is pricey year-round.",
            cashRequirement: "Homestays often cash-only; hotels take cards.",
            suitability: "All travellers — the biggest lever on your daily spend.",
            expertTip: "Message the property directly to match online prices minus commission.",
            accent: theme.ocean
        ),
        BudgetItem(
            category: "Food", icon: "fork.knife",
            backpackerCost: "Rp 60–100k (warungs)", midRangeCost: "Rp 150–300k", premiumCost: "Rp 400k+ (fine dining)",
            moneySavingTips: ["Eat where locals queue", "Nasi/mie campur is filling and cheap", "Self-cater breakfast"],
            hiddenCosts: ["Tax + service on tourist-strip menus", "Bottled water adds up"],
            paymentMethods: ["Cash", "QRIS", "Card (restaurants)"],
            seasonalVariation: "Fairly stable; tourist-area menus cost more year-round.",
            cashRequirement: "Cash for warungs and markets.",
            suitability: "Everyone — warungs make eating well very cheap.",
            expertTip: "Alternate one nice meal with warung meals to eat brilliantly for less.",
            accent: theme.sun
        ),
        BudgetItem(
            category: "Coffee & drinks", icon: "cup.and.saucer.fill",
            backpackerCost: "Rp 30–60k", midRangeCost: "Rp 80–150k", premiumCost: "Rp 200k+ (beach clubs)",
            moneySavingTips: ["Warung kopi over beach-club lattes", "Minimarket Bintang is a third of bar prices", "Refill water, don’t buy bottles"],
            hiddenCosts: ["Beach-club minimum spends", "Cocktails 3–4× minimart prices"],
            paymentMethods: ["Cash", "QRIS", "Card"],
            seasonalVariation: "Beach-club prices rise in peak season.",
            cashRequirement: "Small cash for warungs and minimarkets.",
            suitability: "Social travellers — easy place to overspend.",
            expertTip: "A sunset beach club once, warung coffee the rest — big savings, same vibe.",
            accent: theme.coral
        ),
        BudgetItem(
            category: "Local transport", icon: "car.fill",
            backpackerCost: "Rp 30–60k (Gojek/bemo)", midRangeCost: "Rp 100–200k", premiumCost: "Rp 600–900k (private driver/day)",
            moneySavingTips: ["Gojek/Grab over street taxis", "GoRide bikes beat traffic and cost", "Share a driver for day trips"],
            hiddenCosts: ["Parking and ‘tip’ fees", "App surge at peak times"],
            paymentMethods: ["GoPay", "OVO", "Cash", "Card"],
            seasonalVariation: "Driver day-rates rise in peak season.",
            cashRequirement: "Some drivers prefer cash.",
            suitability: "Everyone; a driver-for-the-day suits groups.",
            expertTip: "A private driver split between 3–4 people often beats separate taxis.",
            accent: theme.tint
        ),
        BudgetItem(
            category: "Scooter rental", icon: "scooter",
            backpackerCost: "Rp 60–75k/day", midRangeCost: "Rp 75–90k/day", premiumCost: "Rp 150k+/day (bigger bike)",
            moneySavingTips: ["Weekly rentals drop to ~Rp 50k/day", "Refuel at pumps, not roadside bottles", "Rent from reviewed shops"],
            hiddenCosts: ["Fuel", "‘Damage’ claims on return", "Helmet/petrol top-ups"],
            paymentMethods: ["Cash", "Bank transfer"],
            seasonalVariation: "Slightly higher in peak season.",
            cashRequirement: "Cash and a cash deposit (never your passport).",
            suitability: "Confident riders; not for everyone on Bali’s traffic.",
            expertTip: "Photograph the bike first and pay daily to avoid inflated damage claims.",
            accent: theme.moss
        ),
        BudgetItem(
            category: "Ferries", icon: "ferry.fill",
            backpackerCost: "Rp 20–50k (public)", midRangeCost: "Rp 250–450k (fast boat)", premiumCost: "Rp 600k+ (Raja Ampat/charters)",
            moneySavingTips: ["Public slow ferry where time allows", "Book direct, not via beach touts", "Return tickets can be cheaper"],
            hiddenCosts: ["Harbour porter ‘fees’", "Onward transfers from the port"],
            paymentMethods: ["Cash", "Card", "GoPay"],
            seasonalVariation: "Wet-season cancellations push people onto pricier boats.",
            cashRequirement: "Cash for public ferries and porters.",
            suitability: "Island-hoppers; budget travellers can use public boats.",
            expertTip: "Per-crossing, not daily — budget each island hop separately.",
            accent: theme.ocean
        ),
        BudgetItem(
            category: "Activities", icon: "ticket.fill",
            backpackerCost: "Rp 100–250k", midRangeCost: "Rp 300–600k", premiumCost: "Rp 1m+ (private tours)",
            moneySavingTips: ["Group tours over private", "Book via Klook/hotel desk, not touts", "Bundle nearby sights in one day"],
            hiddenCosts: ["Park and temple entry fees", "Guide tips", "Sarong rental"],
            paymentMethods: ["Card", "Cash", "GoPay"],
            seasonalVariation: "Popular tours sell out and cost more in peak season.",
            cashRequirement: "Cash for entry fees and tips.",
            suitability: "Everyone — pick a few highlights rather than everything.",
            expertTip: "Sunrise Batur and waterfalls can be combined in one driver day to save.",
            accent: theme.sun
        ),
        BudgetItem(
            category: "Diving", icon: "water.waves",
            backpackerCost: "Rp 600k–1m (Gili fun dives)", midRangeCost: "Rp 1.5–2m/day", premiumCost: "Rp 8m+/day (Raja Ampat liveaboard)",
            moneySavingTips: ["Multi-dive packages cut the per-dive cost", "Gili/Amed are cheaper than Komodo/Raja Ampat", "Bring your own mask + computer"],
            hiddenCosts: ["Gear rental", "Marine-park fees (Komodo, Raja Ampat)", "Nitrox surcharges"],
            paymentMethods: ["Cash", "Card", "Bank transfer"],
            seasonalVariation: "Liveaboards (Komodo, Raja Ampat) are seasonal and book out far ahead.",
            cashRequirement: "Cash for park fees and remote operators.",
            suitability: "Certified divers; Raja Ampat is a premium splurge.",
            expertTip: "The Gilis and Amed offer world-class diving at a fraction of Raja Ampat’s cost.",
            accent: theme.ocean
        ),
        BudgetItem(
            category: "Surfing", icon: "figure.surfing",
            backpackerCost: "Rp 75k (board rental)", midRangeCost: "Rp 300k (group lesson)", premiumCost: "Rp 800k+ (private coaching/boat)",
            moneySavingTips: ["Rent by the week", "Group lessons over private", "Beach breaks (Kuta, Selong Belanak) are free to surf"],
            hiddenCosts: ["Ding repairs", "Boat fees for reef breaks", "Reef booties/rash vests"],
            paymentMethods: ["Cash", "Card"],
            seasonalVariation: "Dry season (Apr–Oct) is prime on the west coast — busier and pricier.",
            cashRequirement: "Cash at smaller surf shops.",
            suitability: "Surfers of all levels — beach breaks keep it cheap.",
            expertTip: "Rent a board weekly and surf free beach breaks rather than paying per session.",
            accent: theme.sky
        ),
        BudgetItem(
            category: "SIM / data", icon: "simcard.fill",
            backpackerCost: "Rp 100k (≈ Rp 10k/day)", midRangeCost: "Rp 150k", premiumCost: "Rp 300k (eSIM convenience)",
            moneySavingTips: ["Buy in town, not at the airport", "Telkomsel tourist packs give the most GB", "One SIM, share a hotspot"],
            hiddenCosts: ["Airport mark-ups", "Roaming if you forget to switch"],
            paymentMethods: ["Cash", "QRIS", "Card", "App (eSIM)"],
            seasonalVariation: "Stable year-round.",
            cashRequirement: "A little cash, or QRIS at official stores.",
            suitability: "Everyone — a tiny, one-off cost.",
            expertTip: "A single tourist data pack usually covers a whole trip for the price of a coffee a day.",
            accent: theme.tint
        ),
        BudgetItem(
            category: "Shopping", icon: "bag.fill",
            backpackerCost: "Rp 50k", midRangeCost: "Rp 200k", premiumCost: "Rp 1m+ (boutiques)",
            moneySavingTips: ["Haggle politely at markets", "Buy crafts away from tourist hubs", "Set a souvenir budget"],
            hiddenCosts: ["Shipping bulky items home", "Airport-price boutiques"],
            paymentMethods: ["Cash", "QRIS", "Card (boutiques)"],
            seasonalVariation: "Stable; tourist hubs always charge more.",
            cashRequirement: "Cash and small notes for markets.",
            suitability: "Optional — easy to control with a set budget.",
            expertTip: "Decide a souvenir budget up front; markets reward friendly haggling.",
            accent: theme.coral
        ),
        BudgetItem(
            category: "Emergency buffer", icon: "shield.lefthalf.filled",
            backpackerCost: "Rp 200k/day set aside", midRangeCost: "Rp 500k/day", premiumCost: "Rp 1m+/day",
            moneySavingTips: ["Keep a separate stash you don’t touch", "Have a backup card stored apart", "Note your bank’s 24-hr line"],
            hiddenCosts: ["Medical/clinic fees", "Last-minute transport/changes", "ATM and currency fees"],
            paymentMethods: ["Cash + a backup card"],
            seasonalVariation: "Not seasonal — always keep it.",
            cashRequirement: "Always hold emergency cash; island ATMs run dry.",
            suitability: "Every traveller — the most-skipped budget line.",
            expertTip: "Set aside a daily buffer and a hidden emergency note — island ATMs do run out of cash.",
            accent: theme.moss
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Plan your spend (tap to expand)").font(TravelTypography.section)
                    ExplorerBudgetPlannerGuide(
                        items: budget,
                        subtitle: "Daily budgets across Bali, Lombok, the Gilis, Komodo & Raja Ampat.",
                        highlightLevel: .midRange
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerBudgetPlannerGuide(items: [], title: "Daily budget")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Budget · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerBudgetPlannerGuide(
                        items: budget,
                        layout: .compact,
                        title: "Daily budget"
                    )

                    Text("Compact · Big-ticket items").font(TravelTypography.section)
                    ExplorerBudgetPlannerGuide(
                        items: Array(budget.prefix(4)),
                        layout: .compact,
                        title: "Where the money goes"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Budget · Compact")

            ScrollView {
                ExplorerBudgetPlannerGuide(items: Array(budget.prefix(2)), highlightLevel: .backpacker)
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Budget · Dynamic Type XL")
        }
    }
}
#endif
