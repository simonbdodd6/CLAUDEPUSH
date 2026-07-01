import SwiftUI

// MARK: - Travel booking manager dashboard (Phase 104)
//
// A premium booking-management dashboard where every reservation — flights,
// ferries, accommodation, activities and transport — is organised into one polished
// planning experience, with booking-status indicators, payment badges, confirmation
// numbers, a "Needs attention" view, a check-in timeline, a document-wallet preview
// and emergency shortcuts. A caller supplies a `BookingPlan` value and the dashboard
// renders the full page.
//
// It reuses the existing design system exclusively — `FeatureHeroScaffold`,
// `PremiumScrollView`, `PremiumSection`, `PremiumAdaptiveGrid`, `PremiumMetricTile`,
// `PremiumPillRow`, `PremiumTimelineConnector`, `GlassCard`,
// `TravelTripPlannerDashboard` (embedded as a framed preview) and the tokens — and it
// reuses the Phase-101 presentation model types (`DestinationTimelineDay`,
// `DestinationStat`, `DestinationListItem`). `BookingPlan` / `BookingEntry` are
// lightweight presentation models (not DTOs); the dashboard holds no data,
// networking, persistence, repository, view-model, navigation, AppContainer or DTO
// logic, and is not wired into any screen. Confirmation numbers are shown as
// selectable text; the "Continue planning" button is UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; text uses the Dynamic
// Type-scaling `TravelTypography` styles and wraps rather than truncating; and all
// motion is disabled under Reduce Motion.

/// Confirmation state of a booking.
enum BookingStatus: CaseIterable {
    case confirmed
    case pending
    case needsAttention

    var label: String {
        switch self {
        case .confirmed: "Confirmed"
        case .pending: "Pending"
        case .needsAttention: "Needs attention"
        }
    }

    var icon: String {
        switch self {
        case .confirmed: "checkmark.seal.fill"
        case .pending: "clock.fill"
        case .needsAttention: "exclamationmark.triangle.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .confirmed: return theme.moss
        case .pending: return theme.sun
        case .needsAttention: return theme.coral
        }
    }
}

/// Payment state of a booking.
enum BookingPayment: CaseIterable {
    case paid
    case deposit
    case unpaid

    var label: String {
        switch self {
        case .paid: "Paid"
        case .deposit: "Deposit"
        case .unpaid: "Unpaid"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .paid: return theme.moss
        case .deposit: return theme.sun
        case .unpaid: return theme.coral
        }
    }
}

/// A single, presentation-only reservation.
struct BookingEntry: Identifiable {
    let id: String
    var title: String
    var provider: String
    var dateLabel: String
    var confirmationNumber: String
    var status: BookingStatus
    var payment: BookingPayment
    var icon: String
    var accent: Color

    init(
        id: String? = nil,
        title: String,
        provider: String,
        dateLabel: String,
        confirmationNumber: String,
        status: BookingStatus,
        payment: BookingPayment,
        icon: String,
        accent: Color = TravelTheme.current.tint
    ) {
        self.id = id ?? "\(title)-\(confirmationNumber)"
        self.title = title
        self.provider = provider
        self.dateLabel = dateLabel
        self.confirmationNumber = confirmationNumber
        self.status = status
        self.payment = payment
        self.icon = icon
        self.accent = accent
    }

    var accessibilityText: String {
        "\(title), \(provider), \(dateLabel). \(status.label), \(payment.label). Reference \(confirmationNumber)."
    }
}

/// A digital ticket / wallet document.
struct BookingDocument: Identifiable {
    let id: String
    var title: String
    var type: String
    var icon: String
    var gradient: [Color]

    init(id: String? = nil, title: String, type: String, icon: String, gradient: [Color]) {
        self.id = id ?? title
        self.title = title
        self.type = type
        self.icon = icon
        self.gradient = gradient
    }
}

