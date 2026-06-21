import SwiftUI

struct TravelTheme: Equatable {
    static let current = TravelTheme()

    let tint = Color(red: 0.05, green: 0.47, blue: 0.52)
    let ocean = Color(red: 0.02, green: 0.33, blue: 0.43)
    let sky = Color(red: 0.40, green: 0.70, blue: 0.92)
    let coral = Color(red: 0.92, green: 0.36, blue: 0.30)
    let sun = Color(red: 0.96, green: 0.72, blue: 0.32)
    let moss = Color(red: 0.24, green: 0.43, blue: 0.31)
    let ink = Color(red: 0.08, green: 0.09, blue: 0.10)
    let paper = Color(red: 0.97, green: 0.96, blue: 0.93)

    var background: some View {
        LinearGradient(
            colors: [paper, sky.opacity(0.18), sun.opacity(0.12)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

enum TravelSpacing {
    static let xxs: CGFloat = 4
    static let xs: CGFloat = 8
    static let sm: CGFloat = 12
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
    static let xxl: CGFloat = 48
}

enum TravelRadius {
    static let sm: CGFloat = 12
    static let md: CGFloat = 18
    static let lg: CGFloat = 28
    static let hero: CGFloat = 36
}

