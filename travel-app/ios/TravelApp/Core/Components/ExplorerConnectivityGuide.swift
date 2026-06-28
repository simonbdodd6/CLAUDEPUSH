import SwiftUI

// MARK: - Explorer connectivity guide (Phase 90)
//
// A reusable, presentation-only guide to staying connected while travelling —
// SIMs, eSIMs, operators, Wi-Fi, pocket Wi-Fi, data packs, roaming, offline maps,
// translation, VPNs and an offline-emergency kit. Each entry carries the best
// option, estimated cost, setup difficulty, where to buy, activation steps,
// payment methods, coverage quality, offline capability, battery impact,
// traveller suitability, an expert tip and common mistakes to avoid.
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

/// How hard a connectivity option is to set up.
enum SetupDifficulty: CaseIterable {
    case easy
    case moderate
    case advanced

    var label: String {
        switch self {
        case .easy: "Easy setup"
        case .moderate: "Moderate setup"
        case .advanced: "Advanced setup"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .easy: return theme.moss
        case .moderate: return theme.sun
        case .advanced: return theme.coral
        }
    }
}

/// Mobile-signal coverage quality, shown as a three-segment meter.
enum CoverageQuality: CaseIterable {
    case limited
    case good
    case excellent

    var label: String {
        switch self {
        case .limited: "Limited"
        case .good: "Good"
        case .excellent: "Excellent"
        }
    }

    /// Filled-segment count (1...3).
    var level: Int {
        switch self {
        case .limited: 1
        case .good: 2
        case .excellent: 3
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .limited: return theme.coral
        case .good: return theme.sun
        case .excellent: return theme.moss
        }
    }
}

/// How heavily an option drains the battery.
enum BatteryImpact: CaseIterable {
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
        case .low: return theme.moss
        case .medium: return theme.sun
        case .high: return theme.coral
        }
    }
}

