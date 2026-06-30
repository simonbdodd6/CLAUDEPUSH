import SwiftUI

// MARK: - Travel connectivity & eSIM dashboard (Phase 121)
//
// A flagship, presentation-only Connectivity & eSIM dashboard: a hero with
// at-a-glance facts (best provider, typical coverage, eSIM support, average speed), a
// local provider comparison (Telkomsel / XL / Indosat / Smartfren with signal-strength
// and coverage indicators), a filterable ways-to-connect comparison (eSIM vs physical
// SIM vs roaming vs Wi-Fi), data-plan cards, coverage-by-region bars with remote-island
// notes, buying & activation guidance, top-up help, Wi-Fi availability, VPN & security
// tips, hotspot/tethering advice, essential travel apps, emergency-communication tips,
// useful phone numbers and a disclaimer placeholder. A caller supplies a
// `ConnectivityGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens.
// `ConnectivityGuide` and its nested rows are lightweight presentation models (not
// DTOs); the component holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The category
// filters and favourite stars are UI-only, and all figures are illustrative.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A way to get online — drives the badge glyph, accent and the category filter.
enum ConnMethod: String, CaseIterable {
    case eSIM
    case physicalSIM
    case roaming
    case wifi

    var label: String {
        switch self {
        case .eSIM: "eSIM"
        case .physicalSIM: "Physical SIM"
        case .roaming: "Roaming"
        case .wifi: "Wi-Fi"
        }
    }

    var icon: String {
        switch self {
        case .eSIM: "simcard.fill"
        case .physicalSIM: "simcard"
        case .roaming: "antenna.radiowaves.left.and.right"
        case .wifi: "wifi"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .eSIM: return theme.tint
        case .physicalSIM: return theme.ocean
        case .roaming: return theme.coral
        case .wifi: return theme.sky
        }
    }
}

/// A single at-a-glance / quick-reference connectivity fact.
struct ConnFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A local mobile provider with signal-strength and coverage indicators.
struct ConnProvider: Identifiable {
    let id = UUID()
    var name: String
    var tagline: String
    var signal: Int          // 0–4 bars
    var coverage: Double     // 0–1 for the progress bar
    var speed: String
    var priceFrom: String
    var detail: String
}

/// A data-plan card.
struct ConnDataPlan: Identifiable {
    let id = UUID()
    var name: String
    var size: String
    var validity: String
    var price: String
    var detail: String
}

/// A way-to-connect comparison option.
struct ConnOption: Identifiable {
    let id: String
    var method: ConnMethod
    var bestFor: String
    var pros: [String]
    var detail: String

    init(method: ConnMethod, bestFor: String, pros: [String], detail: String) {
        self.id = method.label
        self.method = method
        self.bestFor = bestFor
        self.pros = pros
        self.detail = detail
    }
}

/// A region coverage entry with a strength indicator.
struct ConnRegion: Identifiable {
    let id = UUID()
    var region: String
    var signal: Int          // 0–4 bars
    var level: Double        // 0–1 for the progress bar
    var detail: String
}

/// A generic connectivity guide row reused for buying, Wi-Fi, apps and numbers.
struct ConnInfoRow: Identifiable {
    let id: String
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color

    init(id: String? = nil, title: String, subtitle: String? = nil, icon: String, detail: String, accent: Color) {
        self.id = id ?? title
        self.title = title
        self.subtitle = subtitle
        self.icon = icon
        self.detail = detail
        self.accent = accent
    }
}

/// The full, presentation-only content for a connectivity & eSIM guide.
struct ConnectivityGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [ConnFact]
    var providers: [ConnProvider]
    var options: [ConnOption]
    var dataPlans: [ConnDataPlan]
    var regions: [ConnRegion]
    var remoteNotes: [String]
    var buying: [ConnInfoRow]
    var wifi: [ConnInfoRow]
    var vpnTips: [String]
    var tetheringTips: [String]
    var apps: [ConnInfoRow]
    var emergencyTips: [String]
    var usefulNumbers: [ConnInfoRow]
    var disclaimer: String
}

