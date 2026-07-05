import MapKit
import SwiftUI

/// Map of the whole event shortlist (SPEC §2.6, GET /events/:id/map → GeoJSON).
struct EventMapView: View {
    let event: Event

    @State private var collection: GeoFeatureCollection?
    @State private var errorMessage: String?

    init(event: Event, previewCollection: GeoFeatureCollection? = nil) {
        self.event = event
        _collection = State(initialValue: previewCollection)
    }

    private struct Pin: Identifiable {
        let id = UUID()
        let name: String
        let status: EventLocationStatus?
        let coordinate: CLLocationCoordinate2D
    }

    private var pins: [Pin] {
        (collection?.features ?? []).compactMap { feature in
            guard let geometry = feature.geometry,
                  geometry.coordinates.count >= 2
            else { return nil }
            let name = feature.properties?["name"]?.displayString ?? "Location"
            var status: EventLocationStatus?
            if case .string(let raw)? = feature.properties?["status"] {
                status = EventLocationStatus(rawValue: raw)
            }
            return Pin(
                name: name,
                status: status,
                coordinate: CLLocationCoordinate2D(
                    latitude: geometry.coordinates[1],
                    longitude: geometry.coordinates[0]
                )
            )
        }
    }

    var body: some View {
        Map {
            ForEach(pins) { pin in
                Marker(pin.name, coordinate: pin.coordinate)
                    .tint(pin.status?.tintColor ?? .red)
            }
        }
        .overlay(alignment: .bottom) {
            if let errorMessage {
                Label(errorMessage, systemImage: "wifi.exclamationmark")
                    .font(.caption)
                    .padding(8)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
                    .padding()
            } else if pins.isEmpty {
                Label("Nessuna location georeferenziata in shortlist.", systemImage: "mappin.slash")
                    .font(.caption)
                    .padding(8)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 8))
                    .padding()
            }
        }
        .navigationTitle("Mappa — \(event.name)")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if collection == nil {
                do {
                    collection = try await APIClient.shared.eventMap(eventId: event.id)
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }
}

#Preview {
    NavigationStack {
        EventMapView(event: Mocks.event, previewCollection: Mocks.geoCollection)
    }
}
