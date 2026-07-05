import Foundation

/// Mock data used by #Preview across the app. Content in Italian (SPEC §8).
enum Mocks {

    // MARK: Locations

    static let salaGrande = Space(
        id: "sp-1",
        locationId: "loc-1",
        kind: .interno,
        name: "Sala Grande",
        areaSqm: 420,
        heightM: 7.5,
        covered: nil,
        features: SpaceFeatures(
            foyer: true,
            guardaroba: true,
            bagni: BathroomInfo(count: 6, accessible: true),
            cucina: true,
            ascensore: true,
            scale: false,
            arredi: ["tavoli tondi", "sedie chiavarine"]
        ),
        sort: 1,
        capacities: [
            SpaceCapacity(configuration: .tavoliTondi, capacity: 180),
            SpaceCapacity(configuration: .inPiedi, capacity: 300),
            SpaceCapacity(configuration: .platea, capacity: 220)
        ]
    )

    static let terrazza = Space(
        id: "sp-2",
        locationId: "loc-1",
        kind: .esterno,
        name: "Terrazza Belvedere",
        areaSqm: 250,
        heightM: nil,
        covered: .copribile,
        features: nil,
        sort: 2,
        capacities: [
            SpaceCapacity(configuration: .cocktail, capacity: 150)
        ]
    )

    static let ristoranteFiglio = Location(
        id: "loc-2",
        parentLocationId: "loc-1",
        name: "Ristorante La Loggia",
        slug: "ristorante-la-loggia",
        summary: "Ristorante interno alla villa, cucina toscana.",
        addressLine: "Via delle Ville 12",
        city: "Fiesole",
        province: "FI",
        postalCode: "50014",
        country: "IT",
        latitude: 43.8065,
        longitude: 11.2937,
        googleMapsUrl: nil,
        thumbnailUrl: nil,
        visitStatus: .visitata,
        logistics: nil,
        effectiveLogistics: Logistics(
            auto: "sì",
            pullman: "no",
            ztl: ZTLInfo(present: false, hours: nil, permits: nil),
            stopDifficulty: "media",
            privateParking: PrivateParking(spots: 40),
            nearbyParking: nil,
            notes: "Ereditata dalla villa."
        ),
        setup: nil,
        party: nil,
        technical: nil,
        accessibilityRating: 3,
        accessibilityNotes: nil,
        availabilityRules: nil,
        smartTags: ["lunch", "gala_dinner"],
        impressions: nil,
        children: nil,
        spaces: nil,
        contacts: nil,
        suppliers: nil,
        media: nil,
        priceLists: nil,
        usageSummary: nil,
        createdAt: nil,
        updatedAt: nil
    )

