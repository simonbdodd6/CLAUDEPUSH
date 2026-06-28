import SwiftUI

// MARK: - Explorer booking guide (Phase 85)
//
// A reusable, presentation-only "Book It Right" guide: where and how to book
// important transport and activities safely. Each booking item carries a
// recommended booking method, trusted provider examples, when to book, an expected
// booking window, accepted payment methods, cancellation flexibility, an official-
// website indicator, an optional scam warning and an expert travel tip.
//
// It reuses the existing design system exclusively — `GlassCard`, `PremiumPillRow`
// (the compact rows) and the tokens (`TravelTheme`, `TravelSpacing`,
// `TravelRadius`, `TravelTypography`, `TravelMotion`). All values are caller-
// supplied mock data; the component holds no data, networking, persistence,
// view-model, navigation or MapKit usage, and is not wired into any screen.
// Animations are subtle appearance polish only (a staggered fade-and-rise).

/// When a booking should be made.
enum BookingTiming: CaseIterable {
    case sameDay
    case dayAhead
    case weeksAhead

    var label: String {
        switch self {
        case .sameDay: "Same day"
        case .dayAhead: "24 hrs ahead"
        case .weeksAhead: "Weeks ahead"
        }
    }

    var icon: String {
        switch self {
        case .sameDay: "bolt.fill"
        case .dayAhead: "clock.fill"
        case .weeksAhead: "calendar"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .sameDay: return theme.tint
        case .dayAhead: return theme.sun
        case .weeksAhead: return theme.ocean
        }
    }
}

/// How flexible a booking's cancellation policy is.
enum CancellationFlexibility: CaseIterable {
    case flexible
    case moderate
    case strict

    var label: String {
        switch self {
        case .flexible: "Flexible"
        case .moderate: "Moderate"
        case .strict: "Strict"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .flexible: return theme.moss
        case .moderate: return theme.sun
        case .strict: return theme.coral
        }
    }
}

/// A single, presentation-only booking guide entry.
struct BookingItem: Identifiable {
    let id: String
    var category: String
    var icon: String
    var bookingMethod: String
    var providers: [String]
    var timing: BookingTiming
    var bookingWindow: String
    var paymentMethods: [String]
    var cancellation: CancellationFlexibility
    var hasOfficialSite: Bool
    var scamWarning: String?
    var expertTip: String
    var accent: Color

    /// `id` defaults to the category, matching the codebase's deterministic
    /// conventions (no `UUID()`).
    init(
        id: String? = nil,
        category: String,
        icon: String,
        bookingMethod: String,
        providers: [String],
        timing: BookingTiming,
        bookingWindow: String,
        paymentMethods: [String],
        cancellation: CancellationFlexibility,
        hasOfficialSite: Bool,
        scamWarning: String? = nil,
        expertTip: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? category
        self.category = category
        self.icon = icon
        self.bookingMethod = bookingMethod
        self.providers = providers
        self.timing = timing
        self.bookingWindow = bookingWindow
        self.paymentMethods = paymentMethods
        self.cancellation = cancellation
        self.hasOfficialSite = hasOfficialSite
        self.scamWarning = scamWarning
        self.expertTip = expertTip
        self.accent = accent
    }

    var accessibilityText: String {
        var parts = [
            category,
            "book via \(bookingMethod)",
            "trusted providers \(providers.joined(separator: ", "))",
            "book \(timing.label)",
            "window \(bookingWindow)",
            "payment \(paymentMethods.joined(separator: ", "))",
            "\(cancellation.label) cancellation",
            hasOfficialSite ? "official site available" : "no official site"
        ]
        if let scamWarning { parts.append("scam warning: \(scamWarning)") }
        parts.append("tip: \(expertTip)")
        return parts.joined(separator: ", ")
    }
}

/// Layout density for an `ExplorerBookingGuide`.
enum BookingGuideLayout {
    case compact
    case expanded
}

/// A premium, presentation-only "Book It Right" guide.
struct ExplorerBookingGuide: View {
    var items: [BookingItem]
    var layout: BookingGuideLayout = .expanded
    var title: String? = "Book it right"
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