/// A single, presentation-only connectivity entry.
struct ConnectivityItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var bestOption: String
    var estimatedCost: String
    var setupDifficulty: SetupDifficulty
    var whereToBuy: String
    var activationSteps: [String]
    var paymentMethods: [String]
    /// Mobile-signal coverage; `nil` for app-based options where it doesn't apply.
    var coverage: CoverageQuality?
    var worksOffline: Bool
    var batteryImpact: BatteryImpact
    var suitability: String
    var expertTip: String
    var commonMistakes: [String]
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        bestOption: String,
        estimatedCost: String,
        setupDifficulty: SetupDifficulty,
        whereToBuy: String,
        activationSteps: [String],
        paymentMethods: [String],
        coverage: CoverageQuality? = nil,
        worksOffline: Bool,
        batteryImpact: BatteryImpact,
        suitability: String,
        expertTip: String,
        commonMistakes: [String],
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.bestOption = bestOption
        self.estimatedCost = estimatedCost
        self.setupDifficulty = setupDifficulty
        self.whereToBuy = whereToBuy
        self.activationSteps = activationSteps
        self.paymentMethods = paymentMethods
        self.coverage = coverage
        self.worksOffline = worksOffline
        self.batteryImpact = batteryImpact
        self.suitability = suitability
        self.expertTip = expertTip
        self.commonMistakes = commonMistakes
        self.accent = accent
    }

    var accessibilityText: String {
        var parts = [
            category,
            "best option \(bestOption)",
            "cost \(estimatedCost)",
            setupDifficulty.label,
            "where to buy \(whereToBuy)",
            "activation: \(activationSteps.joined(separator: "; "))",
            "payment \(paymentMethods.joined(separator: ", "))"
        ]
        if let coverage { parts.append("coverage \(coverage.label)") }
        parts.append(worksOffline ? "works offline" : "needs signal")
        parts.append("battery impact \(batteryImpact.label)")
        parts.append("best for \(suitability)")
        parts.append("tip \(expertTip)")
        parts.append("common mistakes: \(commonMistakes.joined(separator: "; "))")
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerConnectivityGuide`.
enum ConnectivityGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only connectivity guide.
struct ExplorerConnectivityGuide: View {
    var items: [ConnectivityItem]
    var layout: ConnectivityGuideLayout = .expanded
    var title: String? = "Staying connected"
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
                    ConnectivityCard(item: item, startsExpanded: index == 0)
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
                            subtitle: item.bestOption,
                            trailing: item.estimatedCost
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
        items.count == 1 ? "1 option" : "\(items.count) options"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "wifi.slash")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No connectivity options listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Connectivity card

/// A premium expandable GlassCard for one connectivity option: a summary
/// (category, best option, cost) that expands to reveal the full detail set. The
/// whole card is a single VoiceOver element, and all motion is disabled under
/// Reduce Motion.
private struct ConnectivityCard: View {
    let item: ConnectivityItem
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
                Text(item.bestOption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                Text(item.estimatedCost)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xxs)
                    .background(.thinMaterial, in: Capsule())
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

            if let coverage = item.coverage {
                coverageMeter(coverage)
            }

            detailRow(icon: "cart.fill", label: "Where to buy", value: item.whereToBuy)

            labeledList("Activation steps", item.activationSteps, icon: "arrow.right.circle.fill", tint: item.accent)

            labeledChips("Payment", item.paymentMethods)

            detailRow(icon: "person.fill.checkmark", label: "Best for", value: item.suitability)

            labeledList("Common mistakes", item.commonMistakes, icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.coral)

            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, label: "Expert tip", text: item.expertTip)
        }
    }

    // MARK: Pieces

    private var badgeRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                pillBadge(icon: "wrench.and.screwdriver.fill", text: item.setupDifficulty.label, tint: item.setupDifficulty.accent)
                pillBadge(icon: "battery.50", text: "Battery: \(item.batteryImpact.label)", tint: item.batteryImpact.accent)
                pillBadge(
                    icon: item.worksOffline ? "wifi.slash" : "wifi",
                    text: item.worksOffline ? "Works offline" : "Needs signal",
                    tint: item.worksOffline ? TravelTheme.current.moss : Color.secondary
                )
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

    private func coverageMeter(_ coverage: CoverageQuality) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text("Coverage")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            HStack(spacing: TravelSpacing.xxs) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index < coverage.level ? coverage.accent : Color.secondary.opacity(0.22))
                        .frame(width: 16, height: 5)
                }
                Text(coverage.label)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
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
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: icon)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(tint)
                        Text(item)
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
struct ExplorerConnectivityGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Staying connected in Indonesia (Bali, Lombok, the islands).
    private static let options: [ConnectivityItem] = [
        ConnectivityItem(
            category: "Airport SIM cards", icon: "simcard.fill",
            bestOption: "Telkomsel counter at DPS arrivals",
            estimatedCost: "Rp 150–250k", setupDifficulty: .easy,
            whereToBuy: "Official operator counters in the arrivals hall",
            activationSteps: ["Show your passport for registration", "Pick a tourist data pack", "Staff insert and test the SIM"],
            paymentMethods: ["Cash", "Card"], coverage: .excellent, worksOffline: false, batteryImpact: .medium,
            suitability: "Arrivals who want data the moment they land",
            expertTip: "Use the official operator counter, not the cheapest kiosk.",
            commonMistakes: ["Buying an unregistered SIM", "Paying airport mark-ups vs city prices"],
            accent: theme.ocean
        ),
        ConnectivityItem(
            category: "Local SIM cards", icon: "simcard",
            bestOption: "Telkomsel or XL Axiata from a town store",
            estimatedCost: "Rp 100–150k", setupDifficulty: .easy,
            whereToBuy: "Operator stores, Indomaret / Alfamart minimarkets",
            activationSteps: ["Bring your passport", "Choose a data package", "Register and activate in-store"],
            paymentMethods: ["Cash", "QRIS", "Card"], coverage: .excellent, worksOffline: false, batteryImpact: .medium,
            suitability: "Anyone staying more than a few days",
            expertTip: "City prices undercut the airport — buy once you’re settled.",
            commonMistakes: ["Letting a stall keep your passport", "Skipping passport registration"],
            accent: theme.tint
        ),
        ConnectivityItem(
            category: "eSIM providers", icon: "qrcode",
            bestOption: "Airalo or Nomad Indonesia eSIM",
            estimatedCost: "$5–20", setupDifficulty: .moderate,
            whereToBuy: "Airalo or Nomad app, before you fly",
            activationSteps: ["Install the app and buy a plan", "Scan the QR or install the eSIM", "Enable data for the eSIM line"],
            paymentMethods: ["Card", "Apple Pay", "PayPal"], coverage: .good, worksOffline: false, batteryImpact: .medium,
            suitability: "Newer phones; travellers who want to arrive connected",
            expertTip: "Install it at home on Wi-Fi so it’s live the moment you land.",
            commonMistakes: ["Buying a plan for the wrong region", "Deleting the eSIM by accident"],
            accent: theme.sky
        ),
        ConnectivityItem(
            category: "Mobile network operators", icon: "antenna.radiowaves.left.and.right",
            bestOption: "Telkomsel for the widest reach",
            estimatedCost: "Varies by pack", setupDifficulty: .easy,
            whereToBuy: "Operator stores nationwide (Telkomsel, XL, Indosat, Smartfren)",
            activationSteps: ["Pick the operator for where you’re going", "Buy a starter and data pack", "Register with your passport"],
            paymentMethods: ["Cash", "QRIS", "Card"], coverage: .excellent, worksOffline: false, batteryImpact: .medium,
            suitability: "Travellers heading off the beaten path",
            expertTip: "Telkomsel wins on the Gilis, Komodo and remote islands.",
            commonMistakes: ["Choosing on price alone where coverage is thin"],
            accent: theme.ocean
        ),
        ConnectivityItem(
            category: "Wi-Fi availability", icon: "wifi",
            bestOption: "Café, hotel and villa Wi-Fi",
            estimatedCost: "Free–included", setupDifficulty: .easy,
            whereToBuy: "Cafés, hotels and co-working spaces",
            activationSteps: ["Ask staff for the password", "Connect and run a speed check", "Switch on your VPN for public Wi-Fi"],
            paymentMethods: ["Free / with a purchase"], coverage: .good, worksOffline: false, batteryImpact: .low,
            suitability: "Light users staying in towns",
            expertTip: "Canggu and Ubub cafés have the fastest fibre on Bali.",
            commonMistakes: ["Banking on open Wi-Fi without a VPN", "Assuming island Wi-Fi is fast"],
            accent: theme.sky
        ),
        ConnectivityItem(
            category: "Pocket Wi-Fi", icon: "wifi.router.fill",
            bestOption: "Rented Mi-Fi hotspot",
            estimatedCost: "Rp 50–100k/day", setupDifficulty: .moderate,
            whereToBuy: "Airport rental desks, or pre-book online",
            activationSteps: ["Reserve and collect on arrival", "Charge it each night", "Connect several devices at once"],
            paymentMethods: ["Card", "Cash deposit"], coverage: .good, worksOffline: false, batteryImpact: .low,
            suitability: "Families and groups sharing one connection",
            expertTip: "One device keeps the whole family online.",
            commonMistakes: ["Forgetting to charge it overnight", "Losing the unit and the deposit"],
            accent: theme.moss
        ),
        ConnectivityItem(
            category: "Data packages", icon: "cellularbars",
            bestOption: "Telkomsel tourist data pack",
            estimatedCost: "Rp 100–200k for 20–50 GB", setupDifficulty: .easy,
            whereToBuy: "MyTelkomsel app, stores and minimarkets",
            activationSteps: ["Open the operator app", "Buy a data package", "Confirm it’s active"],
            paymentMethods: ["Pulsa credit", "QRIS", "Card"], coverage: .excellent, worksOffline: false, batteryImpact: .medium,
            suitability: "Everyone with a local SIM or eSIM",
            expertTip: "Tourist packs give far more GB than default pay-as-you-go rates.",
            commonMistakes: ["Burning credit at default rates", "Buying too little data"],
            accent: theme.tint
        ),
        ConnectivityItem(
            category: "International roaming", icon: "globe",
            bestOption: "Home carrier travel pass",
            estimatedCost: "$10–15/day", setupDifficulty: .easy,
            whereToBuy: "Your home carrier, before you travel",
            activationSteps: ["Enable roaming and a travel pass", "Check the daily cap", "Turn off data on Wi-Fi to save"],
            paymentMethods: ["Home phone bill"], coverage: .good, worksOffline: false, batteryImpact: .high,
            suitability: "Short trips where convenience beats cost",
            expertTip: "Great for a weekend, costly for weeks — switch to a local SIM/eSIM.",
            commonMistakes: ["Roaming for weeks with no pass", "Bill shock from background data"],
            accent: theme.coral
        ),
        ConnectivityItem(
            category: "Offline maps", icon: "map.fill",
            bestOption: "Google Maps offline + Maps.me",
            estimatedCost: "Free", setupDifficulty: .easy,
            whereToBuy: "Google Maps or Maps.me app",
            activationSteps: ["Download the area while on Wi-Fi", "Star key places", "Test navigation in airplane mode"],
            paymentMethods: ["Free"], coverage: nil, worksOffline: true, batteryImpact: .medium,
            suitability: "Everyone, especially in remote areas",
            expertTip: "Download Bali, Lombok and the Gilis before you leave Wi-Fi.",
            commonMistakes: ["Forgetting to download before losing signal", "Not saving your hotel pin"],
            accent: theme.moss
        ),
        ConnectivityItem(
            category: "Translation apps", icon: "character.bubble.fill",
            bestOption: "Google Translate (offline Indonesian)",
            estimatedCost: "Free", setupDifficulty: .easy,
            whereToBuy: "Google Translate app",
            activationSteps: ["Download the Indonesian language pack", "Enable camera and conversation modes", "Test it offline"],
            paymentMethods: ["Free"], coverage: nil, worksOffline: true, batteryImpact: .low,
            suitability: "Everyone",
            expertTip: "Download the offline Indonesian pack before you fly.",
            commonMistakes: ["Relying on data-only translation", "Skipping the offline pack"],
            accent: theme.sky
        ),
        ConnectivityItem(
            category: "VPN recommendations", icon: "lock.shield.fill",
            bestOption: "A reputable paid VPN",
            estimatedCost: "$3–12/month", setupDifficulty: .moderate,
            whereToBuy: "Your VPN provider’s app — subscribe before travel",
            activationSteps: ["Subscribe and install at home", "Sign in and choose a server", "Connect on any public Wi-Fi"],
            paymentMethods: ["Card", "Apple Pay", "PayPal"], coverage: nil, worksOffline: false, batteryImpact: .medium,
            suitability: "Anyone on public Wi-Fi or using geo-blocked services",
            expertTip: "Set it up at home — some VPN sites are awkward to reach abroad.",
            commonMistakes: ["Trusting free VPNs with your data", "Installing only after you arrive"],
            accent: theme.ocean
        ),
        ConnectivityItem(
            category: "Emergency offline preparation", icon: "powerplug.fill",
            bestOption: "Offline kit: maps, documents, contacts",
            estimatedCost: "Free", setupDifficulty: .easy,
            whereToBuy: "Your own phone, before travelling",
            activationSteps: ["Save offline maps and translation packs", "Store passport and insurance photos offline", "Note 112 and your embassy number"],
            paymentMethods: ["Free"], coverage: nil, worksOffline: true, batteryImpact: .low,
            suitability: "Every traveller",
            expertTip: "Carry a charged power bank and a printed backup of key documents.",
            commonMistakes: ["Storing everything only in the cloud", "Travelling without a power bank"],
            accent: theme.sun
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Stay connected (tap to expand)").font(TravelTypography.section)
                    ExplorerConnectivityGuide(
                        items: optionsPreview,
                        subtitle: "SIMs, eSIMs, Wi-Fi and offline prep for Bali, Lombok & the islands."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerConnectivityGuide(items: [], title: "Staying connected")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Connectivity · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerConnectivityGuide(
                        items: optionsPreview,
                        layout: .compact,
                        title: "Staying connected"
                    )

                    Text("Compact · Get online fast").font(TravelTypography.section)
                    ExplorerConnectivityGuide(
                        items: Array(optionsPreview.prefix(4)),
                        layout: .compact,
                        title: "Get online fast"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Connectivity · Compact")

            ScrollView {
                ExplorerConnectivityGuide(items: Array(optionsPreview.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Connectivity · Dynamic Type XL")
        }
    }

    /// Alias so the previews read clearly.
    private static var optionsPreview: [ConnectivityItem] { options }
}
#endif
