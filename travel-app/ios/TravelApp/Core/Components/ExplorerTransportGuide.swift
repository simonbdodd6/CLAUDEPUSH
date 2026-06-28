import SwiftUI

// MARK: - Explorer transport guide (Phase 83, expanded Phase 86)
//
// A reusable, presentation-only "Getting Around" guide: the practical side of
// Travel Intelligence — how to move around a destination safely and efficiently.
// Each transport option carries a best use case, average price range, booking
// method and official booking recommendation, trusted providers, payment methods,
// estimated journey times, operating hours, a safety tip, a common-scam warning,
// accessibility notes, luggage suitability and an expert travel tip.
//
// It reuses the existing design system exclusively — `GlassCard`, `PremiumPillRow`
// (the compact summary rows) and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are caller-
// supplied mock data; the component holds no data, networking, persistence,
// view-model, repository, navigation or MapKit usage, and is not wired into any
// screen. The expanded layout is an expandable GlassCard (collapsed → tap to
// reveal detail); the compact layout is a summary card of `PremiumPillRow`s.
// Animations are subtle presentation polish only (expand/collapse + fade-in).

/// How much luggage a transport option comfortably carries.
enum LuggageSuitability: CaseIterable {
    case minimal
    case moderate
    case full

    var label: String {
        switch self {
        case .minimal: "Hand luggage only"
        case .moderate: "Some luggage"
        case .full: "Full luggage OK"
        }
    }

    var icon: String {
        switch self {
        case .minimal: "bag"
        case .moderate: "bag.fill"
        case .full: "suitcase.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .minimal: return theme.coral
        case .moderate: return theme.sun
        case .full: return theme.moss
        }
    }
}

/// A single, presentation-only way of getting around.
struct TransportOption: Identifiable {
    let id: String
    var name: String
    var icon: String
    var bestFor: String
    var priceRange: String
    var bookingMethod: String
    var officialBooking: String
    var providers: [String]
    var paymentMethods: [String]
    var journeyTimes: String
    var operatingHours: String
    var safetyTip: String
    var commonScam: String?
    var accessibilityNote: String
    var luggage: LuggageSuitability
    var expertTip: String
    var accent: Color

