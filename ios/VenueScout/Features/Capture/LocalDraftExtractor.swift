import Foundation
import FoundationModels

/// On-device pre-extraction of a rough location draft while the server job runs.
/// Uses the Foundation Models framework (Apple Intelligence). Purely a preview:
/// the authoritative draft is always the server's ExtractedLocationDraft.
@Generable
struct LocalLocationDraft: Equatable {
    @Guide(description: "Nome della location; stringa vuota se non indicato")
    var name: String

    @Guide(description: "Città; stringa vuota se non indicata")
    var city: String

    @Guide(description: "Sintesi della location in una frase, in italiano")
    var summary: String

    @Guide(description: "Capienza massima menzionata (persone); 0 se non indicata")
    var maxCapacity: Int

    @Guide(description: "Tag pertinenti tra: conferenze, gala_dinner, lunch, coffee, feste, lancio, shooting, wedding")
    var smartTags: [String]

    @Guide(description: "Domande aperte da chiarire con la location, in italiano")
    var openQuestions: [String]
}

enum LocalDraftExtractor {
    /// True when the on-device model can be used right now.
    static var isAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability {
            return true
        }
        return false
    }

    /// Italian explanation of why the model is unavailable (for graceful fallback UI).
    static var unavailabilityReason: String? {
        switch SystemLanguageModel.default.availability {
        case .available:
            return nil
        case .unavailable(let reason):
            switch reason {
            case .deviceNotEligible:
                return "Modello on-device non disponibile su questo dispositivo."
            case .appleIntelligenceNotEnabled:
                return "Abilita Apple Intelligence nelle Impostazioni per l'anteprima locale."
            case .modelNotReady:
                return "Il modello on-device è in preparazione, riprova tra poco."
            @unknown default:
                return "Modello on-device non disponibile."
            }
        }
    }

    /// Extracts a quick draft from the transcript/notes. Only stated facts.
    static func extract(from text: String) async throws -> LocalLocationDraft {
        let session = LanguageModelSession(instructions: """
            Sei un assistente di un'agenzia eventi. Estrai informazioni su una \
            location per eventi dal testo di un sopralluogo. Riporta SOLO fatti \
            dichiarati esplicitamente nel testo; non inventare nulla. \
            Se un dato manca usa stringa vuota o 0. Contenuti in italiano.
            """)
        let response = try await session.respond(
            to: text,
            generating: LocalLocationDraft.self
        )
        return response.content
    }
}
