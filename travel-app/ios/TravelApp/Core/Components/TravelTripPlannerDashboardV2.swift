import SwiftUI

// MARK: - Travel trip planner dashboard V2 (Phase 136)
//
// A flagship, presentation-only Trip Planner that brings every travel module into one
// planning overview: a hero with destination and departure countdown, an overall trip-
// readiness score and planning-progress rings, summary tiles for each module (flights,
// ferries, accommodation, transport, budget, weather, visa & entry, passport &
// documents, offline readiness, health, packing, currency, connectivity, safety), an
// island-itinerary overview, a daily-timeline preview, a quick-actions grid, a continue-
// planning button, favourite shortcuts, personal notes, a recent-activity feed, smart
// recommendations and an interactive-planning-timeline placeholder. A caller supplies a
// `PlannerV2Plan` value.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumSection`, `FeatureHeroScaffold`, `HeroMetric`, `GlassCard`,
// `PremiumMetricTile`, `PremiumProgressBar`, `PremiumRingProgress`,
// `PremiumAdaptiveGrid`, `TravelTypography` and the tokens. The `PlannerV2*` model
// names are deliberately distinct from the existing Trip Planner's types to avoid any
// collision. `PlannerV2Plan` and its nested rows are lightweight presentation models
// (not DTOs); the component holds no data, networking, persistence, repository, view-
// model, navigation, AppContainer or DTO logic, and is not wired into any screen. The
// quick actions, favourite shortcuts and notes are UI-only.
//
// Accessibility: cards expose combined VoiceOver labels with favourite buttons kept
// independently focusable; text uses the Dynamic Type-scaling `TravelTypography` styles
// and wraps rather than truncating; and all motion is disabled under Reduce Motion.

/// A planning module's status — drives the status badge label and accent.
enum PlannerV2Status {
    case ready
    case inProgress
    case todo
    case alert

    var label: String {
        switch self {
        case .ready: "Ready"
        case .inProgress: "In progress"
        case .todo: "To do"
        case .alert: "Attention"
        }
    }

    var icon: String {
        switch self {
        case .ready: "checkmark.circle.fill"
        case .inProgress: "hourglass"
        case .todo: "circle.dashed"
        case .alert: "exclamationmark.triangle.fill"
        }
    }

    var accent: Color {
        let theme = TravelTheme.current
        switch self {
        case .ready: return theme.moss
        case .inProgress: return theme.sun
        case .todo: return theme.ocean
        case .alert: return theme.coral
        }
    }
}

/// A single at-a-glance planner fact.
struct PlannerV2Fact: Identifiable {
    let id = UUID()
    var value: String
    var label: String
}

/// A planning-module summary tile.
struct PlannerV2Module: Identifiable {
    let id: String
    var title: String
    var icon: String
    var status: PlannerV2Status
    var summary: String
    var progress: Double?

    init(title: String, icon: String, status: PlannerV2Status, summary: String, progress: Double? = nil) {
        self.id = title
        self.title = title
        self.icon = icon
        self.status = status
        self.summary = summary
        self.progress = progress
    }
}

/// A quick-action tile.
struct PlannerV2Action: Identifiable {
    let id = UUID()
    var title: String
    var icon: String
    var accent: Color
}

/// An island stop in the itinerary overview.
struct PlannerV2Itinerary: Identifiable {
    let id = UUID()
    var island: String
    var nights: String
    var icon: String
    var detail: String
    var accent: Color
}

/// A generic planner row reused for the timeline preview, activity feed and recommendations.
struct PlannerV2Row: Identifiable {
    let id = UUID()
    var title: String
    var subtitle: String?
    var icon: String
    var detail: String
    var accent: Color
}

/// The full, presentation-only content for the V2 trip planner.
struct PlannerV2Plan {
    var destination: String
    var subtitle: String
    var heroSymbol: String
    var heroGradient: [Color]
    var departureLabel: String
    var daysToDeparture: Int
    var readiness: Double
    var planningProgress: Double
    var offlineReadiness: Double
    var packingCompletion: Double
    var facts: [PlannerV2Fact]
    var modules: [PlannerV2Module]
    var itinerary: [PlannerV2Itinerary]
    var timelinePreview: [PlannerV2Row]
    var quickActions: [PlannerV2Action]
    var shortcuts: [String]
    var notesPlaceholder: String
    var recentActivity: [PlannerV2Row]
    var recommendations: [PlannerV2Row]
    var disclaimer: String
}

