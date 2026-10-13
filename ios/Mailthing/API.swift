import Foundation

struct APIError: LocalizedError {
    var message: String
    var errorDescription: String? { message }
}
struct EmptyReply: Decodable {}
struct MailAPI {
    var baseURL: URL
    var session: URLSession = .shared
    static func serverURL(_ value: String) throws -> URL {
        guard let url = URL(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/",
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1", "::1"].contains(host)) else {
            throw APIError(message: "Enter an HTTPS server address, such as https://mailthing.ericj5.com.")
        }
        return url
    }
    func request<T: Decodable>(_ path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil) async throws -> T {
        let data = try await data(path, query: query, method: method, body: body)
        return try JSONDecoder.mailthing.decode(T.self, from: data)
    }
    func data(_ path: String, query: [URLQueryItem] = [], method: String = "GET", body: Data? = nil) async throws -> Data {
        var components = URLComponents(url: baseURL.appendingPathComponent("api").appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError(message: "The server returned an invalid response.") }
        guard (200..<300).contains(http.statusCode) else {
            let detail = (try? JSONSerialization.jsonObject(with: data) as? [String: String])?["error"]
            throw APIError(message: detail ?? "The server returned error \(http.statusCode).")
        }
        return data
    }
    func action(_ id: String, _ action: String, value: String = "", until: Int64? = nil) async throws {
        var body: [String: Any] = ["thread_ids": [id], "action": action, "value": value]
        if let until { body["until"] = until }
        let _: EmptyReply = try await request("actions", method: "POST", body: JSONSerialization.data(withJSONObject: body))
    }
    func sortingMemories() async throws -> [SortingMemory] {
        try await request("sorting/memories")
    }
    func saveSortingMemory(_ id: String, guidance: String, clearExamples: Bool = false) async throws {
        let update = SortingMemoryUpdate(guidance: guidance, clearExamples: clearExamples)
        let _: EmptyReply = try await request("sorting/memories/\(id)", method: "PUT", body: JSONEncoder.mailthing.encode(update))
    }
    func save(_ draft: Draft) async throws {
        let _: EmptyReply = try await request("drafts", method: "POST", body: JSONEncoder.mailthing.encode(draft))
    }
}
