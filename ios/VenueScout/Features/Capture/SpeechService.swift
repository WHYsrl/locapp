import AVFoundation
import Foundation
import Observation
import Speech

enum SpeechServiceError: Error {
    case localeNotSupported
    case audioFormatUnavailable
}

/// Live Italian dictation built on the iOS 26 Speech framework
/// (SpeechAnalyzer + SpeechTranscriber, on-device).
/// Shared by CaptureView, BriefSearchView and PostEventFeedbackView.
@MainActor
@Observable
final class SpeechService {
    private(set) var finalizedTranscript: String = ""
    private(set) var volatileTranscript: String = ""
    private(set) var isRecording = false
    private(set) var statusMessage: String?

    var fullTranscript: String {
        (finalizedTranscript + volatileTranscript)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private let audioStreamer = AudioStreamer()
    private var analyzer: SpeechAnalyzer?
    private var transcriber: SpeechTranscriber?
    private var inputContinuation: AsyncStream<AnalyzerInput>.Continuation?
    private var resultsTask: Task<Void, Never>?

    func toggleRecording() {
        Task {
            if isRecording {
                await stop()
            } else {
                await start()
            }
        }
    }

    func reset() {
        finalizedTranscript = ""
        volatileTranscript = ""
        statusMessage = nil
    }

    func start() async {
        guard !isRecording else { return }
        statusMessage = nil

        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            statusMessage = "Permesso microfono negato: abilitalo nelle Impostazioni di sistema."
            return
        }

        do {
            try configureAudioSession()

            let locale = Locale(identifier: "it-IT")
            let transcriber = SpeechTranscriber(
                locale: locale,
                transcriptionOptions: [],
                reportingOptions: [.volatileResults],
                attributeOptions: []
            )
            self.transcriber = transcriber

            try await ensureModelAvailable(for: transcriber, locale: locale)

            let analyzer = SpeechAnalyzer(modules: [transcriber])
            self.analyzer = analyzer

            guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
                compatibleWith: [transcriber]
            ) else {
                statusMessage = "Formato audio non disponibile per la trascrizione."
                throw SpeechServiceError.audioFormatUnavailable
            }

            let (inputSequence, continuation) = AsyncStream<AnalyzerInput>.makeStream()
            inputContinuation = continuation

            // Consume transcription results on the main actor.
            resultsTask = Task { [weak self] in
                do {
                    for try await result in transcriber.results {
                        guard let self else { return }
                        let text = String(result.text.characters)
                        if result.isFinal {
                            self.finalizedTranscript += text
                            self.volatileTranscript = ""
                        } else {
                            self.volatileTranscript = text
                        }
                    }
                } catch {
                    self?.statusMessage = "Errore di trascrizione: \(error.localizedDescription)"
                }
            }

            try await analyzer.start(inputSequence: inputSequence)

            try audioStreamer.start(targetFormat: analyzerFormat) { buffer in
                continuation.yield(AnalyzerInput(buffer: buffer))
            }

            isRecording = true
        } catch {
            if statusMessage == nil {
                statusMessage = "Impossibile avviare la registrazione: \(error.localizedDescription)"
            }
            await teardown()
        }
    }

    func stop() async {
        guard isRecording else { return }
        isRecording = false
        audioStreamer.stop()
        inputContinuation?.finish()
        inputContinuation = nil
        do {
            try await analyzer?.finalizeAndFinishThroughEndOfInput()
        } catch {
            statusMessage = "Errore in chiusura trascrizione: \(error.localizedDescription)"
        }
        await teardown()
        if !volatileTranscript.isEmpty {
            finalizedTranscript += volatileTranscript
            volatileTranscript = ""
        }
    }

    private func teardown() async {
        resultsTask?.cancel()
        resultsTask = nil
        analyzer = nil
        transcriber = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.duckOthers])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
    }

    /// Checks locale support and downloads the on-device model if needed.
    private func ensureModelAvailable(for transcriber: SpeechTranscriber, locale: Locale) async throws {
        let supported = await SpeechTranscriber.supportedLocales
        guard supported.contains(where: {
            $0.identifier(.bcp47) == locale.identifier(.bcp47)
        }) else {
            statusMessage = "La trascrizione in italiano non è supportata su questo dispositivo."
            throw SpeechServiceError.localeNotSupported
        }

        let installed = await SpeechTranscriber.installedLocales
        let alreadyInstalled = installed.contains {
            $0.identifier(.bcp47) == locale.identifier(.bcp47)
        }
        if !alreadyInstalled {
            if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
                statusMessage = "Scarico il modello di trascrizione…"
                try await request.downloadAndInstall()
                statusMessage = nil
            }
        }
    }
}

/// Captures microphone audio with AVAudioEngine, converts it to the analyzer's
/// preferred format and forwards buffers. The tap callback runs on an audio
/// thread, hence the @unchecked Sendable + serial usage.
final class AudioStreamer: @unchecked Sendable {
    private let engine = AVAudioEngine()
    private var converter: AVAudioConverter?

    func start(
        targetFormat: AVAudioFormat,
        onBuffer: @escaping @Sendable (AVAudioPCMBuffer) -> Void
    ) throws {
        let input = engine.inputNode
        let inputFormat = input.outputFormat(forBus: 0)
        converter = AVAudioConverter(from: inputFormat, to: targetFormat)

        input.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) { [weak self] buffer, _ in
            guard let self else { return }
            if let converted = self.convert(buffer, to: targetFormat) {
                onBuffer(converted)
            }
        }

        engine.prepare()
        try engine.start()
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        converter = nil
    }

    private func convert(_ buffer: AVAudioPCMBuffer, to format: AVAudioFormat) -> AVAudioPCMBuffer? {
        if buffer.format == format {
            return buffer
        }
        guard let converter else { return nil }
        let ratio = format.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
        guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else {
            return nil
        }
        var provided = false
        var conversionError: NSError?
        let status = converter.convert(to: output, error: &conversionError) { _, outStatus in
            if provided {
                outStatus.pointee = .noDataNow
                return nil
            }
            provided = true
            outStatus.pointee = .haveData
            return buffer
        }
        guard status != .error else { return nil }
        return output
    }
}
