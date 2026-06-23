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
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                TravelTheme.current.ink,
                                TravelTheme.current.ocean.opacity(0.92),
                                TravelTheme.current.coral.opacity(0.72)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )

                FilmStripTexture()
                    .padding(TravelSpacing.lg)
                    .opacity(0.58)

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label("Cinematic travel", systemImage: "film.stack.fill")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.76))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(preview.title)
                            .font(TravelTypography.display)
                            .foregroundStyle(.white)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(preview.subtitle)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: TravelSpacing.sm) {
                        CinematicHeroMetric(value: preview.scenes, label: "Scenes")
                        CinematicHeroMetric(value: preview.destinations, label: "Places")
                        CinematicHeroMetric(value: preview.duration, label: "Reel")
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: 330)
        }
    }
}

struct FilmReelCard: View {
    let reel: FilmReelPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                ZStack(alignment: .bottomLeading) {
                    RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                        .fill(LinearGradient(colors: reel.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    Image(systemName: reel.symbol)
                        .font(.system(size: 42, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.86))
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                        .padding(TravelSpacing.md)
                    Text(reel.sceneCount)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.white.opacity(0.78))
                        .padding(TravelSpacing.md)
                }
                .frame(height: 148)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(reel.title)
                        .font(TravelTypography.cardTitle)
                    Text(reel.subtitle)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
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
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous)
                    .fill(LinearGradient(colors: mood.gradient, startPoint: .topLeading, endPoint: .bottomTrailing))
                    .overlay(alignment: .topTrailing) {
                        Image(systemName: mood.symbol)
                            .font(.title2)
                            .foregroundStyle(.white.opacity(0.86))
                            .padding(TravelSpacing.md)
                    }
                    .frame(height: 118)

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(mood.destination)
                        .font(TravelTypography.cardTitle)
                    Text(mood.mood)
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(mood.caption)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
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
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: statistic.symbol)
                    .font(.title3)
                    .foregroundStyle(TravelTheme.current.tint)
                Text(statistic.value)
                    .font(TravelTypography.title)
                Text(statistic.label)
                    .font(TravelTypography.cardTitle)
                Text(statistic.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

struct CinematicEmptyState: View {
    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(spacing: TravelSpacing.md) {
                Image(systemName: "film.stack.fill")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(TravelTheme.current.tint)
                    .frame(width: 88, height: 88)
                    .background(.thinMaterial, in: Circle())
                Text("Your travel reel is ready")
                    .font(TravelTypography.section)
                Text("Completed trips and memory scenes can become a cinematic travel reel here.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Ready for scenes")
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

private struct CinematicHeroMetric: View {
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
