import SwiftUI

// MARK: - Travel Intelligence app spine (First Xcode Integration Spine)
//
// The first runnable integration spine: a real six-tab container that renders the five
// flagship dashboards from the shared demo data, driven by the navigation coordinator.
// It is the foundation of a runnable app while preserving the existing architecture — it
// touches none of the production app entry (`TravelIntelligenceApp`), `RootFlowView`,
// `AppContainer` or `TravelRoute`/`TravelTab` routing.
//
// It reuses, rather than duplicates:
//   • `TravelNavigationModel`       — the tabs/groups and their titles/symbols
//   • `TravelNavigationCoordinator` — the single source of truth for the selected tab
//   • `TravelDemoData`              — adapters that build each flagship's model
//   • `TravelScreenRegistry`        — headline counts on the profile tab
//   • the flagship dashboards and the premium design system
//
// It introduces no networking, persistence, authentication or backend. Because it reads
// the DEBUG-only `TravelDemoData`, the whole file is wrapped in `#if DEBUG`; it therefore
// runs from Xcode in Debug builds and in previews without affecting release.

#if DEBUG

struct TravelIntelligenceAppSpine: View {
    @State private var coordinator = TravelNavigationCoordinator()
    @State private var nav = TravelNavigationModel.initialState

    private let theme = TravelTheme.current

    /// The TabView selection routes through the coordinator so it stays the source of truth.
    private var selection: Binding<String> {
        Binding(
            get: { nav.selectedGroupID },
            set: { newID in
                coordinator.open(group: newID)
                nav = coordinator.state
            }
        )
    }

    var body: some View {
        TabView(selection: selection) {
            ForEach(TravelNavigationModel.groups) { group in
                groupScreen(group.id)
                    .travelScreenEntrance()
                    .tabItem { Label(group.title, systemImage: group.symbol) }
                    .tag(group.id)
            }
        }
        .tint(theme.tint)
    }

    // MARK: Tab content — real flagship dashboards from the shared demo data

    @ViewBuilder
    private func groupScreen(_ id: String) -> some View {
        switch id {
        case "home":
            TravelHomeDashboardV2(plan: TravelDemoData.homeV2Plan())
        case "trips":
            TravelTripPlannerDashboardV2(plan: TravelDemoData.tripPlannerV2())
        case "destinations":
            TravelDestinationHubDashboard(guide: TravelDemoData.destinationHub())
        case "journey":
            TravelJourneyDashboard(plan: TravelDemoData.journeyDashboard())
        case "explore":
            TravelIslandGuideDashboard(guide: TravelDemoData.islandGuide())
        case "profile":
            profileScreen
        default:
            TravelHomeDashboardV2(plan: TravelDemoData.homeV2Plan())
        }
    }

    // MARK: Profile tab (composed from the shared demo traveller)

    private var traveller: DemoTraveller { TravelDemoData.traveller }

    private var profileScreen: some View {
        PremiumScrollView {
            profileHeaderGroup
            profileStatsGroup
            profileTravelGroup
            profileFooter
        }
    }

    // MARK: Profile — hero & membership

    private var profileHeaderGroup: some View {
        Group {
            FeatureHeroScaffold(
                eyebrow: "Explorer profile",
                symbol: "person.crop.circle.fill",
                title: traveller.name,
                subtitle: "From \(traveller.homeCity) — your trips, saved places and preferences.",
                gradient: [theme.ocean, theme.tint, theme.sky],
                metrics: heroMetrics,
                texture: { MapTexturePlaceholder() }
            )

            membershipCard
        }
    }

    private var heroMetrics: [HeroMetric] {
        traveller.metrics.prefix(3).map { HeroMetric(value: $0.value, label: $0.label) }
    }

    private var membershipCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(spacing: TravelSpacing.md) {
                    Text(traveller.initials)
                        .font(TravelTypography.title)
                        .foregroundStyle(.white)
                        .frame(width: 64, height: 64)
                        .background(
                            LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: Circle()
                        )
                        .overlay(Circle().stroke(.white.opacity(0.4), lineWidth: 1))
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(traveller.name)
                            .font(TravelTypography.cardTitle)
                        Text("Travel Intelligence member")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    Text("EXPLORER")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(theme.tint)
                        .padding(.horizontal, TravelSpacing.sm)
                        .padding(.vertical, TravelSpacing.xs)
                        .background(.thinMaterial, in: Capsule())
                }
                Divider().opacity(0.4)
                HStack(spacing: TravelSpacing.lg) {
                    Label("\(traveller.certifications.count) certifications", systemImage: "rosette")
                    Spacer(minLength: 0)
                    Label("\(traveller.favourites.count) saved places", systemImage: "bookmark.fill")
                }
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Profile — stats & certifications

    private var profileStatsGroup: some View {
        Group {
            PremiumSection(title: "Travel stats", subtitle: "Your journeys, measured.") {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(traveller.metrics.indices, id: \.self) { index in
                        let metric = traveller.metrics[index]
                        PremiumMetricTile(value: metric.value, label: metric.label, valueFont: TravelTypography.title)
                    }
                }
            }

            PremiumSection(title: "Certifications", subtitle: "On file, offline-ready.") {
                PremiumAdaptiveGrid(minimumWidth: 220) {
                    ForEach(traveller.certifications, id: \.self) { certification in
                        certificationChip(certification)
                    }
                }
            }
        }
    }

    private func certificationChip(_ title: String) -> some View {
        HStack(spacing: TravelSpacing.sm) {
            Image(systemName: "rosette")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(theme.sun)
            Text(title)
                .font(TravelTypography.caption)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .padding(TravelSpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    // MARK: Profile — saved places & emergency

    private var profileTravelGroup: some View {
        Group {
            PremiumSection(title: "Saved destinations", subtitle: "Your favourites, ready to plan.") {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(traveller.favourites.indices, id: \.self) { index in
                        let favourite = traveller.favourites[index]
                        PremiumPillRow(symbol: favourite.icon, accent: TravelDemoData.accent(favourite.accentKey), title: favourite.name, subtitle: favourite.subtitle, trailing: "Saved")
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(favourite.name), \(favourite.subtitle)")
                    }
                }
            }

            PremiumSection(title: "Emergency contacts", subtitle: "Saved offline for every trip.") {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(traveller.emergency.indices, id: \.self) { index in
                        let contact = traveller.emergency[index]
                        PremiumPillRow(symbol: contact.icon, accent: TravelDemoData.accent(contact.accentKey), title: contact.name, subtitle: contact.role, trailing: contact.number)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(contact.name), \(contact.role), \(contact.number)")
                    }
                }
            }
        }
    }

    // MARK: Profile — footer

    private var profileFooter: some View {
        PremiumSection(title: "Architecture", subtitle: "Under the hood.") {
            GlassCard {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    Image(systemName: "square.grid.2x2.fill")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(theme.tint)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text("One spine, many screens")
                            .font(TravelTypography.cardTitle)
                        Text("\(TravelScreenRegistry.allScreens.count) screens across \(TravelNavigationModel.groups.count) tabs, all driven by the shared navigation model, coordinator and deterministic demo data.")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

struct TravelIntelligenceAppSpine_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelIntelligenceAppSpine()
                .previewDisplayName("App spine · Travel Intelligence")

            TravelIntelligenceAppSpine()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("App spine · Dynamic Type XL")
        }
    }
}

#endif
