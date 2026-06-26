#!/usr/bin/env bash
#
# Deterministic, Xcode-free CI test runner for the TravelCore XCTest suite.
#
# It compiles the EXISTING `Tests/TravelCoreTests` XCTest source files verbatim
# against:
#   * a lightweight `XCTest` shim module (CITestRunner/XCTestShim.swift), and
#   * a testing-enabled `TravelCore` module (the Foundation-only loading core),
# then runs them via CITestRunner/Runner.swift. Requires only the Swift
# toolchain (`swiftc`) — no Xcode, no XCTest framework, no SwiftPM, no network.
#
# Exit code is 0 when every test passes and non-zero otherwise, so it can gate a
# CI pipeline directly. All output and assertions are deterministic.
#
# Usage:  travel-app/ios/Scripts/run-ci-tests.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Foundation-only loading core (kept in sync with Package.swift's TravelCore target).
CORE_SOURCES=(
  "$IOS_ROOT/TravelApp/Core/ViewModels/ViewModelLoadingState.swift"
  "$IOS_ROOT/TravelApp/Core/ViewModels/ViewModelStatePresentation.swift"
  "$IOS_ROOT/TravelApp/Core/ViewModels/AsyncStateLoader.swift"
)
SHIM_SOURCE="$IOS_ROOT/CITestRunner/XCTestShim.swift"
RUNNER_SOURCE="$IOS_ROOT/CITestRunner/Runner.swift"
# All XCTest files in the test target are picked up automatically.
TEST_SOURCES=( "$IOS_ROOT"/Tests/TravelCoreTests/*.swift )

BUILD_DIR="$(mktemp -d)"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

echo "▸ Building TravelCore module (testing-enabled)…"
swiftc -emit-module -emit-library -enable-testing -module-name TravelCore \
  -emit-module-path "$BUILD_DIR/TravelCore.swiftmodule" \
  -o "$BUILD_DIR/libTravelCore.dylib" \
  "${CORE_SOURCES[@]}"

echo "▸ Building XCTest shim module…"
swiftc -emit-module -emit-library -module-name XCTest \
  -emit-module-path "$BUILD_DIR/XCTest.swiftmodule" \
  -o "$BUILD_DIR/libXCTest.dylib" \
  "$SHIM_SOURCE"

echo "▸ Compiling test runner…"
swiftc -I "$BUILD_DIR" -L "$BUILD_DIR" -lTravelCore -lXCTest \
  -o "$BUILD_DIR/citestrunner" \
  "$RUNNER_SOURCE" "${TEST_SOURCES[@]}"

echo "▸ Running tests…"
echo
set +e
DYLD_LIBRARY_PATH="$BUILD_DIR" "$BUILD_DIR/citestrunner"
STATUS=$?
set -e

exit "$STATUS"
