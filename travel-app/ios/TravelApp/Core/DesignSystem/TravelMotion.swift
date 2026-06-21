import SwiftUI

enum TravelMotion {
    static let gentle = Animation.spring(response: 0.42, dampingFraction: 0.86)
    static let screen = Animation.spring(response: 0.54, dampingFraction: 0.9)
    static let hover = Animation.easeOut(duration: 0.18)
}

