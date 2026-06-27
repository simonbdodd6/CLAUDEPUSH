import SwiftUI

// MARK: - Premium rating view (Phase 59)
//
// A reusable star-rating component supporting fractional values (full / half /
// empty stars), small / medium / large size variants, an optional trailing
// label and an optional caller-supplied tap seam. Built from the existing design
// tokens only. It is presentation-only: the optional `onRate` closure is the sole
// interaction seam (supplied by the caller, mirroring `PremiumBanner.onDismiss`),
// so the component holds no data, scoring or business logic and is not wired into
// any screen.

/// Size variant for `PremiumRatingView`, scaling the glyphs and label from the
/// existing typography and spacing scales.
enum PremiumRatingSize {
    case small
    case medium
    case large

    var starFont: Font {
        switch self {
        case .small: TravelTypography.body
        case .medium: TravelTypography.section
        case .large: TravelTypography.title
        }
    }

    var labelFont: Font {
        switch self {
        case .small: TravelTypography.caption
        case .medium: TravelTypography.body
        case .large: TravelTypography.section
        }
    }

    var spacing: CGFloat {
        switch self {
        case .small: TravelSpacing.xxs
        case .medium: TravelSpacing.xs
        case .large: TravelSpacing.sm
        }
    }
}

/// A premium, presentation-only star-rating view.
///
/// Pass a fractional `rating` (e.g. `4.5`) for read-only display. Supply
/// `onRate` to make the stars tappable; the closure receives the tapped star
/// index (`1...maxRating`) and the caller decides what to do with it.
struct PremiumRatingView: View {
    var rating: Double
    var maxRating: Int = 5
    var size: PremiumRatingSize = .medium
    var accent: Color = TravelTheme.current.sun
    var label: String? = nil
    var onRate: ((Int) -> Void)? = nil

    var body: some View {
        HStack(spacing: size.spacing) {
            ForEach(1...max(maxRating, 1), id: \.self) { index in
                star(for: index)
            }

            if let label {
                Text(label)
                    .font(size.labelFont)
                    .foregroundStyle(.secondary)
                    .padding(.leading, TravelSpacing.xs)
            }
        }
        .accessibilityElement(children: onRate == nil ? .ignore : .contain)
        .accessibilityLabel(label ?? "Rating")
        .accessibilityValue("\(formattedRating) out of \(max(maxRating, 1))")
    }

    @ViewBuilder
    private func star(for index: Int) -> some View {
        let symbol = symbolName(for: index)
        let filled = symbol != "star"
        let glyph = Image(systemName: symbol)
            .font(size.starFont)
            .foregroundStyle(filled ? accent : accent.opacity(0.25))

        if let onRate {
            Button { onRate(index) } label: { glyph }
                .buttonStyle(.plain)
                .accessibilityLabel("Rate \(index) of \(max(maxRating, 1))")
        } else {
            glyph
        }
    }

    /// Chooses a full / half / empty glyph for a star at `index` from the
    /// fractional rating.
    private func symbolName(for index: Int) -> String {
        let fill = rating - Double(index - 1)
        if fill >= 0.75 { return "star.fill" }
        if fill >= 0.25 { return "star.leadinghalf.filled" }
        return "star"
    }

    private var formattedRating: String {
        String(format: "%.1f", min(max(rating, 0), Double(max(maxRating, 1))))
    }
}

#if DEBUG
struct PremiumRatingView_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Sizes")
                    .font(TravelTypography.section)
                PremiumRatingView(rating: 4.5, size: .small, label: "4.5")
                PremiumRatingView(rating: 4.5, size: .medium, label: "4.5")
                PremiumRatingView(rating: 4.5, size: .large, label: "4.5")

                Divider()

                Text("Fractional values")
                    .font(TravelTypography.section)
                PremiumRatingView(rating: 0.0, label: "0.0")
                PremiumRatingView(rating: 2.5, label: "2.5")
                PremiumRatingView(rating: 3.0, label: "3.0")
                PremiumRatingView(rating: 5.0, label: "5.0")

                Divider()

                Text("Variations")
                    .font(TravelTypography.section)
                PremiumRatingView(rating: 4.0)
                PremiumRatingView(rating: 8.0, maxRating: 10, label: "8 / 10")
                PremiumRatingView(rating: 3.0, accent: TravelTheme.current.coral, label: "Custom accent")
                PremiumRatingView(rating: 3.0, label: "Tappable", onRate: { _ in })
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("PremiumRatingView")
    }
}
#endif