            VStack(spacing: TravelSpacing.md) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    bookingCard(item)
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 10)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
                }
            }
        }
    }

    private func bookingCard(_ item: BookingItem) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(item.icon, accent: item.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(item.category)
                            .font(TravelTypography.cardTitle)
                        Text(item.bookingMethod)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    timingBadge(item.timing)
                }

                labeledChips("Trusted providers", item.providers, accent: item.accent)

                detailRow(icon: "calendar", label: "Booking window", value: item.bookingWindow)

                HStack(spacing: TravelSpacing.md) {
                    cancellationChip(item.cancellation)
                    officialSiteBadge(item.hasOfficialSite)
                    Spacer(minLength: 0)
                }

                labeledChips("Payment", item.paymentMethods, accent: nil)

                if let scamWarning = item.scamWarning {
                    warningCallout(scamWarning)
                }

                tipCallout(item.expertTip)
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
                            subtitle: "via \(item.providers.first ?? item.bookingMethod)",
                            trailing: item.timing.label
                        )
                        .opacity(appeared ? 1 : 0)
                        .offset(y: appeared ? 0 : 8)
                        .animation(TravelMotion.gentle.delay(Double(min(index, 8)) * 0.05), value: appeared)
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

    private func timingBadge(_ timing: BookingTiming) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: timing.icon)
            Text(timing.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(timing.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
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

    private func officialSiteBadge(_ hasOfficialSite: Bool) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: hasOfficialSite ? "checkmark.seal.fill" : "xmark.seal")
            Text(hasOfficialSite ? "Official site" : "No official site")
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(hasOfficialSite ? TravelTheme.current.moss : Color.secondary)
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

    private func warningCallout(_ warning: String) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(TravelTypography.caption)
                .foregroundStyle(TravelTheme.current.coral)
            Text(warning)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .background(TravelTheme.current.coral.opacity(0.12), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                .stroke(TravelTheme.current.coral.opacity(0.3), lineWidth: 1)
        )
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
        items.count == 1 ? "1 category" : "\(items.count) categories"
    }

    private var emptyState: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "checkmark.seal")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(.secondary)
                Text("No booking guidance listed for this destination yet.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
    }
}

#if DEBUG
struct ExplorerBookingGuide_Previews: PreviewProvider {

    private static let theme = TravelTheme.current

