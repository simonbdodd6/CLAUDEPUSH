import SwiftUI

// MARK: - Explorer local costs guide (Phase 84)
//
// A reusable, presentation-only "Typical Local Prices" guide that helps a traveller
// quickly understand what everyday things should cost in a destination — coffee, a
// local meal, a taxi, a SIM card, a massage — each with an average price, an
// expected range, the local currency, an optional converted value, a value
// indicator (cheap / average / premium), a money-saving tip, a mock last-updated
// label and a confidence indicator.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumPillRow` (the compact rows) and the tokens
// (`TravelTheme`, `TravelSpacing`, `TravelRadius`, `TravelTypography`,
// `TravelMotion`). All values are caller-supplied mock data; the component holds
// no data, networking, persistence, view-model, navigation or MapKit usage, and is
// not wired into any screen. Animations are subtle appearance polish only (a
// staggered fade-and-rise).

/// How a price compares locally — the value indicator.
enum CostValue: CaseIterable {
    case cheap
    case average
    case premium

    var label: String {
        switch self {
        case .cheap: "Cheap"
        case .average: "Average"
        case .premium: "Premium"
        }
    }

    var icon: String {
        switch self {
        case .cheap: "arrow.down.circle.fill"
        case .average: "equal.circle.fill"
        case .premium: "arrow.up.circle.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .cheap: return theme.moss
        case .average: return theme.sun
        case .premium: return theme.coral
        }
    }
}

/// How trustworthy a price estimate is — the confidence indicator.
enum CostConfidence: CaseIterable {
    case low
    case medium
    case high

    var label: String {
        switch self {
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .low: return theme.coral
        case .medium: return theme.sun
        case .high: return theme.moss
        }
    }
}

