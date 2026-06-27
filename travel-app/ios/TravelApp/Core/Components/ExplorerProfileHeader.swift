import SwiftUI

// MARK: - Explorer profile header (Phase 65)
//
// A reusable, presentation-only traveller profile header that composes existing
// components: `PremiumLevelProgress` (level + XP), `PremiumMetricTile` (stats),
// and an optional `PassportStamp` flourish, on a premium `GlassCard`. It shows an
// avatar (with placeholder support), explorer level/title, XP progress, countries
// / cities / achievements and an optional travel streak, in compact or expanded
// layouts. Built from the existing design tokens only, with subtle appearance
// animation. No data, networking, persistence or navigation; not wired into any
// screen.

/// Layout density for an `ExplorerProfileHeader`.
enum ExplorerProfileLayout {
    case compact
    case expanded
}

/// A premium, presentation-only explorer profile header.
struct ExplorerProfileHeader: View {
    var name: String
    var title: String
    var level: Int
    var currentXP: Int
    var requiredXP: Int
    var countriesVisited: Int
    var citiesVisited: Int
    var achievementsUnlocked: Int
    var streakDays: Int? = nil
    /// Optional avatar glyph; falls back to initials, then a person placeholder.
    var avatarSystemImage: String? = nil
    /// Optional latest passport stamp shown as a flourish in the expanded layout.
    var latestStampCountry: String? = nil
    var latestStampDate: String? = nil
    var accent: Color = TravelTheme.current.tint
    var layout: ExplorerProfileLayout = .expanded

    @State private var appeared = false

    var body: some View {
        GlassCard(prominence: layout == .expanded ? .hero : .standard) {
            content
        }
        .scaleEffect(appeared ? 1 : 0.97)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(TravelMotion.gentle) { appeared = true }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch layout {
        case .expanded:
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack(alignment: .center, spacing: TravelSpacing.md) {
                    avatar(font: TravelTypography.display, padding: TravelSpacing.lg)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(name)
                            .font(TravelTypography.title)
                            .lineLimit(1)
                        Text(title)
                            .font(TravelTypography.cardTitle)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if let latestStampCountry {
                        PassportStamp(
                            state: .visited,
                            style: .circular,
                            destination: latestStampCountry,
                            date: latestStampDate,
                            accent: accent
                        )
                    }
                }
                PremiumLevelProgress(
                    level: level,
                    currentXP: currentXP,
                    requiredXP: requiredXP,
                    accent: accent,
                    layout: .compact
                )
                statTiles
            }
        case .compact:
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack(spacing: TravelSpacing.md) {
                    avatar(font: TravelTypography.title, padding: TravelSpacing.md)
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(name)
                            .font(TravelTypography.cardTitle)
                            .lineLimit(1)
                        Text("Level \(level) · \(title)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                PremiumLevelProgress(
                    level: level,
                    currentXP: currentXP,
                    requiredXP: requiredXP,
                    accent: accent,
                    layout: .compact
                )
                statTiles
            }
        }
    }

    // MARK: Pieces

    private var statTiles: some View {
        HStack(spacing: TravelSpacing.sm) {
            PremiumMetricTile(value: "\(countriesVisited)", label: "Countries")
            PremiumMetricTile(value: "\(citiesVisited)", label: "Cities")
            PremiumMetricTile(value: "\(achievementsUnlocked)", label: "Achievements")
            if let streakDays {
                PremiumMetricTile(value: "\(streakDays)", label: "Day streak")
            }
        }
    }

    private func avatar(font: Font, padding: CGFloat) -> some View {
        avatarContent(font: font)
            .foregroundStyle(.white)
            .padding(padding)
            .background(
                LinearGradient(
                    colors: [accent, accent.opacity(0.7)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Circle()
            )
            .overlay(Circle().stroke(.white.opacity(0.5), lineWidth: 2))
            .shadow(color: accent.opacity(0.3), radius: 12, y: 6)
    }

    @ViewBuilder
    private func avatarContent(font: Font) -> some View {
        if let avatarSystemImage {
            Image(systemName: avatarSystemImage).font(font)
        } else if !initials.isEmpty {
            Text(initials).font(font)
        } else {
            Image(systemName: "person.fill").font(font)
        }
    }

    private var initials: String {
        let letters = name.split(separator: " ").prefix(2).compactMap(\.first)
        return String(letters).uppercased()
    }

    private var accessibilityText: String {
        var parts = [
            name,
            title,
            "Level \(level)",
            "\(currentXP) of \(requiredXP) XP",
            "\(countriesVisited) countries",
            "\(citiesVisited) cities",
            "\(achievementsUnlocked) achievements"
        ]
        if let streakDays { parts.append("\(streakDays) day streak") }
        return parts.joined(separator: ", ")
    }
}

#if DEBUG
struct ExplorerProfileHeader_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Expanded")
                    .font(TravelTypography.section)
                ExplorerProfileHeader(
                    name: "Simon Dodd",
                    title: "Seasoned Voyager",
                    level: 7,
                    currentXP: 320,
                    requiredXP: 500,
                    countriesVisited: 24,
                    citiesVisited: 68,
                    achievementsUnlocked: 19,
                    streakDays: 12,
                    latestStampCountry: "Japan",
                    latestStampDate: "2025"
                )

                ExplorerProfileHeader(
                    name: "Ada Lovelace",
                    title: "New Explorer",
                    level: 1,
                    currentXP: 40,
                    requiredXP: 100,
                    countriesVisited: 3,
                    citiesVisited: 5,
                    achievementsUnlocked: 2,
                    avatarSystemImage: "person.crop.circle.fill",
                    accent: TravelTheme.current.moss
                )

                Divider()

                Text("Compact")
                    .font(TravelTypography.section)
                ExplorerProfileHeader(
                    name: "Marco Polo",
                    title: "Globetrotter",
                    level: 24,
                    currentXP: 980,
                    requiredXP: 1000,
                    countriesVisited: 51,
                    citiesVisited: 140,
                    achievementsUnlocked: 47,
                    streakDays: 365,
                    accent: TravelTheme.current.coral,
                    layout: .compact
                )

                ExplorerProfileHeader(
                    name: "Sam",
                    title: "Wanderer",
                    level: 4,
                    currentXP: 0,
                    requiredXP: 250,
                    countriesVisited: 8,
                    citiesVisited: 21,
                    achievementsUnlocked: 6,
                    accent: TravelTheme.current.sun,
                    layout: .compact
                )
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("ExplorerProfileHeader")
    }
}
#endif