/// A premium, presentation-only V2 trip planner rendered from a `PlannerV2Plan`.
struct TravelTripPlannerDashboardV2: View {
    var plan: PlannerV2Plan

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current

    var body: some View {
        PremiumScrollView {
            hero
            scoreGroup
            modulesGroup
            planGroup
            actionGroup
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
            eyebrow: "Trip Planner",
            symbol: plan.heroSymbol,
            title: plan.destination,
            subtitle: plan.subtitle,
            gradient: plan.heroGradient,
            metrics: [
                HeroMetric(value: "\(plan.daysToDeparture)d", label: "To departure"),
                HeroMetric(value: "\(percent(plan.readiness))%", label: "Ready"),
                HeroMetric(value: "\(percent(plan.planningProgress))%", label: "Planned")
            ],
            texture: { MapTexturePlaceholder() }
        )
        .modifier(PlannerV2Appear(appeared: appeared, reduceMotion: reduceMotion, index: 0))
    }

    // MARK: Section groups (kept within ViewBuilder arity limits)

    private var scoreGroup: some View {
        Group {
            section("Trip readiness", "How ready you are to fly.", 1) {
                scoreCard
            }

            section("At a glance", "Your trip in numbers.", 2) {
                PremiumAdaptiveGrid(minimumWidth: 150) {
                    ForEach(plan.facts) { fact in
                        PremiumMetricTile(value: fact.value, label: fact.label)
                    }
                }
            }
        }
    }

    private var modulesGroup: some View {
        Group {
            section("Planning modules", "Every part of the trip.", 3) {
                PremiumAdaptiveGrid(minimumWidth: 168) {
                    ForEach(plan.modules) { module in
                        moduleTile(module)
                    }
                }
            }
        }
    }

    private var planGroup: some View {
        Group {
            section("Island itinerary", "Where you’ll go.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(plan.itinerary) { stop in
                        itineraryCard(stop)
                    }
                }
            }

