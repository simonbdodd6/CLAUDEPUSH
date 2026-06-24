import SwiftUI

// MARK: - Presentation models

struct SettingsHeroPreview {
    let title: String
    let subtitle: String
    let memberSince: String
    let countries: String
    let memories: String
}

struct TravellerProfilePreview {
    let name: String
    let homeCity: String
    let memberSince: String
    let initials: String
    let passportProgress: Double
}

struct PreferenceCategoryPreview: Identifiable {
    let id: String
    let title: String
    let detail: String
    let status: String
    let symbol: String
    let accent: Color
}

struct AppInformationPreview: Identifiable {
    let id: String
    let title: String
    let detail: String
    let value: String
    let symbol: String
}

struct TravelArchivePreview {
    let journeys: Int
    let memories: Int
    let collections: Int
    let stampedCountries: Int
    let completion: Double
}

struct SettingsStatisticPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
    let accent: Color
}

// MARK: - Hero

struct SettingsHeroCard: View {
    let preview: SettingsHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "Travel settings",
            symbol: "gearshape.fill",
            title: preview.title,
            subtitle: preview.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.moss.opacity(0.92),
                TravelTheme.current.sky.opacity(0.68)
            ],
            metrics: [
                HeroMetric(value: preview.memberSince, label: "Member since"),
                HeroMetric(value: preview.countries, label: "Countries"),
                HeroMetric(value: preview.memories, label: "Memories")
            ]
        ) {
            SettingsDialTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.48)
        }
    }
}

// MARK: - Traveller profile

struct TravellerProfileCard: View {
    let preview: TravellerProfilePreview

    var body: some View {
        GlassCard(prominence: .hero) {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack(spacing: TravelSpacing.md) {
                    Text(preview.initials)
                        .font(TravelTypography.section)
                        .foregroundStyle(.white)
                        .frame(width: 64, height: 64)
                        .background(
                            LinearGradient(
                                colors: [TravelTheme.current.ocean, TravelTheme.current.tint],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            in: Circle()
                        )

                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text(preview.name)
                            .font(TravelTypography.section)
                        Label(preview.homeCity, systemImage: "house.fill")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                        Text("Traveller since \(preview.memberSince)")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                    HStack {
                        Text("Passport progress")
                            .font(TravelTypography.cardTitle)
                        Spacer()
                        Text(preview.passportProgress.formatted(.percent.precision(.fractionLength(0))))
                            .font(TravelTypography.caption)
                            .foregroundStyle(TravelTheme.current.tint)
                    }
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.secondary.opacity(0.14))
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [TravelTheme.current.tint, TravelTheme.current.sky],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: proxy.size.width * max(0, min(preview.passportProgress, 1)))
                        }
                    }
                    .frame(height: 8)
                }
            }
        }
    }
}

// MARK: - Preferences

struct PreferenceCategoryCard: View {
    let preview: PreferenceCategoryPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: preview.symbol)
                        .font(.title3)
                        .foregroundStyle(preview.accent)
                    Spacer()
                    Text(preview.status)
                        .font(TravelTypography.caption)
                        .foregroundStyle(preview.accent)
                        .padding(.horizontal, TravelSpacing.sm)
                        .padding(.vertical, TravelSpacing.xxs)
                        .background(preview.accent.opacity(0.10), in: Capsule())
                }
                Text(preview.title)
                    .font(TravelTypography.cardTitle)
                Text(preview.detail)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Archive

struct TravelArchiveCard: View {
    let preview: TravelArchivePreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                HStack {
                    VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                        Text("Personal travel archive")
                            .font(TravelTypography.cardTitle)
                        Text("Static DTO-backed summary")
                            .font(TravelTypography.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "archivebox.fill")
                        .font(.title2)
                        .foregroundStyle(TravelTheme.current.ocean)
                }

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: TravelSpacing.sm)], spacing: TravelSpacing.sm) {
                    ArchiveMetric(value: "\(preview.journeys)", label: "Journeys")
                    ArchiveMetric(value: "\(preview.memories)", label: "Memories")
                    ArchiveMetric(value: "\(preview.collections)", label: "Collections")
                    ArchiveMetric(value: "\(preview.stampedCountries)", label: "Stamps")
                }

                HStack {
                    Label("Passport", systemImage: "person.text.rectangle.fill")
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(preview.completion.formatted(.percent.precision(.fractionLength(0))))
                        .font(TravelTypography.cardTitle)
                        .foregroundStyle(TravelTheme.current.tint)
                }
            }
        }
    }
}

private struct ArchiveMetric: View {
    let value: String
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
            Text(value)
                .font(TravelTypography.section)
            Text(label)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(TravelSpacing.sm)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
    }
}

// MARK: - App information

struct AppInformationCard: View {
    let preview: AppInformationPreview

    var body: some View {
        GlassCard {
            HStack(alignment: .center, spacing: TravelSpacing.md) {
                Image(systemName: preview.symbol)
                    .font(.headline)
                    .foregroundStyle(TravelTheme.current.tint)
                    .frame(width: 44, height: 44)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(preview.title)
                        .font(TravelTypography.cardTitle)
                    Text(preview.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: TravelSpacing.sm)
                Text(preview.value)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

// MARK: - Statistics

struct SettingsStatisticCard: View {
    let preview: SettingsStatisticPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                Image(systemName: preview.symbol)
                    .font(.title3)
                    .foregroundStyle(preview.accent)
                Text(preview.value)
                    .font(TravelTypography.title)
                Text(preview.label)
                    .font(TravelTypography.cardTitle)
                Text(preview.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

// MARK: - Empty state

struct SettingsEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "person.crop.circle.badge.questionmark",
            title: "Traveller profile unavailable",
            message: "Profile, archive and preference summaries will appear when traveller display data is available.",
            pill: "Ready for a profile"
        )
    }
}

// MARK: - Decorative texture

private struct SettingsDialTexture: View {
    var body: some View {
        ZStack {
            ForEach([128.0, 88.0, 48.0], id: \.self) { size in
                Circle()
                    .stroke(.white.opacity(0.12), lineWidth: 2)
                    .frame(width: size, height: size)
            }
            Image(systemName: "gearshape.fill")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.white.opacity(0.24))
            Circle()
                .fill(.white.opacity(0.28))
                .frame(width: 12, height: 12)
                .offset(x: 52, y: 22)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
