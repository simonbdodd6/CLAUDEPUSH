import SwiftUI

// MARK: - Travel currency & money dashboard (Phase 120)
//
// A flagship, presentation-only Currency & Money dashboard: a hero with an exchange
// overview, indicative exchange-rate cards (IDR base against USD/EUR/GBP/AUD), a
// presentation-only currency converter and daily-spending calculator, local-currency
// quick facts, a cash vs card comparison, ATM guidance (limits, fees, banks), card &
// mobile-payment acceptance, a travel-wallet summary with payment-method badges,
// budget tiers and allocation bars, money-saving tips, best places to exchange,
// scam/counterfeit awareness, security tips, tipping customs, banking hours, financial
// emergency contacts, quick-reference facts and an exchange-rate disclaimer. A caller
// supplies a `MoneyGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens.
// `MoneyGuide` and its nested rows are lightweight presentation models (not DTOs); the
// component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// converter and calculator compute locally against indicative, illustrative rates; the
// category filters and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A way to pay — drives the badge glyph, accent and the category filter.
enum MoneyPayMethod: String, CaseIterable {
    case cash
    case card
    case eWallet

    var label: String {
        switch self {
        case .cash: "Cash"
        case .card: "Card"
        case .eWallet: "E-wallet"
        }
    }

    var icon: String {
        switch self {
        case .cash: "banknote.fill"
        case .card: "creditcard.fill"
        case .eWallet: "iphone"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .cash: return theme.moss
        case .card: return theme.ocean
        case .eWallet: return theme.tint
        }
    }
}

/// A single at-a-glance / quick-reference money fact (icon, label and value).
struct MoneyFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A single indicative exchange-rate card.
struct MoneyRate: Identifiable {
    let id = UUID()
    var code: String
    var name: String
    var perUnit: String
}

/// A budget tier (per-person, per-day).
struct MoneyBudgetTier: Identifiable {
    let id = UUID()
    var name: String
    var perDay: Int
    var icon: String
    var detail: String
}

/// A single daily-budget allocation line with a fractional bar.
struct MoneyAllocation: Identifiable {
    let id = UUID()
    var label: String
    var amount: String
    var fraction: Double
    var accent: Color
}

/// A generic money guide row reused for ways-to-pay, ATM, exchange, tipping,
/// banking hours and emergency contacts.
struct MoneyInfoRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var methods: [String]

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, methods: [String] = []) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.methods = methods
    }
}

/// The full, presentation-only content for a currency & money guide.
struct MoneyGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var currencyName: String
    var currencyCode: String
    var convertFromLabel: String
    var convertRate: Int
    var facts: [MoneyFact]
    var rates: [MoneyRate]
    var cashPoints: [String]
    var cardPoints: [String]
    var waysToPay: [MoneyInfoRow]
    var atmGuide: [MoneyInfoRow]
    var mobilePayment: [MoneyInfoRow]
    var walletCash: String
    var walletCard: String
    var walletEWallet: String
    var budgetTiers: [MoneyBudgetTier]
    var allocations: [MoneyAllocation]
    var savingTips: [String]
    var exchangePlaces: [MoneyInfoRow]
    var scamNotes: [String]
    var securityTips: [String]
    var tipping: [MoneyInfoRow]
    var bankingHours: [MoneyInfoRow]
    var emergencyContacts: [MoneyInfoRow]
    var quickFacts: [MoneyFact]
    var disclaimer: String
}

/// A premium, presentation-only currency & money dashboard rendered from a `MoneyGuide`.
struct TravelCurrencyMoneyDashboard: View {
    var guide: MoneyGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedMethod = "All"
    @State private var favourites: Set<String> = []
    @State private var convertAmount = 50
    @State private var budgetDays = 14
    @State private var selectedTier = 1

    private let theme = TravelTheme.current
    private let methodFilters = ["All", "Cash", "Card", "E-wallet"]

