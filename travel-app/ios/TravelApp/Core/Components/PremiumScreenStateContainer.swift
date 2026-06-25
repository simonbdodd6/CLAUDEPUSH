import SwiftUI

// MARK: - Premium screen state container (Phase 30)
//
// The single, reusable wrapper for every repository-backed feature screen.
// It centralises the loading / empty-or-error / loaded selection that was
// previously duplicated inside each screen body, using the existing Phase 25
// loading state and Phase 26 presentation contracts.
//
// This phase changes no visuals and adds no animation: for the currently
// reachable states (`.loaded` -> content, `.empty`/`.failed` -> presentation)
// it renders exactly what the feature screens rendered before. The `.idle` and
// `.loading` branch is wired for future asynchronous loading and is unreachable
// with the current synchronous mock data.

struct PremiumScreenStateContainer<Content: View>: View {
    let loadingState: ViewModelLoadingState
    let presentation: ViewModelStatePresentation?
    @ViewBuilder var content: Content

    var body: some View {
        switch loadingState {
        case .idle, .loading:
            LoadingStateView()
        case .loaded, .empty, .failed:
            if let presentation {
                StatePresentationView(presentation: presentation)
            } else {
                content
            }
        }
    }
}
