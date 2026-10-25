import SwiftUI

extension Color {
    static let mailAction = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 0.90, alpha: 1)
            : UIColor(white: 0.19, alpha: 1)
    })
    static let mailOnAction = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 0.13, alpha: 1)
            : .white
    })
    static let mailCanvas = adaptiveGray(light: 0.98, dark: 0.08)
    static let mailSurface = adaptiveGray(light: 0.94, dark: 0.13)
    static let mailDock = adaptiveGray(light: 1, dark: 0.14)
    static let mailBorder = adaptiveGray(light: 0.87, dark: 0.24)
    static let mailTint = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(white: 0.21, alpha: 1)
            : UIColor(white: 0.91, alpha: 1)
    })
    private static func adaptiveGray(light: CGFloat, dark: CGFloat) -> Color {
        Color(uiColor: UIColor { UIColor(white: $0.userInterfaceStyle == .dark ? dark : light, alpha: 1) })
    }
}

struct MailDock<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        HStack(spacing: 8) { content }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color.mailDock, in: RoundedRectangle(cornerRadius: 24))
            .overlay { RoundedRectangle(cornerRadius: 24).strokeBorder(Color.mailBorder, lineWidth: 0.5) }
            .shadow(color: .black.opacity(0.06), radius: 12, y: 4)
            .padding(.horizontal, 14).padding(.top, 8).padding(.bottom, 8)
            .background(Color.mailCanvas)
    }
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
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .frame(width: emphasized ? 40 : 32, height: emphasized ? 40 : 32)
                .foregroundStyle(emphasized ? Color.mailOnAction : Color.mailAction)
                .background(emphasized ? Color.mailAction : .clear, in: RoundedRectangle(cornerRadius: emphasized ? 20 : 9))
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

struct SenderAvatar: View {
    let name: String
    let email: String
    var unread = false
    @ScaledMetric(relativeTo: .body) private var diameter = 36.0
    var body: some View {
        let size = min(diameter, 52)
        Text(SenderInitials.make(name: name, email: email))
            .font(.system(size: size * 0.34, weight: .semibold, design: .rounded))
            .foregroundStyle(Color.mailAction)
            .frame(width: size, height: size)
            .background(Color.mailTint, in: Circle())
            .overlay(alignment: .bottomTrailing) {
                if unread {
                    Circle().fill(Color.mailAction).frame(width: 9, height: 9)
                        .overlay { Circle().stroke(Color.mailCanvas, lineWidth: 2) }
                }
            }
            .accessibilityHidden(true)
    }
}
