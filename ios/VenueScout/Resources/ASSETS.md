# Resources

Placeholder — no binary assets are committed.

- `Info.plist` is generated here by `xcodegen generate` (see `ios/project.yml`).
- App icon / accent color: add an `Assets.xcassets` catalog here when design assets exist,
  then add `- path: VenueScout/Resources/Assets.xcassets` under target sources in `project.yml`
  (or just keep it inside `VenueScout/`, which is already a source folder).
- All UI strings are currently inline Italian literals; move to a String Catalog
  (`Localizable.xcstrings`) here if localization is ever needed.