/// The full, presentation-only content for a booking plan.
struct BookingPlan {
    var destinationName: String
    var countryRegion: String
    var tagline: String
    var heroSymbol: String
    var heroGradient: [Color]
    var countdownDays: Int
    var departureLabel: String
    var flights: [BookingEntry]
    var ferries: [BookingEntry]
    var accommodation: [BookingEntry]
    var activities: [BookingEntry]
    var transport: [BookingEntry]
    var checkInTimeline: [DestinationTimelineDay]
    var documents: [BookingDocument]
    var emergencyContacts: [DestinationListItem]
    var tripPlan: TripPlan?

    var allBookings: [BookingEntry] { flights + ferries + accommodation + activities + transport }
    var needsAttention: [BookingEntry] { allBookings.filter { $0.status == .needsAttention || $0.payment == .unpaid } }

    var stats: [DestinationStat] {
        [
            DestinationStat(value: "\(allBookings.count)", label: "Bookings"),
            DestinationStat(value: "\(allBookings.filter { $0.status == .confirmed }.count)", label: "Confirmed"),
            DestinationStat(value: "\(needsAttention.count)", label: "To sort"),
            DestinationStat(value: "\(allBookings.filter { $0.payment == .paid }.count)", label: "Paid")
        ]
    }
}

/// A premium, presentation-only booking-management dashboard rendered from a `BookingPlan`.
struct TravelBookingManagerDashboard: View {
    var plan: BookingPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            immersiveHero
                .modifier(BookingMgrAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            overviewSections
            bookingSections
            walletSections

            continuePlanningButton
                .modifier(BookingMgrAppear(appeared: appeared, reduceMotion: reduceMotion, index: 12))
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Scroll sections (grouped to stay within the ViewBuilder arity limit)

    private var overviewSections: some View {
        Group {
            section("Trip at a glance", "Your bookings in numbers.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 120) {
                    ForEach(plan.stats) { stat in
                        statTile(stat)
                    }
                }
            }

            if !plan.needsAttention.isEmpty {
                section("Needs attention", "Sort these out before you go.", 2) {
                    VStack(spacing: TravelSpacing.sm) {
                        ForEach(plan.needsAttention) { entry in
                            bookingCard(entry, emphasise: true)
                        }
                    }
                }
            }
        }
    }

    private var bookingSections: some View {
        Group {
            bookingSection("Flights", "airplane", plan.flights, 3)
            bookingSection("Ferries", "ferry.fill", plan.ferries, 4)
            bookingSection("Accommodation", "bed.double.fill", plan.accommodation, 5)
            bookingSection("Activities & diving", "water.waves", plan.activities, 6)
            bookingSection("Transport", "car.fill", plan.transport, 7)

            section("Upcoming check-ins", "What needs doing, and when.", 8) {
                VStack(spacing: 0) {
                    ForEach(Array(plan.checkInTimeline.enumerated()), id: \.element.id) { index, day in
                        timelineRow(day, isLast: index == plan.checkInTimeline.count - 1)
                    }
                }
            }
        }
    }

    private var walletSections: some View {
        Group {
            section("Document wallet", "Your tickets and confirmations.", 9) {
                PremiumAdaptiveGrid(minimumWidth: 200) {
                    ForEach(plan.documents) { document in
                        documentCard(document)
                    }
                }
            }

            section("Emergency shortcuts", "Save these before you travel.", 10) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(plan.emergencyContacts) { contact in
                        PremiumPillRow(symbol: contact.icon, accent: contact.accent, title: contact.title, subtitle: "Save offline before you go.", trailing: contact.detail)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(contact.title), \(contact.detail)")
                    }
                }
            }

