import SwiftUI

/// Today — the home screen: who you are, your current trip, and recent activity.
struct TodayView: View {
    @State private var state: LoadState = .loading
    @State private var data: TodayResponse?

    enum LoadState: Equatable { case loading, loaded, failed(String) }

    var body: some View {
        NavigationStack {
            Group {
                switch state {
                case .loading:
                    StateView(kind: .loading)
                case .failed(let message):
                    StateView(kind: .error(message)) { Task { await load() } }
                case .loaded:
                    content
                }
            }
            .navigationTitle("Today")
            .task { if data == nil { await load() } }
            .refreshable { await load() }
        }
    }

    @ViewBuilder private var content: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.spacing) {
                if let trip = data?.currentTrip {
                    Card {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(trip.destination).font(.cardTitle)
                            Text("\(trip.area), \(trip.country)").font(.cardBody).foregroundStyle(.secondary)
                            Text("\(trip.startDate) – \(trip.endDate)").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Card {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("No trip yet").font(.cardTitle)
                            Text("Create your Indonesia trip to get started.").font(.cardBody).foregroundStyle(.secondary)
                        }
                    }
                }

                Text("Recent").font(.cardTitle).padding(.top, 4)
                if let recent = data?.recentTimeline, !recent.isEmpty {
                    ForEach(recent) { event in
                        Card {
                            HStack {
                                Image(systemName: symbol(for: event.eventType)).foregroundStyle(Theme.accent)
                                VStack(alignment: .leading) {
                                    Text(event.eventType.replacingOccurrences(of: "_", with: " ").capitalized).font(.cardBody)
                                    Text(event.timestamp).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                } else {
                    Text("Nothing yet — capture a moment to see it here.")
                        .font(.cardBody).foregroundStyle(.secondary)
                }
            }
            .padding(Theme.spacing)
        }
    }

    private func symbol(for type: String) -> String {
        switch type {
        case "photo_imported": return "photo"
        case "journal_entry": return "text.book.closed"
        case "trip_created", "trip_updated": return "airplane"
        case "activity": return "figure.walk"
        default: return "circle.fill"
        }
    }

    private func load() async {
        state = .loading
        do {
            data = try await APIClient.shared.today()
            state = .loaded
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
