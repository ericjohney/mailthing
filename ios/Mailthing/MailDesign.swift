import SwiftUI

extension Color {
    static let mailAction = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.88, green: 0.90, blue: 0.89, alpha: 1)
            : UIColor(red: 0.16, green: 0.17, blue: 0.18, alpha: 1)
    })
    static let mailOnAction = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.14, green: 0.16, blue: 0.16, alpha: 1)
            : .white
    })
    static let mailSurface = Color(uiColor: .secondarySystemBackground)
    static let mailTint = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.20, green: 0.23, blue: 0.24, alpha: 1)
            : UIColor(red: 0.91, green: 0.93, blue: 0.92, alpha: 1)
    })
}

/// The folded m uses the same geometry as web/public/brand/mailthing-mark.svg.
struct MailMark: View {
    var size: CGFloat = 26
    var body: some View {
        RoundedRectangle(cornerRadius: size * 13 / 48)
            .fill(Color(red: 0.16, green: 0.17, blue: 0.18))
            .overlay {
                FoldedM().stroke(.white, style: StrokeStyle(lineWidth: size * 6 / 48, lineCap: .round, lineJoin: .round))
            }
            .overlay {
                RoundedRectangle(cornerRadius: size * 13 / 48)
                    .strokeBorder(.primary.opacity(0.12), lineWidth: 0.5)
            }
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }
}

private struct FoldedM: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let points: [CGPoint] = [.init(x: 12, y: 33), .init(x: 12, y: 15), .init(x: 24, y: 25), .init(x: 36, y: 15), .init(x: 36, y: 33)]
        for (index, point) in points.enumerated() {
            let scaled = CGPoint(x: rect.minX + point.x * rect.width / 48, y: rect.minY + point.y * rect.height / 48)
            if index == 0 { path.move(to: scaled) } else { path.addLine(to: scaled) }
        }
        return path
    }
}

struct MailHeader<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) { content }
                .frame(minHeight: 48)
                .padding(.horizontal, 8)
                .background(Color(uiColor: .systemBackground))
            Divider()
        }
    }
}

struct MailIconButton: View {
    let symbol: String
    let label: String
    var emphasized = false
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.body)
                .frame(width: 32, height: 32)
                .foregroundStyle(emphasized ? Color.mailOnAction : Color.mailAction)
                .background(emphasized ? Color.mailAction : .clear, in: RoundedRectangle(cornerRadius: 9))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct MailAccountCard: View {
    let account: Account?
    var body: some View {
        HStack(spacing: 12) {
            MailMark(size: 38)
            VStack(alignment: .leading, spacing: 4) {
                Text(account?.name ?? "Mailthing").font(.headline)
                Text(account?.email ?? "Your personal mailbox").font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
    }
}
