# CITestRunner

A deterministic, **Xcode-free** way to run the `TravelCore` XCTest suite from the
command line — for CI pipelines and toolchains that have no XCTest framework
(e.g. Swift CommandLineTools without Xcode).

## Run

```sh
travel-app/ios/Scripts/run-ci-tests.sh
```

Exit code is `0` when every test passes, non-zero otherwise — so it can gate CI
directly. It needs only `swiftc`; no Xcode, no SwiftPM, no network.

## How it works

The script compiles the **existing, unmodified** `Tests/TravelCoreTests/*.swift`
XCTest files against two locally-built modules:

1. **`TravelCore`** — the Foundation-only loading core
   (`ViewModelLoadingState`, `ViewModelStatePresentation`, `AsyncStateLoader`),
   built with `-enable-testing` so `@testable import TravelCore` works.
2. **`XCTest`** (`XCTestShim.swift`) — a tiny re-implementation of the slice of
   the XCTest API the suite uses (`XCTestCase`, `XCTAssertEqual`), so the suite's
   `import XCTest` resolves without the real framework.

`Runner.swift` then instantiates each test case and invokes its `test…` methods,
reporting pass/fail and exiting accordingly.

## Relationship to the real XCTest target

This is **additive** and changes nothing about the canonical test target. Under
full Xcode or `swift test` (see `Package.swift`), the real XCTest framework is
used and this shim/runner is never compiled. The same test files run under both.

## Adding a test

This runner has no Objective-C XCTest reflection, so tests are registered
explicitly in `Runner.swift` (`registeredTests`). When you add a `test…` method,
add one line there. New test **files** are picked up automatically by the script.
