#if DEBUG
import SwiftUI

// MARK: - State presentation preview harness (Phase 29)
//
// Deterministic, preview-only fixtures and SwiftUI previews for the Phase 27
// state presentation views and the Phase 26 contracts they consume. Everything
// here is wrapped in `#if DEBUG` and built only for previews and tests, so it
// never enters the runtime app binary, runtime navigation or feature-screen
// behaviour. All values are fixed strings — no randomness, dates or I/O.

/// Fixed, reproducible presentation contracts for previews and tests.
///
/// These mirror the shape of the values each ViewModel's `statePresentation`
/// emits, but are owned by the harness so previews stay deterministic and
/// independent of repository data.
enum StatePresentationFixture {
    /// An empty contract with no action label, matching current ViewModel usage.
    static let empty = EmptyStatePresentation(
        title: "No travel memories yet",
        message: "Saved trips, stories and scenes will appear here as your archive grows.",
        actionLabel: nil,
        reasonCode: "preview_empty"
    )

    /// An empty contract that supplies an action label, to exercise the
    /// optional action-label rendering path.
    static let emptyWithAction = EmptyStatePresentation(
        title: "Start your first journey",
        message: "Add a trip to begin building your travel archive.",
        actionLabel: "Add a trip",
        reasonCode: "preview_empty_action"
    )

    /// A failure contract using the same "Try again" action label that the
    /// Phase 26 contract extension applies by default.
    static let failed = ErrorStatePresentation(
        title: "Unable to load your travels",
        message: "Something went wrong while preparing this surface.",
        actionLabel: "Try again",
        reasonCode: "preview_failure"
    )

    /// The empty case wrapped in the resolved `ViewModelStatePresentation` enum.
    static let emptyState = ViewModelStatePresentation.empty(empty)

    /// The failed case wrapped in the resolved `ViewModelStatePresentation` enum.
    static let failedState = ViewModelStatePresentation.failed(failed)
}

/// Renders preview content inside the authentic premium scroll stage so the
/// state views appear exactly as they do inside a real feature screen.
private struct StatePresentationPreviewStage<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        PremiumScrollView {
            content
        }
    }
}

/// Deterministic SwiftUI previews for every state presentation surface.
///
/// `PreviewProvider` is used instead of the `#Preview` macro so the harness
/// parses with the project's `swiftc -parse` gate while remaining preview-only.
struct StatePresentationViews_Previews: PreviewProvider {
    static var previews: some View {
        StatePresentationPreviewStage {
            LoadingStateView()
        }
        .previewDisplayName("Loading State")

        StatePresentationPreviewStage {
            LoadingStateView(
                title: "Preparing your reel",
                message: "Gathering cinematic scenes from completed trips."
            )
        }
        .previewDisplayName("Loading State – Custom Copy")

        StatePresentationPreviewStage {
            EmptyStateView(presentation: StatePresentationFixture.empty)
        }
        .previewDisplayName("Empty State")

        StatePresentationPreviewStage {
            EmptyStateView(presentation: StatePresentationFixture.emptyWithAction)
        }
        .previewDisplayName("Empty State – With Action")

        StatePresentationPreviewStage {
            ErrorStateView(presentation: StatePresentationFixture.failed)
        }
        .previewDisplayName("Error State")

        StatePresentationPreviewStage {
            StatePresentationView(presentation: StatePresentationFixture.emptyState)
        }
        .previewDisplayName("State Presentation – Empty")

        StatePresentationPreviewStage {
            StatePresentationView(presentation: StatePresentationFixture.failedState)
        }
        .previewDisplayName("State Presentation – Failed")
    }
}
#endif
