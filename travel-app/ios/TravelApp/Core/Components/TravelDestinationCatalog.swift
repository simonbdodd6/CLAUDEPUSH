import SwiftUI

// MARK: - Travel destination catalog (Phase 102)
//
// The reusable destination picker that sits in front of `TravelDestinationShell`:
// a premium, data-driven catalogue of destinations grouped by country, each shown
// as a card with a gradient image placeholder, best months, an indicative price and
// a UI-only favourite/quick-save star.
//
// It reuses the existing design system exclusively — `PremiumScrollView`,
// `PremiumHeroHeader`, `PremiumSection`, `PremiumAdaptiveGrid`, `GlassCard` and the
// tokens. `DestinationSummary` is a lightweight presentation model (not a DTO); the
// catalog holds no data, networking, persistence, repository, view-model,
// navigation, AppContainer or DTO logic, and is not wired into any screen. The
// search/filter bar and favourite stars are UI-only (the stars hold presentation
// `@State`).
//
// Accessibility: cards expose combined VoiceOver labels with the favourite button
// kept independently focusable; text uses the Dynamic Type-scaling `TravelTypography`
// styles and wraps rather than truncating; and all motion is disabled under Reduce
// Motion.

/// A lightweight, presentation-only destination summary for the catalog.
struct DestinationSummary: Identifiable {
    let id: String
    var name: String
    var country: String
    var region: String
    var tagline: String
    var symbol: String
    var gradient: [Color]
    var bestMonths: String
    var fromPrice: String

    init(
        id: String? = nil,
        name: String,
        country: String,
        region: String,
        tagline: String,
        symbol: String,
        gradient: [Color],
        bestMonths: String,
        fromPrice: String
    ) {
        self.id = id ?? "\(country)-\(name)"
        self.name = name
        self.country = country
        self.region = region
        self.tagline = tagline
        self.symbol = symbol
        self.gradient = gradient
        self.bestMonths = bestMonths
        self.fromPrice = fromPrice
    }

    var countryRegion: String { "\(country) · \(region)" }
}

/// A premium, presentation-only destination catalogue / picker.
struct TravelDestinationCatalog: View {
    var destinations: [DestinationSummary]
    var title: String? = "Where to next?"
    var subtitle: String? = "Choose a destination to open its full travel guide."

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false
    @State private var favourites: Set<String> = []

    private let theme = TravelTheme.current
    private let filters = ["All", "Indonesia", "Beaches", "Diving", "Mountains"]

    /// Destinations grouped by country, preserving first-seen order.
    private var groupedByCountry: [(country: String, items: [DestinationSummary])] {
        var order: [String] = []
        var map: [String: [DestinationSummary]] = [:]
        for destination in destinations {
            if map[destination.country] == nil { order.append(destination.country) }
            map[destination.country, default: []].append(destination)
        }
        return order.map { (country: $0, items: map[$0] ?? []) }
    }

    var body: some View {
        Group {
            if destinations.isEmpty {
                emptyState
            } else {
                content
            }
        }
    }