/// A single, presentation-only local price entry.
struct LocalCostItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var averagePrice: String
    var priceRange: String
    var currency: String
    var converted: String?
    var value: CostValue
    var savingTip: String
    var lastUpdated: String
    var confidence: CostConfidence
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        averagePrice: String,
        priceRange: String,
        currency: String,
        converted: String? = nil,
        value: CostValue,
        savingTip: String,
        lastUpdated: String,
        confidence: CostConfidence,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.averagePrice = averagePrice
        self.priceRange = priceRange
        self.currency = currency
        self.converted = converted
        self.value = value
        self.savingTip = savingTip
        self.lastUpdated = lastUpdated
        self.confidence = confidence
        self.accent = accent
    }

    var accessibilityText: String {
        var parts = [category, "average \(averagePrice)", "range \(priceRange)", currency]
        if let converted { parts.append("about \(converted)") }
        parts.append(value.label)
        parts.append("\(confidence.label) confidence")
        parts.append("updated \(lastUpdated)")
        parts.append("tip: \(savingTip)")
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerLocalCostsGuide`.
enum LocalCostsLayout {
    case compact
    case expanded
}

/// A premium, presentation-only "Typical Local Prices" guide.
struct ExplorerLocalCostsGuide: View {
    var items: [LocalCostItem]
    var layout: LocalCostsLayout = .expanded
    var title: String? = "Typical local prices"
    var subtitle: String? = nil

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
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
    }

    // MARK: Expanded

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)

            PremiumAdaptiveGrid(minimumWidth: 240) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    costCard(item)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.04), value: appeared)
                }
            }
        }
    }

    private func costCard(_ item: LocalCostItem) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.sm) {
                    medallion(item.icon, accent: item.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(item.category)
                            .font(TravelTypography.cardTitle)
                            .lineLimit(1)
                        Text(item.currency)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    valueBadge(item.value)
                }

                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.xs) {
                    Text(item.averagePrice)
                        .font(TravelTypography.section)
                    if let converted = item.converted {
                        Text(converted)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text("Range \(item.priceRange)")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)

                HStack(spacing: TravelSpacing.sm) {
                    confidenceChip(item.confidence)
                    Spacer(minLength: 0)
                    Text(item.lastUpdated)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                }

                tipCallout(item.savingTip)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.accessibilityText)
    }

    // MARK: Compact

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
                            subtitle: "\(item.priceRange) · \(item.value.label)",
                            trailing: item.averagePrice
                        )
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.04), value: appeared)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(item.accessibilityText)
                    }
                }
            }
        }
    }

    // MARK: Pieces

    private func medallion(_ icon: String, accent: Color) -> some View {
        Image(systemName: icon)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 42, height: 42)
            .background(
                LinearGradient(
                    colors: [accent, accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: accent.opacity(0.3), radius: 8, y: 4)
    }

    private func valueBadge(_ value: CostValue) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: value.icon)
            Text(value.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(value.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(value.accent.opacity(0.15), in: Capsule())
    }

    private func confidenceChip(_ confidence: CostConfidence) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "checkmark.shield.fill")
            Text("\(confidence.label) confidence")
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(confidence.accent)
    }

    private func tipCallout(_ tip: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: "lightbulb.fill")
                .font(TravelTypography.caption)
                .foregroundStyle(TravelTheme.current.sun)
            Text(tip)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

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
        items.count == 1 ? "1 item" : "\(items.count) items"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "tag")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No local prices listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

#if DEBUG
struct ExplorerLocalCostsGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Typical 2025 prices across Bali, Lombok and the Gili Islands (IDR, ≈ USD).
    private static let indonesia: [LocalCostItem] = [
        LocalCostItem(category: "Coffee", icon: "cup.and.saucer.fill", averagePrice: "Rp 25k", priceRange: "Rp 18–35k", currency: "IDR", converted: "≈ $1.60", value: .cheap, savingTip: "Warung kopi is half the price of a beach-club latte.", lastUpdated: "Jun 2025", confidence: .high, accent: theme.coral),
        LocalCostItem(category: "Local meal", icon: "fork.knife", averagePrice: "Rp 30k", priceRange: "Rp 20–45k", currency: "IDR", converted: "≈ $1.90", value: .cheap, savingTip: "Eat nasi campur where the locals queue — filling and cheap.", lastUpdated: "Jun 2025", confidence: .high, accent: theme.sun),
        LocalCostItem(category: "Restaurant dinner", icon: "wineglass.fill", averagePrice: "Rp 150k", priceRange: "Rp 90–250k", currency: "IDR", converted: "≈ $9.50", value: .average, savingTip: "Tourist-strip menus add 10% tax + service; check before ordering.", lastUpdated: "Jun 2025", confidence: .medium, accent: theme.coral),
        LocalCostItem(category: "Taxi", icon: "car.fill", averagePrice: "Rp 80k", priceRange: "Rp 50–150k", currency: "IDR", converted: "≈ $5.00", value: .average, savingTip: "Use the meter or Grab to avoid fixed tourist fares.", lastUpdated: "May 2025", confidence: .medium, accent: theme.tint),
        LocalCostItem(category: "Scooter rental", icon: "scooter", averagePrice: "Rp 75k/day", priceRange: "Rp 60–90k", currency: "IDR", converted: "≈ $4.70", value: .cheap, savingTip: "Weekly rentals drop to about Rp 50k a day.", lastUpdated: "Jun 2025", confidence: .high, accent: theme.moss),
        LocalCostItem(category: "Ferry ticket", icon: "ferry.fill", averagePrice: "Rp 350k", priceRange: "Rp 250–600k", currency: "IDR", converted: "≈ $22", value: .premium, savingTip: "The public slow ferry is a fraction of fast-boat prices.", lastUpdated: "May 2025", confidence: .medium, accent: theme.ocean),
        LocalCostItem(category: "SIM card", icon: "simcard.fill", averagePrice: "Rp 100k", priceRange: "Rp 50–150k", currency: "IDR", converted: "≈ $6.30", value: .average, savingTip: "Buy Telkomsel at an official counter, never at the airport.", lastUpdated: "Jun 2025", confidence: .high, accent: theme.sky),
        LocalCostItem(category: "ATM fee", icon: "creditcard.fill", averagePrice: "Rp 50k", priceRange: "Rp 0–50k", currency: "IDR", converted: "≈ $3.20", value: .average, savingTip: "Use fee-free bank ATMs and withdraw the max to amortise it.", lastUpdated: "May 2025", confidence: .medium, accent: theme.coral),
        LocalCostItem(category: "Beer", icon: "mug.fill", averagePrice: "Rp 35k", priceRange: "Rp 25–60k", currency: "IDR", converted: "≈ $2.20", value: .average, savingTip: "Minimarket Bintang is a third of beach-bar prices.", lastUpdated: "Jun 2025", confidence: .high, accent: theme.sun),
        LocalCostItem(category: "Bottled water", icon: "drop.fill", averagePrice: "Rp 5k", priceRange: "Rp 3–10k", currency: "IDR", converted: "≈ $0.30", value: .cheap, savingTip: "Refill stations cut both plastic and cost.", lastUpdated: "Jun 2025", confidence: .high, accent: theme.sky),
        LocalCostItem(category: "Laundry", icon: "tshirt.fill", averagePrice: "Rp 15k/kg", priceRange: "Rp 10–25k", currency: "IDR", converted: "≈ $0.95", value: .cheap, savingTip: "Per-kilo laundries are everywhere; same-day service costs more.", lastUpdated: "May 2025", confidence: .high, accent: theme.moss),
        LocalCostItem(category: "Massage", icon: "hands.sparkles.fill", averagePrice: "Rp 120k/hr", priceRange: "Rp 80–250k", currency: "IDR", converted: "≈ $7.60", value: .average, savingTip: "Village spas charge half the resort rate for the same hour.", lastUpdated: "Jun 2025", confidence: .medium, accent: theme.coral)
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Bali prices").font(TravelTypography.section)
                    ExplorerLocalCostsGuide(
                        items: indonesia,
                        subtitle: "What things really cost across Bali, Lombok & the Gili Islands."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerLocalCostsGuide(items: [], title: "Typical local prices")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Local costs · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerLocalCostsGuide(
                        items: indonesia,
                        layout: .compact,
                        title: "Typical local prices"
                    )

                    Text("Compact · Daily basics").font(TravelTypography.section)
                    ExplorerLocalCostsGuide(
                        items: Array(indonesia.prefix(5)),
                        layout: .compact,
                        title: "Daily basics"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Local costs · Compact")
        }
    }
}
#endif
