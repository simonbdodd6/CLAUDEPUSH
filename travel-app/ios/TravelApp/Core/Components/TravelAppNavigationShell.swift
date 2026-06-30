import SwiftUI

// MARK: - Travel app navigation shell (Phase 140)
//
// A first reusable, presentation-only navigation shell that begins connecting the
// premium dashboards into a real app experience. It is NOT production navigation: there
// is no navigation stack and no real routing — a `@State` selected tab simply swaps a
// placeholder "route" card to demonstrate how a user would move through the app. It
// includes an app-shell hero, a top toolbar (global search, notifications and profile
// placeholders), a central routing area, navigation-state chips, a quick-switch panel,
// a recently-visited list, a settings shortcut, an app-version placeholder, a floating-
// action-button placeholder and a custom bottom navigation bar with Home, Trips,
// Destinations, Journey, Explore and Profile tabs (with an active-tab indicator). A
// caller supplies a `ShellPlan` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumAdaptiveGrid`, `PremiumPillRow`, `PremiumMetricTile`, `TravelTypography` and
// the tokens. The `Shell*` model names are deliberately distinct from
// `TravelDestinationShell`'s types to avoid any collision. `ShellPlan` and its rows are
// lightweight presentation models (not DTOs); the component holds no data, networking,
// persistence, repository, view-model, navigation-stack, AppContainer or DTO logic, and
// is not wired into any screen. All tabs, search, notifications, profile, FAB and
// settings are UI-only placeholders.
//
// Accessibility: tabs are buttons exposing selected state; the routing area announces
// the active destination; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion is disabled under Reduce Motion.

/// A bottom-navigation tab. Each maps to a dashboard the shell would route to.
enum ShellTab: String, CaseIterable, Identifiable {
    case home
    case trips
    case destinations
    case journey
    case explore
    case profile

    var id: String { rawValue }

    var label: String {
        switch self {
        case .home: "Home"
        case .trips: "Trips"
        case .destinations: "Places"
        case .journey: "Journey"
        case .explore: "Explore"
        case .profile: "Profile"
        }
    }

    var icon: String {
        switch self {
        case .home: "house.fill"
        case .trips: "calendar"
        case .destinations: "globe.asia.australia.fill"
        case .journey: "figure.walk.motion"
        case .explore: "map.fill"
        case .profile: "person.crop.circle.fill"
        }
    }

    var routeTitle: String {
        switch self {
        case .home: "Home Dashboard V2"
        case .trips: "Trip Planner Dashboard V2"
        case .destinations: "Destination Hub"
        case .journey: "Journey Dashboard"
        case .explore: "Island Guide Dashboard"
        case .profile: "Your Profile"
        }
    }

    var routeDetail: String {
        switch self {
        case .home: "Your personalised landing page — next-trip countdown, readiness and shortcuts."
        case .trips: "Plan and track a trip across every module, with progress and a budget snapshot."
        case .destinations: "Open a destination hub like Bali, with a snapshot of every guide."
        case .journey: "An end-to-end view of the live trip, from leaving home to returning."
        case .explore: "Compare and choose Indonesian islands by activity and region."
        case .profile: "Your account, saved trips, favourites and preferences. (Placeholder)"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .home: return theme.tint
        case .trips: return theme.ocean
        case .destinations: return theme.sky
        case .journey: return theme.moss
        case .explore: return theme.sun
        case .profile: return theme.coral
        }
    }
}

/// A recently-visited placeholder row.
struct ShellRow: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String
    var icon: String
    var accent: Color
}

/// The full, presentation-only content for the navigation shell.
struct ShellPlan {
    var appName: String
    var appVersion: String
    var userName: String
    var userInitials: String
    var notificationCount: Int
    var heroGradient: [Color]
    var recentlyVisited: [ShellRow]
}

/// A premium, presentation-only navigation shell rendered from a `ShellPlan`.
struct TravelAppNavigationShell: View {
    var plan: ShellPlan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var selectedTab: ShellTab = .home

