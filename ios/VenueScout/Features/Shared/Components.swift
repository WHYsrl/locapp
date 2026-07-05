import SwiftUI

// MARK: - Small reusable UI pieces (Italian labels live in callers)

/// Rounded tag chip.
struct TagChip: View {
    let text: String
    var tint: Color = .accentColor

    var body: some View {
        Text(text)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.15), in: Capsule())
            .foregroundStyle(tint)
    }
}

/// Colored status badge (visit status, shortlist status, project status...).
struct StatusBadge: View {
    let text: String
    var color: Color = .gray

    var body: some View {
        Text(text)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}

/// 1...5 stars, optionally tappable for editing.
struct StarRatingView: View {
    let rating: Int
    var maximum: Int = 5
    var onTap: ((Int) -> Void)? = nil

    var body: some View {
        HStack(spacing: 3) {
            ForEach(1...maximum, id: \.self) { index in
                Image(systemName: index <= rating ? "star.fill" : "star")
                    .foregroundStyle(index <= rating ? Color.yellow : Color.secondary)
                    .onTapGesture {
                        onTap?(index)
                    }
            }
        }
        .font(onTap == nil ? .caption : .title3)
    }
}

/// Match score presented as a percentage badge.
struct ScoreBadge: View {
    let score: Double

    private var color: Color {
        if score >= 80 { return .green }
        if score >= 60 { return .orange }
        return .red
    }

    var body: some View {
        Text("\(Int(score.rounded()))%")
            .font(.subheadline.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.18), in: RoundedRectangle(cornerRadius: 8))
            .foregroundStyle(color)
    }
}

/// Key/value row used across detail screens.
struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .multilineTextAlignment(.trailing)
        }
        .font(.subheadline)
    }
}

/// Horizontal scroll of reason chips for search results.
struct ReasonChips: View {
    let reasons: MatchReasons

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(reasons.matched ?? [], id: \.self) { reason in
                    TagChip(text: "✓ " + reason, tint: .green)
                }
                ForEach(reasons.toVerify ?? [], id: \.self) { reason in
                    TagChip(text: "? " + reason, tint: .orange)
                }
                ForEach(reasons.unmatched ?? [], id: \.self) { reason in
                    TagChip(text: "✕ " + reason, tint: .red)
                }
            }
        }
    }
}

extension EventLocationStatus {
    var tintColor: Color {
        switch self {
        case .preselezionata: .gray
        case .proposta: .blue
        case .sopralluogoFissato: .teal
        case .inValutazione: .orange
        case .preferita: .purple
        case .scartata: .red
        case .confermata: .green
        case .utilizzata: .green
        }
    }
}

extension VisitStatus {
    var tintColor: Color {
        switch self {
        case .daVisitare: .orange
        case .visitata: .green
        }
    }
}

#Preview("Componenti") {
    VStack(alignment: .leading, spacing: 16) {
        HStack {
            TagChip(text: "gala_dinner")
            TagChip(text: "feste", tint: .purple)
        }
        HStack {
            StatusBadge(text: "Visitata", color: .green)
            StatusBadge(text: "In valutazione", color: .orange)
        }
        StarRatingView(rating: 4)
        ScoreBadge(score: 87)
        InfoRow(label: "Città", value: "Fiesole")
        ReasonChips(reasons: MatchReasons(
            matched: ["capienza ok"],
            unmatched: ["fuori budget"],
            toVerify: ["date"]
        ))
    }
    .padding()
}
