import Foundation

/// Deterministic lifecycle state for repository-backed presentation data.
///
/// The current mock repositories resolve synchronously, so ViewModels begin in
/// either `loaded` or `empty`. The remaining states establish the typed
/// contract for future loading work without changing current UI behavior.
enum ViewModelLoadingState: Equatable, Sendable {
    case idle
    case loading
    case loaded
    case empty
    case failed(ViewModelLoadingFailure)

    static func resolved(isEmpty: Bool) -> ViewModelLoadingState {
        isEmpty ? .empty : .loaded
    }
}

/// Stable, presentation-safe failure metadata. It deliberately carries no
/// platform error or generated text. Conforms to `Error` so it can be thrown by
/// asynchronous repository loads and resolved into `.failed`.
struct ViewModelLoadingFailure: Error, Equatable, Sendable {
    let code: String
    let message: String
}