    private let theme = TravelTheme.current

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                topToolbar
                PremiumScrollView {
                    hero
                    routingSection
                    chipsSection
                    quickSwitchSection
                    recentlySection
                    footerSection
                    Color.clear.frame(height: 76)
                }
            }
            bottomNavBar
        }
        .overlay(alignment: .bottomTrailing) { floatingActionButton }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Top toolbar

    private var topToolbar: some View {
        HStack(spacing: TravelSpacing.sm) {
            HStack(spacing: TravelSpacing.xs) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                Text("Search trips, places, guides")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, TravelSpacing.md)
            .padding(.vertical, TravelSpacing.sm)
            .background(.thinMaterial, in: Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Search. Placeholder.")

            notificationsButton
            profileButton
        }
        .padding(.horizontal, TravelSpacing.lg)
        .padding(.vertical, TravelSpacing.sm)
        .background(.bar)
    }

    private var notificationsButton: some View {
        Button { } label: {
            Image(systemName: "bell.fill")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(theme.tint)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
                .overlay(alignment: .topTrailing) {
                    if plan.notificationCount > 0 {
                        Text("\(plan.notificationCount)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(.white)
                            .padding(4)
                            .background(theme.coral, in: Circle())
                            .offset(x: 2, y: -2)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Notifications, \(plan.notificationCount) unread. Placeholder.")
    }

    private var profileButton: some View {
        Button { selectTab(.profile) } label: {
            Text(plan.userInitials)
                .font(TravelTypography.caption)
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(
                    LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: Circle()
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profile, \(plan.userName). Placeholder.")
    }

    // MARK: Hero

    private var hero: some View {
        FeatureHeroScaffold(
            eyebrow: plan.appName,
            symbol: selectedTab.icon,
            title: selectedTab.label,
            subtitle: selectedTab.routeDetail,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: selectedTab.label, label: "Tab"),
                HeroMetric(value: "\(ShellTab.allCases.count)", label: "Sections"),
                HeroMetric(value: plan.appVersion, label: "Version")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(NavShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Sections

    private var routingSection: some View {
        section("Now showing", "Demonstration routing only.", 1) {
            GlassCard(prominence: .hero) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(selectedTab.icon, selectedTab.accent)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(selectedTab.routeTitle)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(selectedTab.routeDetail)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text("In a real app the \(selectedTab.routeTitle) would render here.")
                            .font(TravelTypography.eyebrow)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Now showing \(selectedTab.routeTitle). \(selectedTab.routeDetail)")
        }
    }

    private var chipsSection: some View {
        section("Navigation state", "Where you are right now.", 2) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    stateChip("rectangle.stack.fill", "Tab: \(selectedTab.label)")
                    stateChip("arrow.triangle.turn.up.right.diamond.fill", "Route: \(selectedTab.routeTitle)")
                    stateChip("square.grid.2x2.fill", "\(ShellTab.allCases.count) sections")
                    stateChip("bell.fill", "\(plan.notificationCount) alerts")
                }
                .padding(.vertical, TravelSpacing.xxs)
            }
        }
    }

    private var quickSwitchSection: some View {
        section("Quick switch", "Jump straight to a section.", 3) {
            PremiumAdaptiveGrid(minimumWidth: 104) {
                ForEach(ShellTab.allCases) { tab in
                    quickSwitchTile(tab)
                }
            }
        }
    }

    private var recentlySection: some View {
        section("Recently visited", "Pick up where you left off.", 4) {
            VStack(spacing: TravelSpacing.sm) {
                ForEach(plan.recentlyVisited) { row in
                    PremiumPillRow(symbol: row.icon, accent: row.accent, title: row.title, subtitle: row.subtitle, trailing: "Open")
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(row.title), \(row.subtitle). Placeholder.")
                }
            }
        }
    }

    private var footerSection: some View {
        section("App", "Settings and version.", 5) {
            VStack(spacing: TravelSpacing.sm) {
                Button { } label: {
                    HStack(spacing: TravelSpacing.md) {
                        medallion("gearshape.fill", theme.ocean)
                        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                            Text("Settings")
                                .font(TravelTypography.cardTitle)
                            Text("Preferences, appearance and account.")
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").foregroundStyle(.secondary)
                    }
                    .padding(TravelSpacing.md)
                    .frame(maxWidth: .infinity)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Settings. Placeholder.")

                Text("\(plan.appName) · version \(plan.appVersion)")
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("\(plan.appName) version \(plan.appVersion)")
            }
        }
    }

    // MARK: Bottom navigation bar

    private var bottomNavBar: some View {
        HStack(spacing: 0) {
            ForEach(ShellTab.allCases) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, TravelSpacing.xs)
        .padding(.top, TravelSpacing.xs)
        .padding(.bottom, TravelSpacing.sm)
        .background(.bar)
        .overlay(alignment: .top) {
            Rectangle().fill(.white.opacity(0.08)).frame(height: 1)
        }
    }

    private func tabButton(_ tab: ShellTab) -> some View {
        let isSelected = tab == selectedTab
        return Button { selectTab(tab) } label: {
            VStack(spacing: TravelSpacing.xxs) {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(isSelected ? theme.tint : .clear)
                    .frame(width: 18, height: 3)
                Image(systemName: tab.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(isSelected ? theme.tint : Color.secondary)
                Text(tab.label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(isSelected ? theme.tint : Color.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.xxs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tab.label) tab")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
    }

    // MARK: Floating action button

    private var floatingActionButton: some View {
        Button { } label: {
            Image(systemName: "plus")
                .font(TravelTypography.title)
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(
                    LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .topLeading, endPoint: .bottomTrailing),
                    in: Circle()
                )
                .shadow(color: theme.tint.opacity(0.4), radius: 10, y: 6)
        }
        .buttonStyle(.plain)
        .padding(.trailing, TravelSpacing.lg)
        .padding(.bottom, 96)
        .accessibilityLabel("New trip or booking. Placeholder action.")
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(NavShellAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Shared bits

    private func selectTab(_ tab: ShellTab) {
        withAnimation(reduceMotion ? nil : TravelMotion.gentle) { selectedTab = tab }
    }

    private func stateChip(_ icon: String, _ text: String) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: icon)
            Text(text)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(theme.tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(theme.tint.opacity(0.15), in: Capsule())
    }

    private func quickSwitchTile(_ tab: ShellTab) -> some View {
        let isSelected = tab == selectedTab
        return Button { selectTab(tab) } label: {
            VStack(spacing: TravelSpacing.xs) {
                Image(systemName: tab.icon)
                    .font(TravelTypography.title)
                    .foregroundStyle(isSelected ? .white : tab.accent)
                Text(tab.label)
                    .font(TravelTypography.eyebrow)
                    .foregroundStyle(isSelected ? .white : .primary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
            .padding(.horizontal, TravelSpacing.sm)
            .background(
                isSelected ? AnyShapeStyle(tab.accent) : AnyShapeStyle(.thinMaterial),
                in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(tab.label) section")
        .accessibilityValue(isSelected ? "Selected" : "Not selected")
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

// MARK: - Navigation shell appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct NavShellAppear: ViewModifier {
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
extension ShellPlan {
    /// A deterministic sample shell plan for the Travel Intelligence app.
    static var sample: ShellPlan {
        let theme = TravelTheme.current
        return ShellPlan(
            appName: "Travel Intelligence",
            appVersion: "1.0 (140)",
            userName: "Simon",
            userInitials: "SD",
            notificationCount: 3,
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            recentlyVisited: [
                ShellRow(title: "Bali · Destination Hub", subtitle: "Viewed 2h ago", icon: "globe.asia.australia.fill", accent: theme.sky),
                ShellRow(title: "Bali & Beyond · Trip Planner", subtitle: "Viewed today", icon: "calendar", accent: theme.ocean),
                ShellRow(title: "Island Guide", subtitle: "Compared 9 islands", icon: "map.fill", accent: theme.sun),
                ShellRow(title: "Document Wallet", subtitle: "Saved insurance", icon: "wallet.bifold.fill", accent: theme.moss)
            ]
        )
    }
}

struct TravelAppNavigationShell_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelAppNavigationShell(plan: .sample)
                .previewDisplayName("App shell · Travel Intelligence")

            TravelAppNavigationShell(plan: .sample)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("App shell · Dynamic Type XL")
        }
    }
}
#endif
