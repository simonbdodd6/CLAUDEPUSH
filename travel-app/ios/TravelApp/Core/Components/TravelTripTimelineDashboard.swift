import SwiftUI

// MARK: - Travel trip timeline dashboard (Phase 113)
//
// The flagship interactive Trip Timeline: the traveller's entire journey from
// departure to returning home — flights, ferries, hotels, check-ins, activities,
// dives, surf, transfers, travel/rest/buffer days and the return leg — with a
// progress indicator, Today and Next-up sections, alerts, UI-only filters and
// favourites, weather placeholders, booking and payment badges, time-zone changes
// and a calendar placeholder. A caller supplies a `TripTimeline` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumMetricTile`,
// `PremiumProgressBar`, `PremiumTimelineConnector`, `GlassCard`, `MapTexturePlaceholder`,
// `TravelTypography` and the tokens — and the Phase-104 `BookingStatus` /
// `BookingPayment` badges. `TripTimeline` / `TimelineEvent` are lightweight
// presentation models (not DTOs); the component holds no data, networking,
// persistence, repository, view-model, navigation, AppContainer or DTO logic, and is
// not wired into any screen. The filters, favourites and calendar button are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// The kind of a timeline event — drives the glyph and accent.
enum TimelineEventKind: CaseIterable {
    case flight
    case ferry
    case hotel
    case checkIn
    case activity
    case dive
    case surf
    case transport
    case travelDay
    case restDay
    case bufferDay
    case returnHome

    var label: String {
        switch self {
        case .flight: "Flight"
        case .ferry: "Ferry"
        case .hotel: "Hotel"
        case .checkIn: "Check-in"
        case .activity: "Activity"
        case .dive: "Dive"
        case .surf: "Surf"
        case .transport: "Transport"
        case .travelDay: "Travel day"
        case .restDay: "Rest day"
        case .bufferDay: "Buffer day"
        case .returnHome: "Return home"
        }
    }

    var icon: String {
        switch self {
        case .flight: "airplane"
        case .ferry: "ferry.fill"
        case .hotel: "bed.double.fill"
        case .checkIn: "checkmark.circle.fill"
        case .activity: "ticket.fill"
        case .dive: "water.waves"
        case .surf: "figure.surfing"
        case .transport: "car.fill"
        case .travelDay: "arrow.left.arrow.right"
        case .restDay: "moon.zzz.fill"
        case .bufferDay: "hourglass"
        case .returnHome: "house.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .flight: return theme.sky
        case .ferry: return theme.ocean
        case .hotel: return theme.sun
        case .checkIn: return theme.moss
        case .activity: return theme.coral
        case .dive: return theme.ocean
        case .surf: return theme.sky
        case .transport: return theme.tint
        case .travelDay: return theme.tint
        case .restDay: return theme.moss
        case .bufferDay: return theme.sun
        case .returnHome: return theme.coral
        }
    }
}

/// A single, presentation-only journey event.
struct TimelineEvent: Identifiable {
    let id: String
    var dateLabel: String
    var time: String
    var title: String
    var location: String
    var kind: TimelineEventKind
    var status: BookingStatus?
    var payment: BookingPayment?
    var weather: String?
    var timeZoneNote: String?
    var note: String
    var isPast: Bool
    var isToday: Bool

    init(
        id: String? = nil,
        dateLabel: String,
        time: String,
        title: String,
        location: String,
        kind: TimelineEventKind,
        status: BookingStatus? = nil,
        payment: BookingPayment? = nil,
        weather: String? = nil,
        timeZoneNote: String? = nil,
        note: String,
        isPast: Bool = false,
        isToday: Bool = false
    ) {
        self.id = id ?? "\(dateLabel)-\(title)"
        self.dateLabel = dateLabel
        self.time = time
        self.title = title
        self.location = location
        self.kind = kind
        self.status = status
        self.payment = payment
        self.weather = weather
        self.timeZoneNote = timeZoneNote
        self.note = note
        self.isPast = isPast
        self.isToday = isToday
    }

