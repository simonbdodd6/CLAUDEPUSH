import XCTest
@testable import TravelCore

/// Deterministic unit tests for the Phase 40 loading-state foundation:
/// ViewModel state resolution, the loading -> loaded transition, and empty /
/// failed resolution. All tests are offline, networking-free and reproducible.
final class LoadingStateTests: XCTestCase {

    // MARK: - ViewModel state resolution

    func testResolvedMapsEmptinessToTerminalState() {
        XCTAssertEqual(ViewModelLoadingState.resolved(isEmpty: false), .loaded)
        XCTAssertEqual(ViewModelLoadingState.resolved(isEmpty: true), .empty)
    }

    func testResultResolverMapsSuccessAndFailure() {
        let nonEmpty = ViewModelLoadingState.resolved(
            Result<[Int], ViewModelLoadingFailure>.success([1, 2, 3]),
            isEmpty: { $0.isEmpty }
        )
        XCTAssertEqual(nonEmpty, .loaded)

        let empty = ViewModelLoadingState.resolved(
            Result<[Int], ViewModelLoadingFailure>.success([]),
            isEmpty: { $0.isEmpty }
        )
        XCTAssertEqual(empty, .empty)

        let failure = ViewModelLoadingFailure(code: "io", message: "boom")
        let failed = ViewModelLoadingState.resolved(
            Result<[Int], ViewModelLoadingFailure>.failure(failure),
            isEmpty: { $0.isEmpty }
        )
        XCTAssertEqual(failed, .failed(failure))
    }

    // MARK: - Loading -> Loaded transition

    func testLoadingToLoadedTransition() async {
        let loader = AsyncStateLoader<[String]>(
            isEmpty: { $0.isEmpty },
            load: { ["paris", "kyoto"] }
        )

        XCTAssertEqual(loader.state, .idle)

        await loader.reload()

        XCTAssertEqual(loader.state, .loaded)
        XCTAssertEqual(loader.value, ["paris", "kyoto"])
        // The loader passes through .loading before resolving to .loaded.
        XCTAssertEqual(loader.history, [.idle, .loading, .loaded])
    }

    // MARK: - Empty state resolution

    func testEmptyStateResolution() async {
        let loader = AsyncStateLoader<[String]>(
            isEmpty: { $0.isEmpty },
            load: { [] }
        )

        await loader.reload()

        XCTAssertEqual(loader.state, .empty)
        XCTAssertEqual(loader.history, [.idle, .loading, .empty])

        // The empty state surfaces the typed presentation contract.
        let empty = EmptyStatePresentation(
            title: "No travels yet",
            message: "Saved trips will appear here.",
            actionLabel: nil,
            reasonCode: "collections_empty"
        )
        let presentation = loader.state.presentation(
            empty: empty,
            failureTitle: "Unable to load"
        )
        XCTAssertEqual(presentation, .empty(empty))
    }

    // MARK: - Failed state resolution

    func testFailedStateResolution() async {
        let failure = ViewModelLoadingFailure(code: "timeout", message: "Timed out.")
        let loader = AsyncStateLoader<[String]>(
            isEmpty: { $0.isEmpty },
            load: { throw failure }
        )

        await loader.reload()

        XCTAssertEqual(loader.state, .failed(failure))
        XCTAssertEqual(loader.history, [.idle, .loading, .failed(failure)])

        // The failed state surfaces the typed error presentation with the
        // failure's reason code and message.
        let presentation = loader.state.presentation(
            empty: EmptyStatePresentation(title: "", message: "", actionLabel: nil, reasonCode: ""),
            failureTitle: "Unable to load travels"
        )
        XCTAssertEqual(presentation, .failed(ErrorStatePresentation(
            title: "Unable to load travels",
            message: "Timed out.",
            actionLabel: "Try again",
            reasonCode: "timeout"
        )))
    }

    func testUnexpectedErrorMapsToStableFailure() async {
        struct Boom: Error {}
        let loader = AsyncStateLoader<Int>(
            isEmpty: { _ in false },
            load: { throw Boom() }
        )

        await loader.reload()

        XCTAssertEqual(loader.state, .failed(ViewModelLoadingFailure(
            code: "load_failed",
            message: "The travel data could not be loaded."
        )))
    }
}
