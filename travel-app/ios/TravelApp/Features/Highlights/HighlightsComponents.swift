import SwiftUI

struct HighlightsHeroPreview {
    let title: String
    let subtitle: String
    let moments: String
    let achievements: String
    let countries: String
}

struct HighlightMomentPreview: Identifiable {
    let id: String
    let title: String
    let place: String
    let detail: String
    let symbol: String
    let gradient: [Color]
}

struct AchievementHighlightPreview: Identifiable {
    let id: String
    let title: String
    let value: String
    let caption: String
    let symbol: String
    let accent: Color
}

struct CountryHighlightPreview: Identifiable {
    let id: String
    let country: String
    let flag: String
    let detail: String
    let visits: String
    let accent: Color
}

struct TravelMemoryPreview: Identifiable {
    let id: String
    let title: String
    let detail: String
    let reasonCode: String
    let symbol: String
}

struct HighlightsHeroCard: View {
    let highlight: HighlightsHeroPreview

    var body: some View {
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                TravelTheme.current.ink,
                                TravelTheme.current.coral.opacity(0.82),
                                TravelTheme.current.sun.opacity(0.74)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                HighlightSparkTexture()
                    .padding(TravelSpacing.lg)
                    .opacity(0.52)

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label("Traveller highlights", systemImage: "star.fill")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.76))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(highlight.title)
                            .font(TravelTypography.display)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(highlight.subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: TravelSpacing.sm) {
                        HighlightsHeroMetric(value: highlight.moments, label: "Moments")
                        HighlightsHeroMetric(value: highlight.achievements, label: "Achievements")
                        HighlightsHeroMetric(value: highlight.countries, label: "Countries")
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: 318)
        }
    }
}

struct HighlightMomentCard: View {
    let moment: HighlightMomentPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: moment.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: moment.symbol)
                            .font(.title2)
                            .foregroundStyle(.white.opacity(0.86))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: 132)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(moment.title)
                        .font(TravelTypography.cardTitle)
                    Text(moment.place)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(moment.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

struct AchievementHighlightCard: View {
    let achievement: AchievementHighlightPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: achievement.symbol)
                    .font(.title2)
                    .foregroundStyle(achievement.accent)
                    .frame(width: 46, height: 46)
                    .background(.thinMaterial, in: Circle())
                Text(achievement.value)
                    .font(TravelTypography.title)
                Text(achievement.title)
                    .font(TravelTypography.cardTitle)
                Text(achievement.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct CountryHighlightCard: View {
    let country: CountryHighlightPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Text(country.flag)
                .font(.system(size: 30))
                .frame(width: 46, height: 46)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(country.country)
                    .font(TravelTypography.cardTitle)
                Text(country.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: TravelSpacing.sm)
            Text(country.visits)
                .font(TravelTypography.caption)
                .foregroundStyle(country.accent)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xs)
                .background(.thinMaterial, in: Capsule())
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

struct TravelMemoryCard: View {
    let memory: TravelMemoryPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: memory.symbol)
                        .font(.title3)
                        .foregroundStyle(TravelTheme.current.tint)
                    Spacer()
                    Text(memory.reasonCode)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }
                Text(memory.title)
                    .font(TravelTypography.cardTitle)
                Text(memory.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct HighlightsEmptyState: View {
    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: "star.fill")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(TravelTheme.current.sun)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text("Your highlights are waiting")
                    .font(TravelTypography.section)
                Text("Completed journeys can surface best moments, achievements and memorable events here.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ready for best moments")
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

private struct HighlightsHeroMetric: View {
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

private struct HighlightSparkTexture: View {
    var body: some View {
        HStack(alignment: .top, spacing: TravelSpacing.sm) {
            ForEach(0..<5, id: \.self) { index in
                Image(systemName: index % 2 == 0 ? "star.fill" : "sparkle")
                    .font(.system(size: 14 + CGFloat((index * 6) % 18)))
                    .foregroundStyle(.white.opacity(index == 2 ? 0.30 : 0.16))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
