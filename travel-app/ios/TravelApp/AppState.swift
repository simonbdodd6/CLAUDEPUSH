import SwiftUI

// App-wide auth/session state. Holds the session token + current traveller and
// drives the signed-in vs signed-out routing. Persists the token (UserDefaults
// for the MVP scaffold; move to Keychain before App Store).
@MainActor
final class AppState: ObservableObject {
    @Published var traveller: Traveller?
    @Published var isRestoring = true
    @Published var authError: String?

    private let tokenKey = "travel.session.token"

    var isSignedIn: Bool { traveller != nil }

    func restore() async {
        defer { isRestoring = false }
        guard let token = UserDefaults.standard.string(forKey: tokenKey) else { return }
        await APIClient.shared.setToken(token)
        // Validate the cached session by loading Today; clear it if rejected.
        do {
            let today = try await APIClient.shared.today()
            traveller = today.traveller
        } catch {
            UserDefaults.standard.removeObject(forKey: tokenKey)
            await APIClient.shared.setToken(nil)
        }
    }

    func signInWithApple(identityToken: String, displayName: String?) async {
        authError = nil
        do {
            let result = try await APIClient.shared.signInWithApple(identityToken: identityToken, displayName: displayName)
            UserDefaults.standard.set(result.token, forKey: tokenKey)
            traveller = result.traveller
        } catch {
            authError = error.localizedDescription
        }
    }

    func signOut() async {
        UserDefaults.standard.removeObject(forKey: tokenKey)
        await APIClient.shared.setToken(nil)
        traveller = nil
    }
}
