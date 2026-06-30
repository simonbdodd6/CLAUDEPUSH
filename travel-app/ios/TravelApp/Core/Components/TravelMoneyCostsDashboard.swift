import SwiftUI

// MARK: - Travel money, costs & budget dashboard (Phase 127)
//
// A flagship, presentation-only Money, Costs & Budget dashboard for Indonesia: a hero
// with at-a-glance facts (currency, exchange-rate placeholder, typical daily budgets,
// ATM availability), a presentation-only budget calculator, daily cost tiers, a
// cost-comparison mini chart by region, price guides (accommodation, food & drink,
// transport, diving & surf, SIM/eSIM), tipping guidance, ATM & cash advice, card-
// acceptance guidance, money-safety warnings, common scams with severity badges,
// hidden costs, savings tips, region-filtered regional price notes and a disclaimer. A
// caller supplies a `CostsGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens. The
// `Cost*` model names are deliberately distinct from Phase 120's `Money*` types to
// avoid any collision. `CostsGuide` and its nested rows are lightweight presentation
// models (not DTOs); the component holds no data, networking, persistence, repository,
// view-model, navigation, AppContainer or DTO logic, and is not wired into any screen.
// The calculator computes locally against illustrative rates; the region filter and
// favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// How serious a scam is — drives the severity badge label and accent.
enum CostScamSeverity {
    case minor
    case watch
    case serious

    var label: String {
        switch self {
        case .minor: "Minor"
        case .watch: "Watch out"
        case .serious: "Serious"
        }
    }

    var icon: String {
        switch self {
        case .minor: "info.circle.fill"
        case .watch: "exclamationmark.triangle.fill"
        case .serious: "exclamationmark.octagon.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .minor: return theme.moss
        case .watch: return theme.sun
        case .serious: return theme.coral
        }
    }
}

/// A single at-a-glance budget fact.
struct CostsFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A daily-budget tier (per person, per day, in GBP).
struct CostTier: Identifiable {
    let id = UUID()
    var name: String
    var perDay: Int
    var icon: String
    var detail: String
}

/// A single bar in the regional cost-comparison mini chart.
struct CostBar: Identifiable {
    let id = UUID()
    var label: String
    var value: String
    var fraction: Double
    var accent: Color
}

/// A generic price-guide / advice row reused across the dashboard.
struct CostRow: Identifiable {
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

/// A common tourist scam, with a severity badge.
struct CostScam: Identifiable {
    let id = UUID()
    var title: String
    var detail: String
    var severity: CostScamSeverity
}

/// The full, presentation-only content for a money, costs & budget guide.
struct CostsGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var rpPerGBP: Int
    var facts: [CostsFact]
    var tiers: [CostTier]
    var comparison: [CostBar]
    var accommodation: [CostRow]
    var foodDrink: [CostRow]
    var transport: [CostRow]
    var activities: [CostRow]
    var connectivity: [CostRow]
    var tipping: [CostRow]
    var atmAdvice: [CostRow]
    var cardAdvice: [CostRow]
    var safetyWarnings: [String]
    var scams: [CostScam]
    var hiddenCosts: [String]
    var savingsTips: [String]
    var regionalNotes: [CostRow]
    var disclaimer: String
}

/// A premium, presentation-only money/costs/budget dashboard rendered from a `CostsGuide`.
struct TravelMoneyCostsDashboard: View {
    var guide: CostsGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []
    @State private var selectedTier = 1
    @State private var budgetDays = 14

    private let theme = TravelTheme.current
    private let regionFilters = ["All", "Bali", "Lombok", "Gili", "Komodo", "Raja Ampat"]

    private var tier: CostTier? {
        guard guide.tiers.indices.contains(selectedTier) else { return guide.tiers.first }
        return guide.tiers[selectedTier]
    }

    private var filteredRegional: [CostRow] {
        guard selectedRegion != "All" else { return guide.regionalNotes }
        return guide.regionalNotes.filter { $0.region == selectedRegion }
    }

