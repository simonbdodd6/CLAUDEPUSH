import SwiftUI

#if DEBUG

// MARK: - Travel Essentials hub preview (Phase 97)
//
// A DEBUG-only assembly screen that brings the twelve standalone practical travel
// guides together into one cohesive "Travel Essentials" hub, using mock data only.
// The whole file lives inside `#if DEBUG`, so it does not exist in release builds,
// is not wired into navigation, and modifies no production screen.
//
// It is composition glue only — it reuses the existing design system
// (`PremiumScrollView`, `PremiumSection`, `PremiumHeroHeader`, `GlassCard`,
// `PremiumPillRow`, `PremiumAdaptiveGrid` and the design tokens) and references the
// existing guide components where safe (it embeds `ExplorerEmergencyGuide` and
// `ExplorerConnectivityGuide` in their compact layouts as a live preview). The
// search/filter bar and the favourite/quick-save stars are UI-only: the stars hold
// presentation `@State`, and nothing performs real navigation, filtering, data,
// networking, persistence, view-model or DTO work.
//
// Accessibility: cards expose combined VoiceOver labels (with the favourite button
// kept independently focusable); text uses the Dynamic Type-scaling
// `TravelTypography` styles and wraps rather than truncating; and all motion is
// disabled under Reduce Motion.

/// Lightweight, DEBUG-only metadata describing one guide area in the hub.
private struct GuideArea: Identifiable {
    let id: String
    let title: String
    let blurb: String
    let icon: String
    let accent: Color
    var urgent: Bool = false
}

struct TravelEssentialsHubPreview: View {

    /// Preview-only destination context.
    private let destination = "Indonesia · Bali, Lombok, the Gilis & Raja Ampat"

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = ["emergency", "connectivity"]

    private let theme = TravelTheme.current

    private var areas: [GuideArea] {
        [
            GuideArea(id: "transport", title: "Transport", blurb: "Getting around safely and efficiently.", icon: "car.fill", accent: theme.tint, urgent: true),
            GuideArea(id: "booking", title: "Booking", blurb: "Where and how to book it right.", icon: "checkmark.seal.fill", accent: theme.sky),
            GuideArea(id: "ferry", title: "Ferry", blurb: "Island-hopping with confidence.", icon: "ferry.fill", accent: theme.ocean),
            GuideArea(id: "scam", title: "Scam & Safety", blurb: "Spot and avoid common scams.", icon: "exclamationmark.shield.fill", accent: theme.coral, urgent: true),
            GuideArea(id: "emergency", title: "Emergency", blurb: "Who to call and what to do.", icon: "cross.case.fill", accent: theme.coral, urgent: true),
            GuideArea(id: "connectivity", title: "Connectivity", blurb: "Stay online anywhere.", icon: "wifi", accent: theme.sky, urgent: true),
            GuideArea(id: "food", title: "Food Safety", blurb: "Eat well and safely.", icon: "fork.knife", accent: theme.sun),
            GuideArea(id: "health", title: "Health", blurb: "Stay healthy on the road.", icon: "heart.fill", accent: theme.moss),
            GuideArea(id: "packing", title: "Packing", blurb: "Pack light and right.", icon: "suitcase.fill", accent: theme.tint),
            GuideArea(id: "budget", title: "Budget Planner", blurb: "Plan your daily spend.", icon: "banknote.fill", accent: theme.moss),
            GuideArea(id: "weather", title: "Weather & Seasons", blurb: "The best time to visit.", icon: "cloud.sun.fill", accent: theme.sun),
            GuideArea(id: "etiquette", title: "Culture & Etiquette", blurb: "Be a respectful guest.", icon: "hands.sparkles.fill", accent: theme.ocean)
        ]
    }

    private var urgentAreas: [GuideArea] { areas.filter(\.urgent) }
    private var startHereAreas: [GuideArea] { areas.filter { ["health", "budget", "etiquette"].contains($0.id) } }
    private let filters = ["All", "Urgent", "On arrival", "Money", "Activities", "Health"]

