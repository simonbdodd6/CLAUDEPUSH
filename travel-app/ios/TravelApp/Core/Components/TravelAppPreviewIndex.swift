import SwiftUI

#if DEBUG

// MARK: - Travel App preview index (Phase 100)
//
// A simple, DEBUG-only premium index that catalogues the major Travel Intelligence
// preview experiences in one place, so they are easy to find and test. The whole
// file lives inside `#if DEBUG`, so it does not exist in release builds, is not
// wired into navigation, and modifies no production screen.
//
// It is composition glue only — it reuses the existing design system
// (`PremiumScrollView`, `PremiumHeroHeader`, `PremiumSection`, `GlassCard`,
// `PremiumPillRow`, `PremiumAdaptiveGrid` and the design tokens). The
// `PreviewProvider` at the bottom also exposes the three zero-argument composed
// experiences as named canvas entries, so they can be flipped through from this
// one file. The search/filter bar is a UI-only placeholder; nothing performs real
// navigation, data, networking, persistence, view-model or DTO work.
//
// Accessibility: entries expose combined VoiceOver labels; text uses the Dynamic
// Type-scaling `TravelTypography` styles and wraps rather than truncating; and all
// motion is disabled under Reduce Motion.

/// The readiness of a preview entry — drives its status badge.
private enum PreviewStatus {
    case featured
    case ready

    var label: String {
        switch self {
        case .featured: "Featured"
        case .ready: "Ready"
        }
    }

    var accent: Color {
        switch self {
        case .featured: TravelTheme.current.coral
        case .ready: TravelTheme.current.moss
        }
    }
}

/// One catalogued preview experience.
private struct PreviewEntry: Identifiable {
    let id: String
    let title: String
    let blurb: String
    let icon: String
    let accent: Color
    let status: PreviewStatus
}

struct TravelAppPreviewIndex: View {

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    private let theme = TravelTheme.current
    private let filters = ["All", "Composed", "Guides", "Featured", "Safety"]

    private var composedExperiences: [PreviewEntry] {
        [
            PreviewEntry(id: "hub", title: "Travel Essentials Hub", blurb: "All twelve guides in one cohesive hub.", icon: "square.grid.2x2.fill", accent: theme.tint, status: .featured),
            PreviewEntry(id: "destination-guide", title: "Destination Guide Preview", blurb: "A full single-destination page (Gili Air).", icon: "map.fill", accent: theme.ocean, status: .featured),
            PreviewEntry(id: "overview-dashboard", title: "Destination Overview Dashboard", blurb: "The first screen after picking a destination.", icon: "rectangle.3.group.fill", accent: theme.coral, status: .featured)
        ]
    }

    private var practicalGuides: [PreviewEntry] {
        [
            PreviewEntry(id: "transport", title: "Transport Guide", blurb: "Getting around safely and efficiently.", icon: "car.fill", accent: theme.tint, status: .ready),
            PreviewEntry(id: "booking", title: "Booking Guide", blurb: "Where and how to book it right.", icon: "checkmark.seal.fill", accent: theme.sky, status: .ready),
            PreviewEntry(id: "ferry", title: "Ferry Guide", blurb: "Island-hopping with confidence.", icon: "ferry.fill", accent: theme.ocean, status: .ready),
            PreviewEntry(id: "scam", title: "Scam & Safety Guide", blurb: "Spot and avoid common scams.", icon: "exclamationmark.shield.fill", accent: theme.coral, status: .ready),
            PreviewEntry(id: "emergency", title: "Emergency Guide", blurb: "Who to call and what to do.", icon: "cross.case.fill", accent: theme.coral, status: .ready),
            PreviewEntry(id: "connectivity", title: "Connectivity Guide", blurb: "Stay online anywhere.", icon: "wifi", accent: theme.sky, status: .ready),
            PreviewEntry(id: "food", title: "Food Safety Guide", blurb: "Eat well and safely.", icon: "fork.knife", accent: theme.sun, status: .ready),
            PreviewEntry(id: "health", title: "Health Guide", blurb: "Stay healthy on the road.", icon: "heart.fill", accent: theme.moss, status: .ready),
            PreviewEntry(id: "packing", title: "Packing Guide", blurb: "Pack light and right.", icon: "suitcase.fill", accent: theme.tint, status: .ready),
            PreviewEntry(id: "budget", title: "Budget Planner Guide", blurb: "Plan your daily spend.", icon: "banknote.fill", accent: theme.moss, status: .ready),
            PreviewEntry(id: "weather", title: "Weather & Seasons Guide", blurb: "The best time to visit.", icon: "cloud.sun.fill", accent: theme.sun, status: .ready),
            PreviewEntry(id: "etiquette", title: "Culture & Etiquette Guide", blurb: "Be a respectful guest.", icon: "hands.sparkles.fill", accent: theme.ocean, status: .ready)
        ]
    }

