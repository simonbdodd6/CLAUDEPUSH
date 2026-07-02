import SwiftUI

// MARK: - Travel accommodation guide (Phase 109)
//
// A premium accommodation dashboard covering every stage of choosing and staying in
// accommodation — types (hotels, hostels, guesthouses, villas, homestays, resorts,
// eco lodges, liveaboards), a budget-vs-luxury comparison, booking tips, best areas,
// check-in/out checklists, room safety, Wi-Fi/SIM, laundry, coworking, family,
// couple/honeymoon and accessibility advice, plus a UI-only favourites checklist. A
// caller supplies an `AccommodationGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `PremiumAdaptiveGrid`, `PremiumPillRow`,
// `PremiumMetricTile`, `GlassCard`, `MapTexturePlaceholder`, `TravelTypography` and
// the tokens — and the Phase-101 `DestinationListItem`. `AccommodationGuide` /
// `AccommodationType` are lightweight presentation models (not DTOs); the dashboard
// holds no data, networking, persistence, repository, view-model, navigation,
// AppContainer or DTO logic, and is not wired into any screen. The favourites
// checklist toggles are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels; checklist items are
// independently focusable toggle buttons; text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// A type of accommodation with a gradient image placeholder.
struct AccommodationType: Identifiable {
    let id: String
    var name: String
    var icon: String
    var bestFor: String
    var priceRange: String
    var note: String
    var gradient: [Color]

    init(id: String? = nil, name: String, icon: String, bestFor: String, priceRange: String, note: String, gradient: [Color]) {
        self.id = id ?? name
        self.name = name
        self.icon = icon
        self.bestFor = bestFor
        self.priceRange = priceRange
        self.note = note
        self.gradient = gradient
    }
}

/// The full, presentation-only content for an accommodation guide.
struct AccommodationGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var favouriteTypes: [String]
    var types: [AccommodationType]
    var budgetVsLuxury: [DestinationListItem]
    var bestAreas: [DestinationListItem]
    var coworking: [DestinationListItem]
    var bookingTips: [String]
    var checkIn: [String]
    var checkOut: [String]
    var roomSafety: [String]
    var wifiSim: [String]
    var laundry: [String]
    var familyFriendly: [String]
    var coupleHoneymoon: [String]
    var accessibility: [String]
}

/// A premium, presentation-only accommodation guide rendered from an `AccommodationGuide`.
struct TravelAccommodationGuide: View {
    var guide: AccommodationGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Travel Intelligence",
                symbol: guide.heroSymbol,
                title: guide.heroTitle,
                subtitle: guide.heroSubtitle,
                gradient: guide.heroGradient,
                metrics: [
                    HeroMetric(value: "\(guide.types.count)", label: "Stay types"),
                    HeroMetric(value: "\(guide.bestAreas.count)", label: "Top areas"),
                    HeroMetric(value: "\(guide.budgetVsLuxury.count)", label: "Tiers")
                ],
                texture: { MapTexturePlaceholder() }
            )
            .modifier(AccomAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            stayGroup
            bookingGroup
            audienceGroup
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Section helpers

    // MARK: Scroll sections (grouped to stay within the ViewBuilder arity limit)

    private var stayGroup: some View {
        Group {
            section("Favourite stay types", "Tick what you’re after.", 1) {
                GlassCard {
                    VStack(spacing: TravelSpacing.xs) {
                        ForEach(guide.favouriteTypes, id: \.self) { type in
                            favouriteRow(type)
                        }
                    }
                }
            }

            section("Where to stay", "Every type, with prices.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 220) {
                    ForEach(guide.types) { type in
                        typeCard(type)
                    }
                }
            }

            listSection("Budget vs luxury", "What each tier gets you.", guide.budgetVsLuxury, tag: "Tier", 3)
            listSection("Best areas to stay", "Pick the right base.", guide.bestAreas, tag: "Area", 4)
        }
    }

    private var bookingGroup: some View {
        Group {
            section("Booking tips", "Book smart.", 5) {
                bulletCard(guide.bookingTips, icon: "checkmark.circle.fill", tint: theme.moss)
            }

            section("Check-in checklist", "On arrival.", 6) {
                bulletCard(guide.checkIn, icon: "arrow.down.circle.fill", tint: theme.ocean)
            }

            section("Check-out checklist", "Before you leave.", 7) {
                bulletCard(guide.checkOut, icon: "arrow.up.circle.fill", tint: theme.sun)
            }

            section("Room safety", "Stay secure.", 8) {
                bulletCard(guide.roomSafety, icon: "lock.shield.fill", tint: theme.coral)
            }

            section("Wi-Fi & SIM", "Stay connected.", 9) {
                bulletCard(guide.wifiSim, icon: "wifi", tint: theme.sky)
            }

            section("Laundry", "Pack light, wash often.", 10) {
                bulletCard(guide.laundry, icon: "washer.fill", tint: theme.tint)
            }
        }
    }

    private var audienceGroup: some View {
        Group {
            listSection("Coworking-friendly", "For working travellers.", guide.coworking, tag: "Work", 11)

            section("Family-friendly", "Travelling with kids.", 12) {
                bulletCard(guide.familyFriendly, icon: "figure.2.and.child.holdinghands", tint: theme.moss)
            }

            section("Couples & honeymoon", "Romantic escapes.", 13) {
                bulletCard(guide.coupleHoneymoon, icon: "heart.fill", tint: theme.coral)
            }

            section("Accessibility", "Plan ahead for access.", 14) {
                bulletCard(guide.accessibility, icon: "figure.roll", tint: theme.tint)
            }
        }
    }

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(AccomAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    private func listSection(_ title: String, _ subtitle: String, _ items: [DestinationListItem], tag: String, _ index: Int) -> some View {
        section(title, subtitle, index) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(items) { item in
                    PremiumPillRow(symbol: item.icon, accent: item.accent, title: item.title, subtitle: item.detail, trailing: tag)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(item.title). \(item.detail)")
                }
            }
        }
    }

    // MARK: Cards & rows

    private func favouriteRow(_ type: String) -> some View {
        let isFav = favourites.contains(type)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isFav { favourites.remove(type) } else { favourites.insert(type) }
            }
        } label: {
            HStack(spacing: TravelSpacing.sm) {
                Image(systemName: isFav ? "star.fill" : "star")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isFav ? theme.sun : Color.secondary)
                Text(type)
                    .font(TravelTypography.caption)
                    .foregroundStyle(isFav ? .secondary : .primary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(type) favourite")
        .accessibilityValue(isFav ? "Yes" : "No")
        .accessibilityHint("Double tap to toggle")
    }

    private func typeCard(_ type: AccommodationType) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: type.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topLeading) {
                        Image(systemName: type.icon)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.9))
                            .padding(TravelSpacing.md)
                    }
                    .overlay(alignment: .bottomTrailing) {
                        Text(type.priceRange)
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.white)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xxs)
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(TravelSpacing.sm)
                    }
                    .frame(height: 96)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(type.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(type.bestFor)
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(type.note)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(type.name), \(type.priceRange). Best for \(type.bestFor). \(type.note)")
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
}

