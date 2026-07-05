import SwiftUI

@main
struct VenueScoutApp: App {
    var body: some Scene {
        WindowGroup {
            RootTabView()
                .task {
                    // Best-effort resend of offline captures on launch.
                    _ = await OutboxStore.shared.flush()
                }
        }
    }
}

/// Root navigation: Inserisci · Cerca · Progetti · Contatti · Impostazioni.
struct RootTabView: View {
    var body: some View {
        TabView {
            Tab("Inserisci", systemImage: "mic.badge.plus") {
                NavigationStack {
                    CaptureView()
                }
            }
            Tab("Cerca", systemImage: "sparkle.magnifyingglass") {
                NavigationStack {
                    SearchTabView()
                }
            }
            Tab("Progetti", systemImage: "folder") {
                NavigationStack {
                    ProjectListView()
                }
            }
            Tab("Contatti", systemImage: "person.2") {
                NavigationStack {
                    ContactsView()
                }
            }
            Tab("Impostazioni", systemImage: "gearshape") {
                NavigationStack {
                    SettingsView()
                }
            }
        }
    }
}

#Preview {
    RootTabView()
}
