import SwiftUI
import AuthenticationServices

/// Sign in with Apple. The Apple identity token is sent to the API, which maps
/// it to a canonical traveller and returns a session.
struct SignInView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            VStack(spacing: 12) {
                Image(systemName: "globe.asia.australia.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(Theme.accent)
                Text("Your trip, in your pocket")
                    .font(.screenTitle)
                    .multilineTextAlignment(.center)
                Text("Plan, capture, and remember your journey through Indonesia — even offline.")
                    .font(.cardBody)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            Spacer()

            if let error = appState.authError {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }

            SignInWithAppleButton(.signIn) { request in
                request.requestedScopes = [.fullName]
            } onCompletion: { result in
                handle(result)
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 52)
            .clipShape(RoundedRectangle(cornerRadius: Theme.corner, style: .continuous))
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
    }

    private func handle(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let auth):
            guard
                let credential = auth.credential as? ASAuthorizationAppleIDCredential,
                let tokenData = credential.identityToken,
                let identityToken = String(data: tokenData, encoding: .utf8)
            else {
                appState.authError = "Apple did not return an identity token."
                return
            }
            let displayName = credential.fullName?.givenName
            Task { await appState.signInWithApple(identityToken: identityToken, displayName: displayName) }
        case .failure(let error):
            appState.authError = error.localizedDescription
        }
    }
}