            if let tripPlan = plan.tripPlan {
                section("Trip plan", "Your full planning dashboard.", 11) {
                    tripPlanEmbed(tripPlan)
                }
            }
        }
    }

    // MARK: Section helpers

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(BookingMgrAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    @ViewBuilder
    private func bookingSection(_ title: String, _ icon: String, _ entries: [BookingEntry], _ index: Int) -> some View {
        if !entries.isEmpty {
            section(title, "\(entries.count) booking\(entries.count == 1 ? "" : "s").", index) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(entries) { entry in
                        bookingCard(entry, emphasise: false)
                    }
                }
            }
        }
    }

    // MARK: Hero

    private var immersiveHero: some View {
        FeatureHeroScaffold(
            eyebrow: plan.countryRegion,
            symbol: plan.heroSymbol,
            title: plan.destinationName,
            subtitle: plan.tagline,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: "\(plan.countdownDays) days", label: "Until departure"),
                HeroMetric(value: "\(plan.allBookings.count)", label: "Bookings"),
                HeroMetric(value: "\(plan.needsAttention.count)", label: "To sort")
            ],
            texture: { MapTexturePlaceholder() }
        )
    }

    // MARK: Booking card

    private func bookingCard(_ entry: BookingEntry, emphasise: Bool) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(entry.icon, entry.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(entry.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("\(entry.provider) · \(entry.dateLabel)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    statusBadge(entry.status)
                }

                HStack(spacing: TravelSpacing.sm) {
                    paymentBadge(entry.payment)
                    Spacer(minLength: 0)
                    Text("Ref \(entry.confirmationNumber)")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .monospaced()
                        .textSelection(.enabled)
                }
            }
        }
        .overlay(
            RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                .stroke(emphasise ? theme.coral.opacity(0.4) : .clear, lineWidth: 1)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(entry.accessibilityText)
    }

    private func statusBadge(_ status: BookingStatus) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(.white)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(status.accent, in: Capsule())
        .overlay(Capsule().stroke(.white.opacity(0.4), lineWidth: 1))
    }

    private func paymentBadge(_ payment: BookingPayment) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: "creditcard.fill")
            Text(payment.label)
                .textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(payment.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(payment.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Pieces

    private func documentCard(_ document: BookingDocument) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: document.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topLeading) {
                        Image(systemName: document.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(TravelSpacing.md)
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: "qrcode")
                            .font(.title3)
                            .foregroundStyle(.white.opacity(0.85))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: 96)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(document.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(document.type)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(document.title), \(document.type). Digital ticket.")
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

    private func statTile(_ stat: DestinationStat) -> some View {
        PremiumMetricTile(value: stat.value, label: stat.label)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(stat.value) \(stat.label)")
    }

    private func tripPlanEmbed(_ tripPlan: TripPlan) -> some View {
        TravelTripPlannerDashboard(plan: tripPlan)
            .frame(height: 380)
            .clipShape(RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .stroke(.white.opacity(0.25), lineWidth: 1)
            )
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(tripPlan.destinationName) trip planner. Visual preview.")
    }

    private var continuePlanningButton: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.sm) {
                Text("Continue planning")
                    .font(TravelTypography.cardTitle)
                Image(systemName: "arrow.right")
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(TravelSpacing.md)
            .background(
                LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .leading, endPoint: .trailing),
                in: Capsule()
            )
            .overlay(Capsule().stroke(.white.opacity(0.3), lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue planning. Placeholder button.")
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
}

// MARK: - Booking manager appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct BookingMgrAppear: ViewModifier {
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
extension BookingPlan {
    /// A deterministic sample booking plan (Gili Air) for previews.
    static var sampleGiliAir: BookingPlan {
        let theme = TravelTheme.current
        return BookingPlan(
            destinationName: "Gili Air",
            countryRegion: "Indonesia · Lombok",
            tagline: "Every reservation for your 10-night island escape, in one place.",
            heroSymbol: "wallet.pass.fill",
            heroGradient: [theme.ocean, theme.sky, theme.sun.opacity(0.6)],
            countdownDays: 14,
            departureLabel: "12 Aug 2025",
            flights: [
                BookingEntry(title: "London → Denpasar", provider: "Singapore Airlines", dateLabel: "12 Aug · 09:40", confirmationNumber: "SQ-7F2KQ", status: .confirmed, payment: .paid, icon: "airplane", accent: theme.sky),
                BookingEntry(title: "Denpasar → London", provider: "Singapore Airlines", dateLabel: "22 Aug · 18:05", confirmationNumber: "SQ-7F2KQ", status: .confirmed, payment: .paid, icon: "airplane.departure", accent: theme.sky)
            ],
            ferries: [
                BookingEntry(title: "Padang Bai → Gili Air", provider: "Gili Getaway", dateLabel: "12 Aug · 13:30", confirmationNumber: "GG-44812", status: .needsAttention, payment: .unpaid, icon: "ferry.fill", accent: theme.ocean)
            ],
            accommodation: [
                BookingEntry(title: "Beach bungalow", provider: "Gili Air Escape", dateLabel: "12–22 Aug · 10 nights", confirmationNumber: "BK-99231", status: .confirmed, payment: .deposit, icon: "bed.double.fill", accent: theme.sun)
            ],
            activities: [
                BookingEntry(title: "2 fun dives", provider: "Blue Marlin Dive", dateLabel: "14 Aug · 08:00", confirmationNumber: "BMD-5521", status: .pending, payment: .deposit, icon: "water.waves", accent: theme.ocean),
                BookingEntry(title: "Sunrise freedive", provider: "Gili Freedive", dateLabel: "17 Aug · 06:00", confirmationNumber: "GF-1180", status: .confirmed, payment: .paid, icon: "figure.open.water.swim", accent: theme.tint)
            ],
            transport: [
                BookingEntry(title: "Airport transfer", provider: "Bali Pickup", dateLabel: "12 Aug · 11:30", confirmationNumber: "BP-3092", status: .confirmed, payment: .paid, icon: "car.fill", accent: theme.tint)
            ],
            checkInTimeline: [
                DestinationTimelineDay(day: "11 Aug", title: "Online flight check-in opens", detail: "Check in 24h before for the best seats."),
                DestinationTimelineDay(day: "12 Aug", title: "Confirm the ferry", detail: "Pay and reconfirm the 13:30 fast boat."),
                DestinationTimelineDay(day: "13 Aug", title: "Pay diving balance", detail: "Settle the dive package on arrival."),
                DestinationTimelineDay(day: "22 Aug", title: "Return boat & flight", detail: "Morning boat to Bali for the 18:05 flight.")
            ],
            documents: [
                BookingDocument(title: "Flight e-tickets", type: "Boarding passes", icon: "airplane", gradient: [theme.sky, theme.ocean]),
                BookingDocument(title: "Ferry ticket", type: "QR ticket", icon: "ferry.fill", gradient: [theme.ocean, theme.tint]),
                BookingDocument(title: "Hotel voucher", type: "Reservation", icon: "bed.double.fill", gradient: [theme.sun, theme.coral]),
                BookingDocument(title: "Dive booking", type: "Voucher", icon: "water.waves", gradient: [theme.tint, theme.ocean])
            ],
            emergencyContacts: [
                DestinationListItem(icon: "exclamationmark.shield.fill", title: "General emergency", detail: "112", accent: theme.coral),
                DestinationListItem(icon: "cross.case.fill", title: "Ambulance", detail: "118 / 119", accent: theme.coral),
                DestinationListItem(icon: "lifepreserver", title: "Sea rescue (BASARNAS)", detail: "115", accent: theme.ocean)
            ],
            tripPlan: .sampleGiliAir
        )
    }
}

struct TravelBookingManagerDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelBookingManagerDashboard(plan: .sampleGiliAir)
                .previewDisplayName("Booking manager · Gili Air")

            TravelBookingManagerDashboard(plan: .sampleGiliAir)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Booking manager · Dynamic Type XL")
        }
    }
}
#endif
