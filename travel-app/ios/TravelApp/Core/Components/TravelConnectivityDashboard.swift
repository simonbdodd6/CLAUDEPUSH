import SwiftUI

// MARK: - Travel connectivity dashboard (Phase 129)
//
// A flagship, presentation-only Connectivity dashboard for Indonesia: a hero with
// at-a-glance facts (coverage, SIM/eSIM availability, average speeds), a region-
// filtered connectivity guide with coverage indicators, an internet-speed comparison
// chart, eSIM and physical-SIM comparison cards, typical tourist data packages, a
// presentation-only data-usage estimator, an airport SIM buying guide, Wi-Fi
// availability, offline maps/translation/messaging recommendations, an emergency
// offline-preparation checklist, digital-nomad tips, power-bank & charging advice, a
// plug/socket & voltage guide, a USB charging checklist, a troubleshooting checklist
// and a disclaimer. A caller supplies a `NetGuide` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumProgressBar`, `TravelTypography` and the tokens. The
// `Net*` model names are deliberately distinct from Phase 121's `Conn*` types to avoid
// any collision. `NetGuide` and its nested rows are lightweight presentation models
// (not DTOs); the component holds no data, networking, persistence, repository, view-
// model, navigation, AppContainer or DTO logic, and is not wired into any screen. The
// estimator computes locally; the region filter and favourite stars are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A single at-a-glance connectivity fact.
struct NetFact: Identifiable {
    let id = UUID()
    var icon: String
    var label: String
    var value: String
}

/// A region's connectivity quality, with a signal indicator and speed bar.
struct NetRegion: Identifiable {
    let id = UUID()
    var region: String
    var signal: Int          // 0–4 bars
    var level: Double        // 0–1 for the progress bar
    var speed: String
    var detail: String
}

/// A bar in the internet-speed comparison chart.
struct NetBar: Identifiable {
    let id = UUID()
    var label: String
    var value: String
    var fraction: Double
    var accent: Color
}

/// An eSIM comparison card (presentation only).
struct NetESIM: Identifiable {
    let id = UUID()
    var name: String
    var data: String
    var validity: String
    var price: String
    var detail: String
}

/// A physical-SIM provider comparison card.
struct NetProvider: Identifiable {
    let id = UUID()
    var name: String
    var tagline: String
    var signal: Int
    var speed: String
    var priceFrom: String
    var detail: String
}

/// A tourist data package.
struct NetPlan: Identifiable {
    let id = UUID()
    var name: String
    var sizeMB: Int
    var size: String
    var validity: String
    var price: String
}

/// A data-usage estimator profile (illustrative MB/day).
struct NetUsageProfile: Identifiable {
    let id = UUID()
    var name: String
    var icon: String
    var perDayMB: Int
    var detail: String
}

/// A generic connectivity guide row reused for buying, Wi-Fi, offline tools,
/// messaging, charging and plug info.
struct NetRow: Identifiable {
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

/// A checklist item (offline prep, USB, troubleshooting).
struct NetCheckItem: Identifiable {
    let id = UUID()
    var name: String
    var done: Bool
    var note: String
}

/// The full, presentation-only content for a connectivity guide.
struct NetGuide {
    var heroTitle: String
    var heroSubtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var facts: [NetFact]
    var regions: [NetRegion]
    var speedChart: [NetBar]
    var eSIMs: [NetESIM]
    var providers: [NetProvider]
    var plans: [NetPlan]
    var usageProfiles: [NetUsageProfile]
    var airportBuying: [NetRow]
    var wifi: [NetRow]
    var offlineMaps: [NetRow]
    var offlineTranslation: [NetRow]
    var messaging: [NetRow]
    var offlinePrep: [NetCheckItem]
    var nomadTips: [NetRow]
    var charging: [NetRow]
    var plugGuide: [NetRow]
    var usbChecklist: [NetCheckItem]
    var troubleshooting: [NetCheckItem]
    var disclaimer: String
}

/// A premium, presentation-only connectivity dashboard rendered from a `NetGuide`.
struct TravelConnectivityDashboard: View {
    var guide: NetGuide

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedRegion = "All"
    @State private var favourites: Set<String> = []
    @State private var usageIndex = 1
    @State private var usageDays = 14

