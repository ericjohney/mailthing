import Foundation

struct CodeMail: Decodable {
    let id: String
    let senderEmail: String
    let subject: String
    let text: String
    let receivedAt: Double
}

struct VerificationCode: Identifiable, Equatable {
    let id: String
    let code: String
    let domain: String
    let expiresAt: Date

    func matches(_ service: String) -> Bool {
        let host = (URL(string: service)?.host ?? service).lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return host == domain || host.hasSuffix("." + domain) || domain.hasSuffix("." + host)
    }

    static func extract(from mail: CodeMail, now: Date = Date()) -> VerificationCode? {
        let received = Date(timeIntervalSince1970: mail.receivedAt / 1000)
        guard received <= now, now.timeIntervalSince(received) < 600,
              !["re:", "fw:", "fwd:"].contains(where: { mail.subject.lowercased().hasPrefix($0) }),
              let domain = mail.senderEmail.split(separator: "@").last.map({ String($0).lowercased() }),
              mail.senderEmail.filter({ $0 == "@" }).count == 1,
              domain.contains("."), domain.split(separator: ".", omittingEmptySubsequences: false).allSatisfy({ !$0.isEmpty && $0.count <= 63 && !$0.hasPrefix("-") && !$0.hasSuffix("-") }),
              domain.utf8.allSatisfy({ (97...122).contains($0) || (48...57).contains($0) || $0 == 45 || $0 == 46 }) else { return nil }
        // Ignore quoted replies and keep all work bounded, including untrusted mail.
        let body = mail.text.prefix(12000).components(separatedBy: .newlines)
            .prefix(while: { !$0.trimmingCharacters(in: .whitespaces).hasPrefix(">") }).joined(separator: "\n")
        let input = String(mail.subject.prefix(500)) + "\n" + body
        let cue = #"(?:verification\s+code|security\s+code|authentication\s+code|(?:one[\s-]*time|sign[\s-]*in|log[\s-]*in)\s+(?:code|password|passcode)|passcode|\bOTP\b)"#
        let patterns = [
            cue + #"[\s:：#–—-]*(?:is[\s:：]*)?(?<![0-9A-Za-z])([0-9]{4,8})(?![0-9A-Za-z])"#,
            #"(?<![0-9A-Za-z])([0-9]{4,8})(?![0-9A-Za-z])\s+(?:is\s+)?(?:your\s+)?"# + cue,
            #"(?<![0-9A-Za-z])([0-9]{4,8})(?![0-9A-Za-z])\s+is\s+your\s+[A-Za-z][A-Za-z .'-]{0,30}\s+"# + cue
        ]
        var codes = Set<String>()
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { continue }
            for match in regex.matches(in: input, range: NSRange(input.startIndex..., in: input)) {
                if let range = Range(match.range(at: 1), in: input) { codes.insert(String(input[range])) }
            }
        }
        guard codes.count == 1, let code = codes.first else { return nil }
        var lifetime: TimeInterval = 600
        if let regex = try? NSRegularExpression(pattern: #"(?:expires?|valid)\s+(?:in|for)\s+([0-9]{1,3})\s*(minutes?|mins?|seconds?|secs?)"#, options: [.caseInsensitive]),
           let match = regex.firstMatch(in: input, range: NSRange(input.startIndex..., in: input)),
           let number = Range(match.range(at: 1), in: input), let unit = Range(match.range(at: 2), in: input),
           let value = Double(input[number]) {
            lifetime = min(lifetime, value * (input[unit].lowercased().hasPrefix("m") ? 60 : 1))
        }
        let expiry = received.addingTimeInterval(lifetime)
        guard now < expiry else { return nil }
        return VerificationCode(id: mail.id, code: code, domain: domain, expiresAt: expiry)
    }
}

enum CodeMailbox {
    static let appGroup = "group.com.ericjohney.mailthing"
    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func configure(server: URL) {
        guard let defaults else { return }
        if defaults.string(forKey: "server") != server.absoluteString {
            defaults.removeObject(forKey: "usedCodes")
            defaults.removeObject(forKey: "codeServices")
        }
        defaults.set(server.absoluteString, forKey: "server")
    }

    static func serverURL() throws -> URL {
        guard let value = defaults?.string(forKey: "server"), let url = URL(string: value),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/",
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host)) else {
            throw CodeMailboxError(message: "Open Mailthing and connect to your mailbox first.")
        }
        return url
    }

    static func identityID(domain: String, server: URL) -> String { server.absoluteString + "#service:" + domain }

    /// Keep bounded domain metadata so a subsequent code can be fetched with the
    /// host closed. No code or message body is persisted in the identity index.
    static func updateServices(with codes: [VerificationCode], now: Date = Date()) -> [String] {
        let previous = defaults?.dictionary(forKey: "codeServices") as? [String: Double] ?? [:]
        let services = refreshedServices(previous, codes: codes, now: now)
        defaults?.set(services, forKey: "codeServices")
        return services.keys.sorted()
    }

    static func refreshedServices(_ previous: [String: Double], codes: [VerificationCode], now: Date) -> [String: Double] {
        var services = previous.filter { $0.value > now.addingTimeInterval(-30 * 86400).timeIntervalSince1970 && $0.value <= now.timeIntervalSince1970 }
        for code in codes { services[code.domain] = now.timeIntervalSince1970 }
        return Dictionary(uniqueKeysWithValues: services.sorted {
            $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value
        }.prefix(100).map { ($0.key, $0.value) })
    }

    static func recordID(_ code: VerificationCode, server: URL) -> String { server.absoluteString + "#" + code.id }

    static func consume(_ code: VerificationCode, server: URL) {
        var used = usedCodes()
        used[recordID(code, server: server)] = code.expiresAt.timeIntervalSince1970
        defaults?.set(used, forKey: "usedCodes")
    }

    private static func usedCodes(now: Date = Date()) -> [String: Double] {
        (defaults?.dictionary(forKey: "usedCodes") as? [String: Double] ?? [:]).filter { $0.value > now.timeIntervalSince1970 }
    }

    static func fetch(server: URL, session: URLSession? = nil, now: Date = Date()) async throws -> [VerificationCode] {
        var request = URLRequest(url: server.appendingPathComponent("api/autofill/messages"))
        request.timeoutInterval = 8
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let client = session ?? URLSession(configuration: .ephemeral)
        defer { if session == nil { client.invalidateAndCancel() } }
        let (data, response) = try await client.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw CodeMailboxError(message: "Couldn't load codes. Check your connection and update your Mailthing server.")
        }
        struct Page: Decodable { let messages: [CodeMail] }
        let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase
        let messages = try decoder.decode(Page.self, from: data).messages
        let used = usedCodes(now: now)
        var domains = Set<String>()
        return messages.prefix(40).compactMap { VerificationCode.extract(from: $0, now: now) }
            .filter { domains.insert($0.domain).inserted && used[recordID($0, server: server)] == nil }
    }
}

struct CodeMailboxError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}
