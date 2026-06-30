import SwiftUI

// MARK: - Travel navigation preview shell (Integration 004)
//
// The first interactive demonstration that wires the navigation architecture together:
// it consumes `TravelNavigationModel` (the blueprint), `TravelNavigationCoordinator`
// (the logic) and `TravelDemoData` (the sample journey), and shows the selected group,
// current destination, breadcrumb trail, recent destinations, quick shortcuts, the
// current traveller and trip, plus working buttons that drive the coordinator.
//
// It is a demonstration only — it does NOT touch the production app entry or routing,
// uses no `NavigationStack` / `NavigationLink`, and does not embed the real dashboards
// (the centre shows a placeholder card naming the flagship that would render). Because
// it reads the DEBUG-only `TravelDemoData`, the whole file is wrapped in `#if DEBUG`.
//
// The coordinator is intentionally non-Observable, so this shell mirrors the
// coordinator's value `state` into a SwiftUI `@State` after each action to drive
// re-rendering. It reuses the existing premium design system throughout.

#if DEBUG

struct TravelNavigationPreviewShell: View {
    @State private var coordinator = TravelNavigationCoordinator()
    @State private var nav = TravelNavigationModel.initialState
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let theme = TravelTheme.current

    // MARK: Derived (from the mirrored state)

    private var group: NavigationGroup? { TravelNavigationModel.group(nav.selectedGroupID) }
    private var destination: NavigationDestination? { TravelNavigationModel.destination(nav.selectedDestinationID) }
    private var breadcrumbs: [NavigationDestination] { nav.breadcrumb.compactMap { TravelNavigationModel.destination($0) } }
    private var recent: [NavigationDestination] { nav.recent.compactMap { TravelNavigationModel.destination($0) } }
    private var shortcuts: [NavigationShortcut] { TravelNavigationModel.quickShortcuts }