    static let location = Location(
        id: "loc-1",
        parentLocationId: nil,
        name: "Villa Il Cipresso",
        slug: "villa-il-cipresso",
        summary: "Villa rinascimentale sulle colline di Fiesole con vista su Firenze, ideale per cene di gala e feste aziendali.",
        addressLine: "Via delle Ville 12",
        city: "Fiesole",
        province: "FI",
        postalCode: "50014",
        country: "IT",
        latitude: 43.8067,
        longitude: 11.2939,
        googleMapsUrl: "https://maps.google.com/?q=43.8067,11.2939",
        thumbnailUrl: nil,
        visitStatus: .visitata,
        logistics: Logistics(
            auto: "sì, fino al cancello nord",
            pullman: "sì, sosta breve al piazzale",
            ztl: ZTLInfo(present: true, hours: "7:30–19:30", permits: "richiesta preventiva al Comune"),
            stopDifficulty: "bassa",
            privateParking: PrivateParking(spots: 40),
            nearbyParking: [NearbyParking(name: "Parcheggio Piazza Mino", distanceM: 600)],
            notes: "Scarico allestimenti dal cancello nord."
        ),
        effectiveLogistics: nil,
        setup: SetupInfo(
            furniture: "80 sedie chiavarine, 20 tavoli tondi",
            lights: "impianto architetturale dimmerabile",
            projections: "schermo 4x3 in Sala Grande",
            stage: "pedana modulare 6x4",
            audio: "impianto fisso 2kW",
            constraints: ["no tasselli a muro", "candele solo LED"]
        ),
        party: PartyInfo(
            indoor: PartyRules(allowed: true, musicUntil: "01:00"),
            outdoor: PartyRules(allowed: true, musicUntil: "23:30"),
            structuralConstraints: ["no fuochi d'artificio"],
            dbLimit: 95
        ),
        technical: TechnicalInfo(
            maxKw: 60,
            generators: true,
            aerialLadder: false,
            cooking: "induzione",
            heavyVehicleAccess: true,
            notes: "Quadro elettrico dedicato in cucina."
        ),
        accessibilityRating: 4,
        accessibilityNotes: "Rampa d'accesso al piano nobile; ascensore per la terrazza.",
        availabilityRules: "Solo weekend da ottobre ad aprile.",
        smartTags: ["gala_dinner", "feste", "conferenze"],
        impressions: "Molto scenografica al tramonto, referente disponibile.",
        children: [ristoranteFiglio],
        spaces: [salaGrande, terrazza],
        contacts: [
            LocationContact(
                contactId: "ct-1",
                firstName: "Giulia",
                lastName: "Martini",
                email: "giulia@ilcipresso.it",
                phone: "+39 055 123456",
                role: "event manager",
                companyId: "co-1",
                companyName: "Il Cipresso Srl"
            )
        ],
        suppliers: [
            LocationSupplier(
                id: "ls-1",
                companyId: "co-2",
                companyName: "Toscana Catering",
                contactId: nil,
                category: "catering",
                requirement: "obbligatorio",
                conditions: "Esclusiva, listino 2026.",
                rating: 4.5
            ),
            LocationSupplier(
                id: "ls-2",
                companyId: "co-3",
                companyName: "AVL Firenze",
                contactId: nil,
                category: "service_avl",
                requirement: "consigliato",
                conditions: nil,
                rating: nil
            )
        ],
        media: nil,
        priceLists: [
            PriceList(
                id: "pl-1",
                name: "Listino 2026",
                validFrom: "2026-01-01",
                validTo: "2026-12-31",
                items: [
                    PriceItem(voce: "Affitto sala (giorno)", prezzo: 4500, unita: "giorno", note: nil, stagionalita: "alta"),
                    PriceItem(voce: "Pulizie finali", prezzo: 350, unita: "forfait", note: nil, stagionalita: nil)
                ],
                paymentTerms: PaymentTerms(accontoPct: 30, saldo: "7 giorni prima dell'evento", metodi: ["bonifico"]),
                extractedByAi: true
            )
        ],
        usageSummary: UsageSummary(proposta: true, utilizzata: true, entries: nil),
        createdAt: "2026-05-02T10:00:00Z",
        updatedAt: "2026-06-20T16:30:00Z"
    )

    static let locations: [Location] = [location, ristoranteFiglio]

    // MARK: Smart-tag registry

    static let tags: [Tag] = [
        Tag(id: "tag-1", name: "gala_dinner", color: "#8E44AD"),
        Tag(id: "tag-2", name: "conferenze", color: "#2980B9"),
        Tag(id: "tag-3", name: "feste", color: "#E67E22"),
        Tag(id: "tag-4", name: "lunch", color: nil),
        Tag(id: "tag-5", name: "wedding", color: "#27AE60")
    ]

    static let usage: [UsageEntry] = [
        UsageEntry(
            project: EntityRef(id: "pr-1", name: "Convention ACME 2026"),
            event: EntityRef(id: "ev-1", name: "Cena di gala"),
            status: .utilizzata,
            dates: .string("12–13 settembre 2026")
        ),
        UsageEntry(
            project: EntityRef(id: "pr-2", name: "Kickoff Beta SpA"),
            event: EntityRef(id: "ev-9", name: "Party di chiusura"),
            status: .proposta,
            dates: .string("marzo 2026")
        )
    ]