    var accent: Color { kind.accent }
}

/// The full, presentation-only content for a trip timeline.
struct TripTimeline {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var dayOfTrip: Int
    var totalDays: Int
    var daysToReturn: Int
    var daysToDeparture: Int
    var departureLabel: String
    var alerts: [String]
    var events: [TimelineEvent]

    /// True once the journey is underway (departure day reached or passed).
    var hasDeparted: Bool { daysToDeparture <= 0 }

    var progress: Double {
        guard !events.isEmpty else { return 0 }
        return min(max(Double(events.filter(\.isPast).count) / Double(events.count), 0), 1)
    }
    var todayEvents: [TimelineEvent] { events.filter(\.isToday) }
    var nextUp: TimelineEvent? { events.first { !$0.isPast && !$0.isToday } }
    var returnHome: TimelineEvent? { events.first { $0.kind == .returnHome } }
}

/// A premium, presentation-only trip timeline dashboard rendered from a `TripTimeline`.
struct TravelTripTimelineDashboard: View {
    var trip: TripTimeline

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedFilter = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let filters = ["All", "Flights", "Ferries", "Dives", "Surf", "Activities"]

    private var filteredEvents: [TimelineEvent] {
        guard selectedFilter != "All" else { return trip.events }
        return trip.events.filter { matches($0.kind, selectedFilter) }
    }

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: trip.heroSymbol,
                title: trip.heroTitle,
                subtitle: trip.heroSubtitle,
                gradient: trip.heroGradient,
                metrics: [
                    HeroMetric(value: "Day \(trip.dayOfTrip)/\(trip.totalDays)", label: "Journey"),
                    HeroMetric(value: "\(Int((trip.progress * 100).rounded()))%", label: "Done"),
                    HeroMetric(value: "\(trip.daysToReturn)d", label: "To home")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(TripTimelineAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            departureCountdownCard
                .modifier(TripTimelineAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            progressCard
                .modifier(TripTimelineAppear(appeared: appeared, reduceMotion: reduceMotion, index: 2))

            if !trip.todayEvents.isEmpty {
                section("Today", "What’s happening now.", 3) {
                    VStack(spacing: TravelSpacing.sm) {
                        ForEach(trip.todayEvents) { event in
                            eventCard(event)
                        }
                    }
                }
            }

            if let next = trip.nextUp {
                section("Next up", "Coming up next.", 4) {
                    eventCard(next)
                }
            }

            if !trip.alerts.isEmpty {
                section("Upcoming alerts", "Don’t miss these.", 5) {
                    bulletCard(trip.alerts, icon: "bell.badge.fill", tint: theme.coral)
                }
            }

            section("Filter", "Show just what you need.", 6) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(filters, id: \.self) { filter in
                            filterChip(filter)
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }

            section("Trip timeline", "Your whole journey, in order.", 7) {
                if filteredEvents.isEmpty {
                    GlassCard {
                        Text("No \(selectedFilter.lowercased()) on this trip.")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    VStack(spacing: 0) {
                        ForEach(Array(filteredEvents.enumerated()), id: \.element.id) { index, event in
                            timelineRow(event, isLast: index == filteredEvents.count - 1)
                        }
                    }
                }
            }

            if let home = trip.returnHome {
                section("Return home", "The journey back.", 8) {
                    eventCard(home)
                }
            }

            section("Calendar", "Keep it in sync.", 9) {
                calendarPlaceholder
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

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(TripTimelineAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Departure countdown card

    private var departureCountdownCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text(trip.hasDeparted ? "Trip underway" : "Departure countdown")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    if trip.hasDeparted {
                        Text("You’re on your way")
                            .font(TravelTypography.cardTitle)
                    } else {
                        Text("\(trip.daysToDeparture)")
                            .font(TravelTypography.display)
                            .foregroundStyle(theme.tint)
                        Text(trip.daysToDeparture == 1 ? "day to go" : "days to go")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    medallion(trip.hasDeparted ? "airplane.departure" : "hourglass", theme.tint)
                }
                Label(trip.departureLabel, systemImage: "calendar")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                Text(trip.hasDeparted
                     ? "Bon voyage — enjoy every moment. Home in \(trip.daysToReturn) days."
                     : "Bags packed? Your adventure across Indonesia begins soon.")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(trip.hasDeparted
            ? "Trip underway. Departure \(trip.departureLabel). Home in \(trip.daysToReturn) days."
            : "Departure countdown. \(trip.daysToDeparture) days to go. Departure \(trip.departureLabel).")
    }

    // MARK: Progress card

    private var progressCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Text("Trip progress")
                    .font(TravelTypography.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                HStack(alignment: .firstTextBaseline, spacing: TravelSpacing.sm) {
                    Text("Day \(trip.dayOfTrip)")
                        .font(TravelTypography.display)
                    Text("of \(trip.totalDays)")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Text(trip.departureLabel)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                }
                PremiumProgressBar(
                    progress: appeared ? trip.progress : 0,
                    colors: [theme.tint, theme.sky],
                    height: TravelSpacing.sm
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                Text("\(Int((trip.progress * 100).rounded()))% complete · home in \(trip.daysToReturn) days")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Trip progress, day \(trip.dayOfTrip) of \(trip.totalDays), \(Int((trip.progress * 100).rounded())) percent complete, home in \(trip.daysToReturn) days.")
    }

    // MARK: Timeline & event cards

    private func timelineRow(_ event: TimelineEvent, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: TravelSpacing.md) {
            PremiumTimelineConnector(accent: event.isPast ? Color.secondary : event.accent, showsLine: !isLast)
            eventCard(event)
                .padding(.bottom, isLast ? 0 : TravelSpacing.md)
        }
    }

    private func eventCard(_ event: TimelineEvent) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(event.kind.icon, event.accent)
                        .opacity(event.isPast ? 0.6 : 1)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            Text(event.dateLabel)
                                .font(TravelTypography.eyebrow)
                                .textCase(.uppercase)
                                .foregroundStyle(.secondary)
                            if event.isToday { todayTag }
                        }
                        Text(event.title)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Label("\(event.location) · \(event.time)", systemImage: "mappin.and.ellipse")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(event)
                }

                if event.status != nil || event.payment != nil || event.weather != nil || event.timeZoneNote != nil {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: TravelSpacing.xs) {
                            if let status = event.status { statusBadge(status) }
                            if let payment = event.payment { paymentBadge(payment) }
                            if let weather = event.weather { chip(icon: "cloud.sun.fill", text: weather, tint: theme.sky) }
                            if let tz = event.timeZoneNote { chip(icon: "clock.fill", text: tz, tint: theme.sun) }
                        }
                    }
                }

                Text(event.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText(event))
    }

