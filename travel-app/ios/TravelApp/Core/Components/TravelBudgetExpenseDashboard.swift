import SwiftUI

// MARK: - Travel budget & expense dashboard (Phase 110)
//
// A premium travel budget and expense dashboard helping travellers estimate, track
// and understand spending before and during a trip — total and daily budgets,
// remaining funds, a currency summary, per-category spending breakdowns, typical
// Indonesia daily budgets, a budget timeline, money-saving tips, ATM/cash and card
// advice, a hidden-fees checklist and a UI-only savings checklist. A caller supplies
// a `BudgetDashboard` value; totals are derived in-view (deterministic presentation
// arithmetic — no business logic, networking or persistence).
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumMetricTile`,
// `PremiumProgressBar`, `PremiumPillRow`, `PremiumTimelineConnector`, `GlassCard`,
// `MapTexturePlaceholder`, `TravelTypography` and the tokens — and the Phase-101
// `DestinationListItem` and `DestinationTimelineDay` models. `BudgetDashboard` /
// `BudgetCategory` are lightweight presentation models (not DTOs); the dashboard
// holds no data, networking, persistence, repository, view-model, navigation,
// AppContainer or DTO logic, and is not wired into any screen. The checklist toggles
// are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// A single budget/spend category (amounts in whole rupiah).
struct BudgetCategory: Identifiable {
    let id: String
    var name: String
    var icon: String
    var budget: Int
    var spent: Int
    var accent: Color

    init(id: String? = nil, name: String, icon: String, budget: Int, spent: Int, accent: Color) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.budget = budget
        self.spent = spent
        self.accent = accent
    }

    var fraction: Double {
        guard budget > 0 else { return 0 }
        return min(max(Double(spent) / Double(budget), 0), 1)
    }
}

/// The full, presentation-only content for a budget & expense dashboard.
struct BudgetDashboard {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var totalBudget: Int
    var nights: Int
    var currencyNote: String
    var exchangeRates: [DestinationListItem]
    var categories: [BudgetCategory]
    var dailyTiers: [DestinationListItem]
    var timeline: [DestinationTimelineDay]
    var moneySavingTips: [String]
    var atmCash: [String]
    var cardPayment: [String]
    var hiddenFees: [String]
    var savingsChecklist: [String]

    var totalSpent: Int { categories.reduce(0) { $0 + $1.spent } }
    var remaining: Int { max(totalBudget - totalSpent, 0) }
    var dailyBudget: Int { nights > 0 ? totalBudget / nights : totalBudget }
    var spentFraction: Double {
        guard totalBudget > 0 else { return 0 }
        return min(max(Double(totalSpent) / Double(totalBudget), 0), 1)
    }
}

/// A premium, presentation-only budget & expense dashboard rendered from a `BudgetDashboard`.
struct TravelBudgetExpenseDashboard: View {
    var plan: BudgetDashboard

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var feesChecked: Set<String> = []
    @State private var savingsChecked: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: plan.heroSymbol,
                title: plan.heroTitle,
                subtitle: plan.heroSubtitle,
                gradient: plan.heroGradient,
                metrics: [
                    HeroMetric(value: rp(plan.totalBudget), label: "Total budget"),
                    HeroMetric(value: rp(plan.dailyBudget), label: "Per day"),
                    HeroMetric(value: rp(plan.remaining), label: "Remaining")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(BudgetAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            budgetOverviewCard
                .modifier(BudgetAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            section("Currency", "Know what your money’s worth.", 2) {
                currencyCard
            }

            section("Spending breakdown", "Budget vs spent, by category.", 3) {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(plan.categories) { category in
                        categoryCard(category)
                    }
                }
            }

            listSection("Typical daily budgets", "What Indonesia costs by style.", plan.dailyTiers, tag: "Per day", 4)

            section("Budget timeline", "When the money goes out.", 5) {
                VStack(spacing: 0) {
                    ForEach(Array(plan.timeline.enumerated()), id: \.element.id) { index, day in
                        timelineRow(day, isLast: index == plan.timeline.count - 1)
                    }
                }
            }

            section("Money-saving tips", "Stretch every rupiah.", 6) {
                bulletCard(plan.moneySavingTips, icon: "lightbulb.fill", tint: theme.sun)
            }

            section("ATM & cash", "Get cash the smart way.", 7) {
                bulletCard(plan.atmCash, icon: "banknote.fill", tint: theme.moss)
            }

            section("Card payments", "Pay by card wisely.", 8) {
                bulletCard(plan.cardPayment, icon: "creditcard.fill", tint: theme.sky)
            }

            section("Hidden fees", "Tick the ones you’ve accounted for.", 9) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(plan.hiddenFees, id: \.self) { fee in
                            checkRow(fee, isOn: feesChecked.contains(fee)) { toggle(&feesChecked, fee) }
                        }
                    }
                }
            }

            section("Savings checklist", "Habits to bank your savings.", 10) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(plan.savingsChecklist, id: \.self) { item in
                            checkRow(item, isOn: savingsChecked.contains(item)) { toggle(&savingsChecked, item) }
                        }
                    }
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

    // MARK: Section helpers

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(BudgetAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    private func listSection(_ title: String, _ subtitle: String, _ items: [DestinationListItem], tag: String, _ index: Int) -> some View {
        section(title, subtitle, index) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(items) { item in
                    PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.title, subtitle: item.detail, trailing: tag)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(item.title). \(item.detail)")
                }
            }
        }
    }

    // MARK: Cards & rows

    private var budgetOverviewCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Text("Total trip budget")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(rp(plan.totalBudget))
                    .font(TravelTypography.display)
                HStack(spacing: TravelSpacing.md) {
                    PremiumMetricTile(value: rp(plan.totalSpent), label: "Spent")
                    PremiumMetricTile(value: rp(plan.remaining), label: "Remaining")
                    PremiumMetricTile(value: rp(plan.dailyBudget), label: "Per day")
                }
                PremiumProgressBar(
                    progress: appeared ? plan.spentFraction : 0,
                    colors: [theme.tint, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("\(Int((plan.spentFraction * 100).rounded()))% of budget used over \(plan.nights) nights")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Total trip budget \(rp(plan.totalBudget)). Spent \(rp(plan.totalSpent)), remaining \(rp(plan.remaining)). \(rp(plan.dailyBudget)) per day.")
    }

    private var currencyCard: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Text(plan.currencyNote)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                PremiumAdaptiveGrid(minimumWidth: 140) {
                    ForEach(plan.exchangeRates) { rate in
                        PremiumMetricTile(value: rate.detail, label: rate.title)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(rate.title), \(rate.detail)")
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func categoryCard(_ category: BudgetCategory) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(spacing: TravelSpacing.md) {
                    medallion(category.icon, category.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(category.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(rp(category.spent)) of \(rp(category.budget))")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                PremiumProgressBar(
                    progress: appeared ? category.fraction : 0,
                    colors: [category.accent, theme.sky],
                    height: TravelSpacing.xs
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("\(Int((category.fraction * 100).rounded()))% of this category used")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(category.name), \(rp(category.spent)) of \(rp(category.budget)) spent.")
    }

    private func timelineRow(_ day: DestinationTimelineDay, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            PremiumTimelineConnector(accent: theme.tint, showsLine: !isLast)
            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(day.day)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(day.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(day.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.bottom, isLast ? 0 : TravelSpacing.md)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(day.day), \(day.title). \(day.detail)")
    }

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

    private func checkRow(_ item: String, isOn: Bool, _ action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { action() }
        } label: {
            HStack(alignment: .top, spacing: TravelSpacing.sm) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isOn ? theme.moss : Color.secondary)
                Text(item)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isOn ? .secondary : .primary)
                    .strikethrough(isOn, color: .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item)
        .accessibilityValue(isOn ? "Done" : "Not done")
        .accessibilityHint("Double tap to toggle")
    }

    private func medallion(_ icon: String, _ accent: Color) -> some View {
        Image(systemName: icon)
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

    // MARK: Helpers

    private func toggle(_ set: inout Set<String>, _ key: String) {
        if set.contains(key) { set.remove(key) } else { set.insert(key) }
    }

    /// Deterministic rupiah formatting (no Locale / no formatter state).
    private func rp(_ value: Int) -> String {
        if value >= 1_000_000 {
            let tenths = value / 100_000
            return "Rp \(tenths / 10).\(tenths % 10)m"
        } else if value >= 1_000 {
            return "Rp \(value / 1_000)k"
        } else {
            return "Rp \(value)"
        }
    }
}

// MARK: - Budget dashboard appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct BudgetAppear: ViewModifier {
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
extension BudgetDashboard {
    /// A deterministic sample budget for a 10-night Indonesia trip.
    static var sampleIndonesia: BudgetDashboard {
        let theme = TravelTheme.current
        return BudgetDashboard(
            heroTitle: "Budget & Expenses",
            heroSubtitle: "Estimate and track your spending for a 10-night trip across Bali, Lombok and the islands.",
            heroSymbol: "creditcard.fill",
            heroGradient: [theme.moss, theme.tint, theme.ocean],
            totalBudget: 27_000_000,
            nights: 10,
            currencyNote: "Indonesian rupiah (IDR). Rates are approximate — check before you exchange.",
            exchangeRates: [
                DestinationListItem(icon: "sterlingsign.circle.fill", title: "£1 GBP", detail: "≈ Rp 20,000", accent: theme.tint),
                DestinationListItem(icon: "dollarsign.circle.fill", title: "$1 USD", detail: "≈ Rp 16,000", accent: theme.moss),
                DestinationListItem(icon: "eurosign.circle.fill", title: "€1 EUR", detail: "≈ Rp 17,500", accent: theme.coral),
                DestinationListItem(icon: "australiandollarsign.circle.fill", title: "A$1 AUD", detail: "≈ Rp 10,500", accent: theme.sky)
            ],
            categories: [
                BudgetCategory(name: "Accommodation", icon: "bed.double.fill", budget: 10_000_000, spent: 7_000_000, accent: theme.ocean),
                BudgetCategory(name: "Food & drinks", icon: "fork.knife", budget: 4_000_000, spent: 2_500_000, accent: theme.sun),
                BudgetCategory(name: "Transport", icon: "car.fill", budget: 3_000_000, spent: 1_800_000, accent: theme.tint),
                BudgetCategory(name: "Diving & activities", icon: "water.waves", budget: 5_000_000, spent: 3_000_000, accent: theme.coral),
                BudgetCategory(name: "Shopping", icon: "bag.fill", budget: 2_000_000, spent: 800_000, accent: theme.moss),
                BudgetCategory(name: "Emergency fund", icon: "shield.lefthalf.filled", budget: 3_000_000, spent: 0, accent: theme.sky)
            ],
            dailyTiers: [
                DestinationListItem(icon: "bunkbed.fill", title: "Backpacker", detail: "Rp 500–800k · hostels, warungs, scooter.", accent: theme.moss),
                DestinationListItem(icon: "bed.double.fill", title: "Mid-range", detail: "Rp 1.2–2m · 3–4★, restaurants, drivers.", accent: theme.sun),
                DestinationListItem(icon: "star.fill", title: "Premium", detail: "Rp 3–5m · villas, dining, private tours.", accent: theme.coral),
                DestinationListItem(icon: "crown.fill", title: "Luxury", detail: "Rp 6m+ · resorts, fine dining, full service.", accent: theme.tint)
            ],
            timeline: [
                DestinationTimelineDay(day: "Now", title: "Pay deposits", detail: "Flights and hotel deposit — roughly 30% upfront."),
                DestinationTimelineDay(day: "On arrival", title: "Withdraw cash", detail: "Use a Bali bank ATM; keep a buffer for the islands."),
                DestinationTimelineDay(day: "Daily", title: "Track as you go", detail: "Aim for about Rp 2.7m/day to stay on budget."),
                DestinationTimelineDay(day: "Mid-trip", title: "Top up emergency fund", detail: "Replace anything you’ve had to dip into.")
            ],
            moneySavingTips: [
                "Eat at warungs and minimarkets — a fraction of resort prices.",
                "Rent scooters or bikes weekly for a better daily rate.",
                "Use Gojek/Grab and public ferries over fixed tourist fares.",
                "Travel in the shoulder season (May–Jun, Sep) for lower prices."
            ],
            atmCash: [
                "Use bank ATMs (BCA, Mandiri) inside branches; cover the keypad.",
                "Withdraw the maximum to amortise the ~Rp 25–50k fee.",
                "Island ATMs run dry — carry enough cash before you cross.",
                "Tell your bank you’re travelling to avoid card blocks."
            ],
            cardPayment: [
                "Cards work at hotels and bigger restaurants; warungs are cash-only.",
                "Choose to be charged in IDR, not your home currency (avoid DCC).",
                "Keep your card in sight to avoid skimming.",
                "Carry a backup card stored separately."
            ],
            hiddenFees: [
                "Hotel tax & service (10–21%)",
                "Restaurant tax + service on tourist menus",
                "ATM withdrawal fees",
                "Dynamic currency conversion on cards",
                "Airport mark-ups on SIMs and snacks"
            ],
            savingsChecklist: [
                "Set a daily spend cap",
                "Pre-book fast boats & key tours",
                "Buy a local SIM, skip roaming",
                "Carry a refillable water bottle",
                "Keep an emergency cash stash"
            ]
        )
    }
}

struct TravelBudgetExpenseDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelBudgetExpenseDashboard(plan: .sampleIndonesia)
                .previewDisplayName("Budget & expenses · Indonesia")

            TravelBudgetExpenseDashboard(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Budget & expenses · Dynamic Type XL")
        }
    }
}
#endif