    private let theme = TravelTheme.current
    private let regionFilters = ["All", "Bali", "Lombok", "Gili", "Komodo", "Raja Ampat"]

    private var filteredRegions: [NetRegion] {
        guard selectedRegion != "All" else { return guide.regions }
        return guide.regions.filter { $0.region == selectedRegion }
    }

    private var usageProfile: NetUsageProfile? {
        guard guide.usageProfiles.indices.contains(usageIndex) else { return guide.usageProfiles.first }
        return guide.usageProfiles[usageIndex]
    }

    var body: some View {
        PremiumScrollView {
            hero
            overviewGroup
            simGroup
            offlineGroup
            powerGroup
            footerGroup
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
            eyebrow: "Connectivity",
            symbol: guide.heroSymbol,
            title: guide.heroTitle,
            subtitle: guide.heroSubtitle,
            gradient: guide.heroGradient,
            metrics: [
                HeroMetric(value: factValue("Coverage"), label: "Coverage"),
                HeroMetric(value: factValue("eSIM"), label: "eSIM"),
                HeroMetric(value: factValue("Avg speed"), label: "Speed")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(NetAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
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

            section("By region", "Coverage where you’re headed.", 2) {
                VStack(alignment: .leading, spacing: TravelSpacing.md) {
                    regionFilter
                    if filteredRegions.isEmpty {
                        GlassCard {
                            Text("No coverage notes for that region.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        GlassCard {
                            VStack(spacing: TravelSpacing.md) {
                                ForEach(filteredRegions) { region in
                                    regionRow(region)
                                }
                            }
                        }
                    }
                }
            }

            section("Speed comparison", "Typical download by region.", 3) {
                speedCard
            }
        }
    }

    private var simGroup: some View {
        Group {
            section("eSIM options", "Install before you land.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.eSIMs) { esim in
                        esimCard(esim)
                    }
                }
            }

            section("Physical SIMs", "Buy on arrival.", 5) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.providers) { provider in
                        providerCard(provider)
                    }
                }
            }