    private var totalCount: Int { composedExperiences.count + practicalGuides.count }

    var body: some View {
        PremiumScrollView {
            PremiumHeroHeader(
                eyebrow: "Travel Intelligence · Phase 100 milestone",
                symbol: "square.grid.3x3.fill",
                title: "Preview Index",
                subtitle: "Every major Travel Intelligence preview experience, catalogued in one place for quick testing."
            )
            .modifier(IndexAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            debugNotice
                .modifier(IndexAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            searchBar
                .modifier(IndexAppear(appeared: appeared, reduceMotion: reduceMotion, index: 2))

            section("Composed experiences", "Full screens assembled from the guides.", 3) {
                PremiumAdaptiveGrid(minimumWidth: 240) {
                    ForEach(composedExperiences) { entry in
                        entryCard(entry)
                    }
                }
            }

            section("Practical guides", "The twelve standalone guide components.", 4) {
                VStack(spacing: TravelSpacing.sm) {
                    ForEach(practicalGuides) { entry in
                        PremiumPillRow(
                            symbol: entry.icon,
                            accent: entry.accent,
                            title: entry.title,
                            subtitle: entry.blurb,
                            trailing: entry.status.label
                        )
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(entry.title), \(entry.status.label). \(entry.blurb)")
                    }
                }
            }

            footer
                .modifier(IndexAppear(appeared: appeared, reduceMotion: reduceMotion, index: 5))
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
        .modifier(IndexAppear(appeared: appeared, reduceMotion: reduceMotion, index: index))
    }

    // MARK: Pieces

    private var debugNotice: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "hammer.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.sun)
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Debug only")
                        .font(TravelTypography.eyebrow)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text("These previews are excluded from release builds and aren’t wired into navigation.")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Debug only. These previews are excluded from release builds and aren’t wired into navigation.")
    }

    private var searchBar: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            GlassCard {
                HStack(spacing: TravelSpacing.sm) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    Text("Search previews")
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Search previews. Placeholder, not yet active.")

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

    private func entryCard(_ entry: PreviewEntry) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                HStack(alignment: .top, spacing: TravelSpacing.md) {
                    medallion(entry.icon, entry.accent)
                    Spacer(minLength: 0)
                    statusBadge(entry.status)
                }
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(entry.title)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(entry.blurb)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(entry.title), \(entry.status.label). \(entry.blurb)")
    }

    private func statusBadge(_ status: PreviewStatus) -> some View {
        Text(status.label)
            .textCase(.uppercase)
            .font(TravelTypography.eyebrow)
            .foregroundStyle(status.accent)
            .padding(.horizontal, TravelSpacing.sm)
            .padding(.vertical, TravelSpacing.xxs)
            .background(status.accent.opacity(0.15), in: Capsule())
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

    private var footer: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: "checkmark.seal.fill")
                    .font(TravelTypography.cardTitle)
                    .foregroundStyle(theme.moss)
                Text("\(totalCount) preview experiences · Phase 100 milestone")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(totalCount) preview experiences. Phase 100 milestone.")
    }
}

// MARK: - Index appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct IndexAppear: ViewModifier {
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

struct TravelAppPreviewIndex_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelAppPreviewIndex()
                .previewDisplayName("Preview Index")

            TravelAppPreviewIndex()
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Preview Index · Dynamic Type XL")

            TravelEssentialsHubPreview()
                .previewDisplayName("→ Travel Essentials Hub")

            DestinationGuidePreview()
                .previewDisplayName("→ Destination Guide")

            DestinationOverviewDashboard()
                .previewDisplayName("→ Destination Overview")
        }
    }
}

#endif
