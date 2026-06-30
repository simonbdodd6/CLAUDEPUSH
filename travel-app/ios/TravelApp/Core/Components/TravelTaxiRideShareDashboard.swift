import SwiftUI

// MARK: - Travel taxi & ride-share dashboard (Phase 133)
//
// A flagship, presentation-only Taxi & Ride Share dashboard for Indonesia: a hero,
// at-a-glance facts, a Grab / Gojek / Bluebird comparison with cost/convenience/safety
// indicators, an airport-transfer guide, typical price ranges, a ride-hailing
// checklist, payment notes, scam warnings with safety badges, a scooter-taxi (ojek)
// warning, private-driver tips, destination-by-destination transport notes and a
// disclaimer. A caller supplies a `RideGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. The `Ride*` model names are
// deliberately distinct from Phase 126's `Transport*`/`GettingAround*` types to avoid
// any collision. `RideGuide` and its nested rows are lightweight presentation models
// (not DTOs); the component holds no data, networking, persistence, repository, view-
// model, navigation, AppContainer or DTO logic, and is not wired into any screen. The
// favourite stars are UI-only and all figures are illustrative.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A ride-safety level — drives the badge label and accent.
enum RideSafety {
    case trusted
    case caution
    case avoid

    var label: String {
        switch self {
        case .trusted: "Trusted"
        case .caution: "Caution"
        case .avoid: "Avoid"
        }
    }

    var icon: String {
        switch self {
        case .trusted: "checkmark.shield.fill"
        case .caution: "exclamationmark.triangle.fill"
        case .avoid: "hand.raised.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .trusted: return theme.moss
        case .caution: return theme.sun
        case .avoid: return theme.coral
        }
    }
}

/// A single at-a-glance ride fact.
struct RideFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A ride option in the comparison, with 0–4 indicator levels.
struct RideOption: Identifiable {
    let id: String
    var name: String
    var tagline: String
    var icon: String
    var cost: Int
    var convenience: Int
    var safety: Int
    var rating: RideSafety
    var bestFor: String
    var detail: String

    init(name: String, tagline: String, icon: String, cost: Int, convenience: Int, safety: Int, rating: RideSafety, bestFor: String, detail: String) {
        self.id = name
        self.name = name
        self.tagline = tagline
        self.icon = icon
        self.cost = cost
        self.convenience = convenience
        self.safety = safety
        self.rating = rating
        self.bestFor = bestFor
        self.detail = detail
    }
}

/// A generic ride guide row reused for airport, prices, payment, scams, ojek, driver.
struct RideRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
    var safety: RideSafety?

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color, safety: RideSafety? = nil) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
        self.safety = safety
    }
}

/// A destination-by-destination transport note.
struct RideDestination: Identifiable {
    let id = UUID()
    var name: String
    var recommended: String
    var icon: String
    var detail: String
    var accent: Color
}

/// A ride-hailing checklist item.
struct RideCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for a taxi & ride-share guide.
struct RideGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [RideFact]
    var options: [RideOption]
    var airport: [RideRow]
    var prices: [RideRow]
    var checklist: [RideCheckItem]
    var payment: [RideRow]
    var scams: [RideRow]
    var ojekWarnings: [RideRow]
    var driverTips: [RideRow]
    var destinations: [RideDestination]
    var disclaimer: String
}

