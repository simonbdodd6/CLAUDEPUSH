import SwiftUI

// MARK: - Explorer transport guide (Phase 83)
//
// A reusable, presentation-only "Getting Around" guide: the practical side of
// Travel Intelligence. Each transport option (ferry, taxi, ride-share, scooter
// rental, walking) carries a recommended provider, price range, travel time,
// booking method, payment methods, a local tip, and reliability / safety meters.
//
// It reuses the existing design system exclusively — `GlassCard`,
// `PremiumMetricTile`, `PremiumPillRow` (the compact rows) and the tokens
// (`TravelTheme`, `TravelSpacing`, `TravelRadius`, `TravelTypography`,
// `TravelMotion`). All values are caller-supplied mock data; the component holds
// no data, networking, persistence, view-model, navigation or MapKit usage, and is
// not wired into any screen. Animations are subtle appearance polish only (a
// staggered fade-and-rise).

/// A reliability / safety indicator level, shown as a three-segment meter.
enum TransportLevel: CaseIterable {
    case low
    case moderate
    case high

    var label: String {
        switch self {
        case .low: "Low"
        case .moderate: "Moderate"
        case .high: "High"
        }
    }

    /// Filled-segment count (1...3).
    var level: Int {
        switch self {
        case .low: 1
        case .moderate: 2
        case .high: 3
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .low: return theme.coral
        case .moderate: return theme.sun
        case .high: return theme.moss
        }
    }
}

/// A single, presentation-only way of getting around.
struct TransportOption: Identifiable {
    let id: String
    var type: String
    var icon: String
    var provider: String
    var priceRange: String
    var travelTime: String
    var bookingMethod: String
    var paymentMethods: [String]
    var localTip: String
    var reliability: TransportLevel
    var safety: TransportLevel
    var accent: Color

    /// `id` defaults to the transport type, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        type: String,
        icon: String,
        provider: String,
        priceRange: String,
        travelTime: String,
        bookingMethod: String,
        paymentMethods: [String],
        localTip: String,
        reliability: TransportLevel,
        safety: TransportLevel,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? type
        self.type = type
        self.icon = icon
        self.provider = provider
        self.priceRange = priceRange
        self.travelTime = travelTime
        self.bookingMethod = bookingMethod
        self.paymentMethods = paymentMethods
        self.localTip = localTip
        self.reliability = reliability
        self.safety = safety
        self.accent = accent
    }

    var accessibilityText: String {
        [
            type,
            "via \(provider)",
            "price \(priceRange)",
            "time \(travelTime)",
            "booking \(bookingMethod)",
            "payment \(paymentMethods.joined(separator: ", "))",
            "reliability \(reliability.label)",
            "safety \(safety.label)",
            "tip: \(localTip)"
        ].joined(separator: ", ")
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

    // MARK: Expanded

    private var expanded: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            header(titleFont: TravelTypography.section)

            VStack(spacing: TravelSpacing.md) {
                ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                    optionCard(option)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                }
            }
        }
    }

    private func optionCard(_ option: TransportOption) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .center, spacing: TravelSpacing.md) {
                    medallion(option.icon, accent: option.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(option.type)
                            .font(TravelTypography.cardTitle)
                        Text("via \(option.provider)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }

                HStack(spacing: TravelSpacing.sm) {
                    PremiumMetricTile(value: option.priceRange, label: "Price")
                    PremiumMetricTile(value: option.travelTime, label: "Time")
                }

                HStack(alignment: .top, spacing: TravelSpacing.lg) {
                    indicator("Reliability", option.reliability)
                    indicator("Safety", option.safety)
                    Spacer(minLength: 0)
                }

                detailRow(icon: "ticket.fill", label: "Booking", value: option.bookingMethod)

                paymentBlock(option.paymentMethods)

                tipCallout(option.localTip)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(option.accessibilityText)
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
                    ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                        PremiumPillRow(
                            symbol: option.icon,
                            accent: option.accent,
                            title: option.type,
                            subtitle: "via \(option.provider) · \(option.travelTime)",
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

    private func medallion(_ icon: String, accent: Color) -> some View {
        Image(systemName: icon)
            .font(TravelTypography.cardTitle)
            .foregroundStyle(.white)
            .frame(width: 46, height: 46)
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

    private func indicator(_ label: String, _ level: TransportLevel) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            HStack(spacing: TravelSpacing.xxs) {
                ForEach(0..<3, id: \.self) { index in
                    Capsule()
                        .fill(index < level.level ? level.accent : Color.secondary.opacity(0.22))
                        .frame(width: 16, height: 5)
                }
                Text(level.label)
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

    private func paymentBlock(_ methods: [String]) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            Text("Payment")
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(methods, id: \.self) { method in
                        Text(method)
                            .font(TravelTypography.caption)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.thinMaterial, in: Capsule())
                    }
                }
            }
        }
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

#if DEBUG
struct ExplorerTransportGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// Getting around Bali, Lombok and the Gili Islands.
    private static let indonesia: [TransportOption] = [
        TransportOption(
            type: "Ferry",
            icon: "ferry.fill",
            provider: "Eka Jaya Fast Boat",
            priceRange: "Rp 250–600k",
            travelTime: "1.5–2 hrs",
            bookingMethod: "Online or at the harbour",
            paymentMethods: ["Cash", "Card", "GoPay"],
            localTip: "Take the morning crossing from Padangbai — afternoon seas to the Gilis get rough.",
            reliability: .moderate,
            safety: .moderate,
            accent: theme.ocean
        ),
        TransportOption(
            type: "Taxi",
            icon: "car.fill",
            provider: "Blue Bird",
            priceRange: "Rp 50–150k",
            travelTime: "20–40 min",
            bookingMethod: "Hail, call, or the My Blue Bird app",
            paymentMethods: ["Cash", "Card", "App wallet"],
            localTip: "Insist on the meter (‘argo’); Blue Bird is the trusted name in Bali.",
            reliability: .high,
            safety: .high,
            accent: theme.tint
        ),
        TransportOption(
            type: "Ride-share",
            icon: "iphone.gen3",
            provider: "Gojek / Grab",
            priceRange: "Rp 20–80k",
            travelTime: "15–35 min",
            bookingMethod: "Gojek or Grab app",
            paymentMethods: ["GoPay", "OVO", "Cash"],
            localTip: "GoRide motorbikes beat the traffic; some tourist zones ban app pickups, so walk a block.",
            reliability: .high,
            safety: .moderate,
            accent: theme.coral
        ),
        TransportOption(
            type: "Scooter rental",
            icon: "scooter",
            provider: "Local warung rentals",
            priceRange: "Rp 60–90k/day",
            travelTime: "Self-paced",
            bookingMethod: "Cash at the rental shop",
            paymentMethods: ["Cash"],
            localTip: "Carry an international permit, photograph existing scratches, and always wear the helmet.",
            reliability: .moderate,
            safety: .low,
            accent: theme.sun
        ),
        TransportOption(
            type: "Walking",
            icon: "figure.walk",
            provider: "Self-guided",
            priceRange: "Free",
            travelTime: "Varies",
            bookingMethod: "No booking needed",
            paymentMethods: ["None"],
            localTip: "Footpaths are patchy — walk facing traffic and carry a torch after dark on the Gilis.",
            reliability: .high,
            safety: .moderate,
            accent: theme.moss
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Bali & the Gilis").font(TravelTypography.section)
                    ExplorerTransportGuide(
                        options: indonesia,
                        subtitle: "Bali, Lombok & the Gili Islands — how to move between them."
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
                        options: Array(indonesia.prefix(3)),
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
