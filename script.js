const API_URL = 'api.php';
let authToken = localStorage.getItem('uplink_token') || '';

// DOM Elements
const adminPanel = document.getElementById('admin-panel');
const guestPanel = document.getElementById('guest-panel');
const uplinkStatus = document.getElementById('uplink-status');
const btnLoginModal = document.getElementById('btn-login-modal');
const btnLogout = document.getElementById('btn-logout');
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const btnCloseModal = document.getElementById('btn-close-modal');
const errorMsg = document.getElementById('error-message');
const successMsg = document.getElementById('success-message');
const telemetryForm = document.getElementById('telemetry-form');
const rateForm = document.getElementById('rate-form');

function showMessage(msg, isError = false) {
    const target = isError ? errorMsg : successMsg;
    target.textContent = msg;
    target.style.display = 'block';
    setTimeout(() => { target.style.display = 'none'; }, 5000);
}

async function apiCall(action, payload = null) {
    let url = `${API_URL}?action=${action}`;
    if (action === 'get_logs' && authToken) {
        url += `&token=${authToken}`;
    }

    const options = {
        method: payload ? 'POST' : 'GET'
    };

    if (payload) {
        if (authToken) payload.token = authToken;
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(payload);
    }

    try {
        const response = await fetch(url, options);
        return await response.json();
    } catch (err) {
        showMessage('BŁĄD SYSTEMU: Utrata połączenia telemetrycznego.', true);
        return { success: false };
    }
}

async function init() {
    if (authToken) {
        const res = await apiCall('check_auth', { token: authToken });
        if (res.auth) {
            setAdminMode(true);
        } else {
            setAdminMode(false);
            localStorage.removeItem('uplink_token');
            authToken = '';
        }
    } else {
        setAdminMode(false);
    }
    loadData();
}

function setAdminMode(isAdmin) {
    if (isAdmin) {
        adminPanel.style.display = 'block';
        guestPanel.style.display = 'none';
        uplinkStatus.textContent = 'DOWÓDCA (ADMIN)';
        uplinkStatus.style.color = '#fff';
        btnLoginModal.style.display = 'none';
        btnLogout.style.display = 'inline-block';
    } else {
        adminPanel.style.display = 'none';
        guestPanel.style.display = 'block';
        uplinkStatus.textContent = 'GOŚĆ';
        uplinkStatus.style.color = 'var(--text-color)';
        btnLoginModal.style.display = 'inline-block';
        btnLogout.style.display = 'none';
    }
}

async function loadData() {
    const res = await apiCall('get_logs');
    if (!res.success) return;

    if (authToken) {
        // Admin View
        const tbody = document.getElementById('admin-table-body');
        tbody.innerHTML = '';
        let totalVal = 0;

        document.getElementById('rate-multiplier').value = res.rate;

        res.logs.forEach(log => {
            const tr = document.createElement('tr');
            const result = (log.hours * log.locked_rate).toFixed(2);
            totalVal += parseFloat(result);

            tr.innerHTML = `
                <td>${log.date}</td>
                <td>${log.location}</td>
                <td>${parseFloat(log.hours).toFixed(2)}</td>
                <td>${log.locked_rate}</td>
                <td>${result}</td>
            `;
            tbody.appendChild(tr);
        });
        document.getElementById('total-archive-value').textContent = totalVal.toFixed(2);

    } else {
        // Guest View
        const tbody = document.getElementById('guest-table-body');
        tbody.innerHTML = '';
        let totalHours = 0;

        res.logs.forEach(log => {
            const tr = document.createElement('tr');
            totalHours += parseFloat(log.hours);

            tr.innerHTML = `
                <td>${log.date}</td>
                <td>${log.location}</td>
                <td>${parseFloat(log.hours).toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('guest-total-hours').textContent = totalHours.toFixed(2);
        document.getElementById('guest-summary').style.display = 'block';
    }
}

// Event Listeners
btnLoginModal.addEventListener('click', () => { loginModal.style.display = 'flex'; });
btnCloseModal.addEventListener('click', () => { loginModal.style.display = 'none'; });

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const res = await apiCall('login', { password });
    if (res.success) {
        authToken = res.token;
        localStorage.setItem('uplink_token', authToken);
        loginModal.style.display = 'none';
        document.getElementById('password').value = '';
        setAdminMode(true);
        loadData();
        showMessage('AUTORYZACJA ZAKOŃCZONA SUKCESEM.');
    } else {
        showMessage(res.message || 'BŁĄD AUTORYZACJI', true);
    }
});

btnLogout.addEventListener('click', () => {
    authToken = '';
    localStorage.removeItem('uplink_token');
    setAdminMode(false);
    loadData();
    showMessage('UPLINK ZAMKNIĘTY.');
});

telemetryForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const location = document.getElementById('location').value;
    const date = document.getElementById('date').value;
    const start_time = document.getElementById('start_time').value;
    const end_time = document.getElementById('end_time').value;

    // Local JS Validation
    const start = new Date(`1970-01-01T${start_time}:00Z`);
    let end = new Date(`1970-01-01T${end_time}:00Z`);

    if (end < start) {
        end.setDate(end.getDate() + 1);
    }

    const diffMins = (end - start) / 60000;

    if (diffMins < 60) {
        showMessage('BŁĄD: Szum telemetryczny. Czas stabilizacji < 60 min. Orbita odrzucona.', true);
        return;
    }

    const res = await apiCall('add_log', { location, date, start_time, end_time });
    if (res.success) {
        showMessage('ORBITA PARKINGOWA ZATWIERDZONA.');
        telemetryForm.reset();
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        loadData();
    } else {
        showMessage(res.message || 'BŁĄD WYSYŁANIA DANYCH', true);
    }
});

rateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rate = document.getElementById('rate-multiplier').value;
    const res = await apiCall('update_rate', { rate });
    if (res.success) {
        showMessage('WSPÓŁCZYNNIK ZAKTUALIZOWANY.');
        loadData();
    } else {
        showMessage(res.message || 'BŁĄD ZAPISU', true);
    }
});

// Setup defaults
document.getElementById('date').value = new Date().toISOString().split('T')[0];
init();
