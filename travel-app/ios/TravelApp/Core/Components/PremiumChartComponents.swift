import SwiftUI

// MARK: - Premium chart components (Phase 37)
//
// Deterministic, presentation-only chart primitives built with SwiftUI shapes
// and the existing Travel Intelligence design system.

enum PremiumRingGradientStyle {
    case angular
    case linear
}

struct PremiumChartLegendItem: Identifiable {
    let id: String
    let label: String
    let value: String?
    let color: Color
}

/// A compact bar chart for normalized values.
struct PremiumBarChart: View {
    let values: [Double]
    let colors: [Color]
    var minimumBarHeight: CGFloat = 28
    var barHeightRange: CGFloat = 72
    var chartHeight: CGFloat = 100
    var barSpacing: CGFloat = TravelSpacing.xs

    var body: some View {
        HStack(alignment: .bottom, spacing: barSpacing) {
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: colors,
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
                    .frame(maxWidth: .infinity)
                    .frame(height: minimumBarHeight + (barHeightRange * clamped(value)))
            }
        }
        .frame(height: chartHeight, alignment: .bottom)
    }

    private func clamped(_ value: Double) -> Double {
        min(max(value, 0), 1)
    }
}

/// A deterministic linear progress bar with a gradient fill.
struct PremiumProgressBar: View {
    let progress: Double
    let colors: [Color]
    var trackColor: Color = Color.secondary.opacity(0.14)
    var height: CGFloat = 8

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(trackColor)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: colors,
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: proxy.size.width * clampedProgress)
            }
        }
        .frame(height: height)
    }

    private var clampedProgress: Double {
        min(max(progress, 0), 1)
    }
}

/// A circular progress indicator with a caller-supplied centre label.
struct PremiumRingProgress<Label: View>: View {
    let progress: Double
    let colors: [Color]
    let trackColor: Color
    var lineWidth: CGFloat = 7
    var gradientStyle: PremiumRingGradientStyle = .angular
    @ViewBuilder var label: Label

    var body: some View {
        ZStack {
            Circle()
                .stroke(trackColor, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: clampedProgress)
                .stroke(
                    progressStyle,
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
            label
        }
    }

    private var clampedProgress: Double {
        min(max(progress, 0), 1)
    }

    private var progressStyle: AnyShapeStyle {
        switch gradientStyle {
        case .angular:
            AnyShapeStyle(AngularGradient(colors: colors, center: .center))
        case .linear:
            AnyShapeStyle(
                LinearGradient(
                    colors: colors,
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
    }
}

/// A compact chart legend using deterministic labels and existing colours.
struct PremiumChartLegend: View {
    let items: [PremiumChartLegendItem]

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 112), spacing: TravelSpacing.sm)],
            spacing: TravelSpacing.sm
        ) {
            ForEach(items) { item in
                HStack(spacing: TravelSpacing.xs) {
                    Circle()
                        .fill(item.color)
                        .frame(width: 8, height: 8)
                    Text(item.label)
                        .font(TravelTypography.caption)
                        .foregroundStyle(.secondary)
                    if let value = item.value {
                        Spacer(minLength: 0)
                        Text(value)
                            .font(TravelTypography.caption)
                            .foregroundStyle(.primary)
                    }
                }
            }
        }
    }
}