    private func accessibilityText(_ event: TimelineEvent) -> String {
        var parts = [event.kind.label, event.dateLabel, event.time, event.title, event.location]
        if event.isToday { parts.append("today") }
        if let s = event.status { parts.append(s.label) }
        if let p = event.payment { parts.append(p.label) }
        if let w = event.weather { parts.append("weather \(w)") }
        if let tz = event.timeZoneNote { parts.append(tz) }
        parts.append(event.note)
        return parts.joined(separator: ", ")
    }

    // MARK: Badges & chips

    private func statusBadge(_ status: BookingStatus) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label).textCase(.uppercase)
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
            Text(payment.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(payment.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(payment.accent.opacity(0.15), in: Capsule())
    }

    private func chip(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: icon)
            Text(text)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
    }

    private var todayTag: some View {
        Text("Today")
            .textCase(.uppercase)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(.white)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(theme.coral, in: Capsule())
    }

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedFilter
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedFilter = filter }
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

    private func favouriteButton(_ event: TimelineEvent) -> some View {
        let isFav = favourites.contains(event.id)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(event.id) } else { favourites.insert(event.id) }
            }
        } label: {
            Image(systemName: isFav ? "star.fill" : "star")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(isFav ? theme.sun : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFav ? "Saved event: \(event.title)" : "Save event \(event.title)")
    }

    private var calendarPlaceholder: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "calendar.badge.plus")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Add trip to Calendar")
                        .font(TravelTypography.cardTitle)
                    Text("Sync every event to your calendar. (Placeholder)")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .foregroundStyle(.secondary)
            }
            .padding(TravelSpacing.md)
            .frame(maxWidth: .infinity)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add trip to Calendar. Placeholder button.")
    }

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

    private func matches(_ kind: TimelineEventKind, _ filter: String) -> Bool {
        switch filter {
        case "Flights": return kind == .flight
        case "Ferries": return kind == .ferry
        case "Dives": return kind == .dive
        case "Surf": return kind == .surf
        case "Activities": return kind == .activity
        default: return true
        }
    }
}

