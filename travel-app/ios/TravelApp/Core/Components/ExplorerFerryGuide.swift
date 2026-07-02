import SwiftUI

// MARK: - Explorer ferry guide (Phase 87)
//
// A reusable, presentation-only ferry-intelligence guide — a flagship Travel
// Intelligence feature that helps travellers move confidently between islands.
// Each route carries its ports, operator, official booking recommendation and
// trusted websites, price, duration, frequency, luggage allowance, check-in
// advice, sea-condition and rainy-season notes, cancellation flexibility, payment
// methods, family friendliness, accessibility notes, an expert tip and a common-
// scam warning.
//
// It reuses the existing design system exclusively — `GlassCard`, `PremiumPillRow`
// (the compact summary rows), the `CancellationFlexibility` indicator (shared with
// the booking guide) and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are caller-
// supplied mock data; the component holds no data, networking, persistence,
// view-model, repository, navigation, AppContainer or DTO usage, and is not wired
// into any screen.
//
// Accessibility: every route card exposes one combined VoiceOver label covering
// the full detail set; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion (appearance + expand)
// is disabled under Reduce Motion.

/// How suitable a route is for travelling with children.
enum FamilyFriendliness: CaseIterable {
    case limited
    case good
    case excellent

    var label: String {
        switch self {
        case .limited: "Limited for kids"
        case .good: "Family OK"
        case .excellent: "Great for families"
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

/// A single, presentation-only ferry route.
struct FerryRoute: Identifiable {
    let id: String
    var departurePort: String
    var arrivalPort: String
    var operatorName: String
    var officialBooking: String
    var bookingWebsites: [String]
    var averagePrice: String
    var duration: String
    var frequency: String
    var luggageAllowance: String
    var checkIn: String
    var seaConditions: String
    var rainySeasonNote: String
    var cancellation: CancellationFlexibility
    var paymentMethods: [String]
    var familyFriendliness: FamilyFriendliness
    var accessibilityNote: String
    var expertTip: String
    var commonScam: String?
    var accent: Color

    /// `id` defaults to "departure → arrival", matching the codebase's
    /// deterministic conventions (no `UUID()`).
    init(
        id: String? = nil,
        departurePort: String,
        arrivalPort: String,
        operatorName: String,
        officialBooking: String,
        bookingWebsites: [String],
        averagePrice: String,
        duration: String,
        frequency: String,
        luggageAllowance: String,
        checkIn: String,
        seaConditions: String,
        rainySeasonNote: String,
        cancellation: CancellationFlexibility,
        paymentMethods: [String],
        familyFriendliness: FamilyFriendliness,
        accessibilityNote: String,
        expertTip: String,
        commonScam: String? = nil,
        accent: Color = TravelTheme.current.ocean
    ) {
        self.id = id ?? "\(departurePort) → \(arrivalPort)"
        self.departurePort = departurePort
        self.arrivalPort = arrivalPort
        self.operatorName = operatorName
        self.officialBooking = officialBooking
        self.bookingWebsites = bookingWebsites
        self.averagePrice = averagePrice
        self.duration = duration
        self.frequency = frequency
        self.luggageAllowance = luggageAllowance
        self.checkIn = checkIn
        self.seaConditions = seaConditions
        self.rainySeasonNote = rainySeasonNote
        self.cancellation = cancellation
        self.paymentMethods = paymentMethods
        self.familyFriendliness = familyFriendliness
        self.accessibilityNote = accessibilityNote
        self.expertTip = expertTip
        self.commonScam = commonScam
        self.accent = accent
    }

    var route: String { "\(departurePort) → \(arrivalPort)" }

    var accessibilityText: String {
        var parts = [
            "Ferry \(route)",
            "operator \(operatorName)",
            "official booking \(officialBooking)",
            "trusted websites \(bookingWebsites.joined(separator: ", "))",
            "average price \(averagePrice)",
            "duration \(duration)",
            "frequency \(frequency)",
            "luggage \(luggageAllowance)",
            "check-in \(checkIn)",
            "sea conditions \(seaConditions)",
            "rainy season \(rainySeasonNote)",
            "\(cancellation.label) cancellation",
            "payment \(paymentMethods.joined(separator: ", "))",
            familyFriendliness.label,
            "accessibility \(accessibilityNote)",
            "tip \(expertTip)"
        ]
        if let commonScam { parts.append("common scam \(commonScam)") }
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerFerryGuide`.
enum FerryGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only ferry-intelligence guide.
struct ExplorerFerryGuide: View {
    var routes: [FerryRoute]
    var layout: FerryGuideLayout = .expanded
    var title: String? = "Ferry guide"
    var subtitle: String? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        Group {
            if routes.isEmpty {
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
                ForEach(Array(routes.enumerated()), id: \.element.id) { index, route in
                    FerryRouteCard(route: route, startsExpanded: index == 0)
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
                    ForEach(Array(routes.enumerated()), id: \.element.id) { index, route in
                        PremiumPillRow(
                            symbol: "ferry.fill",
                            accent: route.accent,
                            title: route.route,
                            subtitle: "via \(route.operatorName) · \(route.duration)",
                            trailing: route.averagePrice
                        )
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)
                        .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(route.accessibilityText)
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
        routes.count == 1 ? "1 route" : "\(routes.count) routes"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "ferry")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No ferry routes listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Ferry route card

/// A premium expandable GlassCard for one ferry route: a summary (route,
/// operator, duration, price) that expands on tap to reveal the full detail set.
/// The whole card is a single VoiceOver element carrying the complete label, and
/// all motion is disabled under Reduce Motion.
private struct FerryRouteCard: View {
    let route: FerryRoute
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
        .accessibilityLabel(route.accessibilityText)
        .accessibilityHint(expanded ? "Showing details" : "Double tap to show details")
    }

    private var summary: some View {
        HStack(spacing: TravelSpacing.md) {
            medallion

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(route.route)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text("via \(route.operatorName) · \(route.duration)")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                Text(route.averagePrice)
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
            Group {
                detailRow(icon: "clock", label: "Duration", value: route.duration)
                detailRow(icon: "calendar", label: "Frequency", value: route.frequency)
                detailRow(icon: "checkmark.seal.fill", label: "Official booking", value: route.officialBooking)

                labeledChips("Trusted websites", route.bookingWebsites, accent: route.accent)

                detailRow(icon: "suitcase.fill", label: "Luggage", value: route.luggageAllowance)
                detailRow(icon: "clock.arrow.circlepath", label: "Check-in", value: route.checkIn)

                labeledChips("Payment", route.paymentMethods, accent: nil)
            }

            Group {
                HStack(spacing: TravelSpacing.md) {
                    cancellationChip(route.cancellation)
                    familyBadge(route.familyFriendliness)
                    Spacer(minLength: 0)
                }

                detailRow(icon: "figure.roll", label: "Accessibility", value: route.accessibilityNote)

                calloutRow(icon: "water.waves", tint: TravelTheme.current.sky, text: route.seaConditions)
                calloutRow(icon: "cloud.rain.fill", tint: TravelTheme.current.ocean, text: route.rainySeasonNote)
                if let scam = route.commonScam {
                    calloutRow(icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.coral, text: scam)
                }
                calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, text: route.expertTip)
            }
        }
    }

    // MARK: Pieces

    private var medallion: some View {
        Image(systemName: "ferry.fill")
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(
                    colors: [route.accent, route.accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: route.accent.opacity(0.3), radius: 8, y: 4)
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

    private func cancellationChip(_ cancellation: CancellationFlexibility) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "arrow.uturn.backward")
            Text("\(cancellation.label) cancellation")
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(cancellation.accent)
    }

    private func familyBadge(_ family: FamilyFriendliness) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "person.2.fill")
            Text(family.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(family.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(family.accent.opacity(0.15), in: Capsule())
    }

    private func calloutRow(icon: String, tint: Color, text: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(tint)
            Text(text)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

#if DEBUG
struct ExplorerFerryGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Inter-island ferry routes across Bali, Lombok, the Gilis, the Nusa islands
    /// and Flores (Labuan Bajo).
    private static let routes: [FerryRoute] = [
        FerryRoute(
            departurePort: "Padang Bai", arrivalPort: "Gili Trawangan",
            operatorName: "Eka Jaya",
            officialBooking: "Book direct on the operator’s site or a trusted agent",
            bookingWebsites: ["ekajayafastboat.com", "Bookaway", "12Go Asia"],
            averagePrice: "Rp 350k", duration: "1.5–2 hrs", frequency: "≈ 6 daily",
            luggageAllowance: "1 large bag + 1 cabin bag included",
            checkIn: "Arrive 45–60 min before departure",
            seaConditions: "Open-water crossing — can be choppy midday; sit mid-ship if prone to seasickness.",
            rainySeasonNote: "Nov–Mar swells occasionally cancel afternoon sailings; take the morning boat.",
            cancellation: .moderate,
            paymentMethods: ["Cash", "Card", "GoPay"],
            familyFriendliness: .good,
            accessibilityNote: "Beach-launch boarding at the Gilis; not wheelchair accessible.",
            expertTip: "The first morning departure is the calmest and least crowded.",
            commonScam: "Touts on the beach reselling tickets for ‘full’ boats — buy from the operator desk.",
            accent: theme.ocean
        ),
        FerryRoute(
            departurePort: "Padang Bai", arrivalPort: "Gili Air",
            operatorName: "BlueWater Express",
            officialBooking: "Book on bluewater-express.com",
            bookingWebsites: ["bluewater-express.com", "Bookaway"],
            averagePrice: "Rp 400k", duration: "≈ 2 hrs", frequency: "3–4 daily",
            luggageAllowance: "1 checked bag up to 20 kg + hand luggage",
            checkIn: "Check in 60 min before; bags tagged at the desk",
            seaConditions: "Slightly longer crossing than Gili T; generally calm in the morning.",
            rainySeasonNote: "Wet-season afternoons can be rough — prefer the 08:30 sailing.",
            cancellation: .flexible,
            paymentMethods: ["Cash", "Card"],
            familyFriendliness: .excellent,
            accessibilityNote: "Staff assist with boarding; no step-free access on the sand.",
            expertTip: "Gili Air is the calmest Gili for families — this route lands you right there.",
            accent: theme.sky
        ),
        FerryRoute(
            departurePort: "Padang Bai", arrivalPort: "Bangsal (Lombok)",
            operatorName: "Gili Getaway",
            officialBooking: "Book direct; confirm the Lombok transfer is included",
            bookingWebsites: ["giligetaway.com", "12Go Asia"],
            averagePrice: "Rp 450k", duration: "2–2.5 hrs", frequency: "2 daily",
            luggageAllowance: "1 large bag + 1 small bag",
            checkIn: "Arrive 60 min ahead; manifest checked",
            seaConditions: "Crosses the Lombok Strait — the most exposed of these routes.",
            rainySeasonNote: "Dec–Feb crossings may be delayed for swell; build in a buffer day.",
            cancellation: .moderate,
            paymentMethods: ["Cash", "Card", "Bank transfer"],
            familyFriendliness: .good,
            accessibilityNote: "Bangsal harbour is busy and uneven; assistance recommended.",
            expertTip: "Ask whether the fare includes the onward shuttle from Bangsal harbour.",
            commonScam: "Porters at Bangsal demanding inflated bag fees — agree a price first.",
            accent: theme.ocean
        ),
        FerryRoute(
            departurePort: "Sanur", arrivalPort: "Nusa Lembongan",
            operatorName: "Golden Queen",
            officialBooking: "Book at the Sanur ticket office or a reputable agent",
            bookingWebsites: ["Bookaway", "12Go Asia"],
            averagePrice: "Rp 200k", duration: "30–45 min", frequency: "Hourly daytime",
            luggageAllowance: "Generous; bags carried onto the beach",
            checkIn: "Arrive 30 min before; boards from Sanur beach",
            seaConditions: "Short hop, usually gentle; brief swell near the channel.",
            rainySeasonNote: "Reliable year-round; heavy rain may delay rather than cancel.",
            cancellation: .flexible,
            paymentMethods: ["Cash", "Card", "GoPay"],
            familyFriendliness: .excellent,
            accessibilityNote: "Wet-beach boarding from Sanur; no jetty at Lembongan.",
            expertTip: "Sit at the back to stay driest on the beach-launch boarding.",
            accent: theme.sky
        ),
        FerryRoute(
            departurePort: "Sanur", arrivalPort: "Nusa Penida (Toya Pakeh)",
            operatorName: "Golden Queen",
            officialBooking: "Buy from the official Sanur counter, not beach sellers",
            bookingWebsites: ["Bookaway", "12Go Asia"],
            averagePrice: "Rp 250k", duration: "≈ 45 min", frequency: "≈ 8 daily",
            luggageAllowance: "1 large + 1 small bag",
            checkIn: "Arrive 30–45 min before departure",
            seaConditions: "Can be lumpy crossing the Badung Strait; mornings are calmest.",
            rainySeasonNote: "Occasional wet-season cancellations; keep plans flexible.",
            cancellation: .moderate,
            paymentMethods: ["Cash", "Card"],
            familyFriendliness: .good,
            accessibilityNote: "Toya Pakeh has a jetty, but steps are steep at low tide.",
            expertTip: "Pre-arrange Penida transport — drivers swarm the jetty on arrival.",
            commonScam: "‘Official’ looking sellers on the sand charging double — use the counter.",
            accent: theme.ocean
        ),
        FerryRoute(
            departurePort: "Bangsal (Lombok)", arrivalPort: "Gili Trawangan",
            operatorName: "Local public ferry",
            officialBooking: "Buy at the Bangsal Koperasi (public ferry) office",
            bookingWebsites: ["Ticket office only (no website)"],
            averagePrice: "Rp 20k", duration: "25–45 min", frequency: "Departs when full, daytime",
            luggageAllowance: "No formal limit; load it onto the deck",
            checkIn: "No check-in; boats fill on a first-come basis",
            seaConditions: "Slow public boat; fine in calm seas, skip it when windy.",
            rainySeasonNote: "Public boats stop in rough weather — have a fast-boat backup.",
            cancellation: .strict,
            paymentMethods: ["Cash"],
            familyFriendliness: .limited,
            accessibilityNote: "Wade-aboard boarding; no accessibility provision.",
            expertTip: "The cheapest crossing by far — go early before the wind picks up.",
            commonScam: "Being told the public boat ‘isn’t running’ to upsell a private charter.",
            accent: theme.moss
        ),
        FerryRoute(
            departurePort: "Labuan Bajo", arrivalPort: "Komodo Island",
            operatorName: "Local speedboat / public ferry",
            officialBooking: "Book a licensed boat through the harbour office or a reputable tour",
            bookingWebsites: ["Klook", "GetYourGuide", "Harbour office"],
            averagePrice: "Rp 600k (shared)", duration: "≈ 1.5 hrs", frequency: "Daily, tour-dependent",
            luggageAllowance: "Day bags only; liveaboards carry more",
            checkIn: "Meet at the harbour 30 min before; park fees paid separately",
            seaConditions: "Open sea to the national park; mornings are smoothest.",
            rainySeasonNote: "Jan–Feb seas can be heavy; some operators pause — confirm the day before.",
            cancellation: .moderate,
            paymentMethods: ["Cash", "Bank transfer", "Card via agency"],
            familyFriendliness: .good,
            accessibilityNote: "Wooden jetties and boat steps; limited accessibility.",
            expertTip: "Book a licensed operator — the Komodo park ranger fee is extra and unavoidable.",
            commonScam: "Unlicensed ‘cheap’ boats skipping safety gear and park permits.",
            accent: theme.tint
        ),
        FerryRoute(
            departurePort: "Amed", arrivalPort: "Gili Trawangan",
            operatorName: "Gili Getaway",
            officialBooking: "Book direct on giligetaway.com",
            bookingWebsites: ["giligetaway.com", "Bookaway"],
            averagePrice: "Rp 300k", duration: "45 min–1 hr", frequency: "1–2 daily",
            luggageAllowance: "1 large bag + hand luggage",
            checkIn: "Arrive 45 min before; small Amed beach departure",
            seaConditions: "Short north-east crossing; calmer than the Padang Bai route.",
            rainySeasonNote: "Fewer sailings in low season — check the schedule the night before.",
            cancellation: .flexible,
            paymentMethods: ["Cash", "Card"],
            familyFriendliness: .good,
            accessibilityNote: "Beach-launch from Amed; not step-free.",
            expertTip: "The quickest hop to the Gilis if you’re already in east Bali.",
            accent: theme.sky
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Island ferries (tap to expand)").font(TravelTypography.section)
                    ExplorerFerryGuide(
                        routes: routes,
                        subtitle: "Crossing between Bali, Lombok, the Gilis, the Nusas & Flores."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerFerryGuide(routes: [], title: "Ferry guide")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Ferry guide · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerFerryGuide(
                        routes: routes,
                        layout: .compact,
                        title: "Ferry guide"
                    )

                    Text("Compact · To the Gilis").font(TravelTypography.section)
                    ExplorerFerryGuide(
                        routes: Array(routes.prefix(3)),
                        layout: .compact,
                        title: "Routes to the Gili Islands"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Ferry guide · Compact")

            ScrollView {
                ExplorerFerryGuide(routes: Array(routes.prefix(2)))
                    .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .environment(\.sizeCategory, .accessibilityLarge)
            .previewDisplayName("Ferry guide · Dynamic Type XL")
        }
    }
}
#endif
