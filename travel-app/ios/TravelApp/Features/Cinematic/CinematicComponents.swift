import SwiftUI

struct CinematicHeroPreview {
    let title: String
    let subtitle: String
    let scenes: String
    let destinations: String
    let duration: String
}

struct FilmReelPreview: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let sceneCount: String
    let symbol: String
    let gradient: [Color]
}

struct MemoryScenePreview: Identifiable {
    let id: String
    let title: String
    let place: String
    let caption: String
    let symbol: String
    let accent: Color
}

struct DestinationMoodPreview: Identifiable {
    let id: String
    let destination: String
    let mood: String
    let caption: String
    let symbol: String
    let gradient: [Color]
}

struct CinematicMomentPreview: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let marker: String
    let symbol: String
}

struct CinematicStatisticPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
}

struct CinematicHeroCard: View {
    let preview: CinematicHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "Cinematic travel",
            symbol: "film.stack.fill",
            title: preview.title,
            subtitle: preview.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.ocean.opacity(0.92),
                TravelTheme.current.coral.opacity(0.72)
            ],
            minHeight: 330,
            metrics: [
                HeroMetric(value: preview.scenes, label: "Scenes"),
                HeroMetric(value: preview.destinations, label: "Places"),
                HeroMetric(value: preview.duration, label: "Reel")
            ]
        ) {
            FilmStripTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.58)
        }
    }
}

struct FilmReelCard: View {
    let reel: FilmReelPreview

    var body: some View {
        PremiumMediaCard(
            gradient: reel.gradient,
            symbol: reel.symbol,
            caption: reel.sceneCount,
            title: reel.title,
            subtitle: reel.subtitle
        )
    }
}

struct MemorySceneCard: View {
    let scene: MemoryScenePreview

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                Image(systemName: scene.symbol)
                    .font(.title3)
                    .foregroundStyle(scene.accent)
                    .frame(width: 46, height: 46)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(scene.title)
                        .font(TravelTypography.cardTitle)
                    Label(scene.place, systemImage: "mappin.and.ellipse")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Text(scene.caption)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: TravelSpacing.sm)
            }
        }
    }
}

struct DestinationMoodCard: View {
    let mood: DestinationMoodPreview

    var body: some View {
        PremiumGradientTile(
            gradient: mood.gradient,
            symbol: mood.symbol,
            title: mood.destination,
            metadata: mood.mood,
            detail: mood.caption,
            bannerHeight: 118
        )
    }
}

struct CinematicMomentRow: View {
    let moment: CinematicMomentPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: moment.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.coral)
                .frame(width: 46, height: 46)
                .background(.thinMaterial, in: Circle())
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(moment.title)
                    .font(TravelTypography.cardTitle)
                Text(moment.subtitle)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: TravelSpacing.sm)
            Text(moment.marker)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, TravelSpacing.sm)
                .padding(.vertical, TravelSpacing.xs)
                .background(.thinMaterial, in: Capsule())
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

struct CinematicStatisticCard: View {
    let statistic: CinematicStatisticPreview

    var body: some View {
        PremiumStatCard(
            symbol: statistic.symbol,
            value: statistic.value,
            label: statistic.label,
            caption: statistic.caption,
            accent: TravelTheme.current.tint
        )
    }
}

struct CinematicEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "film.stack.fill",
            title: "Your travel reel is ready",
            message: "Completed trips and memory scenes can become a cinematic travel reel here.",
            pill: "Ready for scenes"
        )
    }
}

private struct FilmStripTexture: View {
    var body: some View {
        HStack(spacing: TravelSpacing.xs) {
            ForEach(0..<5, id: \.self) { index in
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .fill(.white.opacity(index == 2 ? 0.24 : 0.14))
                    .frame(width: 34, height: 86 + CGFloat(index % 2) * 26)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