    var body: some View {
        PremiumScrollView {
            hero
            locationSection
            breadcrumbSection
            placeholderSection
            actionsSection
            shortcutsSection
            recentSection
            travellerSection
            tripSection
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
            eyebrow: "Architecture Preview",
            symbol: group?.symbol ?? "square.grid.2x2.fill",
            title: group?.title ?? "Navigation",
            subtitle: "Model + Coordinator + Demo Data working together — tap the buttons to navigate.",
            gradient: [theme.ocean, theme.tint, theme.sky],
            metrics: [
                HeroMetric(value: group?.title ?? "—", label: "Group"),
                HeroMetric(value: "\(breadcrumbs.count)", label: "Depth"),
                HeroMetric(value: "\(TravelNavigationModel.destinations.count)", label: "Routes")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(NavPreviewAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Current location

    private var locationSection: some View {
        section("Current location", "Where the coordinator is.", 1) {
            GlassCard(prominence: .hero) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(destination?.symbol ?? "mappin", theme.tint)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(destination?.title ?? "—")
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(destination?.subtitle ?? "")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: TravelSpacing.xs) {
                            chip("rectangle.stack.fill", group?.title ?? "—", theme.ocean)
                            if let kind = destination?.kind { chip("tag.fill", kind.rawValue, theme.sun) }
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Current location, group \(group?.title ?? "none"), destination \(destination?.title ?? "none").")
        }
    }

    // MARK: Breadcrumb

    private var breadcrumbSection: some View {
        section("Breadcrumb", "How you got here.", 2) {
            GlassCard {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: TravelSpacing.xs) {
                        ForEach(Array(breadcrumbs.enumerated()), id: \.offset) { index, crumb in
                            HStack(spacing: TravelSpacing.xs) {
                                Text(crumb.title)
                                    .font(TravelTypography.caption)
                                    .foregroundStyle(index == breadcrumbs.count - 1 ? .primary : .secondary)
                                    .padding(.horizontal, TravelSpacing.sm)
                                    .padding(.vertical, TravelSpacing.xs)
                                    .background(.thinMaterial, in: Capsule())
                                if index < breadcrumbs.count - 1 {
                                    Image(systemName: "chevron.right")
                                        .font(TravelTypography.eyebrow)
                                        .foregroundStyle(theme.tint)
                                }
                            }
                        }
                    }
                    .padding(.vertical, TravelSpacing.xxs)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Breadcrumb: " + breadcrumbs.map { $0.title }.joined(separator: ", then "))
        }
    }

    // MARK: Centre placeholder

    private var placeholderSection: some View {
        section("Now showing", "The dashboard that would render.", 3) {
            GlassCard(prominence: .hero) {
                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    HStack(alignment: .top, spacing: TravelSpacing.md) {
                        medallion(destination?.symbol ?? "square.dashed", theme.coral)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text(dashboardName(for: destination))
                                .font(TravelTypography.cardTitle)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(destination?.subtitle ?? "")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                    }
                    Text("In the real app the \(dashboardName(for: destination)) would render here. Dashboards are not embedded in this preview.")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Now showing placeholder for \(dashboardName(for: destination)).")
        }
    }

    // MARK: Actions

    private var actionsSection: some View {
        section("Navigate", "Drive the coordinator.", 4) {
            PremiumAdaptiveGrid(minimumWidth: 150) {
                actionButton("Home", "house.fill", theme.tint) { coordinator.openHome() }
                actionButton("Journey", "figure.walk.motion", theme.ocean) { coordinator.openJourney() }
                actionButton("Trip Planner", "calendar", theme.sky) { coordinator.openTripPlanner() }
                actionButton("Destination Hub", "globe.asia.australia.fill", theme.moss) { coordinator.openDestinationHub() }
                actionButton("Island Guide", "map.fill", theme.sun) { coordinator.openIslandGuide() }
                actionButton("Back", "chevron.left", theme.ocean, enabled: nav.canGoBack) { coordinator.goBack() }
                actionButton("Reset", "arrow.counterclockwise", theme.coral) { coordinator.reset() }
            }
        }
    }

    private func actionButton(_ title: String, _ icon: String, _ accent: Color, enabled: Bool = true, _ action: @escaping () -> Void) -> some View {
        Button { run(action) } label: {
            HStack(spacing: TravelSpacing.sm) {
                Image(systemName: icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(enabled ? accent : Color.secondary)
                Text(title)
                    .font(TravelTypography.caption)
                    .foregroundStyle(enabled ? .primary : .secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .padding(TravelSpacing.md)
            .frame(maxWidth: .infinity)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .opacity(enabled ? 1 : 0.5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel("\(title) button")
    }

    // MARK: Shortcuts

    private var shortcutsSection: some View {
        section("Quick shortcuts", "Jump to a destination.", 5) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(shortcuts) { shortcut in
                        Button { run { coordinator.open(destination: shortcut.destinationID) } } label: {
                            Label(shortcut.title, systemImage: shortcut.symbol)
                                .font(TravelTypography.caption)
                                .foregroundStyle(theme.tint)
                                .padding(.horizontal, TravelSpacing.md)
                                .padding(.vertical, TravelSpacing.xs)
                                .background(theme.tint.opacity(0.15), in: Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(shortcut.title) shortcut")
                    }
                }
                .padding(.vertical, TravelSpacing.xxs)
            }
        }
    }

    // MARK: Recent

    private var recentSection: some View {
        section("Recent destinations", "Most recent first.", 6) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(recent) { dest in
                    PremiumPillRow(symbol: dest.symbol, accent: theme.tint, title: dest.title, subtitle: dest.subtitle, trailing: "Open")
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(dest.title), \(dest.subtitle)")
                }
            }
        }
    }

    // MARK: Traveller

    private var travellerSection: some View {
        section("Traveller", "From the shared demo data.", 7) {
            GlassCard {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    Text(TravelDemoData.traveller.initials)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                        .frame(width: 46, height: 46)
                        .background(
                            LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .topLeading, endPoint: .bottomTrailing),
                            in: Circle()
                        )
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(TravelDemoData.traveller.name)
                            .font(TravelTypography.cardTitle)
                        Text("From \(TravelDemoData.traveller.homeCity) · \(TravelDemoData.traveller.certifications.first ?? "")")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Traveller \(TravelDemoData.traveller.name) from \(TravelDemoData.traveller.homeCity).")
        }
    }

    // MARK: Trip

    private var tripSection: some View {
        section("Current trip", "The shared journey.", 8) {
            GlassCard {
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(TravelDemoData.trip.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(TravelDemoData.trip.subtitle)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: TravelSpacing.xs) {
                        chip("calendar", "\(TravelDemoData.trip.totalDays) nights", theme.tint)
                        chip("map.fill", "\(TravelDemoData.trip.islandNames.count) islands", theme.ocean)
                        chip("airplane", "\(TravelDemoData.trip.daysToDeparture)d to go", theme.sun)
                    }
                    .padding(.top, TravelSpacing.xxs)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Current trip \(TravelDemoData.trip.title), \(TravelDemoData.trip.totalDays) nights, \(TravelDemoData.trip.islandNames.count) islands.")
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(NavPreviewAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Logic bridge

    /// Run a coordinator action, then mirror its value state into `@State` to re-render.
    private func run(_ action: () -> Void) {
        action()
        withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
            nav = coordinator.state
        }
    }

    private func dashboardName(for destination: NavigationDestination?) -> String {
        switch destination?.id {
        case "home-v2": return "Home Dashboard V2"
        case "journey": return "Journey Dashboard"
        case "trip-planner-v2": return "Trip Planner Dashboard V2"
        case "destination-hub": return "Destination Hub"
        case "island-guide": return "Island Guide Dashboard"
        default: return "\(destination?.title ?? "Dashboard") screen"
        }
    }

    // MARK: Shared bits

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

// MARK: - Preview shell appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct NavPreviewAppear: ViewModifier {
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

struct TravelNavigationPreviewShell_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelNavigationPreviewShell()
                .previewDisplayName("Navigation preview shell")

            TravelNavigationPreviewShell()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Navigation preview · Dynamic Type XL")
        }
    }
}

#endif
