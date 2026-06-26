import Foundation
import XCTest

// MARK: - CI test runner entry point (Phase 42)
//
// Drives the TravelCore XCTest suite from the command line without Xcode. The
// runner is compiled together with the unmodified XCTest source files (so it can
// see their `test…` methods), linked against the `XCTest` shim and the
// testing-enabled `TravelCore` module by `Scripts/run-ci-tests.sh`.
//
// Test discovery: the toolchain that powers this runner has no Objective-C
// XCTest reflection, so each test is registered explicitly below. When a test is
// added to a suite, add a line here. Under a full Xcode / `swift test` run the
// real framework discovers tests automatically and this file is not used.

@main
struct CITestRunner {
    /// A registered test: a display name and an async invocation. Synchronous
    /// test methods are called directly inside the async closure.
    typealias RegisteredTest = (name: String, run: (LoadingStateTests) async -> Void)

    static let registeredTests: [RegisteredTest] = [
        ("testResolvedMapsEmptinessToTerminalState", { $0.testResolvedMapsEmptinessToTerminalState() }),
        ("testResultResolverMapsSuccessAndFailure", { $0.testResultResolverMapsSuccessAndFailure() }),
        ("testLoadingToLoadedTransition", { await $0.testLoadingToLoadedTransition() }),
        ("testEmptyStateResolution", { await $0.testEmptyStateResolution() }),
        ("testFailedStateResolution", { await $0.testFailedStateResolution() }),
        ("testUnexpectedErrorMapsToStableFailure", { await $0.testUnexpectedErrorMapsToStableFailure() }),
    ]

    static func main() async {
        print("Running LoadingStateTests (\(registeredTests.count) tests)\n")

        var failedCount = 0
        for test in registeredTests {
            XCTestObserver.shared.reset()
            // A fresh instance per test, matching XCTest's isolation guarantee.
            let instance = LoadingStateTests()
            instance.setUp()
            await test.run(instance)
            instance.tearDown()

            let failures = XCTestObserver.shared.failures
            if failures.isEmpty {
                print("  ok   \(test.name)")
            } else {
                failedCount += 1
                print("  FAIL \(test.name)")
                for failure in failures { print("       \(failure)") }
            }
        }

        if failedCount == 0 {
            print("\nALL \(registeredTests.count) TESTS PASSED")
            exit(0)
        } else {
            print("\n\(failedCount) of \(registeredTests.count) TEST(S) FAILED")
            exit(1)
        }
    }
}