// MARK: - Trip timeline appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct TripTimelineAppear: ViewModifier {
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
extension TripTimeline {
    /// A deterministic sample journey across Bali, the Nusas, the Gilis, Lombok,
    /// Komodo and Raja Ampat (mid-trip, day 6 of 14).
    static var sampleIndonesia: TripTimeline {
        TripTimeline(
            heroTitle: "Your Journey",
            heroSubtitle: "Departure to home — Bali, the Nusas, the Gilis, Lombok, Komodo and Raja Ampat.",
            heroSymbol: "map.fill",
            heroGradient: [TravelTheme.current.ocean, TravelTheme.current.tint, TravelTheme.current.sky],
            dayOfTrip: 6,
            totalDays: 14,
            daysToReturn: 8,
            daysToDeparture: 0,
            departureLabel: "12–26 Aug 2025",
            alerts: [
                "Confirm tomorrow’s 09:00 fast boat to Lombok.",
                "Pay the Komodo dive balance before Day 9.",
                "Clocks go +1h (WITA) when you reach Komodo."
            ],
            events: [
                TimelineEvent(dateLabel: "Day 1 · 12 Aug", time: "09:40", title: "London → Denpasar", location: "Bali (DPS)", kind: .flight, status: .confirmed, payment: .paid, timeZoneNote: "Clocks +7h → WIB", note: "Arrive late evening; pre-booked transfer waiting.", isPast: true),
                TimelineEvent(dateLabel: "Day 1 · 12 Aug", time: "22:30", title: "Airport → Sanur", location: "Bali", kind: .transport, status: .confirmed, payment: .paid, note: "Private transfer to the first night’s hotel.", isPast: true),
                TimelineEvent(dateLabel: "Day 2 · 13 Aug", time: "10:30", title: "Fast boat to Nusa Lembongan", location: "Sanur → Lembongan", kind: .ferry, status: .confirmed, payment: .paid, weather: "Sunny 29°C", note: "Golden Queen — calm morning crossing.", isPast: true),
                TimelineEvent(dateLabel: "Day 3 · 14 Aug", time: "08:00", title: "Dive Manta Point", location: "Nusa Penida", kind: .dive, status: .confirmed, payment: .paid, weather: "Sunny 28°C", note: "Reef mantas at the cleaning station.", isPast: true),
                TimelineEvent(dateLabel: "Day 4 · 15 Aug", time: "11:00", title: "Boat to Gili Air", location: "Lembongan → Gili Air", kind: .ferry, status: .confirmed, payment: .paid, note: "Check into the beach bungalow on arrival.", isPast: true),
                TimelineEvent(dateLabel: "Day 5 · 16 Aug", time: "09:00", title: "Dive Shark Point", location: "Gili Trawangan", kind: .dive, status: .confirmed, payment: .paid, weather: "Sunny 29°C", note: "Reef sharks and turtles on an easy reef.", isPast: true),
                TimelineEvent(dateLabel: "Day 6 · 17 Aug", time: "10:00", title: "Snorkel with turtles", location: "Gili Meno", kind: .activity, status: .confirmed, payment: .paid, weather: "Sunny 30°C", note: "Almost-guaranteed turtles at the turtle point.", isToday: true),
                TimelineEvent(dateLabel: "Day 6 · 17 Aug", time: "18:00", title: "Check in for tomorrow’s boat", location: "Gili Air", kind: .checkIn, note: "Reconfirm the 09:00 fast boat to Lombok.", isToday: true),
                TimelineEvent(dateLabel: "Day 7 · 18 Aug", time: "09:00", title: "Fast boat to Bangsal", location: "Gili Air → Lombok", kind: .ferry, status: .needsAttention, payment: .unpaid, note: "Reconfirm and pay — currently unpaid.", isPast: false),
                TimelineEvent(dateLabel: "Day 7 · 18 Aug", time: "12:00", title: "Transfer to Kuta Lombok", location: "Lombok", kind: .transport, status: .confirmed, payment: .paid, note: "Driver pickup at Bangsal harbour.", isPast: false),
                TimelineEvent(dateLabel: "Day 8 · 19 Aug", time: "07:00", title: "Surf Desert Point", location: "Lombok", kind: .surf, status: .pending, payment: .deposit, weather: "Offshore AM", note: "World-class left when it’s working — flexible day.", isPast: false),
                TimelineEvent(dateLabel: "Day 9 · 20 Aug", time: "All day", title: "Rest & catch up", location: "Kuta Lombok", kind: .restDay, note: "A slow day to recharge before Komodo.", isPast: false),
                TimelineEvent(dateLabel: "Day 10 · 21 Aug", time: "11:30", title: "Lombok → Labuan Bajo", location: "Komodo (LBJ)", kind: .flight, status: .pending, payment: .deposit, timeZoneNote: "Clocks +1h → WITA", note: "Short hop to the Komodo gateway.", isPast: false),
                TimelineEvent(dateLabel: "Day 11 · 22 Aug", time: "06:30", title: "Dive Batu Bolong", location: "Komodo NP", kind: .dive, status: .pending, payment: .deposit, weather: "Strong current", note: "Pinnacle dive — reef sharks and mantas.", isPast: false),
                TimelineEvent(dateLabel: "Day 12 · 23 Aug", time: "10:00", title: "Travel day to Raja Ampat", location: "Komodo → Sorong", kind: .travelDay, status: .pending, payment: .deposit, timeZoneNote: "Clocks +1h → WIT", note: "Flights via Sorong; long travel day.", isPast: false),
                TimelineEvent(dateLabel: "Day 13 · 24 Aug", time: "All day", title: "Weather buffer", location: "Raja Ampat", kind: .bufferDay, note: "Spare day in case of flight or sea delays.", isPast: false),
                TimelineEvent(dateLabel: "Day 14 · 26 Aug", time: "13:00", title: "Sorong → Denpasar → London", location: "Home", kind: .returnHome, status: .confirmed, payment: .paid, timeZoneNote: "Clocks −7h on arrival", note: "The long journey home — allow buffer between flights.", isPast: false)
            ]
        )
    }

    /// The same journey seen 12 days before departure — everything still upcoming,
    /// so the departure countdown shows numerically.
    static var samplePreDeparture: TripTimeline {
        var trip = sampleIndonesia
        trip.heroTitle = "Almost There"
        trip.heroSubtitle = "12 days until you fly — Bali, the Nusas, the Gilis, Lombok, Komodo and Raja Ampat."
        trip.dayOfTrip = 0
        trip.daysToReturn = trip.totalDays
        trip.daysToDeparture = 12
        trip.events = sampleIndonesia.events.map { event in
            var copy = event
            copy.isPast = false
            copy.isToday = false
            return copy
        }
        return trip
    }
}

struct TravelTripTimelineDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelTripTimelineDashboard(trip: .sampleIndonesia)
                .previewDisplayName("Trip timeline · Indonesia")

            TravelTripTimelineDashboard(trip: .samplePreDeparture)
                .previewDisplayName("Trip timeline · Countdown")

            TravelTripTimelineDashboard(trip: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Trip timeline · Dynamic Type XL")
        }
    }
}
#endif