    private var filteredWays: [MoneyInfoRow] {
        guard selectedMethod != "All" else { return guide.waysToPay }
        return guide.waysToPay.filter { $0.methods.contains(selectedMethod) }
    }

    private var tier: MoneyBudgetTier? {
        guard guide.budgetTiers.indices.contains(selectedTier) else { return guide.budgetTiers.first }
        return guide.budgetTiers[selectedTier]
    }

    var body: some View {
        PremiumScrollView {
            hero
            ratesGroup
            payGroup
            budgetGroup
            tipsGroup
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
            eyebrow: "Currency & Money",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: guide.currencyCode, label: "Currency"),
                HeroMetric(value: factValue("Indicative rate"), label: "Rate"),
                HeroMetric(value: factValue("Daily budget"), label: "Per day")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(MoneyAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var ratesGroup: some View {
        Group {
            section("Exchange rates", "Indicative — for guidance only.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.rates) { rate in
                        rateTile(rate)
                    }
                }
            }

            section("Converter", "A quick home-to-local estimate.", 2) {
                converterCard
            }

            section("At a glance", "Local currency basics.", 3) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }
        }
    }

    private var payGroup: some View {
        Group {
            section("Cash vs card", "When to use which.", 4) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    comparisonColumn("Cash", "banknote.fill", theme.moss, guide.cashPoints)
                    comparisonColumn("Card", "creditcard.fill", theme.ocean, guide.cardPoints)
                }
            }

            section("Ways to pay", "Filter by payment method.", 5) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    methodFilter
                    if filteredWays.isEmpty {
                        GlassCard {
                            Text("No \(selectedMethod.lowercased()) notes here.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        infoList(filteredWays)
                    }
                }
            }

            section("ATM guide", "Withdrawing cash safely.", 6) {
                infoList(guide.atmGuide)
            }

            section("Mobile payments", "E-wallets and QR.", 7) {
                infoList(guide.mobilePayment)
            }

            section("Travel wallet", "A snapshot of how you’ll pay.", 8) {
                walletCard
            }
        }
    }

    private var budgetGroup: some View {
        Group {
            section("Daily spending", "Estimate your trip total.", 8) {
                calculatorCard
            }

            section("Budget tiers", "Per person, per day.", 8) {
                tiersList
            }

            section("Where it goes", "A typical daily split.", 8) {
                allocationCard
            }
        }
    }

    private var tipsGroup: some View {
        Group {
            section("Money-saving tips", "Stretch your rupiah.", 8) {
                bulletCard(guide.savingTips, icon: "lightbulb.fill", tint: theme.sun)
            }

            section("Where to exchange", "Get a fair rate.", 8) {
                infoList(guide.exchangePlaces)
            }

            section("Scams & counterfeits", "Stay sharp.", 8) {
                bulletCard(guide.scamNotes, icon: "exclamationmark.shield.fill", tint: theme.coral)
            }

            section("Security tips", "Protect your money.", 8) {
                bulletCard(guide.securityTips, icon: "lock.shield.fill", tint: theme.ocean)
            }

            section("Tipping", "What’s customary.", 8) {
                infoList(guide.tipping)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Banking hours", "When banks and exchanges open.", 8) {
                infoList(guide.bankingHours)
            }

            section("Emergency contacts", "If a card is lost or blocked.", 8) {
                infoList(guide.emergencyContacts)
            }

            section("Quick reference", "Handy money facts.", 8) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.quickFacts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Before you spend", "A quick caveat.", 8) {
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
        .modifier(MoneyAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Rate & fact tiles

    private func rateTile(_ rate: MoneyRate) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                HStack(spacing: TravelSpacing.xs) {
                    Text(rate.code)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.left.arrow.right")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                }
                Text(rate.perUnit)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(rate.name)
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(rate.code), \(rate.name): \(rate.perUnit)")
    }

    private func factTile(_ fact: MoneyFact) -> some View {
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

    // MARK: Converter (presentation only)

    private var converterCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    stepperButton("minus") { if convertAmount > 10 { convertAmount -= 10 } }
                    VStack(spacing: TravelSpacing.xxs) {
                        Text("\(guide.convertFromLabel)\(convertAmount)")
                            .font(TravelTypography.title)
                        Text(guide.convertFromLabel == "£" ? "British pounds" : "Home currency")
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    stepperButton("plus") { convertAmount += 10 }
                }
                Divider().opacity(0.4)
                VStack(spacing: TravelSpacing.xxs) {
                    Text("Rp \(grouped(convertAmount * guide.convertRate))")
                        .font(TravelTypography.display)
                        .foregroundStyle(theme.tint)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("at ≈ Rp \(grouped(guide.convertRate)) per \(guide.convertFromLabel)1")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Converter. \(guide.convertFromLabel)\(convertAmount) is about \(grouped(convertAmount * guide.convertRate)) rupiah.")
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
        .accessibilityLabel(icon == "plus" ? "Increase amount" : "Decrease amount")
    }

    // MARK: Cash vs card / generic comparison

    private func comparisonColumn(_ title: String, _ icon: String, _ accent: Color, _ points: [String]) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Label(title, systemImage: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    ForEach(points, id: \.self) { point in
                        HStack(alignment: .top, spacing: TravelSpacing.xs) {
                            Image(systemName: "checkmark")
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(accent)
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

    // MARK: Method filter

    private var methodFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(methodFilters, id: \.self) { filter in
                    filterChip(filter)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedMethod
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedMethod = filter }
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

    // MARK: Travel wallet

    private var walletCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Text("How you’ll pay")
                    .font(TravelTypography.cardTitle)
                PremiumAdaptiveGrid(minimumWidth: 104) {
                    walletTile(.cash, guide.walletCash)
                    walletTile(.card, guide.walletCard)
                    walletTile(.eWallet, guide.walletEWallet)
                }
            }
        }
    }

    private func walletTile(_ method: MoneyPayMethod, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            methodBadge(method)
            Text(value)
                .font(TravelTypography.cardTitle)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(method.label): \(value)")
    }

    private func methodBadge(_ method: MoneyPayMethod) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: method.icon)
            Text(method.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(method.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(method.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Daily spending calculator (presentation only)

    private var calculatorCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(guide.budgetTiers.enumerated()), id: \.element.id) { index, tier in
                            tierChip(index, tier)
                        }
                    }
                }
                HStack {
                    Text("Days")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    stepperButton("minus") { if budgetDays > 1 { budgetDays -= 1 } }
                    Text("\(budgetDays)")
                        .font(TravelTypography.cardTitle)
                        .frame(minWidth: 36)
                    stepperButton("plus") { if budgetDays < 60 { budgetDays += 1 } }
                }
                Divider().opacity(0.4)
                if let tier {
                    VStack(spacing: TravelSpacing.xxs) {
                        Text("≈ £\(grouped(tier.perDay * budgetDays))")
                            .font(TravelTypography.display)
                            .foregroundStyle(theme.tint)
                        Text("\(tier.name) · £\(tier.perDay)/day × \(budgetDays) days")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                        Text("≈ Rp \(grouped(tier.perDay * budgetDays * guide.convertRate)) total")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(calculatorAccessibility)
    }

    private var calculatorAccessibility: String {
        guard let tier else { return "Daily spending calculator." }
        return "Daily spending calculator. \(tier.name) at £\(tier.perDay) per day for \(budgetDays) days is about £\(grouped(tier.perDay * budgetDays))."
    }

    private func tierChip(_ index: Int, _ tier: MoneyBudgetTier) -> some View {
        let selected = index == selectedTier
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedTier = index }
        } label: {
            Label(tier.name, systemImage: tier.icon)
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
        .accessibilityLabel("\(tier.name) tier")
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    // MARK: Budget tiers

    private var tiersList: some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(guide.budgetTiers) { tier in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(tier.icon, theme.tint)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(tier.name)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                tagPill("£\(tier.perDay)/day", theme.sun)
                            }
                            Text(tier.detail)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(tier.name), £\(tier.perDay) per day. \(tier.detail)")
            }
        }
    }

    // MARK: Allocation

    private var allocationCard: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(guide.allocations) { line in
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack {
                            Text(line.label)
                                .font(TravelTypography.caption)
                            Spacer(minLength: 0)
                            Text(line.amount)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                        PremiumProgressBar(
                            progress: appeared ? line.fraction : 0,
                            colors: [line.accent, line.accent.opacity(0.6)]
                        )
                        .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(line.label), \(line.amount)")
                }
            }
        }
    }

    // MARK: Generic info list

    private func infoList(_ rows: [MoneyInfoRow]) -> some View {
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

    // MARK: Disclaimer

    private var disclaimerCard: some View {
        GlassCard(prominence: .hero) {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "info.circle.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Rates are indicative only")
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
        .accessibilityLabel("Rates are indicative only. \(guide.disclaimer)")
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

// MARK: - Money appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct MoneyAppear: ViewModifier {
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
extension MoneyGuide {
    /// A deterministic sample money guide for Indonesia (illustrative rates only).
    static var sampleIndonesia: MoneyGuide {
        let theme = TravelTheme.current
        return MoneyGuide(
            heroTitle: "Indonesia · Money",
            heroSubtitle: "Cash-first islands with fast-growing e-wallets — here’s how to pay, budget and stay safe.",
            heroSymbol: "banknote.fill",
            heroGradient: [theme.moss, theme.tint, theme.sun],
            currencyName: "Indonesian Rupiah",
            currencyCode: "IDR",
            convertFromLabel: "£",
            convertRate: 20_400,
            facts: [
                MoneyFact(icon: "banknote.fill", label: "Currency", value: "Rupiah (Rp)"),
                MoneyFact(icon: "number", label: "Symbol", value: "Rp / IDR"),
                MoneyFact(icon: "arrow.left.arrow.right", label: "Indicative rate", value: "£1≈Rp20.4k"),
                MoneyFact(icon: "wallet.pass.fill", label: "Daily budget", value: "£25–60")
            ],
            rates: [
                MoneyRate(code: "IDR", name: "Base", perUnit: "Rp 1 = Rp 1"),
                MoneyRate(code: "GBP", name: "Pound", perUnit: "£1 ≈ Rp 20,400"),
                MoneyRate(code: "USD", name: "US dollar", perUnit: "$1 ≈ Rp 16,200"),
                MoneyRate(code: "EUR", name: "Euro", perUnit: "€1 ≈ Rp 17,500"),
                MoneyRate(code: "AUD", name: "Aussie", perUnit: "A$1 ≈ Rp 10,600")
            ],
            cashPoints: [
                "Essential for warungs, markets and small islands",
                "Needed for boat tickets and entrance fees",
                "Tipping and parking attendants",
                "Carry small notes — change can be scarce"
            ],
            cardPoints: [
                "Hotels, malls and bigger restaurants",
                "Dive centres and tour operators",
                "Use credit for fraud protection",
                "Always choose to be charged in rupiah"
            ],
            waysToPay: [
                MoneyInfoRow(title: "Cash (rupiah)", subtitle: "Most widely accepted", icon: "banknote.fill", detail: "King outside tourist hubs; keep a stash of small notes for warungs and boats.", accent: theme.moss, methods: ["Cash"]),
                MoneyInfoRow(title: "Visa / Mastercard", subtitle: "Hotels & restaurants", icon: "creditcard.fill", detail: "Widely taken in towns; a 2–3% surcharge is common at smaller venues.", accent: theme.ocean, methods: ["Card"]),
                MoneyInfoRow(title: "GoPay / OVO / DANA", subtitle: "QRIS e-wallets", icon: "iphone", detail: "Scan-to-pay QRIS is everywhere in cities; usually needs a local number to top up.", accent: theme.tint, methods: ["E-wallet"]),
                MoneyInfoRow(title: "Contactless / Apple Pay", subtitle: "Limited", icon: "wave.3.right", detail: "Works at some chains and malls; don’t rely on it on the islands.", accent: theme.ocean, methods: ["Card", "E-wallet"])
            ],
            atmGuide: [
                MoneyInfoRow(title: "Withdrawal limit", subtitle: "Per transaction", icon: "creditcard.and.123", detail: "Most ATMs cap at Rp 2.5–3m; BCA and Mandiri often allow more.", accent: theme.tint, methods: []),
                MoneyInfoRow(title: "ATM fees", subtitle: "Per withdrawal", icon: "percent", detail: "Local fee around Rp 25,000–50,000 plus your home bank’s charges.", accent: theme.coral, methods: []),
                MoneyInfoRow(title: "Preferred banks", subtitle: "Reliable", icon: "building.columns.fill", detail: "BCA, Mandiri and BNI ATMs are widespread and dependable in towns.", accent: theme.ocean, methods: []),
                MoneyInfoRow(title: "Take your card first", subtitle: "Safety", icon: "checkmark.shield.fill", detail: "Some machines dispense cash before returning the card — wait for both.", accent: theme.moss, methods: [])
            ],
            mobilePayment: [
                MoneyInfoRow(title: "QRIS", subtitle: "National QR", icon: "qrcode", detail: "One QR standard accepted across e-wallets and banks — point, scan, pay.", accent: theme.tint, methods: ["E-wallet"]),
                MoneyInfoRow(title: "GoPay & Gojek", subtitle: "Super-app", icon: "scooter", detail: "Pays for rides, food delivery and many shops; top up at minimarts.", accent: theme.ocean, methods: ["E-wallet"]),
                MoneyInfoRow(title: "Tourist eSIM + wallet", subtitle: "Workaround", icon: "simcard.fill", detail: "A local eSIM gives you a number to register an e-wallet if you want one.", accent: theme.sun, methods: ["E-wallet"])
            ],
            walletCash: "Rp small notes",
            walletCard: "1 credit + 1 debit",
            walletEWallet: "GoPay (optional)",
            budgetTiers: [
                MoneyBudgetTier(name: "Backpacker", perDay: 25, icon: "backpack.fill", detail: "Guesthouses, warung meals, public boats and scooters."),
                MoneyBudgetTier(name: "Mid-range", perDay: 60, icon: "bed.double.fill", detail: "Comfortable hotels, mix of restaurants, some dives and tours."),
                MoneyBudgetTier(name: "Luxury", perDay: 150, icon: "sparkles", detail: "Resorts, private transfers, premium diving and fine dining.")
            ],
            allocations: [
                MoneyAllocation(label: "Accommodation", amount: "£22", fraction: 0.37, accent: theme.ocean),
                MoneyAllocation(label: "Food & drink", amount: "£15", fraction: 0.25, accent: theme.sun),
                MoneyAllocation(label: "Activities & diving", amount: "£15", fraction: 0.25, accent: theme.tint),
                MoneyAllocation(label: "Transport", amount: "£8", fraction: 0.13, accent: theme.moss)
            ],
            savingTips: [
                "Eat at warungs — a full meal costs a fraction of a tourist restaurant.",
                "Withdraw larger amounts less often to spread the fixed ATM fee.",
                "Rent a scooter by the week rather than the day where it’s safe to ride.",
                "Always pay in rupiah, never your home currency, to dodge poor conversion."
            ],
            exchangePlaces: [
                MoneyInfoRow(title: "Authorised money changers", subtitle: "Best rates", icon: "building.2.fill", detail: "Use reputable shops (e.g. PT Central Kuta); count cash before leaving.", accent: theme.moss, methods: []),
                MoneyInfoRow(title: "Banks", subtitle: "Safe", icon: "building.columns.fill", detail: "Slightly poorer rates but secure; bring your passport.", accent: theme.ocean, methods: []),
                MoneyInfoRow(title: "Avoid airport & hotels", subtitle: "Worst rates", icon: "airplane", detail: "Convenient but the rates and fees are the least favourable.", accent: theme.coral, methods: [])
            ],
            scamNotes: [
                "Beware ‘no-commission’ changers with rates that look too good — they short-change on the count.",
                "Count your money yourself and don’t hand it back once counted.",
                "Check notes for tears; very worn or marked rupiah may be refused.",
                "Cover the keypad at ATMs and use machines attached to banks."
            ],
            securityTips: [
                "Split cash and cards between bag, pocket and the hotel safe.",
                "Carry a ‘dummy’ small wallet for day-to-day spending.",
                "Tell your bank your travel dates so cards aren’t blocked.",
                "Keep a photo of your cards and emergency numbers offline."
            ],
            tipping: [
                MoneyInfoRow(title: "Restaurants", subtitle: "Optional", icon: "fork.knife", detail: "A service charge is often included; round up or leave 5–10% if not.", accent: theme.sun, methods: []),
                MoneyInfoRow(title: "Drivers & guides", subtitle: "Appreciated", icon: "car.fill", detail: "Rp 50,000–100,000 a day for a good private driver or dive guide.", accent: theme.tint, methods: []),
                MoneyInfoRow(title: "Hotel staff", subtitle: "Small notes", icon: "bell.fill", detail: "Rp 10,000–20,000 for porters and housekeeping is generous.", accent: theme.ocean, methods: [])
            ],
            bankingHours: [
                MoneyInfoRow(title: "Banks", subtitle: "Mon–Fri", icon: "clock.fill", detail: "Typically 08:00–15:00 weekdays; some branches open Saturday mornings.", accent: theme.ocean, methods: []),
                MoneyInfoRow(title: "Money changers", subtitle: "Daily", icon: "storefront.fill", detail: "Tourist-area changers often open daily until evening.", accent: theme.tint, methods: []),
                MoneyInfoRow(title: "ATMs", subtitle: "24/7", icon: "creditcard.and.123", detail: "Available around the clock in towns; sparse on smaller islands.", accent: theme.moss, methods: [])
            ],
            emergencyContacts: [
                MoneyInfoRow(title: "Card-loss hotlines", subtitle: "Save offline", icon: "phone.fill", detail: "Store your bank’s 24h international number before you travel.", accent: theme.coral, methods: []),
                MoneyInfoRow(title: "Emergency cash transfer", subtitle: "Backup", icon: "arrow.left.arrow.right.circle.fill", detail: "Western Union and similar have agents in towns for emergency funds.", accent: theme.tint, methods: []),
                MoneyInfoRow(title: "Embassy / consulate", subtitle: "Last resort", icon: "building.columns.fill", detail: "Can advise if you’re stranded without money; keep their number handy.", accent: theme.ocean, methods: [])
            ],
            quickFacts: [
                MoneyFact(icon: "number", label: "Big notes", value: "Rp 100k / 50k"),
                MoneyFact(icon: "fork.knife", label: "Warung meal", value: "Rp 25k–45k"),
                MoneyFact(icon: "scooter", label: "Scooter/day", value: "Rp 70k–90k"),
                MoneyFact(icon: "water.waves", label: "Fun dive", value: "Rp 600k–900k")
            ],
            disclaimer: "Exchange rates and prices fluctuate constantly and are shown for rough guidance only. Check a live rate and current prices before exchanging money or budgeting your trip."
        )
    }
}

struct TravelCurrencyMoneyDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelCurrencyMoneyDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Currency & money · Indonesia")

            TravelCurrencyMoneyDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Currency & money · Dynamic Type XL")
        }
    }
}
#endif
