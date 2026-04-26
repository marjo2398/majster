<?php
header('Content-Type: application/json');

$db_file = __DIR__ . '/database.sqlite';
$db = new PDO('sqlite:' . $db_file);
$db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Initialize DB
$db->exec("CREATE TABLE IF NOT EXISTS telemetry_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    location TEXT,
    hours REAL,
    locked_rate REAL
)");

$db->exec("CREATE TABLE IF NOT EXISTS system_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rate REAL,
    token TEXT,
    password TEXT
)");

// Check if settings exist
$stmt = $db->query("SELECT COUNT(*) FROM system_settings");
if ($stmt->fetchColumn() == 0) {
    $default_password = password_hash('admin', PASSWORD_DEFAULT);
    $db->exec("INSERT INTO system_settings (rate, token, password) VALUES (1.0, '', '$default_password')");
}

$action = $_GET['action'] ?? '';
$data = json_decode(file_get_contents('php://input'), true) ?? [];

function getSettings($db) {
    $stmt = $db->query("SELECT * FROM system_settings LIMIT 1");
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function verifyAuth($db, $token) {
    if (empty($token)) return false;
    $settings = getSettings($db);
    return hash_equals($settings['token'], $token);
}

switch ($action) {
    case 'login':
        $password = $data['password'] ?? '';
        $settings = getSettings($db);
        if (password_verify($password, $settings['password'])) {
            $token = bin2hex(random_bytes(16));
            $stmt = $db->prepare("UPDATE system_settings SET token = ?");
            $stmt->execute([$token]);
            echo json_encode(['success' => true, 'token' => $token]);
        } else {
            echo json_encode(['success' => false, 'message' => 'Autoryzacja odrzucona.']);
        }
        break;

    case 'check_auth':
        $token = $data['token'] ?? '';
        $is_auth = verifyAuth($db, $token);
        echo json_encode(['auth' => $is_auth]);
        break;

    case 'get_logs':
        $token = $_GET['token'] ?? '';
        $is_auth = verifyAuth($db, $token);

        if ($is_auth) {
            // Admin: All logs
            $stmt = $db->query("SELECT * FROM telemetry_logs ORDER BY date DESC, id DESC");
            $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $settings = getSettings($db);
            echo json_encode(['success' => true, 'logs' => $logs, 'rate' => $settings['rate']]);
        } else {
            // Guest: Current week only
            // Current week from Monday to Sunday
            $monday = date('Y-m-d', strtotime('monday this week'));
            $sunday = date('Y-m-d', strtotime('sunday this week'));

            $stmt = $db->prepare("SELECT id, date, location, hours FROM telemetry_logs WHERE date >= ? AND date <= ? ORDER BY date DESC, id DESC");
            $stmt->execute([$monday, $sunday]);
            $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);

            echo json_encode(['success' => true, 'logs' => $logs]);
        }
        break;

    case 'add_log':
        $token = $data['token'] ?? '';
        if (!verifyAuth($db, $token)) {
            echo json_encode(['success' => false, 'message' => 'Brak uprawnień.']);
            exit;
        }

        $location = $data['location'] ?? '';
        $date = $data['date'] ?? date('Y-m-d');
        $start_time = $data['start_time'] ?? '';
        $end_time = $data['end_time'] ?? '';

        if (empty($location) || empty($start_time) || empty($end_time)) {
            echo json_encode(['success' => false, 'message' => 'Brakujące dane telemetryczne.']);
            exit;
        }

        $start = strtotime($start_time);
        $end = strtotime($end_time);

        if ($end < $start) {
            $end += 24 * 3600; // Next day
        }

        $diff_seconds = $end - $start;
        $hours = $diff_seconds / 3600;

        if ($hours < 1) {
            echo json_encode(['success' => false, 'message' => 'BŁĄD: Szum telemetryczny. Czas stabilizacji < 60 min. Orbita odrzucona.']);
            exit;
        }

        $settings = getSettings($db);
        $locked_rate = $settings['rate'];

        $stmt = $db->prepare("INSERT INTO telemetry_logs (date, location, hours, locked_rate) VALUES (?, ?, ?, ?)");
        $stmt->execute([$date, $location, $hours, $locked_rate]);

        echo json_encode(['success' => true]);
        break;

    case 'update_rate':
        $token = $data['token'] ?? '';
        if (!verifyAuth($db, $token)) {
            echo json_encode(['success' => false, 'message' => 'Brak uprawnień.']);
            exit;
        }

        $rate = (float)($data['rate'] ?? 1.0);
        $stmt = $db->prepare("UPDATE system_settings SET rate = ?");
        $stmt->execute([$rate]);

        echo json_encode(['success' => true]);
        break;

    case 'delete_log':
        $token = $data['token'] ?? '';
        if (!verifyAuth($db, $token)) {
            echo json_encode(['success' => false, 'message' => 'Brak uprawnień.']);
            exit;
        }

        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'message' => 'Brak identyfikatora logu.']);
            exit;
        }

        $stmt = $db->prepare("DELETE FROM telemetry_logs WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(['success' => true]);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Nieznana komenda.']);
        break;
}