    private var content: some View {
        PremiumScrollView {
            PremiumHeroHeader(
                eyebrow: "Travel Intelligence",
                symbol: "globe.asia.australia.fill",
                title: title ?? "Destinations",
                subtitle: subtitle
            )
            .modifier(CatalogAppear(appeared: appeared, reduceMotion: reduceMotion, index: 0))

            searchBar
                .modifier(CatalogAppear(appeared: appeared, reduceMotion: reduceMotion, index: 1))

            ForEach(Array(groupedByCountry.enumerated()), id: \.element.country) { index, group in
                PremiumSection(title: group.country, subtitle: "\(group.items.count) destination\(group.items.count == 1 ? "" : "s")") {
                    PremiumAdaptiveGrid(minimumWidth: 240) {
                        ForEach(group.items) { destination in
                            destinationCard(destination)
                        }
                    }
                }
                .modifier(CatalogAppear(appeared: appeared, reduceMotion: reduceMotion, index: index + 2))
            }
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(TravelMotion.gentle) { appeared = true }
            }
        }
    }

    // MARK: Search (UI-only placeholder)

    private var searchBar: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.sm) {
            GlassCard {
                HStack(spacing: TravelSpacing.sm) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                    Text("Search destinations")
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Image(systemName: "line.3.horizontal.decrease.circle")
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Search destinations. Placeholder, not yet active.")

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

    // MARK: Destination card

    private func destinationCard(_ destination: DestinationSummary) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                ZStack(alignment: .topTrailing) {
                    RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                        .fill(LinearGradient(colors: destination.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                        .overlay(alignment: .topLeading) {
                            Image(systemName: destination.symbol)
                                .font(.system(size: 26, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.9))
                                .padding(TravelSpacing.md)
                        }
                        .overlay(alignment: .bottomLeading) {
                            Text(destination.countryRegion.uppercased())
                                .font(TravelTypography.eyebrow)
                                .foregroundStyle(.white.opacity(0.9))
                                .padding(TravelSpacing.md)
                        }
                        .frame(height: 108)

                    favouriteButton(destination)
                        .padding(TravelSpacing.sm)
                }

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(destination.name)
                        .font(TravelTypography.cardTitle)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(destination.tagline)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(destination.name), \(destination.countryRegion). \(destination.tagline)")

                HStack(spacing: TravelSpacing.xs) {
                    factPill(icon: "calendar", text: destination.bestMonths, tint: theme.sun)
                    factPill(icon: "banknote.fill", text: destination.fromPrice, tint: theme.moss)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    private func favouriteButton(_ destination: DestinationSummary) -> some View {
        let isSaved = favourites.contains(destination.id)
        return Button {
            withAnimation(reduceMotion ? nil : TravelMotion.gentle) {
                if isSaved { favourites.remove(destination.id) } else { favourites.insert(destination.id) }
            }
        } label: {
            Image(systemName: isSaved ? "star.fill" : "star")
                .font(TravelTypography.cardTitle)
                .foregroundStyle(isSaved ? theme.sun : .white)
                .padding(TravelSpacing.xs)
                .background(.ultraThinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isSaved ? "Saved to favourites: \(destination.name)" : "Save \(destination.name) to favourites")
    }

    private func factPill(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: TravelSpacing.xxs) {
            Image(systemName: icon)
            Text(text)
        }
        .font(TravelTypography.eyebrow)
        .foregroundStyle(tint)
        .padding(.horizontal, TravelSpacing.sm)
        .padding(.vertical, TravelSpacing.xxs)
        .background(tint.opacity(0.15), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    private var emptyState: some View {
        PremiumScrollView {
            GlassCard {
                HStack(spacing: TravelSpacing.md) {
                    Image(systemName: "globe")
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(.secondary)
                    Text("No destinations to show yet.")
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

// MARK: - Catalog appearance

/// Subtle staggered fade-and-rise, disabled under Reduce Motion.
private struct CatalogAppear: ViewModifier {
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
extension Array where Element == DestinationSummary {
    /// A deterministic sample catalogue spanning Indonesia, Japan and New Zealand.
    static var sampleDestinations: [DestinationSummary] {
        let theme = TravelTheme.current
        return [
            DestinationSummary(name: "Bali", country: "Indonesia", region: "Bali", tagline: "Temples, surf and rice terraces — the all-rounder.", symbol: "leaf.fill", gradient: [theme.ocean, theme.moss, theme.sun.opacity(0.6)], bestMonths: "Apr–Oct", fromPrice: "from Rp 500k/day"),
            DestinationSummary(name: "Lombok", country: "Indonesia", region: "Lombok", tagline: "Rinjani’s slopes, empty beaches and a slower pace.", symbol: "mountain.2.fill", gradient: [theme.moss, theme.ocean], bestMonths: "May–Sep", fromPrice: "from Rp 400k/day"),
            DestinationSummary(name: "Gili Air", country: "Indonesia", region: "Lombok", tagline: "Car-free island calm with turtle reefs.", symbol: "beach.umbrella.fill", gradient: [theme.ocean, theme.sky, theme.sun.opacity(0.6)], bestMonths: "Apr–Oct", fromPrice: "from Rp 350k/day"),
            DestinationSummary(name: "Nusa Penida", country: "Indonesia", region: "Bali", tagline: "Dramatic cliffs and manta-filled bays.", symbol: "water.waves", gradient: [theme.ocean, theme.sky], bestMonths: "Apr–Oct", fromPrice: "from Rp 450k/day"),
            DestinationSummary(name: "Komodo", country: "Indonesia", region: "Flores", tagline: "Dragons, pink beaches and world-class diving.", symbol: "lizard.fill", gradient: [theme.coral, theme.sun, theme.ocean], bestMonths: "Apr–Nov", fromPrice: "from Rp 900k/day"),
            DestinationSummary(name: "Raja Ampat", country: "Indonesia", region: "West Papua", tagline: "The planet’s richest reefs — remote and pristine.", symbol: "fish.fill", gradient: [theme.ocean, theme.tint, theme.sky], bestMonths: "Oct–Apr", fromPrice: "from Rp 2m/day"),
            DestinationSummary(name: "Japan", country: "Japan", region: "Honshu", tagline: "Neon cities, ancient temples and powder snow.", symbol: "building.2.fill", gradient: [theme.tint, theme.sky, theme.coral], bestMonths: "Mar–May & Oct–Nov", fromPrice: "from ¥12,000/day"),
            DestinationSummary(name: "New Zealand", country: "New Zealand", region: "South Island", tagline: "Fjords, alps and endless road trips.", symbol: "mountain.2.fill", gradient: [theme.moss, theme.ocean, theme.sky], bestMonths: "Dec–Mar", fromPrice: "from NZ$120/day")
        ]
    }
}

struct TravelDestinationCatalog_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            TravelDestinationCatalog(destinations: .sampleDestinations)
                .previewDisplayName("Destination catalog")

            TravelDestinationCatalog(destinations: Array(Array<DestinationSummary>.sampleDestinations.prefix(3)))
                .environment(\.sizeCategory, .accessibilityLarge)
                .previewDisplayName("Destination catalog · Dynamic Type XL")

            TravelDestinationCatalog(destinations: [])
                .previewDisplayName("Destination catalog · Empty")
        }
    }
}
#endif