// MARK: - Accommodation appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct AccomAppear: ViewModifier {
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
extension AccommodationGuide {
    /// A deterministic sample accommodation guide for Indonesia.
    static var sampleIndonesia: AccommodationGuide {
        let theme = TravelTheme.current
        return AccommodationGuide(
            heroTitle: "Where to Stay",
            heroSubtitle: "From homestays to liveaboards — choosing and staying in the right place across Bali, Lombok, the Gilis, Komodo & Raja Ampat.",
            heroSymbol: "bed.double.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sun.opacity(0.6)],
            favouriteTypes: ["Hotels", "Villas", "Homestays", "Hostels", "Resorts"],
            types: [
                AccommodationType(name: "Hotels", icon: "bed.double.fill", bestFor: "Reliable comfort & service", priceRange: "Rp 500k–2m", note: "Star-rated, with pools, AC and breakfast.", gradient: [theme.ocean, theme.sky]),
                AccommodationType(name: "Hostels", icon: "bunkbed.fill", bestFor: "Budget & social", priceRange: "Rp 120–300k", note: "Dorms and privates — great for solo travellers.", gradient: [theme.coral, theme.sun]),
                AccommodationType(name: "Guesthouses", icon: "house.fill", bestFor: "Local charm, good value", priceRange: "Rp 250–600k", note: "Family-run, often with a small pool.", gradient: [theme.sun, theme.moss]),
                AccommodationType(name: "Villas", icon: "house.lodge.fill", bestFor: "Privacy & space", priceRange: "Rp 1m–5m+", note: "Private pool; ideal for groups and families.", gradient: [theme.tint, theme.ocean]),
                AccommodationType(name: "Homestays", icon: "house.circle.fill", bestFor: "Authentic & affordable", priceRange: "Rp 150–400k", note: "Stay with a local family — the heart of Raja Ampat.", gradient: [theme.moss, theme.sky]),
                AccommodationType(name: "Resorts", icon: "star.fill", bestFor: "All-in luxury", priceRange: "Rp 2m–10m+", note: "Beachfront, with spas and several restaurants.", gradient: [theme.coral, theme.sun]),
                AccommodationType(name: "Eco lodges", icon: "leaf.fill", bestFor: "Sustainable & remote", priceRange: "Rp 600k–3m", note: "Off-grid comfort, immersed in nature.", gradient: [theme.moss, theme.ocean]),
                AccommodationType(name: "Liveaboards", icon: "sailboat.fill", bestFor: "Dive trips at sea", priceRange: "Rp 3m–12m/day", note: "A floating dive base for Komodo and Raja Ampat.", gradient: [theme.ocean, theme.tint])
            ],
            budgetVsLuxury: [
                DestinationListItem(icon: "bunkbed.fill", title: "Budget", detail: "Rp 120–400k · hostels, homestays, fan rooms.", accent: theme.moss),
                DestinationListItem(icon: "bed.double.fill", title: "Mid-range", detail: "Rp 500k–1.5m · guesthouses and 3–4★ hotels with AC and a pool.", accent: theme.sun),
                DestinationListItem(icon: "star.fill", title: "Luxury", detail: "Rp 2m–10m+ · villas and resorts with full service.", accent: theme.coral)
            ],
            bestAreas: [
                DestinationListItem(icon: "leaf.fill", title: "Ubud (Bali)", detail: "Jungle, yoga and culture.", accent: theme.moss),
                DestinationListItem(icon: "figure.surfing", title: "Canggu (Bali)", detail: "Surf, cafés and digital nomads.", accent: theme.sun),
                DestinationListItem(icon: "wineglass.fill", title: "Seminyak (Bali)", detail: "Beach clubs and boutiques.", accent: theme.coral),
                DestinationListItem(icon: "sunset.fill", title: "Uluwatu (Bali)", detail: "Clifftop sunsets and surf.", accent: theme.ocean),
                DestinationListItem(icon: "beach.umbrella.fill", title: "Gili Air", detail: "Car-free island calm.", accent: theme.sky),
                DestinationListItem(icon: "water.waves", title: "Kuta Lombok", detail: "Empty beaches and surf breaks.", accent: theme.moss),
                DestinationListItem(icon: "ferry.fill", title: "Labuan Bajo (Komodo)", detail: "Gateway to Komodo National Park.", accent: theme.tint),
                DestinationListItem(icon: "fish.fill", title: "Waisai (Raja Ampat)", detail: "Remote reefs; mostly homestays.", accent: theme.ocean)
            ],
            coworking: [
                DestinationListItem(icon: "laptopcomputer", title: "Canggu", detail: "Bali’s nomad hub — many cafés and coworking spaces.", accent: theme.sun),
                DestinationListItem(icon: "leaf.fill", title: "Ubud", detail: "Quieter coworking with jungle views.", accent: theme.moss),
                DestinationListItem(icon: "person.3.fill", title: "Coliving stays", detail: "Rooms, desks and community for longer stays.", accent: theme.tint)
            ],
            bookingTips: [
                "Message the property directly to match the platform price minus commission.",
                "Read recent reviews — verify Gili and villa listings are genuine.",
                "Book early for July–August and Christmas/New Year.",
                "Check the cancellation policy and any taxes or service charges."
            ],
            checkIn: [
                "Confirm the Wi-Fi, AC and hot water all work.",
                "Note the exits and the nearest hospital.",
                "Photograph any existing damage.",
                "Ask about late check-out and laundry."
            ],
            checkOut: [
                "Settle any extras (minibar, tours, laundry).",
                "Check you’ve left nothing in the safe or charging.",
                "Confirm your onward transfer time.",
                "Leave a review to help other travellers."
            ],
            roomSafety: [
                "Use the in-room safe for valuables and your passport.",
                "Lock doors and windows, especially on the ground floor.",
                "Keep a torch handy for power cuts.",
                "Don’t leave valuables visible near open windows."
            ],
            wifiSim: [
                "Test the Wi-Fi speed on arrival — island connections can be slow.",
                "Buy a Telkomsel or XL SIM on the mainland as a backup.",
                "Use a VPN on shared or public Wi-Fi.",
                "Pocket Wi-Fi suits groups needing reliable data."
            ],
            laundry: [
                "Per-kilo laundries are everywhere (≈ Rp 10–25k/kg).",
                "Same-day service costs a little more.",
                "Many guesthouses offer laundry directly.",
                "Quick-dry fabrics mean you can pack less."
            ],
            familyFriendly: [
                "Villas with a private pool and a kitchen suit families.",
                "Choose resorts with kids’ clubs and shallow pools.",
                "Ground-floor and connecting rooms help with young children.",
                "Gili Air and Sanur are calm, family-friendly bases."
            ],
            coupleHoneymoon: [
                "Private-pool villas in Ubud or Uluwatu for seclusion.",
                "Beachfront resorts in the Gilis and Nusa islands.",
                "Ask about honeymoon perks — flowers, breakfast in bed.",
                "Raja Ampat eco-resorts for a remote, romantic escape."
            ],
            accessibility: [
                "Confirm step-free access — many villas and islands have stairs or sand.",
                "Lifts are rare outside larger hotels; ask before booking.",
                "Gili and homestay boarding is by beach-launch — not step-free.",
                "Message the property about specific mobility needs in advance."
            ]
        )
    }
}

struct TravelAccommodationGuide_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelAccommodationGuide(guide: .sampleIndonesia)
                .previewDisplayName("Accommodation · Indonesia")

            TravelAccommodationGuide(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Accommodation · Dynamic Type XL")
        }
    }
}
#endif
