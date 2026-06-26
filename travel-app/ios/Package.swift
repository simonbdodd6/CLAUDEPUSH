// swift-tools-version:5.7
import PackageDescription

// First test scaffold for Travel Intelligence iOS (Phase 40).
//
// The app itself is a source tree consumed by Xcode; this package exposes the
// Foundation-only loading core as a small library so the deterministic state
// machine can be unit-tested with XCTest (`swift test`) without compiling the
// SwiftUI layer. It introduces no third-party dependencies and no networking.
let package = Package(
    name: "TravelCore",
    products: [
        .library(name: "TravelCore", targets: ["TravelCore"]),
    ],
    targets: [
        .target(
            name: "TravelCore",
            path: "TravelApp/Core/ViewModels",
            sources: [
                "ViewModelLoadingState.swift",
                "ViewModelStatePresentation.swift",
                "AsyncStateLoader.swift",
            ]
        ),
        .testTarget(
            name: "TravelCoreTests",
            dependencies: ["TravelCore"],
            path: "Tests/TravelCoreTests"
        ),
    ]
)