    /// How to book safely across Bali, Lombok, the Gili Islands and Raja Ampat.
    private static let indonesia: [BookingItem] = [
        BookingItem(
            category: "Ferries", icon: "ferry.fill",
            bookingMethod: "Book online or at the harbour ticket office",
            providers: ["Eka Jaya", "Blue Water Express", "Gili Gili Fast Boat"],
            timing: .dayAhead, bookingWindow: "1–3 days ahead in peak season",
            paymentMethods: ["Cash", "Card", "GoPay"], cancellation: .moderate, hasOfficialSite: true,
            scamWarning: "Ignore beach touts selling ‘fast boats’ with no safety gear or manifest.",
            expertTip: "Confirm life jackets and a passenger manifest before you pay.",
            accent: theme.ocean
        ),
        BookingItem(
            category: "Flights", icon: "airplane",
            bookingMethod: "Airline website or a trusted OTA",
            providers: ["Garuda Indonesia", "Lion Air", "Traveloka"],
            timing: .weeksAhead, bookingWindow: "4–8 weeks ahead",
            paymentMethods: ["Card", "Bank transfer", "PayLater"], cancellation: .strict, hasOfficialSite: true,
            expertTip: "Domestic baggage allowances are small — pre-pay extra kilos online, it’s far cheaper.",
            accent: theme.sky
        ),
        BookingItem(
            category: "Hotels", icon: "bed.double.fill",
            bookingMethod: "Booking platform, or message the property direct",
            providers: ["Booking.com", "Agoda", "Direct via hotel"],
            timing: .weeksAhead, bookingWindow: "2–6 weeks ahead in high season",
            paymentMethods: ["Card", "Cash on arrival"], cancellation: .flexible, hasOfficialSite: true,
            scamWarning: "Verify Gili and villa listings against recent reviews — fake villas exist.",
            expertTip: "Message the property to match the platform price minus its commission.",
            accent: theme.coral
        ),
        BookingItem(
            category: "Diving", icon: "water.waves",
            bookingMethod: "Book directly with a certified dive centre",
            providers: ["Blue Marlin Dive", "Manta Dive", "Papua Explorers"],
            timing: .dayAhead, bookingWindow: "1–2 days ahead; liveaboards months ahead",
            paymentMethods: ["Cash", "Card"], cancellation: .moderate, hasOfficialSite: true,
            scamWarning: "Check PADI/SSI certification — avoid ‘cheap’ uncertified operators.",
            expertTip: "Raja Ampat liveaboards sell out 6–12 months ahead; book early.",
            accent: theme.ocean
        ),
        BookingItem(
            category: "Surf lessons", icon: "figure.surfing",
            bookingMethod: "Book at the surf school or via its app",
            providers: ["Rip Curl School of Surf", "Odysseys Surf School"],
            timing: .sameDay, bookingWindow: "Same day or the day before",
            paymentMethods: ["Cash", "Card"], cancellation: .flexible, hasOfficialSite: true,
            expertTip: "Beginners: Kuta and Lombok’s Selong Belanak have the gentlest beach breaks.",
            accent: theme.tint
        ),
        BookingItem(
            category: "Scooter rental", icon: "scooter",
            bookingMethod: "A reputable rental shop with reviews — not a street stall",
            providers: ["Bali Bike Rental", "Reviewed local warung"],
            timing: .sameDay, bookingWindow: "Same day",
            paymentMethods: ["Cash", "Bank transfer"], cancellation: .flexible, hasOfficialSite: false,
            scamWarning: "Some rentals ‘find’ damage on return — photograph the bike before riding.",
            expertTip: "Pay daily and keep your passport — never leave it as a deposit.",
            accent: theme.moss
        ),
        BookingItem(
            category: "National park permits", icon: "leaf.fill",
            bookingMethod: "Official park office or a licensed guide",
            providers: ["Komodo NP office", "Rinjani (BTNGR) ePermit"],
            timing: .weeksAhead, bookingWindow: "Days to weeks ahead; treks require a guide",
            paymentMethods: ["Cash", "Bank transfer"], cancellation: .strict, hasOfficialSite: true,
            scamWarning: "Rinjani treks: book licensed operators only — unlicensed guides are unsafe.",
            expertTip: "Carry the printed permit; checkpoints do verify it.",
            accent: theme.moss
        ),
        BookingItem(
            category: "Tours", icon: "map.fill",
            bookingMethod: "A reputable agency or your hotel desk",
            providers: ["Klook", "GetYourGuide", "Trusted hotel desk"],
            timing: .dayAhead, bookingWindow: "1–3 days ahead",
            paymentMethods: ["Card", "Cash", "GoPay"], cancellation: .moderate, hasOfficialSite: true,
            scamWarning: "Beachside ‘tour’ touts may be uninsured — prefer reviewed agencies.",
            expertTip: "Sunrise Mount Batur tours leave around 2am — confirm the pickup time.",
            accent: theme.sun
        )
    ]

    static var previews: some View {
        Group {
            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Expanded · Indonesia").font(TravelTypography.section)
                    ExplorerBookingGuide(
                        items: indonesia,
                        subtitle: "Booking safely across Bali, Lombok, the Gilis & Raja Ampat."
                    )

                    Text("Expanded · Empty").font(TravelTypography.section)
                    ExplorerBookingGuide(items: [], title: "Book it right")
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Booking guide · Expanded")

            ScrollView {
                VStack(alignment: .leading, spacing: TravelSpacing.xl) {
                    Text("Compact · At a glance").font(TravelTypography.section)
                    ExplorerBookingGuide(
                        items: indonesia,
                        layout: .compact,
                        title: "Book it right"
                    )

                    Text("Compact · Getting there").font(TravelTypography.section)
                    ExplorerBookingGuide(
                        items: Array(indonesia.prefix(4)),
                        layout: .compact,
                        title: "Transport & stays"
                    )
                }
                .padding(TravelSpacing.lg)
            }
            .background(TravelTheme.current.background)
            .previewDisplayName("Booking guide · Compact")
        }
    }
}
#endif
