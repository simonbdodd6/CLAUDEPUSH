import SwiftUI

// MARK: - Presentation models

struct SearchHeroPreview {
    let title: String
    let subtitle: String
    let destinations: String
    let memories: String
    let journeys: String
}

struct RecentDestinationPreview: Identifiable {
    let id: String
    let place: String
    let detail: String
    let date: String
    let symbol: String
    let accent: Color
}

struct SearchSuggestionPreview: Identifiable {
    let id: String
    let title: String
    let query: String
    let symbol: String
}

struct SearchCategoryPreview: Identifiable {
    let id: String
    let title: String
    let count: Int
    let symbol: String
    let accent: Color
}

struct SearchResultPreview: Identifiable {
    let id: String
    let title: String
    let subtitle: String
    let metadata: String
    let category: String
    let symbol: String
    let searchTerms: [String]
}

struct SearchStatisticPreview: Identifiable {
    let id: String
    let value: String
    let label: String
    let caption: String
    let symbol: String
    let accent: Color
}

// MARK: - Hero

struct SearchHeroCard: View {
    let preview: SearchHeroPreview

    var body: some View {
        FeatureHeroScaffold(
            eyebrow: "Travel search",
            symbol: "magnifyingglass",
            title: preview.title,
            subtitle: preview.subtitle,
            gradient: [
                TravelTheme.current.ink,
                TravelTheme.current.tint.opacity(0.92),
                TravelTheme.current.sky.opacity(0.72)
            ],
            metrics: [
                HeroMetric(value: preview.destinations, label: "Destinations"),
                HeroMetric(value: preview.memories, label: "Memories"),
                HeroMetric(value: preview.journeys, label: "Journeys")
            ]
        ) {
            SearchOrbitTexture()
                .padding(TravelSpacing.lg)
                .opacity(0.5)
        }
    }
}

// MARK: - Recent destinations

struct RecentDestinationCard: View {
    let preview: RecentDestinationPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    PremiumMapPin(
                        symbol: preview.symbol,
                        accent: preview.accent
                    )
                    Spacer()
                    Text(preview.date)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: TravelSpacing.xxs) {
                    Text(preview.place)
                        .font(TravelTypography.cardTitle)
                    Text(preview.detail)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

// MARK: - Suggestions

struct SearchSuggestionCard: View {
    let suggestions: [SearchSuggestionPreview]
    let onSelect: (SearchSuggestionPreview) -> Void

    var body: some View {
        GlassCard {
            FlowLayout(spacing: TravelSpacing.sm) {
                ForEach(suggestions) { suggestion in
                    Button {
                        onSelect(suggestion)
                    } label: {
                        Label(suggestion.title, systemImage: suggestion.symbol)
                            .font(TravelTypography.caption)
                            .foregroundStyle(TravelTheme.current.ink)
                            .padding(.horizontal, TravelSpacing.sm)
                            .padding(.vertical, TravelSpacing.xs)
                            .background(.thinMaterial, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

// MARK: - Categories

struct SearchCategoryCard: View {
    let preview: SearchCategoryPreview

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: TravelSpacing.md) {
                HStack {
                    Image(systemName: preview.symbol)
                        .font(.title3)
                        .foregroundStyle(preview.accent)
                    Spacer()
                    Text("\(preview.count)")
                        .font(TravelTypography.section)
                        .foregroundStyle(preview.accent)
                }
                Text(preview.title)
                    .font(TravelTypography.cardTitle)
                Text("Search this part of the archive")
                    .font(TravelTypography.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Results

struct SearchResultPreviewCard: View {
    let preview: SearchResultPreview

    var body: some View {
        PremiumCompactTile(
            title: preview.title,
            subtitle: preview.subtitle,
            badge: preview.category,
            metadata: preview.metadata,
            symbol: preview.symbol
        )
    }
}

// MARK: - Statistics

struct SearchStatisticCard: View {
    let preview: SearchStatisticPreview

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

struct SearchEmptyState: View {
    let query: String

    var body: some View {
        FeatureEmptyState(
            symbol: "magnifyingglass",
            title: "No travel matches",
            message: query.isEmpty
                ? "Destinations, memories and stories will appear here as the archive grows."
                : "Nothing in the static preview archive matches “\(query)”.",
            pill: query.isEmpty ? "Ready to search" : "Try another search"
        )
    }
}

// MARK: - Local layout and texture

private struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        layout(proposal: proposal, subviews: subviews).size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, point) in result.points.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + point.x, y: bounds.minY + point.y),
                proposal: .unspecified
            )
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, points: [CGPoint]) {
        let width = max(proposal.width ?? 320, 1)
        var points: [CGPoint] = []
        var cursor = CGPoint.zero
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if cursor.x > 0, cursor.x + size.width > width {
                cursor.x = 0
                cursor.y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(cursor)
            cursor.x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }

        return (
            CGSize(width: width, height: cursor.y + rowHeight),
            points
        )
    }
}

private struct SearchOrbitTexture: View {
    var body: some View {
        ZStack {
            Circle()
                .stroke(.white.opacity(0.16), lineWidth: 2)
                .frame(width: 132, height: 132)
            Circle()
                .stroke(.white.opacity(0.12), lineWidth: 2)
                .frame(width: 82, height: 82)
            Image(systemName: "magnifyingglass")
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(.white.opacity(0.28))
            Circle()
                .fill(.white.opacity(0.28))
                .frame(width: 14, height: 14)
                .offset(x: 58, y: -28)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        .accessibilityHidden(true)
    }
}
