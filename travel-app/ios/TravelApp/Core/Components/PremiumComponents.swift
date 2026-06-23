import SwiftUI

struct PremiumScrollView<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                content
            }
            .padding(.horizontal, TravelSpacing.lg)
            .padding(.top, TravelSpacing.md)
            .padding(.bottom, TravelSpacing.xxl)
        }
        .background(TravelTheme.current.background)
        .scrollIndicators(.hidden)
    }
}

struct GlassCard<Content: View>: View {
    var prominence: Prominence = .standard
    @ViewBuilder var content: Content

    enum Prominence { case standard, hero }

    var body: some View {
        content
            .padding(prominence == .hero ? TravelSpacing.lg : TravelSpacing.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: prominence == .hero ? TravelRadius.hero : TravelRadius.md, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: prominence == .hero ? TravelRadius.hero : TravelRadius.md, style: .continuous)
                    .stroke(.white.opacity(0.35), lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.08), radius: 18, x: 0, y: 12)
    }
}

struct ScreenHero: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    let symbol: String
    let endpoint: String?

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack {
                    Label(eyebrow, systemImage: symbol)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Spacer()
                    if let endpoint {
                        Text(endpoint)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xs)
                            .background(.thinMaterial, in: Capsule())
                    }
                }

                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    Text(title)
                        .font(TravelTypography.display)
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(TravelTypography.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                MapTexturePlaceholder()
                    .frame(height: 148)
            }
        }
    }
}

struct PremiumSection<Content: View>: View {
    let title: String
    let subtitle: String
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.md) {
            VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                Text(title).font(TravelTypography.section)
                Text(subtitle).font(TravelTypography.caption).foregroundStyle(.secondary)
            }
            content
        }
    }
}

struct PlaceholderCard: View {
    let title: String
    let subtitle: String
    let symbol: String

    var body: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: symbol)
                    .font(.title2)
                    .foregroundStyle(TravelTheme.current.tint)
                    .frame(width: 42, height: 42)
                    .background(.thinMaterial, in: Circle())
                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    Text(title).font(TravelTypography.cardTitle)
                    Text(subtitle).font(TravelTypography.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct MapTexturePlaceholder: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [TravelTheme.current.ocean.opacity(0.90), TravelTheme.current.sky.opacity(0.65), TravelTheme.current.sun.opacity(0.40)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
            HStack(spacing: TravelSpacing.sm) {
                ForEach(0..<5, id: \.self) { index in
                    Capsule()
                        .fill(.white.opacity(0.22))
                        .frame(width: 34 + CGFloat(index * 8), height: 8)
                        .rotationEffect(.degrees(Double(index * 9 - 18)))
                }
            }
            Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.white.opacity(0.85))
        }
        .accessibilityLabel("Decorative route texture")
    }
}

// MARK: - Shared feature primitives (Phase 10 design-system pass)

/// A single white-on-glass metric tile used inside feature hero cards.
/// Previously duplicated per feature as `InsightsHeroMetric`, `HighlightsHeroMetric`,
/// `CinematicHeroMetric`, `StoryHeroMetric` and `TimelineMetricPill`.
struct HeroMetricTile: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(value)
                .font(TravelTypography.cardTitle)
                .foregroundStyle(.white)
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.white.opacity(0.68))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.white.opacity(0.13), in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

/// A single value/label pair shown in a feature hero's metric row.
struct HeroMetric: Identifiable {
    let value: String
    let label: String

    var id: String { label }
}

/// Standard cinematic hero scaffold shared by every feature hero card:
/// a hero `GlassCard` with a gradient base, a feature-specific decorative
/// texture, an uppercase eyebrow, display title, subtitle and a metric row.
/// Each feature supplies its gradient, eyebrow, copy, metrics and texture,
/// keeping its identity while removing the duplicated scaffold.
struct FeatureHeroScaffold<Texture: View>: View {
    let eyebrow: String
    let symbol: String
    let title: String
    let subtitle: String
    let gradient: [Color]
    var minHeight: CGFloat = 318
    let metrics: [HeroMetric]
    @ViewBuilder var texture: Texture

    var body: some View {
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: gradient,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                texture

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label(eyebrow, systemImage: symbol)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.76))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(title)
                            .font(TravelTypography.display)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: TravelSpacing.sm) {
                        ForEach(metrics) { metric in
                            HeroMetricTile(value: metric.value, label: metric.label)
                        }
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: minHeight)
        }
    }
}

/// Standard feature empty state shared by every feature surface:
/// a hero `GlassCard` with a circular icon, title, centred message and a pill.
/// Previously duplicated as `PassportEmptyState`, `TimelineEmptyState`,
/// `StoryEmptyState`, `CinematicEmptyState`, `InsightsEmptyState` and
/// `HighlightsEmptyState`, which now delegate here.
struct FeatureEmptyState: View {
    let symbol: String
    var accent: Color = TravelTheme.current.tint
    let title: String
    let message: String
    let pill: String

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: symbol)
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text(title)
                    .font(TravelTypography.section)
                Text(message)
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text(pill)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, TravelSpacing.sm)
                    .padding(.vertical, TravelSpacing.xs)
                    .background(.thinMaterial, in: Capsule())
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, TravelSpacing.md)
        }
    }
}

