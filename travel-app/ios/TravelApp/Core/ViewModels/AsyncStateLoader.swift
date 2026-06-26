import Foundation

// MARK: - Async loading seam (Phase 40)
//
// Foundation-only, networking-free async loading primitives that activate the
// existing `ViewModelLoadingState` machine for future asynchronous repositories.
// Nothing here is wired into a screen yet: the current ViewModels keep resolving
// synchronously, so runtime behaviour is unchanged. This is the deterministic,
// unit-testable seam that a later phase's ViewModels can adopt.

/// Drives a `ViewModelLoadingState` through a single asynchronous, networking-free
/// load, recording every state it passes through.
///
/// Given a `load` closure and an `isEmpty` predicate it always resolves the
/// deterministic sequence `.idle -> .loading -> (.loaded | .empty | .failed)`.
/// A thrown `ViewModelLoadingFailure` is surfaced verbatim; any other error is
/// mapped to a stable, presentation-safe failure (no platform error leaks).
final class AsyncStateLoader<Value> {
    private(set) var state: ViewModelLoadingState = .idle {
        didSet { history.append(state) }
    }

    /// The ordered list of states this loader has occupied, starting at `.idle`.
    private(set) var history: [ViewModelLoadingState] = [.idle]

    /// The most recent successfully loaded value, if any.
    private(set) var value: Value?

    private let isEmpty: (Value) -> Bool
    private let load: () async throws -> Value

    init(
        isEmpty: @escaping (Value) -> Bool,
        load: @escaping () async throws -> Value
    ) {
        self.isEmpty = isEmpty
        self.load = load
    }

    /// Runs the load and resolves the terminal state. Safe to call repeatedly.
    func reload() async {
        state = .loading
        do {
            let loaded = try await load()
            value = loaded
            state = .resolved(isEmpty: isEmpty(loaded))
        } catch let failure as ViewModelLoadingFailure {
            state = .failed(failure)
        } catch {
            state = .failed(ViewModelLoadingFailure(
                code: "load_failed",
                message: "The travel data could not be loaded."
            ))
        }
    }
}

extension ViewModelLoadingState {
    /// Resolve a completed async load `Result` into a terminal state:
    /// success maps to `.loaded`/`.empty` via `isEmpty`, failure to `.failed`.
    static func resolved<Value>(
        _ result: Result<Value, ViewModelLoadingFailure>,
        isEmpty: (Value) -> Bool
    ) -> ViewModelLoadingState {
        switch result {
        case .success(let value):
            return .resolved(isEmpty: isEmpty(value))
        case .failure(let failure):
            return .failed(failure)
        }
    }
}