    /// `id` defaults to the transport name, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        name: String,
        icon: String,
        bestFor: String,
        priceRange: String,
        bookingMethod: String,
        officialBooking: String,
        providers: [String],
        paymentMethods: [String],
        journeyTimes: String,
        operatingHours: String,
        safetyTip: String,
        commonScam: String? = nil,
        accessibilityNote: String,
        luggage: LuggageSuitability,
        expertTip: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.bestFor = bestFor
        self.priceRange = priceRange
        self.bookingMethod = bookingMethod
        self.officialBooking = officialBooking
        self.providers = providers
        self.paymentMethods = paymentMethods
        self.journeyTimes = journeyTimes
        self.operatingHours = operatingHours
        self.safetyTip = safetyTip
        self.commonScam = commonScam
        self.accessibilityNote = accessibilityNote
        self.luggage = luggage
        self.expertTip = expertTip
        self.accent = accent
    }

    var accessibilityText: String {
        var parts = [
            name,
            "best for \(bestFor)",
            "price \(priceRange)",
            "booking \(bookingMethod)",
            "official: \(officialBooking)",
            "trusted providers \(providers.joined(separator: ", "))",
            "payment \(paymentMethods.joined(separator: ", "))",
            "journey times \(journeyTimes)",
            "operating hours \(operatingHours)",
            "safety: \(safetyTip)"
        ]
        if let commonScam { parts.append("common scam: \(commonScam)") }
        parts.append("accessibility: \(accessibilityNote)")
        parts.append("luggage: \(luggage.label)")
        parts.append("tip: \(expertTip)")
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerTransportGuide`.
enum TransportGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only "Getting Around" transport guide.
struct ExplorerTransportGuide: View {
    var options: [TransportOption]
    var layout: TransportGuideLayout = .expanded
    var title: String? = "Getting around"
    var subtitle: String? = nil

    @State private var appeared = false

    var body: some View {
        Group {
            if options.isEmpty {
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

    // MARK: Expanded (expandable cards)

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)

            VStack(spacing: TravelSpacing.md) {
                ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                    ExpandableTransportCard(option: option, startsExpanded: index == 0)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
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
                    ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                        PremiumPillRow(
                            symbol: option.icon,
                            accent: option.accent,
                            title: option.name,
                            subtitle: option.bestFor,
                            trailing: option.priceRange
                        )
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(option.accessibilityText)
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
        options.count == 1 ? "1 option" : "\(options.count) options"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "map")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No transport options listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Expandable transport card

/// A premium expandable GlassCard: a always-visible summary (icon, name, best
/// use case, price) that expands on tap to reveal the full detail set. The card
/// exposes the complete information to VoiceOver regardless of expand state.
private struct ExpandableTransportCard: View {
    let option: TransportOption
    var startsExpanded: Bool = false

    @State private var expanded = false

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                summary
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(TravelMotion.gentle) { expanded.toggle() }
                    }

                if expanded {
                    Divider()
                    detail
                        .transition(.opacity)
                }
            }
        }
        .onAppear { expanded = startsExpanded }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(option.accessibilityText)
        .accessibilityHint(expanded ? "Showing details" : "Double tap to show details")
    }

    private var summary: some View {
        HStack(spacing: TravelSpacing.md) {
            medallion

            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(option.name)
                    .font(TravelTypography.cardTitle)
                Text(option.bestFor)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(expanded ? nil : 2)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: TravelSpacing.sm)

            VStack(alignment: .trailing, spacing: TravelSpacing.xs) {
                Text(option.priceRange)
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
            detailRow(icon: "clock", label: "Journey times", value: option.journeyTimes)
            detailRow(icon: "clock.arrow.circlepath", label: "Operating hours", value: option.operatingHours)
            detailRow(icon: "ticket.fill", label: "Booking", value: option.bookingMethod)
            detailRow(icon: "checkmark.seal.fill", label: "Official booking", value: option.officialBooking)

            labeledChips("Trusted providers", option.providers, accent: option.accent)
            labeledChips("Payment", option.paymentMethods, accent: nil)

            HStack(spacing: TravelSpacing.md) {
                luggageBadge(option.luggage)
                Spacer(minLength: 0)
            }

            detailRow(icon: "figure.roll", label: "Accessibility", value: option.accessibilityNote)

            calloutRow(icon: "shield.lefthalf.filled", tint: TravelTheme.current.moss, text: option.safetyTip)
            if let scam = option.commonScam {
                calloutRow(icon: "exclamationmark.triangle.fill", tint: TravelTheme.current.coral, text: scam)
            }
            calloutRow(icon: "lightbulb.fill", tint: TravelTheme.current.sun, text: option.expertTip)
        }
    }

    // MARK: Pieces

    private var medallion: some View {
        Image(systemName: option.icon)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
            .background(
                LinearGradient(
                    colors: [option.accent, option.accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .stroke(.white.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: option.accent.opacity(0.3), radius: 8, y: 4)
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

    private func luggageBadge(_ luggage: LuggageSuitability) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: luggage.icon)
            Text(luggage.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(luggage.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(luggage.accent.opacity(0.15), in: Capsule())
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
struct ExplorerTransportGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Getting around Bali, Lombok and the Gili Islands.
    private static let indonesia: [TransportOption] = [
        TransportOption(
            name: "Fast Ferry", icon: "ferry.fill",
            bestFor: "Bali ↔ Gili Islands and Lombok island hops",
            priceRange: "Rp 250–700k",
            bookingMethod: "Online or at the harbour ticket office",
            officialBooking: "Book named operators online; never beach touts",
            providers: ["Eka Jaya Fast Ferry", "Blue Water Express", "Gili boat transfers"],
            paymentMethods: ["Cash", "Card", "GoPay"],
            journeyTimes: "Padangbai → Gili T 1.5–2 hrs",
            operatingHours: "Departures ≈ 07:00–16:00",
            safetyTip: "Check for life jackets and a passenger manifest before boarding.",
            commonScam: "Touts selling ‘fast boats’ with no safety gear or insurance.",
            accessibilityNote: "Beach-launch boarding; not wheelchair friendly.",
            luggage: .full,
            expertTip: "Morning crossings to the Gilis are far calmer than the afternoon.",
            accent: theme.ocean
        ),
        TransportOption(
            name: "Airport Transfers", icon: "airplane",
            bestFor: "Getting to and from DPS (Bali) or LOP (Lombok)",
            priceRange: "Rp 150–400k",
            bookingMethod: "Pre-book a hotel transfer or use an app at the pickup point",
            officialBooking: "Official airport taxi counter, or Grab/Gojek pickup zone",
            providers: ["Grab", "Gojek", "Hotel transfer", "Lombok airport transfers"],
            paymentMethods: ["Card", "Cash", "GoPay", "OVO"],
            journeyTimes: "DPS → Ubud 60–90 min; LOP → Kuta Lombok 30–40 min",
            operatingHours: "24 hrs",
            safetyTip: "Agree the price or use a metered/app fare before departing.",
            commonScam: "Unofficial ‘taxi’ drivers quoting inflated fixed fares at arrivals.",
            accessibilityNote: "Ramped terminals; request mobility assistance in advance.",
            luggage: .full,
            expertTip: "A pre-booked transfer skips the arrivals-hall haggling entirely.",
            accent: theme.sky
        ),
        TransportOption(
            name: "Ride-hailing", icon: "iphone.gen3",
            bestFor: "Short city and beach hops with fixed, tracked fares",
            priceRange: "Rp 20–80k",
            bookingMethod: "In-app",
            officialBooking: "Use the Gojek or Grab apps — fares are fixed and tracked",
            providers: ["Gojek", "Grab"],
            paymentMethods: ["GoPay", "OVO", "Cash", "Card"],
            journeyTimes: "Seminyak → Canggu 20–30 min",
            operatingHours: "≈ 05:00–24:00",
            safetyTip: "Match the plate and driver name in the app before getting in.",
            commonScam: "Fake ‘no app pickups here’ signs in tourist zones to force cash deals.",
            accessibilityNote: "GoCar offers more space; motorbikes are not step-free.",
            luggage: .moderate,
            expertTip: "GoRide motorbikes beat the traffic for solo travellers.",
            accent: theme.coral
        ),
        TransportOption(
            name: "Metered Taxi", icon: "car.fill",
            bestFor: "When ride-hailing apps are blocked or unavailable",
            priceRange: "Rp 50–150k",
            bookingMethod: "Hail, call, or the My Blue Bird app",
            officialBooking: "Insist on Blue Bird and the meter (‘argo’)",
            providers: ["Blue Bird Taxi", "My Blue Bird app"],
            paymentMethods: ["Cash", "Card", "App wallet"],
            journeyTimes: "Airport → Seminyak 30–45 min",
            operatingHours: "24 hrs",
            safetyTip: "Confirm the meter is running as you set off.",
            commonScam: "Lookalike ‘Blue Bird’ liveries quoting fixed off-meter fares.",
            accessibilityNote: "Standard sedans; limited step-free options.",
            luggage: .full,
            expertTip: "The My Blue Bird app guarantees a genuine metered car.",
            accent: theme.tint
        ),
        TransportOption(
            name: "Scooter Rental", icon: "scooter",
            bestFor: "Independent exploring on quieter roads",
            priceRange: "Rp 60–90k/day",
            bookingMethod: "A reputable rental shop with reviews",
            officialBooking: "Rent from reviewed shops, not random street stalls",
            providers: ["Bali Bike Rental", "Reviewed local warung"],
            paymentMethods: ["Cash", "Bank transfer"],
            journeyTimes: "Self-paced",
            operatingHours: "Shop hours ≈ 08:00–20:00",
            safetyTip: "Always wear the helmet; check brakes and tyres before riding.",
            commonScam: "Rentals ‘finding’ pre-existing damage on return.",
            accessibilityNote: "A two-wheeler — not suitable for reduced mobility.",
            luggage: .minimal,
            expertTip: "Photograph the bike first and never leave your passport as deposit.",
            accent: theme.moss
        ),
        TransportOption(
            name: "Local Buses & Bemo", icon: "bus.fill",
            bestFor: "The cheapest longer hops for the adventurous",
            priceRange: "Rp 10–50k",
            bookingMethod: "Pay the conductor onboard, or book a tourist shuttle",
            officialBooking: "Perama or Kura-Kura shuttles for fixed routes and times",
            providers: ["Perama Tour", "Kura-Kura Bus", "Local bemo"],
            paymentMethods: ["Cash"],
            journeyTimes: "Ubud → Sanur shuttle ≈ 60 min",
            operatingHours: "Daytime, roughly 06:00–18:00",
            safetyTip: "Keep bags on your lap; informal routes can change.",
            commonScam: "Overcharging tourists versus the local fare — confirm it first.",
            accessibilityNote: "High steps and no ramps; limited accessibility.",
            luggage: .moderate,
            expertTip: "Kura-Kura Bus is the comfortable, fixed-price tourist option.",
            accent: theme.sun
        ),
        TransportOption(
            name: "Private Driver", icon: "steeringwheel",
            bestFor: "Full-day, multi-stop sightseeing",
            priceRange: "Rp 600–900k/day",
            bookingMethod: "Hotel desk or a reputable agency",
            officialBooking: "Book reviewed drivers; agree the itinerary and price in writing",
            providers: ["Hotel-recommended driver", "Klook private driver"],
            paymentMethods: ["Cash", "Bank transfer", "Card via agency"],
            journeyTimes: "Full day ≈ 8–10 hrs",
            operatingHours: "By arrangement",
            safetyTip: "Share your live location; confirm working AC and insurance.",
            commonScam: "Unrequested ‘extra’ stops at commission souvenir shops.",
            accessibilityNote: "Sedans or MPVs; drivers can assist with mobility on request.",
            luggage: .full,
            expertTip: "A driver for the day often costs less than two one-way taxis.",
            accent: theme.ocean
        ),
        TransportOption(
            name: "Walking", icon: "figure.walk",
            bestFor: "Short distances and village centres",
            priceRange: "Free",
            bookingMethod: "No booking needed",
            officialBooking: "No booking needed",
            providers: ["Self-guided"],
            paymentMethods: ["None"],
            journeyTimes: "Varies",
            operatingHours: "Anytime",
            safetyTip: "Walk facing traffic; footpaths are patchy and often absent.",
            accessibilityNote: "Pavements are uneven with few dropped kerbs.",
            luggage: .minimal,
            expertTip: "Carry a torch after dark on the Gilis — there are no street lights.",
            accent: theme.moss
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Bali & the Gilis (tap to expand)").font(TravelTypography.section)
                    ExplorerTransportGuide(
                        options: indonesia,
                        subtitle: "Bali, Lombok & the Gili Islands — how to move around safely."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerTransportGuide(options: [], title: "Getting around")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Transport guide · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerTransportGuide(
                        options: indonesia,
                        layout: .compact,
                        title: "Getting around"
                    )

                    Text("Compact · Island hops only").font(TravelTypography.section)
                    ExplorerTransportGuide(
                        options: Array(indonesia.prefix(4)),
                        layout: .compact,
                        title: "Gili Islands"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Transport guide · Compact")
        }
    }
}
#endif