            section("Daily timeline", "A preview of the plan.", 5) {
                infoList(plan.timelinePreview)
            }
        }
    }

    private var actionGroup: some View {
        Group {
            section("Quick actions", "Jump back in.", 6) {
                PremiumAdaptiveGrid(minimumWidth: 132) {
                    ForEach(plan.quickActions) { action in
                        actionTile(action)
                    }
                }
            }

            section("Keep planning", "Pick up where you left off.", 7) {
                continueCard
            }
        }
    }

    private var footerGroup: some View {
        Group {
            section("Favourite shortcuts", "Pin what you use most.", 8) {
                shortcutsCard
            }

            section("Recent activity", "What’s changed lately.", 8) {
                infoList(plan.recentActivity)
            }

            section("Smart recommendations", "Suggested next steps.", 8) {
                infoList(plan.recommendations)
            }

            section("Personal notes", "Jot it down.", 8) {
                notesCard
            }

            section("Planning timeline", "The big picture.", 8) {
                timelinePlaceholder
            }
        }
    }

    // MARK: Section helper

    @ViewBuilder
    private func section<Content: View>(_ title: String, _ subtitle: String, _ index: Int, @ViewBuilder content: () -> Content) -> some View {
        PremiumSection(title: title, subtitle: subtitle) {
            content()
        }
        .modifier(PlannerV2Appear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Score card

    private var scoreCard: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(spacing: TravelSpacing.lg) {
                    ring("Ready", appeared ? plan.readiness : 0, [theme.tint, theme.moss])
                    ring("Planned", appeared ? plan.planningProgress : 0, [theme.tint, theme.sky])
                    Spacer(minLength: 0)
                }
                progressLine("Offline", plan.offlineReadiness, theme.ocean)
                progressLine("Packing", plan.packingCompletion, theme.sun)
                Text("\(plan.daysToDeparture) days to go — \(plan.departureLabel).")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Trip readiness \(percent(plan.readiness)) percent, planning \(percent(plan.planningProgress)) percent, offline \(percent(plan.offlineReadiness)) percent, packing \(percent(plan.packingCompletion)) percent. \(plan.daysToDeparture) days to departure.")
    }

    private func ring(_ label: String, _ value: Double, _ colors: [Color]) -> some View {
        VStack(spacing: TravelSpacing.xs) {
            PremiumRingProgress(
                progress: value,
                colors: colors,
                trackColor: Color.secondary.opacity(0.14),
                lineWidth: 9
            ) {
                Text("\(percent(value))%")
                    .font(TravelTypography.cardTitle)
            }
            .frame(width: 84, height: 84)
            .animation(reduceMotion ? nil : TravelMotion.gentle, value: value)
            Text(label)
                .font(TravelTypography.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .accessibilityHidden(true)
    }

    private func progressLine(_ label: String, _ value: Double, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            HStack {
                Text(label)
                    .font(TravelTypography.caption)
                Spacer(minLength: 0)
                Text("\(percent(value))%")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            PremiumProgressBar(progress: appeared ? value : 0, colors: [tint, tint.opacity(0.6)])
                .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
        }
    }

    // MARK: Module tiles

    private func moduleTile(_ module: PlannerV2Module) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                HStack(alignment: .top, spacing: TravelSpacing.sm) {
                    Image(systemName: module.icon)
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(module.status.accent)
                    Spacer(minLength: 0)
                    statusBadge(module.status)
                }
                Text(module.title)
                    .font(TravelTypography.cardTitle)
                    .fixedSize(horizontal: false, vertical: true)
                Text(module.summary)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let progress = module.progress {
                    PremiumProgressBar(progress: appeared ? progress : 0, colors: [module.status.accent, module.status.accent.opacity(0.6)], height: 6)
                        .animation(reduceMotion ? nil : TravelMotion.gentle, value: appeared)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(module.title), \(module.status.label). \(module.summary)\(module.progress.map { ", \(percent($0)) percent" } ?? "")")
    }

    private func statusBadge(_ status: PlannerV2Status) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: status.icon)
            Text(status.label).textCase(.uppercase)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(status.accent)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(status.accent.opacity(0.15), in: Capsule())
    }

    // MARK: Itinerary cards

    private func itineraryCard(_ stop: PlannerV2Itinerary) -> some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                medallion(stop.icon, stop.accent)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    HStack(spacing: TravelSpacing.xs) {
                        Text(stop.island)
                            .font(TravelTypography.cardTitle)
                            .fixedSize(horizontal: false, vertical: true)
                        tagPill(stop.nights, stop.accent)
                    }
                    Text(stop.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(stop.island), \(stop.nights). \(stop.detail)")
    }

    // MARK: Quick actions

    private func actionTile(_ action: PlannerV2Action) -> some View {
        Button { } label: {
            VStack(spacing: TravelSpacing.xs) {
                Image(systemName: action.icon)
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(action.accent)
                Text(action.title)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity)
            .padding(TravelSpacing.md)
            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(action.title). Placeholder action.")
    }

    // MARK: Continue & shortcuts & notes

    private var continueCard: some View {
        Button { } label: {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(TravelTypography.title)
                    .foregroundStyle(.white)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Continue planning")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.white)
                    Text("\(percent(plan.planningProgress))% done — finish the last few steps.")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.8))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
            .padding(TravelSpacing.md)
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(colors: [theme.tint, theme.ocean], startPoint: .leading, endPoint: .trailing),
                in: RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Continue planning, \(percent(plan.planningProgress)) percent done. Placeholder button.")
    }

    private var shortcutsCard: some View {
        GlassCard {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: TravelSpacing.xs) {
                    ForEach(plan.shortcuts, id: \.self) { shortcut in
                        let isFav = favourites.contains(shortcut)
                        Button {
                            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                                if isFav { favourites.remove(shortcut) } else { favourites.insert(shortcut) }
                            }
                        } label: {
                            HStack(spacing: TravelSpacing.xxs) {
                                Image(systemName: isFav ? "star.fill" : "star")
                                Text(shortcut)
                            }
                            .font(TravelTypography.caption)
                            .foregroundStyle(isFav ? .white : .secondary)
                            .padding(.horizontal, TravelSpacing.md)
                            .padding(.vertical, TravelSpacing.xs)
                            .background(
                                isFav ? AnyShapeStyle(theme.tint) : AnyShapeStyle(.thinMaterial),
                                in: Capsule()
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(isFav ? "Pinned shortcut \(shortcut)" : "Pin shortcut \(shortcut)")
                    }
                }
                .padding(.vertical, TravelSpacing.xxs)
            }
        }
    }

    private var notesCard: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: "square.and.pencil")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.tint)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Personal notes")
                        .font(TravelTypography.cardTitle)
                    Text(plan.notesPlaceholder)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Editable notes coming soon")
                        .font(TravelTypography.eyebrow)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Personal notes. \(plan.notesPlaceholder). Placeholder.")
    }

    private var timelinePlaceholder: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                MapTexturePlaceholder()
                    .frame(height: 120)
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
                Label("Interactive planning timeline coming soon", systemImage: "calendar.day.timeline.left")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Interactive planning timeline. Placeholder.")
    }

    // MARK: Generic info list

    private func infoList(_ rows: [PlannerV2Row]) -> some View {
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
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(row.title)\(row.subtitle.map { ", \($0)" } ?? ""), \(row.detail)")
            }
        }
    }

    // MARK: Shared bits

    private func percent(_ value: Double) -> Int { Int((value * 100).rounded()) }

    private func tagPill(_ text: String, _ tint: Color) -> some View {
        Text(text)
            .font(TravelTypography.eyebrow)
            .textCase(.uppercase)
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

// MARK: - Planner V2 appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct PlannerV2Appear: ViewModifier {
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
extension PlannerV2Plan {
    /// A deterministic sample plan for an Indonesia trip, mid-planning.
    static var sampleIndonesia: PlannerV2Plan {
        let theme = TravelTheme.current
        return PlannerV2Plan(
            destination: "Bali & Beyond",
            subtitle: "A 14-night island-hop across Bali, the Gilis, Lombok and Komodo.",
            heroSymbol: "map.fill",
            heroGradient: [theme.ocean, theme.tint, theme.sky],
            departureLabel: "12–26 Aug",
            daysToDeparture: 12,
            readiness: 0.78,
            planningProgress: 0.72,
            offlineReadiness: 0.75,
            packingCompletion: 0.70,
            facts: [
                PlannerV2Fact(value: "14", label: "Nights"),
                PlannerV2Fact(value: "5", label: "Islands"),
                PlannerV2Fact(value: "£62", label: "Per day"),
                PlannerV2Fact(value: "8", label: "Dives planned")
            ],
            modules: [
                PlannerV2Module(title: "Flights", icon: "airplane", status: .ready, summary: "Return DPS booked; LBJ hop confirmed."),
                PlannerV2Module(title: "Ferries", icon: "ferry.fill", status: .inProgress, summary: "2 of 3 fast boats booked.", progress: 0.66),
                PlannerV2Module(title: "Accommodation", icon: "bed.double.fill", status: .ready, summary: "Every night booked.", progress: 1.0),
                PlannerV2Module(title: "Transport", icon: "car.fill", status: .todo, summary: "Arrange the airport pickup."),
                PlannerV2Module(title: "Budget", icon: "wallet.bifold.fill", status: .inProgress, summary: "£62/day planned.", progress: 0.7),
                PlannerV2Module(title: "Weather", icon: "cloud.sun.fill", status: .ready, summary: "Dry season — calm and clear."),
                PlannerV2Module(title: "Visa & entry", icon: "doc.text.fill", status: .ready, summary: "e-VOA ready to scan."),
                PlannerV2Module(title: "Documents", icon: "wallet.bifold.fill", status: .alert, summary: "1 document still to save offline."),
                PlannerV2Module(title: "Offline", icon: "arrow.down.circle.fill", status: .inProgress, summary: "6 of 8 essentials saved.", progress: 0.75),
                PlannerV2Module(title: "Health", icon: "cross.case.fill", status: .inProgress, summary: "Vaccines done; confirm dive insurance.", progress: 0.6),
                PlannerV2Module(title: "Packing", icon: "bag.fill", status: .inProgress, summary: "70% packed.", progress: 0.7),
                PlannerV2Module(title: "Currency", icon: "banknote.fill", status: .ready, summary: "Cash and cards sorted."),
                PlannerV2Module(title: "Connectivity", icon: "wifi", status: .todo, summary: "Buy an eSIM before you fly."),
                PlannerV2Module(title: "Safety", icon: "shield.lefthalf.filled", status: .ready, summary: "No active alerts.")
            ],
            itinerary: [
                PlannerV2Itinerary(island: "Bali", nights: "4 nights", icon: "leaf.fill", detail: "Canggu and Ubud to settle in and explore.", accent: theme.tint),
                PlannerV2Itinerary(island: "Nusa Lembongan", nights: "2 nights", icon: "water.waves", detail: "Snorkelling and a chilled island pace.", accent: theme.sky),
                PlannerV2Itinerary(island: "Gili Air", nights: "3 nights", icon: "beach.umbrella.fill", detail: "Turtles, diving and sunset bars.", accent: theme.moss),
                PlannerV2Itinerary(island: "Lombok", nights: "2 nights", icon: "mountain.2.fill", detail: "Surf and a gateway to the Komodo flight.", accent: theme.sun),
                PlannerV2Itinerary(island: "Komodo", nights: "3 nights", icon: "lizard.fill", detail: "Dragons, Padar and big-fish diving.", accent: theme.coral)
            ],
            timelinePreview: [
                PlannerV2Row(title: "Day 1 · Arrive Bali", subtitle: "12 Aug", icon: "airplane.arrival", detail: "Land at DPS, transfer to Canggu.", accent: theme.sky),
                PlannerV2Row(title: "Day 5 · Boat to Lembongan", subtitle: "16 Aug", icon: "ferry.fill", detail: "Fast boat from Sanur.", accent: theme.ocean),
                PlannerV2Row(title: "Day 7 · Gili Air", subtitle: "18 Aug", icon: "beach.umbrella.fill", detail: "Direct boat across to the Gilis.", accent: theme.moss),
                PlannerV2Row(title: "Day 12 · Fly to Komodo", subtitle: "23 Aug", icon: "airplane", detail: "Lombok to Labuan Bajo.", accent: theme.sun),
                PlannerV2Row(title: "Day 14 · Return home", subtitle: "26 Aug", icon: "house.fill", detail: "Fly home via Denpasar.", accent: theme.coral)
            ],
            quickActions: [
                PlannerV2Action(title: "Add booking", icon: "plus.circle.fill", accent: theme.tint),
                PlannerV2Action(title: "Edit budget", icon: "wallet.bifold.fill", accent: theme.moss),
                PlannerV2Action(title: "Packing list", icon: "bag.fill", accent: theme.sun),
                PlannerV2Action(title: "Documents", icon: "doc.text.fill", accent: theme.ocean),
                PlannerV2Action(title: "Island guide", icon: "map.fill", accent: theme.sky),
                PlannerV2Action(title: "Weather", icon: "cloud.sun.fill", accent: theme.coral)
            ],
            shortcuts: ["Timeline", "Documents", "Budget", "Packing", "Islands", "Weather"],
            notesPlaceholder: "“Confirm Komodo liveaboard balance; ask villa about early check-in.”",
            recentActivity: [
                PlannerV2Row(title: "Booked Gili fast boat", subtitle: "Today", icon: "ferry.fill", detail: "Lembongan → Gili Air confirmed.", accent: theme.ocean),
                PlannerV2Row(title: "Updated budget", subtitle: "Yesterday", icon: "wallet.bifold.fill", detail: "Raised the daily allowance to £62.", accent: theme.moss),
                PlannerV2Row(title: "Saved insurance offline", subtitle: "2 days ago", icon: "arrow.down.circle.fill", detail: "Policy PDF added to the document wallet.", accent: theme.tint)
            ],
            recommendations: [
                PlannerV2Row(title: "Book the Komodo liveaboard", subtitle: "Soon", icon: "sailboat.fill", detail: "August cabins sell out — confirm in the next few days.", accent: theme.coral),
                PlannerV2Row(title: "Buy an eSIM before you fly", subtitle: "Connectivity", icon: "simcard.fill", detail: "Install now so you’re online the moment you land.", accent: theme.tint),
                PlannerV2Row(title: "Confirm dive insurance", subtitle: "Health", icon: "lifepreserver.fill", detail: "Make sure your policy or DAN covers your planned depths.", accent: theme.ocean)
            ],
            disclaimer: "This planner aggregates illustrative sample data for a single trip. It is a presentation overview only — confirm every booking, requirement and figure with the relevant provider before you travel."
        )
    }
}

struct TravelTripPlannerDashboardV2_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelTripPlannerDashboardV2(plan: .sampleIndonesia)
                .previewDisplayName("Trip planner V2 · Indonesia")

            TravelTripPlannerDashboardV2(plan: .sampleIndonesia)
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Trip planner V2 · Dynamic Type XL")
        }
    }
}
#endif
