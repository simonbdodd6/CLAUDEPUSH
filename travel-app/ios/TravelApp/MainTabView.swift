import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max") }
            ItineraryView()
                .tabItem { Label("Itinerary", systemImage: "map") }
            CaptureView()
                .tabItem { Label("Capture", systemImage: "plus.circle.fill") }
            TimelineView()
                .tabItem { Label("Timeline", systemImage: "clock") }
            SettingsView()
                .tabItem { Label("More", systemImage: "ellipsis.circle") }
        }
    }
}

// MARK: - Placeholder screens (wired one-by-one in later milestones)

private struct ComingSoon: View {
    let title: String
    let symbol: String
    let detail: String
    var body: some View {
        NavigationStack {
            StateView(kind: .empty(detail))
                .navigationTitle(title)
        }
    }
}

struct TripView: View {
    var body: some View { ComingSoon(title: "Trip", symbol: "airplane", detail: "Your Indonesia trip details — wiring next.") }
}

struct ItineraryView: View {
    var body: some View { ComingSoon(title: "Itinerary", symbol: "map", detail: "Day-by-day plan — wiring to GET/PUT /itinerary next.") }
}

struct CaptureView: View {
    var body: some View { ComingSoon(title: "Capture", symbol: "camera", detail: "Journal + photo capture — wiring to POST /capture next.") }
}

struct TimelineView: View {
    var body: some View { ComingSoon(title: "Timeline", symbol: "clock", detail: "What happened, by day — wiring to GET /timeline next.") }
}

struct SettingsView: View {
    @EnvironmentObject var appState: AppState
    var body: some View {
        NavigationStack {
            List {
                Section("Traveller") {
                    LabeledContent("Name", value: appState.traveller?.displayName ?? "—")
                    LabeledContent("Country", value: appState.traveller?.country ?? "—")
                }
                Section {
                    Button("Sign out", role: .destructive) { Task { await appState.signOut() } }
                }
            }
            .navigationTitle("More")
        }
    }
}
