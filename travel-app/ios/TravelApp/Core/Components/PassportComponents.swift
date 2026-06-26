import SwiftUI

// MARK: - Preview Models

/// Static, inert preview model for a single passport statistic tile.
struct PassportStatPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
    let accent: Color
}

/// Static, inert preview model for a single passport stamp.
struct PassportStampPreview: Identifiable {
    let id: String
    let country: String
    let glyph: String
    let dateLabel: String
    let symbol: String
    let gradient: [Color]
    let isStamped: Bool
}

/// Static, inert preview model for a recent passport moment row.
struct PassportMomentPreview: Identifiable {
    let id: String
    let title: String
    let place: String
    let dateLabel: String
    let category: String
    let symbol: String
}

/// Static, inert preview model for the favourite-style summary card.
struct PassportStylePreview {
    let style: String
    let detail: String
    let reasonCode: String
    let symbol: String
}

// MARK: - Cover

/// Cinematic passport cover hero with an embossed completion ring.
struct PassportCoverCard: View {
    let name: String
    let tagline: String
    let completionLabel: String
    let progress: Double

    var body: some View {
        GlassCard(prominence: .hero) {
            ZStack(alignment: .bottomLeading) {
                RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                TravelTheme.current.ink,
                                TravelTheme.current.ocean,
                                TravelTheme.current.tint.opacity(0.78)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: TravelRadius.lg, style: .continuous)
                            .stroke(.white.opacity(0.18), lineWidth: 1)
                    }

                Image(systemName: "globe.europe.africa.fill")
                    .font(.system(size: 120, weight: .regular))
                    .foregroundStyle(.white.opacity(0.10))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(TravelSpacing.md)

                VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                    Label("Traveller passport", systemImage: "person.text.rectangle.fill")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.74))

                    VStack(alignment: .leading, spacing: TravelSpacing.xs) {
                        Text(name)
                            .font(TravelTypography.title)
                            .foregroundStyle(.white)
                        Text(tagline)
                            .font(TravelTypography.body)
                            .foregroundStyle(.white.opacity(0.76))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    PremiumPassportProgressSummary(
                        title: completionLabel,
                        subtitle: "Passport completion"
                    ) {
                        CompletionRing(progress: progress)
                    }
                }
                .padding(TravelSpacing.lg)
            }
            .frame(minHeight: 268)
        }
    }
}

/// Decorative circular progress ring used on the passport cover.
struct CompletionRing: View {
    let progress: Double

    var body: some View {
        PremiumRingProgress(
            progress: progress,
            colors: [TravelTheme.current.sun, TravelTheme.current.coral, TravelTheme.current.sky],
            trackColor: .white.opacity(0.18)
        ) {
            Text("\(percentage)%")
                .font(.system(.subheadline, design: .rounded, weight: .bold))
                .foregroundStyle(.white)
        }
        .accessibilityLabel("Passport completion \(percentage) percent")
    }

    private var percentage: Int {
        Int((min(max(progress, 0), 1) * 100).rounded())
    }
}

// MARK: - Stats

/// Compact statistic tile for the passport overview grid.
struct PassportStatTile: View {
    let stat: PassportStatPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                Image(systemName: stat.symbol)
                    .font(.title3)
                    .foregroundStyle(stat.accent)
                    .frame(width: 40, height: 40)
                    .background(.thinMaterial, in: Circle())
                Text(stat.value)
                    .font(TravelTypography.title)
                    .foregroundStyle(.primary)
                Text(stat.label)
                    .font(TravelTypography.cardTitle)
                Text(stat.caption)
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

/// Adaptive grid of passport statistic tiles.
struct PassportStatGrid: View {
    let stats: [PassportStatPreview]

    var body: some View {
        PremiumAdaptiveGrid(minimumWidth: 156) {
            ForEach(stats) { stat in
                PassportStatTile(stat: stat)
            }
        }
    }
}

// MARK: - Favourite Style

/// Highlighted favourite-style-of-trip card.
struct PassportStyleCard: View {
    let style: PassportStylePreview

    var body: some View {
        GlassCard {
            HStack(spacing: TravelSpacing.md) {
                Image(systemName: style.symbol)
                    .font(.title)
                    .foregroundStyle(TravelTheme.current.coral)
                    .frame(width: 54, height: 54)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text("Favourite style of trip")
                        .font(TravelTypography.caption)
                        .textCase(.uppercase)
                        .foregroundStyle(.secondary)
                    Text(style.style)
                        .font(TravelTypography.cardTitle)
                    Text(style.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 0)
            }
        }
    }
}

// MARK: - Stamp Grid

/// A single passport stamp cell, either stamped or ready for a future journey.
struct PassportStampCell: View {
    let stamp: PassportStampPreview

    var body: some View {
        PremiumPassportStamp(
            title: stamp.isStamped ? stamp.country : "Ready",
            metadata: stamp.isStamped ? stamp.dateLabel : "Next",
            glyph: stamp.glyph,
            symbol: stamp.isStamped ? stamp.symbol : "plus",
            gradient: stamp.gradient,
            isStamped: stamp.isStamped
        )
    }
}

/// Visual passport stamp grid built from static preview stamps.
struct PassportStampGrid: View {
    let stamps: [PassportStampPreview]

    var body: some View {
        PremiumStampGrid {
            ForEach(stamps) { stamp in
                PassportStampCell(stamp: stamp)
            }
        }
    }
}

// MARK: - Recent Moments

/// Reusable row for the "Recent passport moments" section.
struct PassportMomentRow: View {
    let moment: PassportMomentPreview

    var body: some View {
        HStack(spacing: TravelSpacing.md) {
            Image(systemName: moment.symbol)
                .font(.headline)
                .foregroundStyle(TravelTheme.current.tint)
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
            VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                Text(moment.category)
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                Text(moment.title)
                    .font(TravelTypography.cardTitle)
                    .lineLimit(1)
                Label(moment.place, systemImage: "mappin.and.ellipse")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: TravelSpacing.sm)
            Text(moment.dateLabel)
                .font(TravelTypography.caption)
                .foregroundStyle(.secondary)
        }
        .padding(TravelSpacing.md)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: TravelRadius.md, style: .continuous))
    }
}

// MARK: - Empty State

/// Empty-state friendly layout for a new traveller with no trips yet.
struct PassportEmptyState: View {
    var body: some View {
        FeatureEmptyState(
            symbol: "airplane.departure",
            title: "Your passport is ready",
            message: "No journeys are recorded yet. Once trips arrive, stamps, streaks and captured memories can fill this passport.",
            pill: "Static preview"
        )
    }
}