    var body: some View {
        PremiumScrollView {
            PremiumHeroHeader(
                eyebrow: "Travel Intelligence · \(destination)",
                symbol: "suitcase.fill",
                title: "Travel Essentials",
                subtitle: "Everything you need to travel Indonesia safely and smartly — getting around, staying safe, eating well and making the most of every island."
            )
            .modifier(AppearStagger(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            searchBar
                .modifier(AppearStagger(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            PremiumSection(title: "Start here", subtitle: "New to Indonesia? Begin with these.") {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(startHereAreas) { area in
                        guideCard(area, recommended: true)
                    }
                }
            }
            .modifier(AppearStagger(appeared: appeared, reduceMotion: reduceMotion, index: 2))

            PremiumSection(title: "Quick access", subtitle: "The urgent stuff, one tap away.") {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(urgentAreas) { area in
                        PremiumPillRow(
                            symbol: area.icon,
                            accent: area.accent,
                            title: area.title,
                            subtitle: area.blurb,
                            trailing: "Urgent"
                        )
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(area.title), urgent. \(area.blurb)")
                    }
                }
            }
            .modifier(AppearStagger(appeared: appeared, reduceMotion: reduceMotion, index: 3))

            PremiumSection(title: "Featured guides", subtitle: "A live look at two of the guides, composed in compact form.") {
                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    ExplorerEmergencyGuide(items: emergencyPreview, layout: .compact, title: "Emergency")
                    ExplorerConnectivityGuide(items: connectivityPreview, layout: .compact, title: "Connectivity")
                }
            }
            .modifier(AppearStagger(appeared: appeared, reduceMotion: reduceMotion, index: 4))

            PremiumSection(title: "All guides", subtitle: "Twelve practical guides for your trip.") {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(areas) { area in
                        guideCard(area, recommended: false)
                    }
                }
            }
            .modifier(AppearStagger(appeared: appeared, reduceMotion: reduceMotion, index: 5))
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Search / filter (UI-only placeholder)

    private var searchBar: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            GlassCard {
                HStack(spacing: TravelSpacing.sm) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    Text("Search Travel Essentials")
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Search Travel Essentials. Placeholder, not yet active.")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(Array(filters.enumerated()), id: \.element) { index, filter in
                        filterChip(filter, selected: index == 0)
                    }
                }
            }
            .accessibilityHidden(true)
        }
    }

    private func filterChip(_ text: String, selected: Bool) -> some View {
        Text(text)
            .font(TravelTypography.caption)
            .foregroundStyle(selected ? .white : .secondary)
            .padding(.horizontal, TravelSpacing.md)
            .padding(.vertical, TravelSpacing.xs)
            .background(
                selected ? AnyShapeStyle(theme.tint) : AnyShapeStyle(.thinMaterial),
                in: Capsule()
            )
    }

    // MARK: Guide card

    private func guideCard(_ area: GuideArea, recommended: Bool) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(area.icon, area.accent)
                    Spacer(minLength: 0)
                    favouriteButton(area)
                }

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    if recommended {
                        Text("Recommended")
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(area.accent)
                    }
                    Text(area.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(area.blurb)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(area.title)\(recommended ? ", recommended" : ""). \(area.blurb)")

                HStack(spacing: TravelSpacing.xs) {
                    if area.urgent { tag("Urgent", tint: theme.coral) }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func favouriteButton(_ area: GuideArea) -> some View {
        let isSaved = favourites.contains(area.id)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isSaved { favourites.remove(area.id) } else { favourites.insert(area.id) }
            }
        } label: {
            Image(systemName: isSaved ? "star.fill" : "star")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(isSaved ? theme.sun : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isSaved ? "Saved to favourites: \(area.title)" : "Save \(area.title) to favourites")
    }

    // MARK: Pieces

    private func medallion(_ icon: String, _ accent: Color) -> some View {
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
            .accessibilityHidden(true)
    }

    private func tag(_ text: String, tint: Color) -> some View {
        Text(text)
            .textCase(.uppercase)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(tint)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(tint.opacity(0.15), in: Capsule())
    }

    // MARK: Live-preview mock data (small, representative subsets)

    private var emergencyPreview: [EmergencyItem] {
        [
            EmergencyItem(
                type: "Police", icon: "shield.lefthalf.filled", priority: .high, phoneNumber: "110",
                whenToCall: "Crime, theft or to file a report.",
                firstActions: ["Move to a safe, public place", "Note descriptions and plate numbers"],
                importantNotes: "112 also reaches police nationwide with English operators.",
                phrases: [EmergencyPhrase(indonesian: "Tolong, panggil polisi!", english: "Please call the police!")],
                nearestHelp: "Nearest Polsek; tourist police in resort areas.",
                documents: ["Passport", "Copy of passport"],
                expertAdvice: "Get a written police report — insurers and embassies require it."
            ),
            EmergencyItem(
                type: "Ambulance", icon: "cross.case.fill", priority: .critical, phoneNumber: "118 / 119",
                whenToCall: "Serious injury or sudden severe illness.",
                firstActions: ["Check breathing and bleeding", "Send someone to flag the ambulance"],
                importantNotes: "A taxi to a private hospital is often faster on Bali.",
                phrases: [EmergencyPhrase(indonesian: "Panggil ambulans!", english: "Call an ambulance!")],
                nearestHelp: "Private hospitals (BIMC, Siloam) on Bali.",
                documents: ["ID/passport", "Travel insurance card"],
                expertAdvice: "Save your hotel’s exact address and nearest hospital on arrival."
            )
        ]
    }

    private var connectivityPreview: [ConnectivityItem] {
        [
            ConnectivityItem(
                category: "Local SIM cards", icon: "simcard", bestOption: "Telkomsel or XL from a town store",
                estimatedCost: "Rp 100–150k", setupDifficulty: .easy,
                whereToBuy: "Operator stores and minimarkets",
                activationSteps: ["Bring your passport", "Choose a data package", "Register in-store"],
                paymentMethods: ["Cash", "QRIS"], coverage: .excellent, worksOffline: false, batteryImpact: .medium,
                suitability: "Anyone staying more than a few days",
                expertTip: "City prices undercut the airport — buy once you’re settled.",
                commonMistakes: ["Skipping passport registration"],
                accent: theme.tint
            ),
            ConnectivityItem(
                category: "eSIM providers", icon: "qrcode", bestOption: "Airalo or Nomad eSIM",
                estimatedCost: "$5–20", setupDifficulty: .moderate,
                whereToBuy: "Airalo or Nomad app before you fly",
                activationSteps: ["Buy a plan in the app", "Install the eSIM", "Enable data for the line"],
                paymentMethods: ["Card", "Apple Pay"], coverage: .good, worksOffline: false, batteryImpact: .medium,
                suitability: "Newer phones; arrive connected",
                expertTip: "Install it at home on Wi-Fi so it’s live when you land.",
                commonMistakes: ["Buying for the wrong region"],
                accent: theme.sky
            )
        ]
    }
}

// MARK: - Appearance stagger

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct AppearStagger: ViewModifier {
    let appeared: Bool
    let reduceMotion: Bool
    let index: Int

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 10)
            .animation(reduceMotion ? nil : TravelMotion.gentle.delay(Double(min(index, 8)) * 0.06), value: appeared)
    }
}

struct TravelEssentialsHubPreview_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelEssentialsHubPreview()
                .previewDisplayName("Travel Essentials hub")

            TravelEssentialsHubPreview()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Travel Essentials hub · Dynamic Type XL")
        }
    }
}

#endif
