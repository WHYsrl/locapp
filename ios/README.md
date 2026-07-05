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
