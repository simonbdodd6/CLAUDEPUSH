import Foundation

/// Fixed presentation values for a repository-backed empty state.
struct EmptyStatePresentation: Equatable, Sendable {
    let title: String
    let message: String
    let actionLabel: String?
    let reasonCode: String
}

/// Fixed presentation values for a repository-backed failure state.
struct ErrorStatePresentation: Equatable, Sendable {
    let title: String
    let message: String
    let actionLabel: String?
    let reasonCode: String
}

/// Typed presentation contract emitted only for states that need messaging.
enum ViewModelStatePresentation: Equatable, Sendable {
    case empty(EmptyStatePresentation)
    case failed(ErrorStatePresentation)
}

extension ViewModelLoadingState {
    func presentation(
        empty: EmptyStatePresentation,
        failureTitle: String,
        failureActionLabel: String? = "Try again"
    ) -> ViewModelStatePresentation? {
        switch self {
        case .empty:
            return .empty(empty)
        case .failed(let failure):
            return .failed(ErrorStatePresentation(
                title: failureTitle,
                message: failure.message,
                actionLabel: failureActionLabel,
                reasonCode: failure.code
            ))
        case .idle, .loading, .loaded:
            return nil
        }
    }
}
