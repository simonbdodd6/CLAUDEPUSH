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

struct FeatureLinkGrid: View {
    let tabs: [TravelTab]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: TravelSpacing.md)], spacing: TravelSpacing.md) {
            ForEach(tabs) { tab in
                NavigationLink {
                    FeatureDestinationView(tab: tab)
                } label: {
                    GlassCard {
                        VStack(alignment: .leading, spacing: TravelSpacing.md) {
                            Image(systemName: tab.symbol)
                                .font(.title2)
                                .foregroundStyle(TravelTheme.current.tint)
                            Text(tab.title)
                                .font(TravelTypography.cardTitle)
                                .foregroundStyle(.primary)
                            Text(tab.endpoint)
                                .font(TravelTypography.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