    static let history: [HistoryEntry] = [
        HistoryEntry(kind: "site_visit", date: "2026-05-10", title: "Sopralluogo con cliente", details: "Esito positivo, verificare potenza."),
        HistoryEntry(kind: "quote", date: "2026-05-18", title: "Preventivo ricevuto", details: "4.500 € affitto sala"),
        HistoryEntry(kind: "event", date: "2026-09-12", title: "Cena di gala ACME", details: "180 pax, tavoli tondi")
    ]

    // MARK: Projects & events

    static let event = Event(
        id: "ev-1",
        projectId: "pr-1",
        name: "Cena di gala",
        eventType: "gala_dinner",
        dateStart: "2026-09-12",
        dateEnd: "2026-09-12",
        pax: 180,
        brief: "Cena di gala per 180 ospiti, tavoli tondi, vista su Firenze, budget medio-alto.",
        notes: nil,
        sort: 1,
        locationCounts: ["proposta": 2, "in_valutazione": 1, "confermata": 1],
        tags: ["vip", "serale"]
    )

    static let event2 = Event(
        id: "ev-2",
        projectId: "pr-1",
        name: "Sessione plenaria",
        eventType: "conferenza",
        dateStart: "2026-09-13",
        dateEnd: "2026-09-13",
        pax: 250,
        brief: "Plenaria con platea da 250, regia audio/video completa.",
        notes: nil,
        sort: 2,
        locationCounts: ["preselezionata": 3]
    )

    static let project = Project(
        id: "pr-1",
        name: "Convention ACME 2026",
        clientName: "ACME S.p.A.",
        status: .attivo,
        notes: "Tre giorni a Firenze, 250 partecipanti.",
        events: [event, event2],
        tags: ["convention", "firenze"]
    )

    static let projects: [Project] = [
        project,
        Project(id: "pr-2", name: "Kickoff Beta SpA", clientName: "Beta SpA", status: .attivo, notes: nil, events: nil),
        Project(id: "pr-3", name: "Natale Gamma 2025", clientName: "Gamma Srl", status: .chiuso, notes: nil, events: nil)
    ]

    static let eventLocation = EventLocation(
        id: "el-1",
        eventId: "ev-1",
        locationId: "loc-1",
        status: .inValutazione,
        matchScore: 87,
        matchReasons: MatchReasons(
            matched: ["capienza 180 a tavoli tondi", "vista panoramica", "cucina interna"],
            unmatched: ["budget oltre soglia"],
            toVerify: ["disponibilità 12 settembre"]
        ),
        clientFeedback: "Al cliente piace molto la terrazza.",
        notes: nil,
        location: location,
        visits: [
            SiteVisit(id: "sv-1", scheduledAt: "2026-07-15T10:30:00Z", durationMin: 90, attendees: "Fili, Giulia (venue)", withClient: true, outcome: nil)
        ],
        quotes: [
            Quote(id: "q-1", amount: 4500, currency: "EUR", status: .ricevuto, receivedAt: "2026-06-28", validUntil: "2026-07-31", notes: "Include pulizie")
        ],
        availability: [
            AvailabilitySlot(id: "av-1", date: "2026-09-12", timeFrom: nil, timeTo: nil, status: .opzionata, optionExpiresAt: "2026-07-20", notes: nil)
        ]
    )

    static let eventLocations: [EventLocation] = [
        eventLocation,
        EventLocation(
            id: "el-2",
            eventId: "ev-1",
            locationId: "loc-2",
            status: .proposta,
            matchScore: 74,
            matchReasons: MatchReasons(matched: ["cucina toscana"], unmatched: ["capienza limitata"], toVerify: nil),
            clientFeedback: nil,
            notes: nil,
            location: ristoranteFiglio,
            visits: nil,
            quotes: nil,
            availability: nil
        )
    ]

    // MARK: Search

