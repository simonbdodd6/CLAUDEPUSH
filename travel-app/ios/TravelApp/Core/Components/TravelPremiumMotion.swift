import SwiftUI

// MARK: - Premium motion & loading primitives (M50)
//
// Reusable, presentation-only building blocks that give the app a more premium
// feel without introducing networking, persistence, state or demo-data
// dependencies. Everything here is pure SwiftUI over the existing design-system
// tokens, so it compiles in Release and Debug alike and reads identically for
// every screen that adopts it.
//
//   • `.travelScreenEntrance()` — a gentle fade-and-rise reveal used to make
//     navigating between screens feel smoother. Respects Reduce Motion.
//   • `TravelShimmer` / `TravelSkeleton*` — luxury loading placeholders (a soft
//     shimmering skeleton) for any surface awaiting content. Respects Reduce
//     Motion by falling back to a calm static tint.

// MARK: Screen entrance

/// A gentle fade + upward rise applied when a screen first appears, giving
/// navigation a smoother, more composed feel. Honours Reduce Motion.
struct TravelScreenEntrance: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    /// Optional stagger, in seconds, for sequencing sibling reveals.
    var delay: Double = 0

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 14)
            .onAppear {
                guard !appeared else { return }
                if reduceMotion {
                    appeared = true
                } else {
                    withAnimation(TravelMotion.screen.delay(delay)) { appeared = true }
                }
            }
    }
}

extension View {
    /// Reveals the view with the standard premium screen entrance.
    func travelScreenEntrance(delay: Double = 0) -> some View {
        modifier(TravelScreenEntrance(delay: delay))
    }
}

// MARK: Shimmer

/// A soft diagonal highlight that sweeps across a surface to signal loading.
/// The caller is responsible for clipping to its own shape. Honours Reduce
/// Motion by rendering a calm static highlight instead of an animation.
struct TravelShimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { geo in
                    let width = max(geo.size.width, 1)
                    LinearGradient(
                        colors: [.clear, .white.opacity(0.55), .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                    .frame(width: width * 0.7)
                    .offset(x: (reduceMotion ? -0.1 : phase) * width * 1.7)
                    .blendMode(.plusLighter)
                }
                .allowsHitTesting(false)
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 1
                }
            }
    }
}

extension View {
    /// Applies a shimmering highlight. Clip the receiver to its own shape first.
    func travelShimmer() -> some View { modifier(TravelShimmer()) }
}

// MARK: Skeletons

/// A single rounded skeleton bar — the atom of the loading placeholders.
struct TravelSkeleton: View {
    var height: CGFloat = 14
    var cornerRadius: CGFloat = TravelRadius.sm

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Color.primary.opacity(0.08))
            .frame(height: height)
            .travelShimmer()
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}

/// A premium glass card-shaped loading placeholder: a leading glyph block and a
/// couple of text lines, mirroring the real cards it stands in for.
struct TravelSkeletonCard: View {
    var lines: Int = 2

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: TravelSpacing.md) {
                RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous)
                    .fill(Color.primary.opacity(0.08))
                    .frame(width: 46, height: 46)
                    .travelShimmer()
                    .clipShape(RoundedRectangle(cornerRadius: TravelRadius.sm, style: .continuous))
                VStack(alignment: .leading, spacing: TravelSpacing.sm) {
                    TravelSkeleton(height: 16)
                        .frame(maxWidth: 160)
                    ForEach(0..<max(lines, 1), id: \.self) { _ in
                        TravelSkeleton(height: 10)
                    }
                }
                Spacer(minLength: 0)
            }
        }
    }
}

/// A drop-in loading state: a stack of shimmering skeleton cards for any surface
/// awaiting content. Deterministic — no timers, state or data required.
struct TravelLoadingPlaceholder: View {
    var count: Int = 3

    var body: some View {
        VStack(spacing: TravelSpacing.md) {
            ForEach(0..<max(count, 1), id: \.self) { _ in
                TravelSkeletonCard()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading")
    }
}

#if DEBUG
struct TravelPremiumMotion_Previews: PreviewProvider {
    static var previews: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: TravelSpacing.lg) {
                Text("Loading placeholders")
                    .font(TravelTypography.section)
                TravelLoadingPlaceholder(count: 3)

                Text("Skeleton bars")
                    .font(TravelTypography.section)
                VStack(spacing: TravelSpacing.sm) {
                    TravelSkeleton(height: 18)
                    TravelSkeleton(height: 12)
                    TravelSkeleton(height: 12).frame(maxWidth: 220)
                }
            }
            .padding(TravelSpacing.lg)
        }
        .background(TravelTheme.current.background)
        .previewDisplayName("Premium motion · skeletons")
    }
}
#endif
