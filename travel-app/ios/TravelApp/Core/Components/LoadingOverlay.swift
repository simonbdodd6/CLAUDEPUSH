import SwiftUI

// MARK: - Loading overlay (Phase 55)
//
// A presentation-only loading overlay: a translucent scrim with a centered glass
// HUD (spinner + copy), designed to be layered *over* existing content while it
// loads — distinct from `LoadingStateView`, which replaces content. Generic and
// reusable by any feature; it carries no data, networking or business logic and
// is not wired into any screen or ViewModel.
//
// Empty / error states are already covered by the Phase-27 `EmptyStateView` and
// `ErrorStateView`, so they are intentionally reused rather than duplicated here.

/// A translucent loading overlay with a centered glass HUD.
///
/// Layer it over content, e.g.:
/// `someContent.overlay { if isLoading { LoadingOverlay() } }`.
struct LoadingOverlay: View {
    var title: String = "Loading"
    var message: String? = nil
    var accent: Color = TravelTheme.current.tint

    var body: some View {
        ZStack {
            Rectangle()
                .fill(.ultraThinMaterial)
                .ignoresSafeArea()

            GlassCard {
                VStack(spacing: TravelSpacing.md) {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(accent)
                        .frame(width: TravelIconSize.statusBadge, height: TravelIconSize.statusBadge)
                        .background(.thinMaterial, in: Circle())
                    Text(title)
                        .font(TravelTypography.section)
                        .multilineTextAlignment(.center)
                    if let message {
                        Text(message)
                            .font(TravelTypography.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, TravelSpacing.md)
            }
            .frame(maxWidth: 320)
            .padding(TravelSpacing.xl)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

#if DEBUG
struct LoadingOverlay_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            TravelTheme.current.background
            VStack(spacing: TravelSpacing.md) {
                Text("Demo content")
                    .font(TravelTypography.title)
                Text("This sits behind the overlay.")
                    .font(TravelTypography.body)
                    .foregroundStyle(.secondary)
            }
            LoadingOverlay()
        }
        .previewDisplayName("Loading overlay")

        ZStack {
            TravelTheme.current.background
            LoadingOverlay(
                title: "Preparing your reel",
                message: "Gathering cinematic scenes from completed trips."
            )
        }
        .previewDisplayName("Loading overlay – custom copy")
    }
}
#endif