    var body: some View {
        PremiumScrollView {
            hero
            topGroup
            pricesGroup
            servicesGroup
            safetyGroup
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
            eyebrow: "Money & Budget",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Currency"), label: "Currency"),
                HeroMetric(value: factValue("Mid-range/day"), label: "Per day"),
                HeroMetric(value: factValue("ATMs"), label: "ATMs")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(CostsAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var topGroup: some View {
        Group {
            section("At a glance", "Budget basics.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Budget calculator", "Estimate your trip spend.", 2) {
                calculatorCard
            }

            section("Daily budgets", "Per person, per day.", 3) {
                tiersList
            }

            section("Cost by region", "Typical mid-range day.", 4) {
                comparisonCard
            }
        }
    }

    private var pricesGroup: some View {
        Group {
            section("Accommodation", "A bed for the night.", 5) {
                infoList(guide.accommodation)
            }

            section("Food & drink", "Eating out.", 6) {
                infoList(guide.foodDrink)
            }

            section("Getting around", "Transport costs.", 7) {
                infoList(guide.transport)
            }

            section("Diving & surf", "On and under the water.", 8) {
                infoList(guide.activities)
            }
        }
    }

    private var servicesGroup: some View {
        Group {
            section("SIM & eSIM", "Staying connected.", 8) {
                infoList(guide.connectivity)
            }

            section("Tipping", "What’s customary.", 8) {
                infoList(guide.tipping)
            }

            section("ATMs & cash", "Withdrawing money.", 8) {
                infoList(guide.atmAdvice)
            }

            section("Cards", "Where plastic works.", 8) {
                infoList(guide.cardAdvice)
            }
        }
    }

    private var safetyGroup: some View {
        Group {
            section("Money safety", "Protect your cash.", 8) {
                bulletCard(guide.safetyWarnings, icon: "lock.shield.fill", tint: theme.ocean)
            }

            section("Common scams", "Spot them early.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.scams) { scam in
                        scamCard(scam)
                    }
                }
            }

            section("Hidden costs", "The ones people forget.", 8) {
                bulletCard(guide.hiddenCosts, icon: "eye.trianglebadge.exclamationmark.fill", tint: theme.coral)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Savings tips", "Stretch your budget.", 8) {
                bulletCard(guide.savingsTips, icon: "lightbulb.fill", tint: theme.sun)
            }

            section("Regional notes", "Filter by where you are.", 8) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    regionFilter
                    if filteredRegional.isEmpty {
                        GlassCard {
                            Text("No notes for that region.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        infoList(filteredRegional)
                    }
                }
            }

            section("Good to know", "About these prices.", 8) {
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
        .modifier(CostsAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: CostsFact) -> some View {
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

    // MARK: Budget calculator (presentation only)

    private var calculatorCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(guide.tiers.enumerated()), id: \.element.id) { index, tier in
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
                        Text("≈ Rp \(grouped(tier.perDay * budgetDays * guide.rpPerGBP)) total")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(tier.map { "Budget calculator. \($0.name) at £\($0.perDay) per day for \(budgetDays) days is about £\(grouped($0.perDay * budgetDays))." } ?? "Budget calculator.")
    }

    private func tierChip(_ index: Int, _ tier: CostTier) -> some View {
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
        .accessibilityLabel(icon == "plus" ? "Increase days" : "Decrease days")
    }

    // MARK: Daily tiers

    private var tiersList: some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(guide.tiers) { tier in
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

    // MARK: Comparison mini chart

    private var comparisonCard: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(guide.comparison) { bar in
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack {
                            Text(bar.label)
                                .font(TravelTypography.caption)
                            Spacer(minLength: 0)
                            Text(bar.value)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                        PremiumProgressBar(
                            progress: appeared ? bar.fraction : 0,
                            colors: [bar.accent, bar.accent.opacity(0.6)]
                        )
                        .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(bar.label): \(bar.value) per day")
                }
            }
        }
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

    // MARK: Scam cards

    private func scamCard(_ scam: CostScam) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(scam.severity.icon, scam.severity.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(scam.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        severityBadge(scam.severity)
                    }
                    Text(scam.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("scam-\(scam.title)", scam.title)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(scam.title), \(scam.severity.label). \(scam.detail)")
    }

    private func severityBadge(_ severity: CostScamSeverity) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: severity.icon)
            Text(severity.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(severity.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(severity.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Generic info list

    private func infoList(_ rows: [CostRow]) -> some View {
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
                    Text("Prices are indicative")
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
        .accessibilityLabel("Prices are indicative. \(guide.disclaimer)")
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

// MARK: - Costs appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct CostsAppear: ViewModifier {
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
extension CostsGuide {
    /// A deterministic sample money/costs guide for Indonesia (illustrative pricing).
    static var sampleIndonesia: CostsGuide {
        let theme = TravelTheme.current
        return CostsGuide(
            heroTitle: "Indonesia · Costs",
            heroSubtitle: "From £25-a-day backpacking to luxury resorts — what things really cost across the islands.",
            heroSymbol: "wallet.bifold.fill",
            heroGradient: [theme.moss, theme.tint, theme.sun],
            rpPerGBP: 20_400,
            facts: [
                CostsFact(icon: "banknote.fill", label: "Currency", value: "Rupiah (Rp)"),
                CostsFact(icon: "arrow.left.arrow.right", label: "Rate", value: "£1≈Rp20.4k"),
                CostsFact(icon: "wallet.pass.fill", label: "Mid-range/day", value: "£50–70"),
                CostsFact(icon: "creditcard.and.123", label: "ATMs", value: "Common in towns")
            ],
            tiers: [
                CostTier(name: "Backpacker", perDay: 25, icon: "backpack.fill", detail: "Guesthouses, warung meals, scooters and public boats."),
                CostTier(name: "Mid-range", perDay: 60, icon: "bed.double.fill", detail: "Nice hotels, a mix of restaurants, dives and tours."),
                CostTier(name: "Luxury", perDay: 150, icon: "sparkles", detail: "Resorts, private drivers, premium diving and fine dining.")
            ],
            comparison: [
                CostBar(label: "Lombok", value: "£45", fraction: 0.41, accent: theme.moss),
                CostBar(label: "Bali", value: "£55", fraction: 0.50, accent: theme.tint),
                CostBar(label: "Gili Islands", value: "£60", fraction: 0.55, accent: theme.sky),
                CostBar(label: "Komodo", value: "£75", fraction: 0.68, accent: theme.sun),
                CostBar(label: "Raja Ampat", value: "£110", fraction: 1.0, accent: theme.coral)
            ],
            accommodation: [
                CostRow(title: "Hostel / homestay", subtitle: "Budget", icon: "house.fill", detail: "Rp 150–350k a night (≈ £7–17) for a fan or simple AC room.", accent: theme.moss),
                CostRow(title: "Mid-range hotel", subtitle: "Comfort", icon: "bed.double.fill", detail: "Rp 500k–1.2m (≈ £25–60) for a pool and breakfast.", accent: theme.tint),
                CostRow(title: "Resort / villa", subtitle: "Luxury", icon: "sparkles", detail: "Rp 2m+ (≈ £100+) for private villas and beach resorts.", accent: theme.sun)
            ],
            foodDrink: [
                CostRow(title: "Warung meal", subtitle: "Local", icon: "fork.knife", detail: "Nasi goreng or gado-gado for Rp 25–45k (≈ £1.20–2.20).", accent: theme.moss),
                CostRow(title: "Tourist restaurant", subtitle: "Western-ish", icon: "takeoutbag.and.cup.and.straw.fill", detail: "Mains Rp 80–150k (≈ £4–7) in cafés and beach clubs.", accent: theme.tint),
                CostRow(title: "Bintang beer", subtitle: "Drinks", icon: "wineglass.fill", detail: "Rp 30–50k in a shop, more in bars; coffee Rp 25–40k.", accent: theme.sun)
            ],
            transport: [
                CostRow(title: "Scooter + fuel", subtitle: "Per day", icon: "scooter", detail: "Rental Rp 70–90k; petrol Rp 10–15k a litre from stalls or stations.", accent: theme.tint),
                CostRow(title: "Gojek / Grab", subtitle: "Per ride", icon: "iphone.gen3", detail: "Bike Rp 15–30k, car Rp 40–80k for typical town hops.", accent: theme.ocean),
                CostRow(title: "Fast boat / ferry", subtitle: "Inter-island", icon: "ferry.fill", detail: "Bali–Gili/Lombok Rp 150–600k; public ferries far cheaper but slow.", accent: theme.sky),
                CostRow(title: "Domestic flight", subtitle: "Long hops", icon: "airplane", detail: "Rp 700k–2m (≈ £35–100) e.g. Bali to Labuan Bajo or Sorong.", accent: theme.coral)
            ],
            activities: [
                CostRow(title: "Fun dive", subtitle: "Certified", icon: "water.waves", detail: "Rp 600–900k (≈ £30–45) per guided dive, gear often extra.", accent: theme.ocean),
                CostRow(title: "Open Water course", subtitle: "Learn", icon: "graduationcap.fill", detail: "Rp 5–7m (≈ £250–350) for a 3–4 day PADI/SSI course.", accent: theme.tint),
                CostRow(title: "Surf lesson", subtitle: "Beginner", icon: "figure.surfing", detail: "Rp 350–500k (≈ £17–25) for a group lesson with board.", accent: theme.sky)
            ],
            connectivity: [
                CostRow(title: "Tourist SIM", subtitle: "Local", icon: "simcard.fill", detail: "Rp 100–200k (≈ £5–10) for a data SIM with 10–25GB.", accent: theme.tint),
                CostRow(title: "Tourist eSIM", subtitle: "Online", icon: "qrcode", detail: "Similar pricing; buy and install before you arrive.", accent: theme.ocean)
            ],
            tipping: [
                CostRow(title: "Restaurants", subtitle: "Optional", icon: "fork.knife", detail: "A service charge is often included; round up or 5–10% if not.", accent: theme.sun),
                CostRow(title: "Drivers & guides", subtitle: "Appreciated", icon: "car.fill", detail: "Rp 50–100k a day for a good private driver or dive guide.", accent: theme.tint),
                CostRow(title: "Hotel staff", subtitle: "Small notes", icon: "bell.fill", detail: "Rp 10–20k for porters and housekeeping is generous.", accent: theme.moss)
            ],
            atmAdvice: [
                CostRow(title: "Withdrawal limits", subtitle: "Per transaction", icon: "creditcard.and.123", detail: "Often Rp 2.5–3m; BCA and Mandiri sometimes allow more.", accent: theme.tint),
                CostRow(title: "Fees", subtitle: "Add up", icon: "percent", detail: "Local fee ~Rp 25–50k plus your home bank’s charge — withdraw larger sums.", accent: theme.coral),
                CostRow(title: "Reliable banks", subtitle: "Use these", icon: "building.columns.fill", detail: "BCA, Mandiri and BNI ATMs are widespread and dependable in towns.", accent: theme.ocean)
            ],
            cardAdvice: [
                CostRow(title: "Where cards work", subtitle: "Towns", icon: "creditcard.fill", detail: "Hotels, malls, dive shops and bigger restaurants; a 2–3% surcharge is common.", accent: theme.ocean),
                CostRow(title: "Always pay in rupiah", subtitle: "Avoid DCC", icon: "checkmark.shield.fill", detail: "Decline ‘pay in GBP’ at terminals — the conversion is poor.", accent: theme.moss),
                CostRow(title: "Carry cash", subtitle: "Islands & warungs", icon: "banknote.fill", detail: "Small islands, warungs and boats are cash-only — keep small notes.", accent: theme.sun)
            ],
            safetyWarnings: [
                "Split cash and cards between your bag, pocket and the hotel safe.",
                "Cover the keypad at ATMs and prefer machines attached to banks.",
                "Tell your bank your travel dates so cards aren’t blocked.",
                "Keep a photo of your cards and emergency numbers offline."
            ],
            scams: [
                CostScam(title: "Money-changer short-count", detail: "‘No commission’ changers with great rates palm notes during the count — count it yourself and don’t hand it back.", severity: .serious),
                CostScam(title: "Card skimming", detail: "Use ATMs attached to banks; check for tampering and cover the keypad.", severity: .serious),
                CostScam(title: "Scooter ‘damage’ on return", detail: "Photograph existing damage at pickup so you’re not charged for old scratches.", severity: .watch),
                CostScam(title: "No-meter taxi", detail: "Touts quote inflated flat fares — insist on the meter or agree the price first.", severity: .watch),
                CostScam(title: "‘Closed today’ diversion", detail: "Someone says a site is shut and steers you to a shop for commission — verify yourself.", severity: .minor)
            ],
            hiddenCosts: [
                "Marine-park fees — Komodo and Raja Ampat charge significant entry tags.",
                "‘Tax & service’ of up to 21% added at many hotels and restaurants.",
                "ATM fees on every withdrawal, at both ends.",
                "Scooter and gear deposits, plus fuel.",
                "Sarong rental and donations at temples; airport transfers and domestic baggage."
            ],
            savingsTips: [
                "Eat at warungs — a meal costs a fraction of a tourist restaurant.",
                "Withdraw larger amounts less often to spread the fixed ATM fee.",
                "Rent scooters or rooms by the week for a better rate.",
                "Travel in the shoulder season for cheaper rooms and tours.",
                "Always pay card transactions in rupiah, never your home currency."
            ],
            regionalNotes: [
                CostRow(title: "Bali", subtitle: "Widest range", icon: "leaf.fill", detail: "Everything from £20 hostels to £500 villas — easy to match any budget.", accent: theme.tint, region: "Bali"),
                CostRow(title: "Lombok", subtitle: "Cheaper", icon: "mountain.2.fill", detail: "Generally better value than Bali for rooms, food and scooters.", accent: theme.moss, region: "Lombok"),
                CostRow(title: "Gili Islands", subtitle: "Island premium", icon: "beach.umbrella.fill", detail: "Food, water and rooms cost more — everything arrives by boat.", accent: theme.sky, region: "Gili"),
                CostRow(title: "Komodo / Labuan Bajo", subtitle: "Tour-driven", icon: "ferry.fill", detail: "Day trips, liveaboards and park fees add up fast on top of rooms.", accent: theme.sun, region: "Komodo"),
                CostRow(title: "Raja Ampat", subtitle: "Most expensive", icon: "water.waves", detail: "Remote: high transfers, a steep marine-park tag and pricey liveaboards.", accent: theme.coral, region: "Raja Ampat")
            ],
            disclaimer: "Prices are rough, illustrative estimates and the live exchange rate needs an internet connection. Costs vary by season, operator and how you travel — always check current prices before you budget."
        )
    }
}

struct TravelMoneyCostsDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelMoneyCostsDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Money & costs · Indonesia")

            TravelMoneyCostsDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Money & costs · Dynamic Type XL")
        }
    }
}
#endif