/// A premium, presentation-only taxi & ride-share dashboard rendered from a `RideGuide`.
struct TravelTaxiRideShareDashboard: View {
    var guide: RideGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            appsGroup
            payGroup
            destGroup
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
            eyebrow: "Taxis & Ride Share",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Best app"), label: "App"),
                HeroMetric(value: factValue("Airport"), label: "Airport"),
                HeroMetric(value: factValue("Safest"), label: "Safest")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(RideAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Getting a ride.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Airport transfers", "From the terminal.", 2) {
                infoList(guide.airport)
            }
        }
    }

    private var appsGroup: some View {
        Group {
            section("Grab vs Gojek vs Bluebird", "Compare your options.", 3) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.options) { option in
                        optionCard(option)
                    }
                }
            }

            section("Typical prices", "Rough fare ranges.", 4) {
                infoList(guide.prices)
            }

            section("Ride-hailing checklist", "Before you get in.", 5) {
                checklistCard(guide.checklist)
            }
        }
    }

    private var payGroup: some View {
        Group {
            section("Paying", "Cash, card and e-wallet.", 6) {
                infoList(guide.payment)
            }

            section("Scam warnings", "Spot them early.", 7) {
                infoList(guide.scams)
            }

            section("Scooter taxis (ojek)", "Ride with care.", 8) {
                infoList(guide.ojekWarnings)
            }

            section("Private drivers", "A day on your terms.", 8) {
                infoList(guide.driverTips)
            }
        }
    }

    private var destGroup: some View {
        Group {
            section("By destination", "What works where.", 8) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.destinations) { destination in
                        destinationCard(destination)
                    }
                }
            }

            section("Good to know", "About these fares.", 8) {
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
        .modifier(RideAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: RideFact) -> some View {
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

    // MARK: Option cards

    private func optionCard(_ option: RideOption) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(option.icon, theme.tint)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack(spacing: TravelSpacing.xs) {
                            Text(option.name)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                            safetyBadge(option.rating)
                        }
                        Text(option.tagline)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(option.id, option.name)
                }
                PremiumAdaptiveGrid(minimumWidth: 132) {
                    ratingRow("Cost", option.cost, theme.sun)
                    ratingRow("Convenience", option.convenience, theme.tint)
                    ratingRow("Safety", option.safety, theme.moss)
                }
                Label("Best for: \(option.bestFor)", systemImage: "star.circle.fill")
                    .font(TravelTypography.caption)
                    .foregroundStyle(theme.tint)
                    .fixedSize(horizontal: false, vertical: true)
                Text(option.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option.name), \(option.tagline), \(option.rating.label). Cost \(option.cost) of 4, convenience \(option.convenience), safety \(option.safety). Best for \(option.bestFor). \(option.detail)")
    }

    private func ratingRow(_ label: String, _ level: Int, _ tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xs) {
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            Spacer(minLength: 0)
            HStack(spacing: 3) {
                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .fill(index < level ? tint : Color.secondary.opacity(0.25))
                        .frame(width: 7, height: 7)
                }
            }
        }
        .padding(.vertical, TravelSpacing.xxs)
    }

    private func safetyBadge(_ safety: RideSafety) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: safety.icon)
            Text(safety.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(safety.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(safety.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Destination cards

    private func destinationCard(_ destination: RideDestination) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(destination.icon, destination.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(destination.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(destination.recommended, destination.accent)
                    }
                    Text(destination.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("dest-\(destination.name)", destination.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(destination.name), best: \(destination.recommended). \(destination.detail)")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [RideRow]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(row.icon, row.accent)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            HStack(spacing: TravelSpacing.xs) {
                                Text(row.title)
                                    .font(TravelTypography.cardTitle)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let safety = row.safety {
                                    safetyBadge(safety)
                                }
                            }
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
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? "")\(row.safety.map { ", \($0.label)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Checklist

    private func checklistCard(_ items: [RideCheckItem]) -> some View {
        GlassCard {
            VStack(spacing: TravelSpacing.xs) {
                ForEach(items) { item in
                    HStack(alignment: .top, spacing: TravelSpacing.sm) {
                        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(item.done ? theme.moss : Color.secondary)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(item.name)
                                .font(TravelTypography.caption)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(item.note)
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(item.name), \(item.done ? "done" : "to do"). \(item.note)")
                }
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
                    Text("Fares & availability vary")
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
        .accessibilityLabel("Fares and availability vary. \(guide.disclaimer)")
    }

    // MARK: Shared bits

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
        .accessibilityLabel(isFav ? "Saved option: \(name)" : "Save option \(name)")
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
}

// MARK: - Ride appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct RideAppear: ViewModifier {
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
extension RideGuide {
    /// A deterministic sample taxi & ride-share guide for Indonesia (illustrative rates).
    static var sampleIndonesia: RideGuide {
        let theme = TravelTheme.current
        return RideGuide(
            heroTitle: "Taxis & Ride Share",
            heroSubtitle: "Apps beat haggling — here’s how to ride safely and pay fairly across Indonesia.",
            heroSymbol: "car.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sun],
            facts: [
                RideFact(icon: "iphone.gen3", label: "Best app", value: "Gojek / Grab"),
                RideFact(icon: "airplane.arrival", label: "Airport", value: "Rp 150–300k"),
                RideFact(icon: "checkmark.shield.fill", label: "Safest", value: "Apps / Bluebird"),
                RideFact(icon: "arrow.left.and.right", label: "Drive side", value: "Left")
            ],
            options: [
                RideOption(name: "Grab", tagline: "Ride-hailing app", icon: "car.fill", cost: 1, convenience: 4, safety: 3, rating: .trusted, bestFor: "Everyday rides", detail: "Car (GrabCar) and bike (GrabBike) at an app-set price — no haggling, with driver details and trip sharing."),
                RideOption(name: "Gojek", tagline: "Super-app", icon: "scooter", cost: 1, convenience: 4, safety: 3, rating: .trusted, bestFor: "Bikes & food", detail: "GoRide bikes are the cheapest way around town; also cars, food and payments. Top up at minimarts."),
                RideOption(name: "Bluebird", tagline: "Metered taxi", icon: "car.top.radiowaves.rear.right.fill", cost: 2, convenience: 3, safety: 4, rating: .trusted, bestFor: "Airport & no app", detail: "Reputable metered taxis in Bali, Jakarta and Lombok — book in the official app or insist on the meter.")
            ],
            airport: [
                RideRow(title: "Pre-booked transfer", subtitle: "Easiest", icon: "airplane.arrival", detail: "Arrange a hotel pickup or private transfer to skip the arrivals scrum.", accent: theme.tint, safety: .trusted),
                RideRow(title: "Official taxi counter", subtitle: "Fixed price", icon: "car.fill", detail: "Pay at the airport taxi desk for a set fare; Bali (DPS) to Kuta is ~Rp 150–300k.", accent: theme.ocean, safety: .trusted),
                RideRow(title: "App pickup zone", subtitle: "Cheaper", icon: "iphone.gen3", detail: "Gojek/Grab can be cheaper but may require walking to a designated pickup area.", accent: theme.moss, safety: .trusted),
                RideRow(title: "Arrivals touts", subtitle: "Skip them", icon: "exclamationmark.triangle.fill", detail: "Ignore drivers shouting ‘taxi, transport’ with inflated flat fares.", accent: theme.coral, safety: .avoid)
            ],
            prices: [
                RideRow(title: "GoRide / GrabBike", subtitle: "Short hop", icon: "scooter", detail: "Around Rp 15–30k for a typical in-town bike ride.", accent: theme.tint),
                RideRow(title: "GoCar / GrabCar", subtitle: "Town", icon: "car.fill", detail: "Roughly Rp 40–80k for a normal car trip across town.", accent: theme.ocean),
                RideRow(title: "Bluebird metered", subtitle: "Per trip", icon: "gauge.with.dots.needle.bottom.50percent", detail: "Flagfall ~Rp 7.5k then a per-km rate on the meter.", accent: theme.sky),
                RideRow(title: "Airport → Seminyak", subtitle: "Transfer", icon: "airplane", detail: "About Rp 150–300k depending on traffic and how you book.", accent: theme.sun),
                RideRow(title: "Full-day private car", subtitle: "8–10 h", icon: "steeringwheel", detail: "Roughly Rp 600–800k including driver and fuel — great value for groups.", accent: theme.moss)
            ],
            checklist: [
                RideCheckItem(name: "Check name & plate", done: true, note: "Match the car to the app before getting in"),
                RideCheckItem(name: "Share your trip", done: true, note: "Send live trip status to someone"),
                RideCheckItem(name: "Confirm the destination", done: false, note: "It’s already set in the app — don’t re-negotiate"),
                RideCheckItem(name: "Address in Bahasa", done: false, note: "Have it written down for the driver"),
                RideCheckItem(name: "Pay the app price", done: false, note: "Don’t pay extra cash on top")
            ],
            payment: [
                RideRow(title: "Cash still common", subtitle: "Carry small notes", icon: "banknote.fill", detail: "Many drivers prefer cash — keep small rupiah for the exact fare.", accent: theme.moss),
                RideRow(title: "E-wallets (GoPay/OVO)", subtitle: "In-app", icon: "iphone", detail: "Cashless and tidy, but topping up usually needs a local number.", accent: theme.tint),
                RideRow(title: "Cards", subtitle: "Limited", icon: "creditcard.fill", detail: "Some apps accept cards; many local drivers don’t — have cash as backup.", accent: theme.ocean),
                RideRow(title: "Fare shown up front", subtitle: "No surprises", icon: "tag.fill", detail: "The app price is fixed before you ride, so there’s nothing to argue over.", accent: theme.sun)
            ],
            scams: [
                RideRow(title: "No-meter taxis", subtitle: "Touts", icon: "exclamationmark.triangle.fill", detail: "Drivers refusing the meter quote inflated flat fares — use an app or insist on ‘argo’.", accent: theme.coral, safety: .avoid),
                RideRow(title: "‘App is broken, pay cash’", subtitle: "Upsell", icon: "iphone.slash", detail: "A driver who cancels the app to charge more cash — decline and rebook.", accent: theme.sun, safety: .caution),
                RideRow(title: "Rigged meters", subtitle: "Fast clocks", icon: "gauge.with.dots.needle.100percent", detail: "Rare with Bluebird, but if a meter races, end the trip and pay a fair amount.", accent: theme.sun, safety: .caution),
                RideRow(title: "‘Your hotel is closed’", subtitle: "Diversion", icon: "building.2.fill", detail: "A ploy to take you to a commission shop — insist on your destination.", accent: theme.sun, safety: .caution)
            ],
            ojekWarnings: [
                RideRow(title: "App ojek vs street ojek", subtitle: "Choose the app", icon: "scooter", detail: "GoRide/GrabBike give a fixed price, driver details and some insurance — safer than informal street ojeks.", accent: theme.tint, safety: .caution),
                RideRow(title: "Wear the helmet", subtitle: "Every time", icon: "shield.lefthalf.filled", detail: "Insist on a helmet; informal ojeks don’t always provide a good one.", accent: theme.sun, safety: .caution),
                RideRow(title: "Ride within reason", subtitle: "Your call", icon: "exclamationmark.triangle.fill", detail: "Bikes weave through dense traffic — skip them in heavy rain or if you’re unsure.", accent: theme.coral, safety: .caution)
            ],
            driverTips: [
                RideRow(title: "Day hire", subtitle: "≈ Rp 600–800k", icon: "steeringwheel", detail: "Car, driver and fuel for 8–10 hours — ideal for temples, sightseeing and groups.", accent: theme.moss, safety: .trusted),
                RideRow(title: "Book through your hotel", subtitle: "Or WhatsApp", icon: "message.fill", detail: "Arrange a recommended driver and agree the route and price up front.", accent: theme.tint),
                RideRow(title: "Tip for a good day", subtitle: "Appreciated", icon: "hand.thumbsup.fill", detail: "Rp 50–100k for a friendly, helpful driver is generous and welcome.", accent: theme.sun)
            ],
            destinations: [
                RideDestination(name: "South Bali", recommended: "Apps + driver", icon: "leaf.fill", detail: "Grab/Gojek everywhere, but some Canggu/Ubud zones restrict app pickups — walk out a little to meet your driver.", accent: theme.tint),
                RideDestination(name: "Ubud centre", recommended: "Private driver", icon: "building.columns.fill", detail: "App pickups are limited in the centre; a private driver is popular for temple-hopping.", accent: theme.ocean),
                RideDestination(name: "Gili Islands", recommended: "Cidomo / cycle", icon: "bicycle", detail: "No cars or motorbikes at all — get around on foot, by bicycle or by cidomo (pony cart).", accent: theme.moss),
                RideDestination(name: "Lombok", recommended: "Arrange ahead", icon: "mountain.2.fill", detail: "Fewer app drivers and longer distances — pre-arrange transfers or hire a driver.", accent: theme.sun),
                RideDestination(name: "Labuan Bajo", recommended: "Walk + boats", icon: "ferry.fill", detail: "A small, walkable town with few taxis; boats matter far more than road transport.", accent: theme.coral)
            ],
            disclaimer: "Live fares, availability and app coverage need an internet connection and change often. The figures here are illustrative estimates only — confirm in the app or with the driver, and use reputable, licensed services."
        )
    }
}

struct TravelTaxiRideShareDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelTaxiRideShareDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Taxis & ride share · Indonesia")

            TravelTaxiRideShareDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Taxis & ride share · Dynamic Type XL")
        }
    }
}
#endif
