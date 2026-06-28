import SwiftUI

// MARK: - Travel local transport dashboard (Phase 106)
//
// A premium Local Transport dashboard covering every major way travellers move
// around a destination — ferries, taxis, ride-share, scooters, car hire, buses,
// trains, domestic flights and walking/cycling — alongside a ride-share comparison,
// typical local prices, scam warnings, safety advice, offline tips and a UI-only
// favourites checklist. A caller supplies a `LocalTransportPlan` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumPillRow`,
// `PremiumMetricTile`, `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and
// the tokens — and the Phase-101 `DestinationListItem` for the price list.
// `LocalTransportPlan` / `TransportMode` / `RideShareOption` are lightweight
// presentation models (not DTOs); the dashboard holds no data, networking,
// persistence, repository, view-model, navigation, AppContainer or DTO logic, and is
// not wired into any screen. The favourites checklist toggles are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// A single way of getting around.
struct TransportMode: Identifiable {
    let id: String
    var name: String
    var icon: String
    var bestFor: String
    var priceRange: String
    var providers: [String]
    var note: String
    var accent: Color

    init(id: String? = nil, name: String, icon: String, bestFor: String, priceRange: String, providers: [String], note: String, accent: Color = TravelTheme.current.tint) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.bestFor = bestFor
        self.priceRange = priceRange
        self.providers = providers
        self.note = note
        self.accent = accent
    }
}

/// A ride-share option for the comparison.
struct RideShareOption: Identifiable {
    let id: String
    var name: String
    var icon: String
    var strengths: String
    var priceNote: String
    var accent: Color

    init(id: String? = nil, name: String, icon: String, strengths: String, priceNote: String, accent: Color) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.strengths = strengths
        self.priceNote = priceNote
        self.accent = accent
    }
}

/// The full, presentation-only content for a local transport dashboard.
struct LocalTransportPlan {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var favouriteModes: [String]
    var modes: [TransportMode]
    var rideShare: [RideShareOption]
    var typicalPrices: [DestinationListItem]
    var scamWarnings: [String]
    var safetyAdvice: [String]
    var offlineTips: [String]
}

/// A premium, presentation-only local transport dashboard rendered from a `LocalTransportPlan`.
struct TravelLocalTransportDashboard: View {
    var plan: LocalTransportPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: plan.heroSymbol,
                title: plan.heroTitle,
                subtitle: plan.heroSubtitle,
                gradient: plan.heroGradient,
                metrics: [
                    HeroMetric(value: "\(plan.modes.count)", label: "Ways to move"),
                    HeroMetric(value: "\(plan.typicalPrices.count)", label: "Price guides"),
                    HeroMetric(value: "\(plan.scamWarnings.count)", label: "Scam alerts")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(TransportDashAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            section("Favourite transport", "Tick the ways you’ll use most.", 1) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(plan.favouriteModes, id: \.self) { mode in
                            favouriteRow(mode)
                        }
                    }
                }
            }

            section("Ways to get around", "Every option, with prices and providers.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(plan.modes) { mode in
                        modeCard(mode)
                    }
                }
            }

            section("Ride-share comparison", "Grab vs Gojek at a glance.", 3) {
                PremiumAdaptiveGrid(minimumWidth: 220) {
                    ForEach(plan.rideShare) { option in
                        rideShareCard(option)
                    }
                }
            }

            section("Typical local prices", "What things should cost.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(plan.typicalPrices) { item in
                        PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.title, subtitle: "Typical price", trailing: item.detail)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(item.title), typical price \(item.detail)")
                    }
                }
            }

            section("Scam warnings", "Know these before you ride.", 5) {
                bulletCard(plan.scamWarnings, icon: "exclamationmark.triangle.fill", tint: theme.coral)
            }

            section("Safety advice", "Move around safely.", 6) {
                bulletCard(plan.safetyAdvice, icon: "checkmark.shield.fill", tint: theme.moss)
            }

            section("Offline transport tips", "For when you lose signal.", 7) {
                bulletCard(plan.offlineTips, icon: "wifi.slash", tint: theme.tint)
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
        .modifier(TransportDashAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Cards & rows

    private func favouriteRow(_ mode: String) -> some View {
        let isFav = favourites.contains(mode)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(mode) } else { favourites.insert(mode) }
            }
        } label: {
            HStack(spacing: TravelSpacing.sm) {
                Image(systemName: isFav ? "star.fill" : "star")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isFav ? theme.sun : Color.secondary)
                Text(mode)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isFav ? .secondary : .primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(mode) favourite")
        .accessibilityValue(isFav ? "Yes" : "No")
        .accessibilityHint("Double tap to toggle")
    }

    private func modeCard(_ mode: TransportMode) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(mode.icon, mode.accent)
                    Spacer(minLength: 0)
                    Text(mode.priceRange)
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(mode.accent)
                        .padding(.horizontal, TravelSpacing.sm)
                        .padding(.vertical, TravelSpacing.xxs)
                        .background(mode.accent.opacity(0.15), in: Capsule())
                }
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(mode.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(mode.bestFor)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                providerChips(mode.providers)
                Text(mode.note)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(mode.name). Best for \(mode.bestFor). \(mode.priceRange). Providers: \(mode.providers.joined(separator: ", ")). \(mode.note)")
    }

    private func providerChips(_ providers: [String]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(providers, id: \.self) { provider in
                    Text(provider)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, TravelSpacing.sm)
                        .padding(.vertical, TravelSpacing.xxs)
                        .background(.thinMaterial, in: Capsule())
                }
            }
        }
    }

    private func rideShareCard(_ option: RideShareOption) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(spacing: TravelSpacing.md) {
                    medallion(option.icon, option.accent)
                    Text(option.name)
                        .font(TravelTypography.cardTitle)
                    Spacer(minLength: 0)
                }
                Text(option.strengths)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(alignment: .top, spacing: TravelSpacing.xs) {
                    Image(systemName: "banknote.fill")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(option.accent)
                    Text(option.priceNote)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(option.name). \(option.strengths). \(option.priceNote)")
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
}

