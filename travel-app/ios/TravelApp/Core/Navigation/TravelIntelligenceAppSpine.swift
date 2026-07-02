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

    private var profileScreen: some View {
        let traveller = TravelDemoData.traveller
        return PremiumScrollView {
            FeatureHeroScaffold(
                eyebrow: "Profile",
                symbol: "person.crop.circle.fill",
                title: traveller.name,
                subtitle: "From \(traveller.homeCity) — your saved trips, favourites and preferences.",
                gradient: [theme.ocean, theme.tint, theme.sky],
                metrics: [
                    HeroMetric(value: traveller.metrics.first?.value ?? "0", label: "Trips"),
                    HeroMetric(value: "\(TravelScreenRegistry.allScreens.count)", label: "Screens"),
                    HeroMetric(value: "\(TravelNavigationModel.groups.count)", label: "Tabs")
                ],
                texture: { MapTexturePlaceholder() }
            )

            PremiumSection(title: "Your travels", subtitle: "Lifetime stats.") {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(traveller.metrics.indices, id: \.self) { index in
                        let metric = traveller.metrics[index]
                        PremiumMetricTile(value: metric.value, label: metric.label)
                    }
                }
            }

            PremiumSection(title: "Certifications", subtitle: "On file.") {
                GlassCard {
                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        ForEach(traveller.certifications, id: \.self) { certification in
                            Label(certification, systemImage: "rosette")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }

            PremiumSection(title: "Saved destinations", subtitle: "Your favourites.") {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(traveller.favourites.indices, id: \.self) { index in
                        let favourite = traveller.favourites[index]
                        PremiumPillRow(symbol: favourite.icon, accent: TravelDemoData.accent(favourite.accentKey), title: favourite.name, subtitle: favourite.subtitle, trailing: "Saved")
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel("\(favourite.name), \(favourite.subtitle)")
                    }
                }
            }

            PremiumSection(title: "Architecture", subtitle: "Under the hood.") {
                GlassCard {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        Image(systemName: "square.grid.2x2.fill")
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(theme.tint)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text("Navigation preview shell")
                                .font(TravelTypography.cardTitle)
                            Text("This spine reuses the navigation model, coordinator and shared demo data. The interactive preview shell demonstrates the same architecture.")
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
