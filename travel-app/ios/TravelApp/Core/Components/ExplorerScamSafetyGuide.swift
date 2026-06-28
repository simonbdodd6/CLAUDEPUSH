import SwiftUI

// MARK: - Explorer scam & safety guide (Phase 88)
//
// A reusable, presentation-only safety guide that teaches travellers how to spot
// and avoid the most common scams and stay safe. Each entry carries a warning
// level, how the scam works, likelihood, where it's common, warning signs, how to
// avoid it, what to do if it happens, emergency advice, trusted alternatives and
// an expert tip. Entries are colour-coded by warning level (green → amber → red).
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

/// The seriousness of a scam — drives the colour coding.
enum ScamSeverity: CaseIterable {
    case low
    case medium
    case high

    var label: String {
        switch self {
        case .low: "Low risk"
        case .medium: "Caution"
        case .high: "High risk"
        }
    }

    var icon: String {
        switch self {
        case .low: "exclamationmark.circle.fill"
        case .medium: "exclamationmark.triangle.fill"
        case .high: "exclamationmark.octagon.fill"
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

/// How often a scam is encountered — shown as a three-segment meter.
enum ScamLikelihood: CaseIterable {
    case rare
    case occasional
    case common

    var label: String {
        switch self {
        case .rare: "Rare"
        case .occasional: "Occasional"
        case .common: "Common"
        }
    }

    /// Filled-segment count (1...3).
    var level: Int {
        switch self {
        case .rare: 1
        case .occasional: 2
        case .common: 3
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .rare: return theme.moss
        case .occasional: return theme.sun
        case .common: return theme.coral
        }
    }
}

/// A single, presentation-only scam / safety entry.
struct ScamItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var severity: ScamSeverity
    var likelihood: ScamLikelihood
    var howItWorks: String
    var locations: [String]
    var warningSigns: [String]
    var howToAvoid: String
    var ifItHappens: String
    var emergencyAdvice: String
    var trustedAlternatives: [String]
    var expertTip: String

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        severity: ScamSeverity,
        likelihood: ScamLikelihood,
        howItWorks: String,
        locations: [String],
        warningSigns: [String],
        howToAvoid: String,
        ifItHappens: String,
        emergencyAdvice: String,
        trustedAlternatives: [String],
        expertTip: String
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.severity = severity
        self.likelihood = likelihood
        self.howItWorks = howItWorks
        self.locations = locations
        self.warningSigns = warningSigns
        self.howToAvoid = howToAvoid
        self.ifItHappens = ifItHappens
        self.emergencyAdvice = emergencyAdvice
        self.trustedAlternatives = trustedAlternatives
        self.expertTip = expertTip
    }

    /// Colour-coded by severity.
    var accent: Color { severity.accent }

    var accessibilityText: String {
        [
            category,
            severity.label,
            "\(likelihood.label) likelihood",
            "how it works: \(howItWorks)",
            "common in \(locations.joined(separator: ", "))",
            "warning signs: \(warningSigns.joined(separator: "; "))",
            "how to avoid: \(howToAvoid)",
            "if it happens: \(ifItHappens)",
            "emergency: \(emergencyAdvice)",
            "trusted alternatives \(trustedAlternatives.joined(separator: ", "))",
            "tip: \(expertTip)"
        ].joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerScamSafetyGuide`.
enum ScamSafetyLayout {
    case compact
    case expanded
}

/// A premium, presentation-only scam & safety guide.
struct ExplorerScamSafetyGuide: View {
    var items: [ScamItem]
    var layout: ScamSafetyLayout = .expanded
    var title: String? = "Scams & safety"
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
                    ScamCard(item: item, startsExpanded: index == 0)
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
                            subtitle: "\(item.likelihood.label) · seen in \(item.locations.first ?? "many areas")",
                            trailing: item.severity.label
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
        items.count == 1 ? "1 entry" : "\(items.count) entries"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "checkmark.shield")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No scam or safety notes listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Scam card

/// A premium expandable GlassCard for one scam entry: a summary (category,
/// severity, likelihood) that expands to reveal the full detail set. The whole
/// card is a single VoiceOver element, and all motion is disabled under Reduce
/// Motion.
private struct ScamCard: View {
    let item: ScamItem
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
                Text("\(item.likelihood.label) · \(item.locations.first ?? "many areas")")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                severityBadge
                Image(systemName: "chevron.down")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
            }
        }
    }

    private var detail: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            likelihoodMeter

            calloutRow(icon: "theatermasks.fill", tint: item.accent, label: "How it works", text: item.howItWorks)

            labeledChips("Common in", item.locations, accent: item.accent)

            labeledList("Warning signs", item.warningSigns)

            calloutRow(icon: "shield.lefthalf.filled", tint: TravelTheme.current.moss, label: "How to avoid", text: item.howToAvoid)

            detailRow(icon: "exclamationmark.bubble.fill", label: "If it happens", value: item.ifItHappens)

            calloutRow(icon: "cross.case.fill", tint: TravelTheme.current.coral, label: "Emergency", text: item.emergencyAdvice)

            labeledChips("Trusted alternatives", item.trustedAlternatives, accent: nil)

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

    private var severityBadge: some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: item.severity.icon)
            Text(item.severity.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(item.severity.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private var likelihoodMeter: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text("Likelihood")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            HStack(spacing: TravelSpacing.xxs) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index < item.likelihood.level ? item.likelihood.accent : Color.secondary.opacity(0.22))
                        .frame(width: 16, height: 5)
                }
                Text(item.likelihood.label)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
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

    private func labeledChips(_ label: String, _ items: [String], accent: Color?) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(items, id: \.self) { item in
                        chip(item, accent: accent)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func chip(_ text: String, accent: Color?) -> some View {
        if let accent {
            Text(text)
                .font(TravelTypography.caption)
                .foregroundStyle(accent)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xxs)
                .background(accent.opacity(0.15), in: Capsule())
        } else {
            Text(text)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xxs)
                .background(.thinMaterial, in: Capsule())
        }
    }

    private func labeledList(_ label: String, _ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                ForEach(items, id: \.self) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.xs) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(TravelTheme.current.sun)
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
struct ExplorerScamSafetyGuide_Previews: PreviewProvider {

    /// Common scams and safety advice across Bali, Lombok and the islands.
    private static let scams: [ScamItem] = [
        ScamItem(
            category: "Taxi scams", icon: "car.fill", severity: .high, likelihood: .common,
            howItWorks: "Unmetered taxis or rigged meters quote a fixed, inflated fare and refuse the meter.",
            locations: ["Airports", "Kuta", "Tourist strips"],
            warningSigns: ["Driver refuses the meter", "No company logo or ID", "‘Special price’ quoted upfront"],
            howToAvoid: "Use Blue Bird, the My Blue Bird app, or Grab/Gojek for fixed fares.",
            ifItHappens: "Pay what the meter shows, note the plate, and leave; dispute via the app if booked.",
            emergencyAdvice: "Tourist police 112; report persistent overcharging to the taxi company.",
            trustedAlternatives: ["Blue Bird", "Grab", "Gojek"],
            expertTip: "Screenshot the app’s fare estimate before you ride."
        ),
        ScamItem(
            category: "Fake ticket sellers", icon: "ticket.fill", severity: .high, likelihood: .common,
            howItWorks: "Touts near harbours and attractions sell fake or overpriced ferry and event tickets.",
            locations: ["Padang Bai harbour", "Bangsal", "Gili jetties"],
            warningSigns: ["Selling away from official counters", "Cash-only, no receipt", "‘Buy now, boat leaving’ pressure"],
            howToAvoid: "Buy only at the official operator counter or via a reputable site/agent.",
            ifItHappens: "Go to the official office; a fake ticket won’t scan — keep any receipt.",
            emergencyAdvice: "Harbour office staff and tourist police 112 can intervene.",
            trustedAlternatives: ["Operator counters", "Eka Jaya", "BlueWater Express"],
            expertTip: "Real fast-boat tickets come from a manned desk with a manifest."
        ),
        ScamItem(
            category: "ATM scams", icon: "creditcard.fill", severity: .high, likelihood: .occasional,
            howItWorks: "Skimmers and hidden cameras capture your card and PIN, or the machine ‘eats’ the card.",
            locations: ["Standalone street ATMs", "Convenience stores"],
            warningSigns: ["Loose card slot or keypad", "Pinhole above the keypad", "No bank branding"],
            howToAvoid: "Use ATMs inside bank branches and cover the keypad as you type.",
            ifItHappens: "Freeze the card in your banking app immediately and report it.",
            emergencyAdvice: "Call your bank’s 24-hour line; file a police report for insurance.",
            trustedAlternatives: ["In-branch bank ATMs (BCA, Mandiri)"],
            expertTip: "Set low daily withdrawal limits and card alerts before you travel."
        ),
        ScamItem(
            category: "Currency exchange", icon: "banknote.fill", severity: .medium, likelihood: .common,
            howItWorks: "Backstreet ‘no commission’ changers short-count cash with sleight of hand.",
            locations: ["Kuta", "Legian", "Side-street kiosks"],
            warningSigns: ["Rates too good to be true", "Calculator tricks and fast re-counting", "Tucked-away kiosks"],
            howToAvoid: "Use authorised money changers (PVA) or withdraw from bank ATMs.",
            ifItHappens: "Count fully before leaving the counter; don’t hand the money back.",
            emergencyAdvice: "Tourist police 112 if you’re short-changed and refused.",
            trustedAlternatives: ["PT Central Kuta", "Authorised PVA changers"],
            expertTip: "Count the cash yourself, in full, before passing your money over."
        ),
        ScamItem(
            category: "Fake tour operators", icon: "map.fill", severity: .high, likelihood: .occasional,
            howItWorks: "Unlicensed ‘agents’ take payment for tours or treks that don’t exist or are unsafe.",
            locations: ["Beachfront touts", "Cheap online ads", "Rinjani trek sellers"],
            warningSigns: ["Deep discounts with a cash deposit upfront", "No office or licence", "Vague itinerary"],
            howToAvoid: "Book reviewed operators via Klook/GetYourGuide or your hotel desk.",
            ifItHappens: "Dispute the card charge; report unlicensed Rinjani guides to the park office.",
            emergencyAdvice: "Tourist police 112; park authority for trek-safety issues.",
            trustedAlternatives: ["Klook", "GetYourGuide", "Licensed trek operators"],
            expertTip: "For Rinjani, only licensed operators are insured and permitted."
        ),
        ScamItem(
            category: "SIM card scams", icon: "simcard.fill", severity: .medium, likelihood: .occasional,
            howItWorks: "Airport and street stalls overcharge or sell pre-used SIMs with little credit.",
            locations: ["Airport arrivals", "Tourist-strip stalls"],
            warningSigns: ["Price far above Rp 100–150k", "SIM already opened", "Won’t register your passport"],
            howToAvoid: "Buy Telkomsel/XL at an official counter; they register it to your passport.",
            ifItHappens: "Ask for a working replacement or refund at an official store.",
            emergencyAdvice: "Official operator-store staff resolve registration issues.",
            trustedAlternatives: ["Official Telkomsel store", "XL counter"],
            expertTip: "Official SIMs are registered to your passport — insist on it."
        ),
        ScamItem(
            category: "Scooter rental damage scams", icon: "scooter", severity: .high, likelihood: .common,
            howItWorks: "On return, the shop claims pre-existing scratches and demands costly ‘repairs’.",
            locations: ["Tourist-area rentals", "Stalls taking passports as deposit"],
            warningSigns: ["Wants your passport as deposit", "No rental contract", "Reluctant to note existing damage"],
            howToAvoid: "Rent from reviewed shops and photograph/video the bike before riding.",
            ifItHappens: "Show your timestamped photos; refuse to pay for pre-existing damage.",
            emergencyAdvice: "Tourist police 112; never let them keep your passport.",
            trustedAlternatives: ["Reviewed rental shops", "Hotel-arranged rentals"],
            expertTip: "Pay a cash deposit, never your passport, and film a walk-around."
        ),
        ScamItem(
            category: "Temple donation scams", icon: "building.columns.fill", severity: .low, likelihood: .common,
            howItWorks: "Fake ‘guides’ or donation books pressure inflated cash ‘donations’ at temples.",
            locations: ["Popular temples", "Sarong-rental entrances"],
            warningSigns: ["A ledger showing huge ‘donations’", "Pushy unofficial guide", "No official ticket booth"],
            howToAvoid: "Pay the posted entrance fee at the official booth; donations are optional.",
            ifItHappens: "Politely decline and walk on; you owe only the posted fee.",
            emergencyAdvice: "Staff at the official counter can confirm the real fees.",
            trustedAlternatives: ["Official ticket counter"],
            expertTip: "Entrance and sarong fees are fixed and posted — anything else is optional."
        ),
        ScamItem(
            category: "Bag theft", icon: "bag.fill", severity: .medium, likelihood: .occasional,
            howItWorks: "Bag-snatching from passing scooters, or grabs from café chairs and scooter baskets.",
            locations: ["Busy streets", "Cafés", "Scooter baskets"],
            warningSigns: ["Bag in an open scooter basket", "Phone or bag on the table edge", "Distraction by a stranger"],
            howToAvoid: "Wear bags cross-body away from the road; never leave valuables in baskets.",
            ifItHappens: "Don’t resist a snatch; report to police for an insurance file.",
            emergencyAdvice: "Police 110; tourist police 112; freeze cards and phone remotely.",
            trustedAlternatives: ["Hotel safe for valuables"],
            expertTip: "Carry a daily minimum and leave the rest in the hotel safe."
        ),
        ScamItem(
            category: "Beach theft", icon: "beach.umbrella.fill", severity: .medium, likelihood: .common,
            howItWorks: "Valuables left on the sand are taken while you swim or surf.",
            locations: ["Popular beaches", "Surf breaks"],
            warningSigns: ["Crowded beach with unattended bags", "People loitering near belongings"],
            howToAvoid: "Take only what you need; use a waterproof pouch or a buddy system.",
            ifItHappens: "Report to lifeguards and police; freeze cards and phone immediately.",
            emergencyAdvice: "Lifeguard post; police 110; tourist police 112.",
            trustedAlternatives: ["Hotel safe", "Waterproof neck pouch"],
            expertTip: "Surfing? Hide a spare key and leave everything else behind."
        ),
        ScamItem(
            category: "Card skimming", icon: "creditcard.circle.fill", severity: .high, likelihood: .occasional,
            howItWorks: "Dishonest staff or rigged terminals clone your card during payment.",
            locations: ["Small bars", "Some shops", "Non-bank ATMs"],
            warningSigns: ["Card taken out of sight", "Terminal looks tampered with", "Odd small ‘test’ charges"],
            howToAvoid: "Keep your card in sight; prefer GoPay/OVO or cash for small spends.",
            ifItHappens: "Freeze the card instantly and dispute any unknown charges.",
            emergencyAdvice: "Bank 24-hour line; police report for the claim.",
            trustedAlternatives: ["GoPay", "OVO", "Cash for small purchases"],
            expertTip: "Use a low-limit travel card with instant transaction alerts."
        ),
        ScamItem(
            category: "Fake police", icon: "exclamationmark.shield.fill", severity: .high, likelihood: .rare,
            howItWorks: "Impostors in ‘uniform’ demand on-the-spot ‘fines’ for invented offences.",
            locations: ["Quiet roads", "Tourist areas, often targeting scooters"],
            warningSigns: ["Demands cash now", "No station and no paperwork", "Won’t show proper ID"],
            howToAvoid: "Ask for ID and to settle any fine at the police station, not roadside.",
            ifItHappens: "Stay calm, don’t hand over your wallet, and offer to go to the station.",
            emergencyAdvice: "Genuine tourist police: 112; note any vehicle or badge details.",
            trustedAlternatives: ["Official police station"],
            expertTip: "Real fines are processed at a station with paperwork — never roadside cash."
        ),
        ScamItem(
            category: "Nightlife scams", icon: "wineglass.fill", severity: .medium, likelihood: .occasional,
            howItWorks: "Inflated bar tabs, spiked drinks, or ‘friendly’ locals running up your bill.",
            locations: ["Kuta nightlife", "Some bars and clubs"],
            warningSigns: ["Open tab with no prices", "A drink left unattended", "Over-friendly strangers ordering rounds"],
            howToAvoid: "Pay per round, watch your drink, and check prices before ordering.",
            ifItHappens: "Ask for an itemised bill; pay only for what you ordered.",
            emergencyAdvice: "Tourist police 112; tell a friend your plans and location.",
            trustedAlternatives: ["Reputable venues with posted menus"],
            expertTip: "Pay as you go rather than running an open tab."
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Stay safe (tap to expand)").font(TravelTypography.section)
                    ExplorerScamSafetyGuide(
                        items: scams,
                        subtitle: "The scams to know — and exactly how to handle them — in Indonesia."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerScamSafetyGuide(items: [], title: "Scams & safety")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Scam & safety · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerScamSafetyGuide(
                        items: scams,
                        layout: .compact,
                        title: "Scams & safety"
                    )

                    Text("Compact · Top risks").font(TravelTypography.section)
                    ExplorerScamSafetyGuide(
                        items: scams.filter { $0.severity == .high },
                        layout: .compact,
                        title: "Highest-risk scams"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Scam & safety · Compact")

            ScrollView {
                ExplorerScamSafetyGuide(items: Array(scams.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Scam & safety · Dynamic Type XL")
        }
    }
}
#endif
