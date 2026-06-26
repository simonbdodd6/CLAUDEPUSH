import Foundation

// MARK: - Minimal XCTest shim (Phase 42)
//
// A tiny, dependency-free re-implementation of the small slice of the XCTest
// API that the TravelCore test suite uses. It lets the EXISTING, unmodified
// XCTest files compile and run from the command line on a toolchain that has no
// XCTest framework (e.g. Swift CommandLineTools without Xcode), so the suite can
// run in CI.
//
// This shim is built as a module literally named `XCTest`, so the suite's
// `import XCTest` resolves to it when driven by the CI runner. Under Xcode or a
// full `swift test`, the real XCTest framework is used instead and this shim is
// never compiled. It introduces no networking, persistence or app dependencies.

/// Stand-in for `XCTestCase`. Test classes subclass this exactly as they would
/// the real framework type; the CI runner instantiates them and invokes their
/// `test…` methods.
open class XCTestCase {
    public required init() {}
    open func setUp() {}
    open func tearDown() {}
}

/// Collects assertion failures for the test currently executing. Tests run
/// serially in the CI runner, so a single shared collector is sufficient and
/// fully deterministic.
public final class XCTestObserver {
    public static let shared = XCTestObserver()
    public private(set) var failures: [String] = []

    public func reset() { failures = [] }
    public func record(_ message: String) { failures.append(message) }
}

/// Records a failure when the two expressions are not equal. Mirrors the
/// behaviour (and optional-accepting signature) of the real `XCTAssertEqual`
/// closely enough for the suite, without depending on XCTest.
public func XCTAssertEqual<T: Equatable>(
    _ expression1: @autoclosure () -> T?,
    _ expression2: @autoclosure () -> T?,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    let lhs = expression1()
    let rhs = expression2()
    guard lhs != rhs else { return }
    let custom = message()
    let detail = custom.isEmpty
        ? "XCTAssertEqual failed: (\"\(String(describing: lhs))\") is not equal to (\"\(String(describing: rhs))\")"
        : custom
    XCTestObserver.shared.record("\(file):\(line): \(detail)")
}

/// Records a failure when the expression is not `true`. Provided for parity with
/// XCTest; the current suite uses `XCTAssertEqual` only.
public func XCTAssertTrue(
    _ expression: @autoclosure () -> Bool,
    _ message: @autoclosure () -> String = "",
    file: StaticString = #filePath,
    line: UInt = #line
) {
    guard !expression() else { return }
    let custom = message()
    XCTestObserver.shared.record("\(file):\(line): \(custom.isEmpty ? "XCTAssertTrue failed" : custom)")
}