// MARK: - Transport dashboard appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct TransportDashAppear: ViewModifier {
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
extension LocalTransportPlan {
    /// A deterministic sample local-transport plan for Indonesia.
    static var sampleIndonesia: LocalTransportPlan {
        let theme = TravelTheme.current
        return LocalTransportPlan(
            heroTitle: "Getting around",
            heroSubtitle: "Every way to move around Bali, Lombok, the Gilis and beyond — with prices, providers and the scams to dodge.",
            heroSymbol: "car.2.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            favouriteModes: ["Ride-share", "Scooter rental", "Fast boats", "Walking & cycling", "Taxis"],
            modes: [
                TransportMode(name: "Ferries & fast boats", icon: "ferry.fill", bestFor: "Island hops: Bali ↔ Gili / Lombok / Nusa", priceRange: "Rp 20k–700k", providers: ["Eka Jaya", "Gili Getaway", "Public ferry"], note: "Book named operators, not beach touts; mornings are calmest.", accent: theme.ocean),
                TransportMode(name: "Taxis", icon: "car.fill", bestFor: "When ride-share apps are blocked", priceRange: "Rp 50–150k", providers: ["Blue Bird", "My Blue Bird app"], note: "Insist on the meter (‘argo’); Blue Bird is the trusted name.", accent: theme.tint),
                TransportMode(name: "Ride-share", icon: "iphone.gen3", bestFor: "Cheap, fixed, tracked city fares", priceRange: "Rp 20–80k", providers: ["Gojek", "Grab"], note: "GoRide motorbikes beat the traffic for solo travellers.", accent: theme.coral),
                TransportMode(name: "Scooter rental", icon: "scooter", bestFor: "Independent exploring on quieter roads", priceRange: "Rp 60–90k/day", providers: ["Reviewed local shops"], note: "Photograph the bike first; never leave your passport as deposit.", accent: theme.moss),
                TransportMode(name: "Car rental", icon: "car.2.fill", bestFor: "Families and longer trips", priceRange: "Rp 300–600k/day", providers: ["Self-drive", "With driver Rp 600–900k/day"], note: "A car with a driver is the easy, low-stress option on Bali.", accent: theme.sky),
                TransportMode(name: "Buses", icon: "bus.fill", bestFor: "The cheapest longer hops", priceRange: "Rp 10–50k", providers: ["Perama", "Kura-Kura Bus", "Bemo"], note: "Kura-Kura Bus is the comfy, fixed-price tourist option.", accent: theme.sun),
                TransportMode(name: "Trains", icon: "train.side.front.car", bestFor: "Java intercity (not Bali or the islands)", priceRange: "Rp 100–600k", providers: ["KAI app"], note: "Trains run on Java only — there are none on Bali or the Gilis.", accent: theme.tint),
                TransportMode(name: "Domestic flights", icon: "airplane", bestFor: "Long hops: Bali ↔ Komodo / Raja Ampat", priceRange: "from ~Rp 800k", providers: ["Garuda", "Lion Air", "Wings Air"], note: "Baggage limits are small — pre-pay extra kilos online.", accent: theme.sky),
                TransportMode(name: "Walking & cycling", icon: "bicycle", bestFor: "Car-free islands and town centres", priceRange: "Free–Rp 50k/day", providers: ["Bike hire on the Gilis"], note: "The Gilis have no motor vehicles — walk or cycle everywhere.", accent: theme.moss)
            ],
            rideShare: [
                RideShareOption(name: "Grab", icon: "iphone.gen3", strengths: "Wider regional coverage; cars and bikes; in-app wallet.", priceNote: "Similar fares to Gojek; sometimes cheaper for cars.", accent: theme.coral),
                RideShareOption(name: "Gojek", icon: "iphone.gen3", strengths: "Strong in Bali; rides, food and payments in one app.", priceNote: "GoRide motorbikes are usually the cheapest option.", accent: theme.moss)
            ],
            typicalPrices: [
                DestinationListItem(icon: "car.fill", title: "Metered taxi", detail: "≈ Rp 6.5k/km + Rp 7.5k start", accent: theme.tint),
                DestinationListItem(icon: "scooter", title: "Scooter rental", detail: "Rp 60–90k/day", accent: theme.moss),
                DestinationListItem(icon: "ferry.fill", title: "Fast boat to the Gilis", detail: "Rp 250–450k", accent: theme.ocean),
                DestinationListItem(icon: "ferry", title: "Public ferry (Bangsal → Gili)", detail: "Rp 20k", accent: theme.ocean),
                DestinationListItem(icon: "airplane", title: "Airport transfer (DPS → Ubud)", detail: "Rp 300–400k", accent: theme.sky),
                DestinationListItem(icon: "airplane.departure", title: "Domestic flight (Bali → Labuan Bajo)", detail: "from Rp 800k", accent: theme.sky),
                DestinationListItem(icon: "bicycle", title: "Bike hire (Gili)", detail: "Rp 50k/day", accent: theme.moss)
            ],
            scamWarnings: [
                "Unmetered taxis quoting fixed, inflated fares — use Blue Bird or insist on the meter.",
                "Beach touts selling ‘fast boats’ with no safety gear — buy at the official operator desk.",
                "Scooter shops claiming pre-existing damage on return — photograph the bike first.",
                "Fake ‘no app pickups here’ signs in tourist zones to force a cash deal."
            ],
            safetyAdvice: [
                "Always wear the helmet on scooters; check the brakes and tyres before riding.",
                "Confirm boats carry life jackets and a passenger manifest before you board.",
                "Share your live ride location with someone you trust.",
                "Avoid riding scooters at night on unlit roads."
            ],
            offlineTips: [
                "Download offline maps (Google Maps or Maps.me) before you lose signal.",
                "Screenshot ferry schedules and your booking confirmations.",
                "Keep small cash — many drivers and public ferries are cash-only.",
                "Save the Blue Bird number and your hotel address offline."
            ]
        )
    }
}

struct TravelLocalTransportDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelLocalTransportDashboard(plan: .sampleIndonesia)
                .previewDisplayName("Local transport · Indonesia")

            TravelLocalTransportDashboard(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Local transport · Dynamic Type XL")
        }
    }
}
#endif
