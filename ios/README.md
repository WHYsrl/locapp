# VenueScout iOS

SwiftUI client for VenueScout (venue scouting for an events agency). UI language: Italian.
Targets iOS 26, Swift 6.2 (strict concurrency), iPhone 15 Pro or newer. No third-party dependencies.

## Requirements

- Xcode 26 (iOS 26 SDK) on macOS
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) — the `.xcodeproj` is generated, never committed

## Getting started

```bash
brew install xcodegen
cd ios
xcodegen generate
open VenueScout.xcodeproj
```

Then in Xcode:

1. Select your development team under *Signing & Capabilities* (bundle id `it.justwhy.venuescout`).
2. Run on an iPhone 15 Pro (or newer) device or simulator running iOS 26.
   - Live transcription (SpeechAnalyzer) and on-device draft extraction (Foundation Models)
     require Apple Intelligence-capable hardware; both degrade gracefully when unavailable.
3. The API base URL defaults to `https://venuescout-api.onrender.com` and can be changed in
   the *Impostazioni* tab (stored in `UserDefaults` under the key `APIBaseURL`).

## Accesso con Google (SSO, senza SDK)

The app implements native Sign in with Google (OAuth 2.0 authorization-code + PKCE via
`ASWebAuthenticationSession`, `Features/Settings/GoogleSignIn.swift`) and exchanges the
resulting `id_token` at `POST /api/v1/auth/google`. Setup:

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an
   OAuth client of type **iOS** with bundle id `it.justwhy.venuescout`. You get a client ID like
   `1234567890-abcdefg.apps.googleusercontent.com` (iOS clients have **no client secret**).
2. Compute the **reversed client ID** by reversing the dot-separated components:
   `com.googleusercontent.apps.1234567890-abcdefg`.
3. In `ios/project.yml`, under `CFBundleURLTypes`, replace the placeholder scheme
   `com.googleusercontent.apps.REPLACE-WITH-IOS-CLIENT-ID` with your reversed client ID,
   then re-run `xcodegen generate`.
4. Run the app and paste the (non-reversed) client ID in *Impostazioni → Accesso Google (SSO)*
   (stored in `UserDefaults` under the key `GoogleiOSClientID`). The "Accedi con Google"
   button appears in the Account section once the field is non-empty.

The backend answers `403` (with a message) if the Google account is not allowed and `503`
if SSO is not configured server-side; both messages are shown in Impostazioni.

## Project layout

```
ios/
  project.yml               # XcodeGen manifest (Info.plist keys, build settings)
  VenueScout/
    App/                    # @main entry point + tab root
    Core/                   # Config, APIClient (+ Keychain), Models, OutboxStore, Mocks
    Features/
      Capture/              # "Inserisci": sopralluogo capture, SpeechAnalyzer, draft review
      Locations/            # Archive: list, filters, detail (spazi, logistica, tecnica...)
      Search/               # "Cerca": AI brief search + add-to-event
      Projects/             # Projects → events → shortlist, event map
      Feedback/             # Post-event ratings
      Contacts/             # Shared registry (contacts + companies)
      Settings/             # API URL, login/logout
      Shared/               # Small reusable UI components
    Resources/              # Info.plist is generated here by xcodegen
```

## Notes

- All network calls go through `APIClient` (async/await, JWT stored in the Keychain),
  endpoints mirror `docs/SPEC.md` §4.
- Captures that fail to upload are persisted as JSON in Application Support (`OutboxStore`)
  and can be re-sent from *Impostazioni*.
- Every view has a `#Preview` backed by `Mocks.swift`, so the app is fully browsable offline.