            section("Data packages", "Typical tourist bundles.", 6) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(guide.plans) { plan in
                        planCard(plan)
                    }
                }
            }

            section("Data estimator", "How much data you’ll need.", 7) {
                estimatorCard
            }
        }
    }

    private var offlineGroup: some View {
        Group {
            section("Buying a SIM", "At the airport or in town.", 8) {
                infoList(guide.airportBuying)
            }

            section("Wi-Fi", "Where to get online free.", 8) {
                infoList(guide.wifi)
            }

            section("Offline maps", "Navigate without signal.", 8) {
                infoList(guide.offlineMaps)
            }

            section("Offline translation", "Read and be understood.", 8) {
                infoList(guide.offlineTranslation)
            }

            section("Messaging", "How everyone stays in touch.", 8) {
                infoList(guide.messaging)
            }
        }
    }

    private var powerGroup: some View {
        Group {
            section("Offline prep", "Before you lose signal.", 8) {
                checklistCard(guide.offlinePrep)
            }

            section("Digital nomads", "Working from the islands.", 8) {
                infoList(guide.nomadTips)
            }

            section("Power & charging", "Keep the batteries up.", 8) {
                infoList(guide.charging)
            }

            section("Plugs & voltage", "Powering your kit.", 8) {
                infoList(guide.plugGuide)
            }

            section("USB & cables", "Pack to stay charged.", 8) {
                checklistCard(guide.usbChecklist)
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Troubleshooting", "No signal? Try these.", 8) {
                checklistCard(guide.troubleshooting)
            }

            section("Good to know", "About these figures.", 8) {
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
        .modifier(NetAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Facts

    private func factTile(_ fact: NetFact) -> some View {
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

    // MARK: Region rows

    private func regionRow(_ region: NetRegion) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xs) {
            HStack {
                Text(region.region)
                    .font(TravelTypography.caption)
                Spacer(minLength: 0)
                Text(region.speed)
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
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
        .accessibilityLabel("\(region.region), signal \(region.signal) of 4, \(region.speed). \(region.detail)")
    }

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

    // MARK: Speed chart

    private var speedCard: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(guide.speedChart) { bar in
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        HStack {
                            Text(bar.label)
                                .font(TravelTypography.caption)
                            Spacer(minLength: 0)
                            Text(bar.value)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                        PremiumProgressBar(
                            progress: appeared ? bar.fraction : 0,
                            colors: [bar.accent, bar.accent.opacity(0.6)]
                        )
                        .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(bar.label): \(bar.value)")
                }
            }
        }
    }

    // MARK: eSIM / provider / plan cards

    private func esimCard(_ esim: NetESIM) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("simcard.fill", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(esim.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: TravelSpacing.xs) {
                        tagPill(esim.data, theme.tint)
                        tagPill(esim.validity, theme.ocean)
                        tagPill(esim.price, theme.moss)
                    }
                    Text(esim.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
                favouriteButton("esim-\(esim.name)", esim.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("eSIM \(esim.name), \(esim.data), \(esim.validity), \(esim.price). \(esim.detail)")
    }

    private func providerCard(_ provider: NetProvider) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion("antenna.radiowaves.left.and.right", theme.ocean)
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
                HStack(spacing: TravelSpacing.xs) {
                    tagPill(provider.speed, theme.sky)
                    tagPill(provider.priceFrom, theme.moss)
                }
                Text(provider.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(provider.name), \(provider.tagline), signal \(provider.signal) of 4, \(provider.speed), from \(provider.priceFrom). \(provider.detail)")
    }

    private func planCard(_ plan: NetPlan) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion("square.stack.3d.up.fill", theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(plan.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: TravelSpacing.xs) {
                        tagPill(plan.size, theme.tint)
                        tagPill(plan.validity, theme.ocean)
                        tagPill(plan.price, theme.sun)
                    }
                }
                Spacer(minLength: 0)
                favouriteButton("plan-\(plan.name)", plan.name)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(plan.name), \(plan.size), \(plan.validity), \(plan.price)")
    }

    // MARK: Data estimator (presentation only)

    private var estimatorCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(guide.usageProfiles.enumerated()), id: \.element.id) { index, profile in
                            usageChip(index, profile)
                        }
                    }
                }
                HStack {
                    Text("Days")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    stepperButton("minus") { if usageDays > 1 { usageDays -= 1 } }
                    Text("\(usageDays)")
                        .font(TravelTypography.cardTitle)
                        .frame(minWidth: 36)
                    stepperButton("plus") { if usageDays < 60 { usageDays += 1 } }
                }
                Divider().opacity(0.4)
                if let usageProfile {
                    let totalMB = usageProfile.perDayMB * usageDays
                    VStack(spacing: TravelSpacing.xxs) {
                        Text("≈ \(gigabytes(totalMB)) GB")
                            .font(TravelTypography.display)
                            .foregroundStyle(theme.tint)
                        Text("\(usageProfile.name) · \(usageProfile.detail)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Suggested: \(recommendedPlan(totalMB))")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(usageProfile.map { "Data estimator. \($0.name) for \(usageDays) days is about \(gigabytes($0.perDayMB * usageDays)) gigabytes." } ?? "Data estimator.")
    }

    private func usageChip(_ index: Int, _ profile: NetUsageProfile) -> some View {
        let selected = index == usageIndex
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { usageIndex = index }
        } label: {
            Label(profile.name, systemImage: profile.icon)
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
        .accessibilityLabel("\(profile.name) usage")
        .accessibilityValue(selected ? "Selected" : "Not selected")
    }

    private func stepperButton(_ icon: String, action: @escaping () -> Void) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) { action() }
        } label: {
            Image(systemName: icon)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(theme.tint)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(icon == "plus" ? "Increase days" : "Decrease days")
    }

    /// Megabytes → a "X.Y" gigabyte string without a locale formatter.
    private func gigabytes(_ mb: Int) -> String {
        "\(mb / 1000).\((mb % 1000) / 100)"
    }

    private func recommendedPlan(_ mb: Int) -> String {
        if let plan = guide.plans.first(where: { $0.sizeMB >= mb }) {
            return "\(plan.size) plan"
        }
        return guide.plans.last.map { "\($0.size)+ plan" } ?? "a larger plan"
    }

    // MARK: Region filter

    private var regionFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: TravelSpacing.xs) {
                ForEach(regionFilters, id: \.self) { region in
                    let selected = region == selectedRegion
                    Button {
                        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedRegion = region }
                    } label: {
                        Text(region)
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
                    .accessibilityLabel("\(region) filter")
                    .accessibilityValue(selected ? "Selected" : "Not selected")
                }
            }
            .padding(.vertical, TravelSpacing.xxs)
        }
    }

    // MARK: Generic info list

    private func infoList(_ rows: [NetRow]) -> some View {
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

    // MARK: Checklist

    private func checklistCard(_ items: [NetCheckItem]) -> some View {
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
                    Text("Coverage & prices change")
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
private struct NetAppear: ViewModifier {
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
extension NetGuide {
    /// A deterministic sample connectivity guide for Indonesia (illustrative figures).
    static var sampleIndonesia: NetGuide {
        let theme = TravelTheme.current
        return NetGuide(
            heroTitle: "Indonesia · Connectivity",
            heroSubtitle: "Cheap data and broad 4G in the cities — plan for real gaps on the remote islands.",
            heroSymbol: "wifi",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            facts: [
                NetFact(icon: "dot.radiowaves.up.forward", label: "Coverage", value: "4G nationwide"),
                NetFact(icon: "simcard.fill", label: "eSIM", value: "Supported"),
                NetFact(icon: "speedometer", label: "Avg speed", value: "≈ 20 Mbps"),
                NetFact(icon: "antenna.radiowaves.left.and.right", label: "Best network", value: "Telkomsel")
            ],
            regions: [
                NetRegion(region: "Bali", signal: 4, level: 0.95, speed: "15–30 Mbps", detail: "Excellent 4G/5G across the south; reliable almost everywhere."),
                NetRegion(region: "Lombok", signal: 3, level: 0.8, speed: "10–25 Mbps", detail: "Good in Kuta and Mataram; thinner in the rural north."),
                NetRegion(region: "Gili Islands", signal: 3, level: 0.7, speed: "5–15 Mbps", detail: "Usable 4G but it slows badly at peak times on Trawangan."),
                NetRegion(region: "Komodo", signal: 2, level: 0.5, speed: "3–10 Mbps", detail: "Signal in Labuan Bajo; expect gaps between islands and at sea."),
                NetRegion(region: "Raja Ampat", signal: 1, level: 0.3, speed: "0–5 Mbps", detail: "Patchy around Waisai and often none at remote homestays.")
            ],
            speedChart: [
                NetBar(label: "Bali", value: "≈ 25 Mbps", fraction: 0.83, accent: theme.tint),
                NetBar(label: "Lombok", value: "≈ 18 Mbps", fraction: 0.60, accent: theme.ocean),
                NetBar(label: "Gili Islands", value: "≈ 12 Mbps", fraction: 0.40, accent: theme.sky),
                NetBar(label: "Komodo", value: "≈ 8 Mbps", fraction: 0.27, accent: theme.sun),
                NetBar(label: "Raja Ampat", value: "≈ 4 Mbps", fraction: 0.13, accent: theme.coral)
            ],
            eSIMs: [
                NetESIM(name: "Airalo", data: "10 GB", validity: "14 days", price: "≈ £11", detail: "Easy global app; install before you fly and switch on at landing."),
                NetESIM(name: "Holafly", data: "Unlimited", validity: "15 days", price: "≈ £60", detail: "Truly unlimited but pricier and gives you no local number."),
                NetESIM(name: "Telkomsel eSIM", data: "10 GB", validity: "30 days", price: "≈ £10", detail: "The best underlying coverage, including remoter areas.")
            ],
            providers: [
                NetProvider(name: "Telkomsel", tagline: "Widest coverage", signal: 4, speed: "15–30 Mbps", priceFrom: "Rp 150k", detail: "The most reliable network and the only real option on remote islands — priciest."),
                NetProvider(name: "XL Axiata", tagline: "Great value", signal: 3, speed: "10–25 Mbps", priceFrom: "Rp 90k", detail: "Strong in cities and tourist areas with cheaper big-data bundles."),
                NetProvider(name: "Indosat (IM3)", tagline: "Cheap data", signal: 3, speed: "10–20 Mbps", priceFrom: "Rp 85k", detail: "Competitive prices and good urban coverage; weaker in the far east."),
                NetProvider(name: "Smartfren", tagline: "Budget 4G", signal: 2, speed: "8–18 Mbps", priceFrom: "Rp 60k", detail: "Cheapest data but 4G-only and patchy outside major cities.")
            ],
            plans: [
                NetPlan(name: "Traveller starter", sizeMB: 5_000, size: "5 GB", validity: "7 days", price: "≈ Rp 75k"),
                NetPlan(name: "Tourist standard", sizeMB: 10_000, size: "10 GB", validity: "14 days", price: "≈ Rp 150k"),
                NetPlan(name: "Big data", sizeMB: 25_000, size: "25 GB", validity: "30 days", price: "≈ Rp 250k"),
                NetPlan(name: "Heavy / nomad", sizeMB: 50_000, size: "50 GB", validity: "30 days", price: "≈ Rp 400k")
            ],
            usageProfiles: [
                NetUsageProfile(name: "Light", icon: "leaf.fill", perDayMB: 300, detail: "Maps and messaging, the odd photo upload."),
                NetUsageProfile(name: "Medium", icon: "gauge.with.dots.needle.50percent", perDayMB: 800, detail: "Social media, browsing and music on the go."),
                NetUsageProfile(name: "Heavy", icon: "play.rectangle.fill", perDayMB: 2_000, detail: "Streaming, video calls and tethering a laptop.")
            ],
            airportBuying: [
                NetRow(title: "Airport counters", subtitle: "On arrival", icon: "airplane.arrival", detail: "Official Telkomsel/XL kiosks at Bali (DPS) and Jakarta sell and register tourist SIMs — easy but pricier.", accent: theme.tint),
                NetRow(title: "Official stores (GraPARI)", subtitle: "Best for help", icon: "building.2.fill", detail: "Provider stores in towns register your SIM correctly and sort eSIM issues.", accent: theme.ocean),
                NetRow(title: "Bring your passport", subtitle: "Registration", icon: "person.text.rectangle.fill", detail: "SIMs must be registered to a passport — avoid pre-activated street SIMs.", accent: theme.moss)
            ],
            wifi: [
                NetRow(title: "Hotels & villas", subtitle: "Usually free", icon: "wifi", detail: "Reliable in mid-range and up; ask about speed if you need to work.", accent: theme.sky),
                NetRow(title: "Cafés & coworking", subtitle: "Nomad hubs", icon: "cup.and.saucer.fill", detail: "Canggu, Ubud and Kuta Lombok have fast café and coworking Wi-Fi.", accent: theme.tint),
                NetRow(title: "Use a VPN on public Wi-Fi", subtitle: "Security", icon: "lock.shield.fill", detail: "Open networks are common but insecure — avoid banking without a VPN.", accent: theme.coral)
            ],
            offlineMaps: [
                NetRow(title: "Google Maps offline", subtitle: "Download areas", icon: "map.fill", detail: "Save each island’s area before you lose signal; navigation still works offline.", accent: theme.tint),
                NetRow(title: "Maps.me / Organic Maps", subtitle: "Backup", icon: "map", detail: "Fully offline maps with good trail and detail coverage as a second option.", accent: theme.ocean)
            ],
            offlineTranslation: [
                NetRow(title: "Google Translate offline", subtitle: "Indonesian pack", icon: "character.book.closed.fill", detail: "Download the Bahasa Indonesia language pack to translate without data.", accent: theme.tint),
                NetRow(title: "Camera translate", subtitle: "Menus & signs", icon: "camera.viewfinder", detail: "Point your camera at menus and signs for instant offline translation.", accent: theme.ocean)
            ],
            messaging: [
                NetRow(title: "WhatsApp", subtitle: "Universal", icon: "message.fill", detail: "How almost every guesthouse, driver and dive shop communicates.", accent: theme.moss),
                NetRow(title: "Calls over data", subtitle: "Weak signal", icon: "phone.arrow.up.right.fill", detail: "WhatsApp voice calls often connect where normal calls won’t.", accent: theme.tint)
            ],
            offlinePrep: [
                NetCheckItem(name: "Save emergency numbers", done: true, note: "112, hospital, insurer, embassy"),
                NetCheckItem(name: "Download offline maps", done: true, note: "One per island you’ll visit"),
                NetCheckItem(name: "Screenshot bookings", done: false, note: "Flights, boats, hotels and tickets"),
                NetCheckItem(name: "Share your itinerary", done: false, note: "With someone back home"),
                NetCheckItem(name: "Offline docs", done: false, note: "Passport and insurance copies")
            ],
            nomadTips: [
                NetRow(title: "Bali nomad hubs", subtitle: "Canggu & Ubud", icon: "laptopcomputer", detail: "Coworking spaces (Dojo, Outpost) offer fast, reliable internet and community.", accent: theme.tint),
                NetRow(title: "Have a backup connection", subtitle: "Redundancy", icon: "arrow.triangle.2.circlepath", detail: "Pair café Wi-Fi with a tethered SIM so a single outage doesn’t stop work.", accent: theme.ocean),
                NetRow(title: "Mind time zones & visas", subtitle: "Practicalities", icon: "globe", detail: "WIB/WITA/WIT shift the clock east; check visa rules if working long-term.", accent: theme.sun)
            ],
            charging: [
                NetRow(title: "Carry a power bank", subtitle: "10,000mAh+", icon: "powerplug.fill", detail: "Essential for long boat days and remote stays with little or no power.", accent: theme.tint),
                NetRow(title: "Charge every night", subtitle: "Habit", icon: "battery.100percent.bolt", detail: "Top up phones and banks whenever there’s mains power — it’s not guaranteed.", accent: theme.moss),
                NetRow(title: "Power banks in carry-on", subtitle: "Flight rule", icon: "airplane", detail: "Spare batteries must go in hand luggage, not checked bags (usually <100Wh).", accent: theme.coral)
            ],
            plugGuide: [
                NetRow(title: "Plug type C / F", subtitle: "European 2-pin", icon: "powerplug.fill", detail: "Indonesia uses round two-pin sockets — bring a suitable travel adapter.", accent: theme.tint),
                NetRow(title: "230V · 50Hz", subtitle: "Voltage", icon: "bolt.fill", detail: "Most modern chargers handle this; check older appliances before plugging in.", accent: theme.ocean)
            ],
            usbChecklist: [
                NetCheckItem(name: "Charging cables", done: true, note: "Plus a spare — they fail in the heat"),
                NetCheckItem(name: "Multi-port USB charger", done: true, note: "Charge several devices at once"),
                NetCheckItem(name: "Power bank", done: false, note: "Charged before travel days"),
                NetCheckItem(name: "Travel adapter", done: false, note: "Type C/F for Indonesia")
            ],
            troubleshooting: [
                NetCheckItem(name: "Toggle airplane mode", done: false, note: "Forces a fresh network search"),
                NetCheckItem(name: "Enable data roaming (eSIM)", done: false, note: "Needed even on a local eSIM"),
                NetCheckItem(name: "Check the APN", done: false, note: "Set the provider’s APN if data won’t start"),
                NetCheckItem(name: "Check balance / quota", done: false, note: "Top up pulsa or buy a package"),
                NetCheckItem(name: "Switch 4G/3G or restart", done: false, note: "Helps in weak-signal areas")
            ],
            disclaimer: "Networks, coverage, plans and prices change frequently and vary by handset and location. These figures are illustrative only — confirm current provider information and test your setup on arrival."
        )
    }
}

struct TravelConnectivityDashboard_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelConnectivityDashboard(guide: .sampleIndonesia)
                .previewDisplayName("Connectivity · Indonesia")

            TravelConnectivityDashboard(guide: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Connectivity · Dynamic Type XL")
        }
    }
}
#endif