/// A premium, presentation-only connectivity & eSIM dashboard rendered from a `ConnectivityGuide`.
struct TravelConnectivityESIMDashboard: View {
    var guide: ConnectivityGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedMethod = "All"
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let methodFilters = ["All", "eSIM", "Physical SIM", "Roaming", "Wi-Fi"]

    private var filteredOptions: [ConnOption] {
        guard selectedMethod != "All" else { return guide.options }
        return guide.options.filter { $0.method.label == selectedMethod }
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            connectGroup
            coverageGroup
            setupGroup
            tipsGroup
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
            eyebrow: "Connectivity & eSIM",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Best provider"), label: "Provider"),
                HeroMetric(value: factValue("Coverage"), label: "Coverage"),
                HeroMetric(value: factValue("eSIM"), label: "eSIM")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(ConnAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    private func factValue(_ label: String) -> String {
        guide.facts.first { $0.label == label }?.value ?? "—"
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var overviewGroup: some View {
        Group {
            section("At a glance", "Connectivity basics.", 1) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(guide.facts) { fact in
                        factTile(fact)
                    }
                }
            }

            section("Providers", "Compare the local networks.", 2) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.providers) { provider in
                        providerCard(provider)
                    }
                }
            }
        }
    }

    private var connectGroup: some View {
        Group {
            section("Ways to connect", "Filter by how you’ll get online.", 3) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    methodFilter
                    if filteredOptions.isEmpty {
                        GlassCard {
                            Text("No \(selectedMethod.lowercased()) options here.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        VStack(spacing: TravelSpacing.sm) {
                            ForEach(filteredOptions) { option in
                                optionCard(option)
                            }
                        }
                    }
                }
            }

            section("Data plans", "Typical tourist bundles.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.dataPlans) { plan in
                        planCard(plan)
                    }
                }
            }
        }
    }

    private var coverageGroup: some View {
        Group {
            section("Coverage by region", "Signal where you’re headed.", 5) {
                GlassCard {
                    VStack(spacing: TravelSpacing.md) {
                        ForEach(guide.regions) { region in
                            regionRow(region)
                        }
                    }
                }
            }

            section("Remote islands", "Where to expect gaps.", 6) {
                bulletCard(guide.remoteNotes, icon: "wifi.slash", tint: theme.coral)
            }
        }
    }

    private var setupGroup: some View {
        Group {
            section("Buying & activation", "Getting set up.", 7) {
                infoList(guide.buying)
            }

            section("Wi-Fi", "Where to find a connection.", 8) {
                infoList(guide.wifi)
            }

            section("VPN & security", "Stay private on public networks.", 8) {
                bulletCard(guide.vpnTips, icon: "lock.shield.fill", tint: theme.ocean)
            }

            section("Hotspot & tethering", "Sharing your connection.", 8) {
                bulletCard(guide.tetheringTips, icon: "personalhotspot", tint: theme.tint)
            }
        }
    }

    private var tipsGroup: some View {
        Group {
            section("Essential apps", "Download before you go.", 8) {
                infoList(guide.apps)
            }

            section("Emergency comms", "If the signal drops.", 8) {
                bulletCard(guide.emergencyTips, icon: "exclamationmark.bubble.fill", tint: theme.coral)
            }

            section("Useful numbers", "Keep these saved offline.", 8) {
                infoList(guide.usefulNumbers)
            }

            section("Good to know", "A quick caveat.", 8) {
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
        .modifier(ConnAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: ConnFact) -> some View {
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

    // MARK: Provider cards

    private func providerCard(_ provider: ConnProvider) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("antenna.radiowaves.left.and.right", theme.tint)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(provider.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(provider.tagline)
                            .font(TravelTypography.eyebrow)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    signalBars(provider.signal)
                }
                PremiumProgressBar(
                    progress: appeared ? provider.coverage : 0,
                    colors: [theme.tint, theme.sky]
                )
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                HStack(spacing: TravelSpacing.xs) {
                    chip("speedometer", provider.speed, theme.ocean)
                    chip("banknote.fill", provider.priceFrom, theme.moss)
                }
                Text(provider.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(provider.name), \(provider.tagline), signal \(provider.signal) of 4, \(Int((provider.coverage * 100).rounded())) percent coverage, \(provider.speed), from \(provider.priceFrom). \(provider.detail)")
    }

    // MARK: Method filter & option cards

    private var methodFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(methodFilters, id: \.self) { filter in
                    filterChip(filter)
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    private func filterChip(_ filter: String) -> some View {
        let selected = filter == selectedMethod
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedMethod = filter }
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

    private func optionCard(_ option: ConnOption) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(option.method.icon, option.method.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        methodBadge(option.method)
                        Text("Best for: \(option.bestFor)")
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(option.id, option.method.label)
                }
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    ForEach(option.pros, id: \.self) { pro in
                        HStack(alignment: .top, spacing: TravelSpacing.xs) {
                            Image(systemName: "checkmark")
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(option.method.accent)
                            Text(pro)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                        }
                    }
                }
                Text(option.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(option.method.label), best for \(option.bestFor). \(option.pros.joined(separator: ", ")). \(option.detail)")
    }

    private func methodBadge(_ method: ConnMethod) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: method.icon)
            Text(method.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(method.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(method.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Data plan cards

    private func planCard(_ plan: ConnDataPlan) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("square.stack.3d.up.fill", theme.tint)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(plan.name)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(plan.detail)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    favouriteButton(plan.id.uuidString, plan.name)
                }
                PremiumAdaptiveGrid(minimumWidth: 104) {
                    planMetric("externaldrive.fill", plan.size, "Data")
                    planMetric("calendar", plan.validity, "Validity")
                    planMetric("banknote.fill", plan.price, "Price")
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(plan.name), \(plan.size), \(plan.validity), \(plan.price). \(plan.detail)")
    }

    private func planMetric(_ icon: String, _ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Label(value, systemImage: icon)
                .font(TravelTypography.caption)
                .foregroundStyle(.primary)
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }

    // MARK: Region coverage

    private func regionRow(_ region: ConnRegion) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            HStack {
                Text(region.region)
                    .font(TravelTypography.caption)
                Spacer(minLength: 0)
                signalBars(region.signal)
            }
            PremiumProgressBar(
                progress: appeared ? region.level : 0,
                colors: [theme.tint, theme.sky]
            )
            .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
            Text(region.detail)
                .font(TravelTypography.eyebrow)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(region.region), signal \(region.signal) of 4. \(region.detail)")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [ConnInfoRow]) -> some View {
        VStack(spacing: TravelSpacing.sm) {
            ForEach(rows) { row in
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(row.icon, row.accent)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(row.title)
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
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
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
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
                    Text("Coverage and prices change")
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
        .accessibilityLabel("Coverage and prices change. \(guide.disclaimer)")
    }

    // MARK: Shared bits

    private func signalBars(_ level: Int) -> some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<4, id: \.self) { index in
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(index < level ? theme.tint : Color.secondary.opacity(0.25))
                    .frame(width: 4, height: CGFloat(6 + index * 4))
            }
        }
        .accessibilityHidden(true)
    }

    private func chip(_ icon: String, _ text: String, _ tint: Color) -> some View {
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
        .accessibilityLabel(isFav ? "Saved note: \(name)" : "Save note \(name)")
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

// MARK: - Connectivity appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct ConnAppear: ViewModifier {
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
extension ConnectivityGuide {
    /// A deterministic sample connectivity guide for Indonesia (illustrative figures).
    static var sampleIndonesia: ConnectivityGuide {
        let theme = TravelTheme.current
        return ConnectivityGuide(
            heroTitle: "Indonesia · Connectivity",
            heroSubtitle: "Cheap data and broad 4G in the cities — with real gaps on the remote islands.",
            heroSymbol: "wifi",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            facts: [
                ConnFact(icon: "antenna.radiowaves.left.and.right", label: "Best provider", value: "Telkomsel"),
                ConnFact(icon: "dot.radiowaves.up.forward", label: "Coverage", value: "4G nationwide"),
                ConnFact(icon: "simcard.fill", label: "eSIM", value: "Supported"),
                ConnFact(icon: "speedometer", label: "Avg speed", value: "≈ 20 Mbps")
            ],
            providers: [
                ConnProvider(name: "Telkomsel", tagline: "Widest coverage", signal: 4, coverage: 0.95, speed: "15–30 Mbps", priceFrom: "Rp 150k", detail: "The most reliable network and the only real option on remote islands — but the priciest."),
                ConnProvider(name: "XL Axiata", tagline: "Great value", signal: 3, coverage: 0.8, speed: "10–25 Mbps", priceFrom: "Rp 90k", detail: "Strong in cities and tourist areas with cheaper big-data bundles."),
                ConnProvider(name: "Indosat (IM3)", tagline: "Cheap data", signal: 3, coverage: 0.75, speed: "10–20 Mbps", priceFrom: "Rp 85k", detail: "Competitive data prices and good urban coverage; weaker in the far east."),
                ConnProvider(name: "Smartfren", tagline: "Budget 4G", signal: 2, coverage: 0.6, speed: "8–18 Mbps", priceFrom: "Rp 60k", detail: "Cheapest data but 4G-only and patchy outside major cities.")
            ],
            options: [
                ConnOption(method: .eSIM, bestFor: "Most travellers", pros: ["Install before you land", "No queues or paperwork", "Keep your home number active"], detail: "Buy a tourist eSIM (Airalo, Holafly or Telkomsel) online; activate on arrival. Phone must be eSIM-capable and unlocked."),
                ConnOption(method: .physicalSIM, bestFor: "Cheapest local data", pros: ["Best price per GB", "A local number for e-wallets", "Sold everywhere"], detail: "Buy from an official counter and have them register it with your passport — avoid pre-activated street SIMs."),
                ConnOption(method: .roaming, bestFor: "Short trips", pros: ["Zero setup", "Keep one number", "Good for a few days"], detail: "Convenient but expensive; check your home carrier’s daily pass before relying on it."),
                ConnOption(method: .wifi, bestFor: "Light users", pros: ["Free at most hotels & cafés", "No SIM needed", "Fine for messaging"], detail: "Widely available in tourist areas but variable; pair it with a VPN on public networks.")
            ],
            dataPlans: [
                ConnDataPlan(name: "Traveller starter", size: "5 GB", validity: "7 days", price: "≈ Rp 75k", detail: "Enough for maps and messaging on a short stay."),
                ConnDataPlan(name: "Tourist eSIM", size: "10 GB", validity: "14 days", price: "≈ Rp 150k", detail: "The sweet spot for a typical two-week trip."),
                ConnDataPlan(name: "Big data", size: "25 GB", validity: "30 days", price: "≈ Rp 250k", detail: "For heavy use, tethering or longer stays."),
                ConnDataPlan(name: "Unlimited-ish", size: "50 GB", validity: "30 days", price: "≈ Rp 400k", detail: "Plenty for remote work and streaming where coverage allows.")
            ],
            regions: [
                ConnRegion(region: "Bali", signal: 4, level: 0.95, detail: "Excellent 4G/5G across the south; reliable almost everywhere."),
                ConnRegion(region: "Lombok", signal: 3, level: 0.8, detail: "Good in Kuta and Mataram; thinner in the rural north."),
                ConnRegion(region: "Gili Islands", signal: 3, level: 0.7, detail: "Usable 4G but it slows badly at peak times on Trawangan."),
                ConnRegion(region: "Komodo", signal: 2, level: 0.5, detail: "Signal in Labuan Bajo; expect gaps between islands and at sea."),
                ConnRegion(region: "Raja Ampat", signal: 1, level: 0.3, detail: "Patchy around Waisai and often none at remote homestays.")
            ],
            remoteNotes: [
                "Expect little or no signal on liveaboards and remote homestays — plan offline.",
                "Telkomsel is the only network with a realistic chance of coverage on far islands.",
                "Download offline maps, tickets and translations before you leave the city.",
                "Tell people at home you may be off-grid for stretches in Raja Ampat and Komodo."
            ],
            buying: [
                ConnInfoRow(title: "Airport counters", subtitle: "On arrival", icon: "airplane.arrival", detail: "Official Telkomsel/XL kiosks at Bali (DPS) and Jakarta sell and register tourist SIMs — pricier but easy.", accent: theme.tint),
                ConnInfoRow(title: "Official stores (GraPARI)", subtitle: "Best for help", icon: "building.2.fill", detail: "Provider stores in towns register your SIM correctly and sort eSIM issues.", accent: theme.ocean),
                ConnInfoRow(title: "Online eSIM", subtitle: "Before you fly", icon: "qrcode", detail: "Buy and install an eSIM (Airalo/Holafly) at home; scan the QR and switch it on when you land.", accent: theme.tint),
                ConnInfoRow(title: "Top-up (pulsa/paket)", subtitle: "Anywhere", icon: "plus.circle.fill", detail: "Reload at Indomaret/Alfamart, the MyTelkomsel app, or small phone kiosks everywhere.", accent: theme.moss)
            ],
            wifi: [
                ConnInfoRow(title: "Hotels & villas", subtitle: "Usually free", icon: "wifi", detail: "Reliable in mid-range and up; ask about speed if you need to work.", accent: theme.sky),
                ConnInfoRow(title: "Cafés & co-working", subtitle: "Digital-nomad hubs", icon: "cup.and.saucer.fill", detail: "Canggu, Ubud and Kuta Lombok have fast café and co-working Wi-Fi.", accent: theme.tint),
                ConnInfoRow(title: "Public Wi-Fi caution", subtitle: "Use a VPN", icon: "lock.shield.fill", detail: "Open networks are common but insecure — avoid banking without a VPN.", accent: theme.coral)
            ],
            vpnTips: [
                "Install and test a reputable VPN before you arrive — some stores block VPN sites.",
                "Use the VPN on all public and café Wi-Fi, especially for banking.",
                "A VPN also helps access services that geo-block while you travel.",
                "Keep it off when using local e-wallets that dislike foreign IPs."
            ],
            tetheringTips: [
                "Most local plans allow hotspot/tethering — confirm when you buy.",
                "Tethering drains data and battery fast; carry a power bank.",
                "A 25GB+ plan is better value than roaming if several of you share.",
                "Signal for a hotspot is only as good as the host phone’s coverage."
            ],
            apps: [
                ConnInfoRow(title: "Gojek", subtitle: "Super-app", icon: "scooter", detail: "Ride-hailing, food delivery and payments — indispensable in cities.", accent: theme.moss),
                ConnInfoRow(title: "Grab", subtitle: "Rides & food", icon: "car.fill", detail: "The main alternative to Gojek; handy where one has better driver coverage.", accent: theme.ocean),
                ConnInfoRow(title: "WhatsApp", subtitle: "Messaging", icon: "message.fill", detail: "How almost every guesthouse, driver and dive shop communicates.", accent: theme.tint),
                ConnInfoRow(title: "Google Maps (offline)", subtitle: "Navigation", icon: "map.fill", detail: "Download offline areas for each island before you lose signal.", accent: theme.sun)
            ],
            emergencyTips: [
                "Save key numbers and addresses offline in case you lose data.",
                "Share your live location with someone before heading off-grid.",
                "WhatsApp calls work on weak data where normal calls won’t connect.",
                "Carry a power bank — a dead phone is the real emergency."
            ],
            usefulNumbers: [
                ConnInfoRow(title: "Emergency (general)", subtitle: "112", icon: "phone.fill", detail: "Single nationwide emergency number, reachable without credit.", accent: theme.coral),
                ConnInfoRow(title: "Police", subtitle: "110", icon: "shield.fill", detail: "Tourist police also operate in major destinations.", accent: theme.ocean),
                ConnInfoRow(title: "Ambulance", subtitle: "118 / 119", icon: "cross.case.fill", detail: "Response times vary; private clinics may be faster in tourist areas.", accent: theme.tint),
                ConnInfoRow(title: "Search & rescue (Basarnas)", subtitle: "115", icon: "figure.wave", detail: "For sea and remote-area rescue — relevant on island crossings.", accent: theme.sun)
            ],
            disclaimer: "Networks, coverage, plans and prices change frequently and vary by handset and location. This guide is illustrative only — check current provider information and test your setup on arrival."
        )
    }
}

struct TravelConnectivityESIMDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelConnectivityESIMDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Connectivity & eSIM · Indonesia")

            TravelConnectivityESIMDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Connectivity & eSIM · Dynamic Type XL")
        }
    }
}
#endif