    static let searchResults: [SearchResult] = [
        SearchResult(
            location: location,
            score: 87,
            reasons: MatchReasons(
                matched: ["capienza 180 tavoli tondi", "terrazza panoramica"],
                unmatched: ["fuori budget"],
                toVerify: ["disponibilità settembre"]
            ),
            distances: [DistanceInfo(poi: "Aeroporto Firenze Peretola", km: 12.4, minutesCar: 25)]
        ),
        SearchResult(
            location: ristoranteFiglio,
            score: 64,
            reasons: MatchReasons(matched: ["cucina interna"], unmatched: ["capienza insufficiente"], toVerify: nil),
            distances: nil
        )
    ]

    // MARK: Ingestion

    static let draft = ExtractedLocationDraft(
        confidence: 0.87,
        location: [
            "name": .string("Villa Il Cipresso"),
            "city": .string("Fiesole"),
            "summary": .string("Villa rinascimentale con vista su Firenze."),
            "accessibility_rating": .number(4),
            "smart_tags": .array([.string("gala_dinner"), .string("feste")])
        ],
        spaces: [
            DraftSpace(kind: "interno", name: "Sala Grande", areaSqm: 420, capacities: ["tavoli_tondi": 180, "in_piedi": 300])
        ],
        contacts: [
            DraftContact(firstName: "Giulia", lastName: "Martini", role: "event manager", phone: "+39 055 123456", email: "giulia@ilcipresso.it", companyName: "Il Cipresso Srl")
        ],
        suppliers: [
            DraftSupplier(companyName: "Toscana Catering", category: "catering", requirement: "obbligatorio")
        ],
        priceItems: [
            PriceItem(voce: "Affitto sala", prezzo: 4500, unita: "giorno", note: nil, stagionalita: nil)
        ],
        openQuestions: ["Chiedere potenza massima disponibile", "Verificare orario limite musica esterna"],
        fieldSources: ["locations.name": "audio 00:12", "locations.accessibility_rating": "audio 02:47"]
    )

    static let ingestionJob = IngestionJob(
        id: "job-1",
        locationId: nil,
        sourceType: .audio,
        sourceUrl: nil,
        rawText: "Siamo a Villa Il Cipresso a Fiesole...",
        status: .ready,
        extracted: draft,
        error: nil,
        createdAt: "2026-07-05T09:00:00Z",
        appliedAt: nil
    )

    // MARK: Registry

    static let contacts: [Contact] = [
        Contact(id: "ct-1", firstName: "Giulia", lastName: "Martini", email: "giulia@ilcipresso.it", phone: "+39 055 123456", notes: "Event manager di Villa Il Cipresso"),
        Contact(id: "ct-2", firstName: "Marco", lastName: "Rossi", email: "marco@toscanacatering.it", phone: "+39 055 654321", notes: nil)
    ]

    static let companies: [Company] = [
        Company(id: "co-1", name: "Il Cipresso Srl", kind: .gestione, supplierCategories: nil, vatNumber: "IT01234567890", email: "info@ilcipresso.it", phone: nil, website: "https://ilcipresso.it", notes: nil),
        Company(id: "co-2", name: "Toscana Catering", kind: .fornitore, supplierCategories: ["catering"], vatNumber: nil, email: nil, phone: nil, website: nil, notes: "Esclusivista in villa")
    ]

    // MARK: Map

    static let geoCollection = GeoFeatureCollection(
        type: "FeatureCollection",
        features: [
            GeoFeature(
                type: "Feature",
                geometry: GeoGeometry(type: "Point", coordinates: [11.2939, 43.8067]),
                properties: ["name": .string("Villa Il Cipresso"), "status": .string("in_valutazione")]
            ),
            GeoFeature(
                type: "Feature",
                geometry: GeoGeometry(type: "Point", coordinates: [11.2550, 43.7696]),
                properties: ["name": .string("Palazzo dei Congressi"), "status": .string("proposta")]
            )
        ]
    )
}
