import Foundation
import HealthKit
import WebKit

/// Native iOS Apple HealthKit bridge for the Treise WKWebView app.
///
/// Mirrors `app/src/main/java/com/headstrong/app/HealthConnectBridge.kt` message-for-message so the
/// shared TypeScript bridge (`src/services/healthConnectBridge.ts`) works identically across Android
/// Health Connect and iOS Apple HealthKit (`window.webkit.messageHandlers.treiseHealth`).
///
/// Strictly read-only (`toShare: nil`): reads only workouts, daily step counts, asleep duration,
/// heart rate, resting heart rate, HRV (SDNN in ms), body mass (kg), height (cm), body fat %,
/// biological sex, and birth-year age over the last 29 days, delivering them exclusively to the
/// local WKWebView on the athlete's iPhone.
final class HealthKitBridge: NSObject, WKScriptMessageHandler {
    static let handlerName = "treiseHealth"
    private static let maxLookbackDays = 29

    private let store = HKHealthStore()
    private weak var webView: WKWebView?
    private var requestedAuthorization = false

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
    }

    private var readObjectTypes: Set<HKObjectType> {
        var set: Set<HKObjectType> = [HKObjectType.workoutType()]
        let quantities: [HKQuantityTypeIdentifier] = [
            .stepCount,
            .heartRate,
            .restingHeartRate,
            .heartRateVariabilitySDNN,
            .bodyMass,
            .height,
            .bodyFatPercentage
        ]
        for id in quantities {
            if let qt = HKObjectType.quantityType(forIdentifier: id) {
                set.insert(qt)
            }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            set.insert(sleep)
        }
        if let sex = HKObjectType.characteristicType(forIdentifier: .biologicalSex) {
            set.insert(sex)
        }
        if let dob = HKObjectType.characteristicType(forIdentifier: .dateOfBirth) {
            set.insert(dob)
        }
        return set
    }

    func notifyPageReady() {
        post([
            "type": "hello",
            "version": 5,
            "provider": "apple_health"
        ])
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let raw = message.body as? String,
              let data = raw.data(using: .utf8),
              let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let type = json["type"] as? String else {
            return
        }

        switch type {
        case "status":
            sendStatus()
        case "request-permission":
            requestPermission()
        case "read-sessions":
            let requestId = (json["requestId"] as? String) ?? ""
            let since = parseSince(json["since"] as? String)
            readSessions(requestId: requestId, since: since)
        case "read-steps":
            let requestId = (json["requestId"] as? String) ?? ""
            let since = parseSince(json["since"] as? String)
            readSteps(requestId: requestId, since: since)
        case "read-biometrics":
            let requestId = (json["requestId"] as? String) ?? ""
            let since = parseSince(json["since"] as? String)
            readBiometrics(requestId: requestId, since: since)
        default:
            break
        }
    }

    private func parseSince(_ iso: String?) -> Date {
        let earliest = Calendar.current.date(byAdding: .day, value: -Self.maxLookbackDays, to: Date()) ?? Date()
        guard let iso = iso,
              let parsed = ISO8601DateFormatter().date(from: iso) else {
            return Calendar.current.date(byAdding: .day, value: -14, to: Date()) ?? earliest
        }
        return max(parsed, earliest)
    }

    private func sendStatus() {
        let available = HKHealthStore.isHealthDataAvailable()
        guard available else {
            post([
                "type": "status",
                "provider": "apple_health",
                "available": false,
                "granted": false,
                "stepsGranted": false,
                "biometricsGranted": false,
                "heightGranted": false
            ])
            return
        }

        // Apple HealthKit deliberately hides read-authorization status for privacy; once the user
        // has completed the read-only authorization sheet (`unnecessary`), reads return the allowed categories.
        store.getRequestStatusForAuthorization(toShare: [], read: readObjectTypes) { [weak self] reqStatus, _ in
            guard let self = self else { return }
            let authorized = self.requestedAuthorization || reqStatus == .unnecessary
            self.post([
                "type": "status",
                "provider": "apple_health",
                "available": true,
                "granted": authorized,
                "stepsGranted": authorized,
                "biometricsGranted": authorized,
                "heightGranted": authorized
            ])
        }
    }

    private func requestPermission() {
        guard HKHealthStore.isHealthDataAvailable() else {
            sendStatus()
            return
        }
        store.requestAuthorization(toShare: nil, read: readObjectTypes) { [weak self] success, _ in
            guard let self = self else { return }
            if success {
                self.requestedAuthorization = true
            }
            self.sendStatus()
        }
    }

    private func readSessions(requestId: String, since: Date) {
        guard HKHealthStore.isHealthDataAvailable() else {
            post(["type": "sessions", "requestId": requestId, "error": "Apple Health isn't available on this device"])
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: since, end: Date(), options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            guard let self = self else { return }
            if let error = error {
                self.post(["type": "sessions", "requestId": requestId, "error": error.localizedDescription])
                return
            }
            let iso = ISO8601DateFormatter()
            var out: [[String: Any]] = []
            for case let w as HKWorkout in (samples ?? []) {
                let minutes = Int((w.duration / 60.0).rounded())
                if minutes <= 0 { continue }
                let sport = Self.sportName(for: w.workoutActivityType)
                var row: [String: Any] = [
                    "externalId": w.uuid.uuidString,
                    "sportType": sport,
                    "name": sport,
                    "startedAt": iso.string(from: w.startDate),
                    "minutes": minutes
                ]
                if let dist = w.totalDistance?.doubleValue(for: .meterUnit(with: .kilo)), dist > 0 {
                    row["distanceKm"] = (dist * 100).rounded() / 100
                }
                if #available(iOS 16.0, *),
                   let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate),
                   let avgHr = w.statistics(for: hrType)?.averageQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())),
                   avgHr > 0 {
                    row["avgHeartRate"] = Int(avgHr.rounded())
                }
                out.append(row)
            }
            self.post(["type": "sessions", "requestId": requestId, "sessions": out])
        }
        store.execute(query)
    }

    private func readSteps(requestId: String, since: Date) {
        guard HKHealthStore.isHealthDataAvailable(),
              let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            post(["type": "steps", "requestId": requestId, "days": []])
            return
        }
        let cal = Calendar.current
        let anchor = cal.startOfDay(for: since)
        var interval = DateComponents()
        interval.day = 1
        let predicate = HKQuery.predicateForSamples(withStart: anchor, end: Date(), options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: stepType,
            quantitySamplePredicate: predicate,
            options: .cumulativeSum,
            anchorDate: anchor,
            intervalComponents: interval
        )
        query.initialResultsHandler = { [weak self] _, results, error in
            guard let self = self else { return }
            if let error = error {
                self.post(["type": "steps", "requestId": requestId, "error": error.localizedDescription])
                return
            }
            let fmt = Self.localDateFormatter()
            var days: [[String: Any]] = []
            results?.enumerateStatistics(from: anchor, to: Date()) { stats, _ in
                if let sum = stats.sumQuantity()?.doubleValue(for: .count()), sum > 0 {
                    days.append([
                        "date": fmt.string(from: stats.startDate),
                        "steps": Int(sum.rounded())
                    ])
                }
            }
            self.post(["type": "steps", "requestId": requestId, "days": days])
        }
        store.execute(query)
    }

    private func readBiometrics(requestId: String, since: Date) {
        guard HKHealthStore.isHealthDataAvailable() else {
            post(["type": "biometrics", "requestId": requestId, "days": []])
            return
        }

        let group = DispatchGroup()
        let lock = NSLock()
        var byDate: [String: [String: Any]] = [:]
        var latestHeightCm: Double?
        let fmt = Self.localDateFormatter()

        func mergeDay(_ date: String, _ key: String, _ value: Any) {
            lock.lock()
            var row = byDate[date] ?? ["date": date]
            row[key] = value
            byDate[date] = row
            lock.unlock()
        }

        func readLatestPerDay(_ id: HKQuantityTypeIdentifier, unit: HKUnit, key: String, from startDate: Date, transform: @escaping (Double) -> Any?) {
            guard let qType = HKQuantityType.quantityType(forIdentifier: id) else { return }
            group.enter()
            let pred = HKQuery.predicateForSamples(withStart: startDate, end: Date(), options: .strictStartDate)
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let q = HKSampleQuery(sampleType: qType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
                for case let s as HKQuantitySample in (samples ?? []) {
                    let raw = s.quantity.doubleValue(for: unit)
                    if let mapped = transform(raw) {
                        mergeDay(fmt.string(from: s.startDate), key, mapped)
                    }
                }
                group.leave()
            }
            store.execute(q)
        }

        readLatestPerDay(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), key: "restingHr", from: since) {
            $0 >= 30 && $0 <= 140 ? Int($0.rounded()) : nil
        }
        readLatestPerDay(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), key: "hrvRmssd", from: since) {
            $0 > 0 && $0 < 400 ? Int($0.rounded()) : nil
        }
        readLatestPerDay(.bodyMass, unit: .gramUnit(with: .kilo), key: "bodyweightKg", from: since) {
            $0 >= 25 && $0 <= 300 ? ($0 * 10).rounded() / 10 : nil
        }
        readLatestPerDay(.bodyFatPercentage, unit: .percent(), key: "bodyFatPct", from: since) {
            let pct = $0 <= 1 ? $0 * 100 : $0
            return pct > 1 && pct < 75 ? (pct * 10).rounded() / 10 : nil
        }

        // Height over full lookback
        if let heightType = HKQuantityType.quantityType(forIdentifier: .height) {
            group.enter()
            let earliest = Calendar.current.date(byAdding: .day, value: -Self.maxLookbackDays, to: Date()) ?? since
            let pred = HKQuery.predicateForSamples(withStart: earliest, end: Date(), options: .strictStartDate)
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let q = HKSampleQuery(sampleType: heightType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
                for case let s as HKQuantitySample in (samples ?? []) {
                    let cm = s.quantity.doubleValue(for: .meterUnit(with: .centi))
                    if cm >= 100 && cm <= 250 {
                        lock.lock()
                        latestHeightCm = cm.rounded()
                        lock.unlock()
                        mergeDay(fmt.string(from: s.startDate), "heightCm", Int(cm.rounded()))
                    }
                }
                group.leave()
            }
            store.execute(q)
        }

        // Asleep intervals grouped by wake-up calendar date
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            let pred = HKQuery.predicateForSamples(withStart: since, end: Date(), options: .strictStartDate)
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
                var intervalsByDay: [String: [(Date, Date)]] = [:]
                for case let s as HKCategorySample in (samples ?? []) {
                    if Self.isAsleepValue(s.value) && s.endDate > s.startDate {
                        let dayKey = fmt.string(from: s.endDate)
                        intervalsByDay[dayKey, default: []].append((s.startDate, s.endDate))
                    }
                }
                for (dayKey, intervals) in intervalsByDay {
                    let sorted = intervals.sorted { $0.0 < $1.0 }
                    guard var cur = sorted.first else { continue }
                    var totalSec: TimeInterval = 0
                    for next in sorted.dropFirst() {
                        if next.0 <= cur.1 {
                            cur.1 = max(cur.1, next.1)
                        } else {
                            totalSec += cur.1.timeIntervalSince(cur.0)
                            cur = next
                        }
                    }
                    totalSec += cur.1.timeIntervalSince(cur.0)
                    let hours = ((totalSec / 3600.0) * 10).rounded() / 10
                    if hours > 0 {
                        mergeDay(dayKey, "sleepHours", hours)
                    }
                }
                group.leave()
            }
            store.execute(q)
        }

        group.notify(queue: .main) { [weak self] in
            guard let self = self else { return }
            var profile: [String: Any] = [:]
            if let h = latestHeightCm {
                profile["heightCm"] = Int(h)
            }
            if let sexObj = try? self.store.biologicalSex().biologicalSex {
                if sexObj == .male { profile["gender"] = "male" }
                else if sexObj == .female { profile["gender"] = "female" }
            }
            if let dob = try? self.store.dateOfBirthComponents(),
               let birthDate = Calendar.current.date(from: dob) {
                let years = Calendar.current.dateComponents([.year], from: birthDate, to: Date()).year ?? 0
                if years >= 13 && years <= 110 {
                    profile["age"] = years
                }
            }
            let days = byDate.keys.sorted().compactMap { byDate[$0] }
            var reply: [String: Any] = [
                "type": "biometrics",
                "requestId": requestId,
                "days": days
            ]
            if !profile.isEmpty {
                reply["profile"] = profile
            }
            self.post(reply)
        }
    }

    private static func isAsleepValue(_ raw: Int) -> Bool {
        if #available(iOS 16.0, *) {
            return raw == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue ||
                raw == HKCategoryValueSleepAnalysis.asleepCore.rawValue ||
                raw == HKCategoryValueSleepAnalysis.asleepDeep.rawValue ||
                raw == HKCategoryValueSleepAnalysis.asleepREM.rawValue
        }
        return raw == HKCategoryValueSleepAnalysis.asleep.rawValue
    }

    private static func localDateFormatter() -> DateFormatter {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    private static func sportName(for type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "Running"
        case .cycling: return "Cycling"
        case .walking: return "Walking"
        case .swimming: return "Swimming"
        case .hiking: return "Hiking"
        case .rowing: return "Rowing"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .highIntensityIntervalTraining: return "HIIT"
        case .traditionalStrengthTraining, .functionalStrengthTraining: return "Strength Training"
        default: return "Workout"
        }
    }

    private func post(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let jsonString = String(data: data, encoding: .utf8) else {
            return
        }
        DispatchQueue.main.async { [weak self] in
            let escaped = jsonString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            self?.webView?.evaluateJavaScript("window.__treiseReceiveNativeMessage && window.__treiseReceiveNativeMessage('\(escaped)');", completionHandler: nil)
        }
    }
}
