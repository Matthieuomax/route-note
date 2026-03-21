// ================================
// ROUTE NOTE - PWA JavaScript
// Version complète avec géolocalisation
// ================================

// ===== ENREGISTREMENT SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker enregistré'))
            .catch(err => console.log('❌ Erreur SW:', err));
    });
}

// ===== SYSTÈME DE STOCKAGE LOCAL =====
class LocalStorage {
    static getUsers() {
        return JSON.parse(localStorage.getItem('users') || '{}');
    }

    static saveUsers(users) {
        localStorage.setItem('users', JSON.stringify(users));
    }

    static createUser(username, password) {
        const users = this.getUsers();
        if (users[username]) {
            throw new Error('Cet identifiant existe déjà');
        }
        users[username] = {
            password: btoa(password),
            createdAt: new Date().toISOString()
        };
        this.saveUsers(users);
    }

    static verifyUser(username, password) {
        const users = this.getUsers();
        const user = users[username];
        if (!user || user.password !== btoa(password)) {
            throw new Error('Identifiant ou mot de passe incorrect');
        }
        return { username };
    }

    static getDeliveries(username) {
        const key = `deliveries_${username}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    }

    static saveDeliveries(username, deliveries) {
        const key = `deliveries_${username}`;
        localStorage.setItem(key, JSON.stringify(deliveries));
    }

    static getSettings(username) {
        const key = `settings_${username}`;
        const defaults = { 
            ratePerKm: 0.50, 
            vehicleInfo: '',
            theme: 'blue'
        };
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaults));
    }

    static saveSettings(username, settings) {
        const key = `settings_${username}`;
        localStorage.setItem(key, JSON.stringify(settings));
    }
}

// ===== VARIABLES GLOBALES =====
let currentUser = null;
let userSettings = { ratePerKm: 0.50, vehicleInfo: '', theme: 'blue' };
let deliveries = [];

// ===== GÉOLOCALISATION - Variables trajet GPS =====
let tripData = {
    active: false,
    startTime: null,
    endTime: null,
    startPos: null,
    currentPos: null,
    watchId: null,
    timerInterval: null,
    distance: 0,
    positions: []
};

// ===== ÉLÉMENTS DOM =====
const authPage = document.getElementById('authPage');
const appPage = document.getElementById('appPage');
const loginForm = document.getElementById('loginForm');
const authError = document.getElementById('authError');
const authSuccess = document.getElementById('authSuccess');

// ===== VÉRIFICATION UTILISATEUR CONNECTÉ =====
const savedUser = localStorage.getItem('currentUser');
if (savedUser) {
    currentUser = JSON.parse(savedUser);
    loadUserData();
    showApp();
}

// ===== INSCRIPTION =====
document.getElementById('switchToRegister').addEventListener('click', () => {
    const username = prompt('Choisissez un identifiant :');
    if (!username || username.trim() === '') return;

    const password = prompt('Choisissez un mot de passe (min 4 caractères) :');
    if (!password || password.length < 4) {
        showError('Le mot de passe doit contenir au moins 4 caractères');
        return;
    }

    try {
        LocalStorage.createUser(username.trim(), password);
        showSuccess('Compte créé ! Vous pouvez maintenant vous connecter.');
    } catch (error) {
        showError(error.message);
    }
});

// ===== CONNEXION =====
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    hideMessages();

    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    try {
        const user = LocalStorage.verifyUser(username, password);
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        loadUserData();
        showApp();
    } catch (error) {
        showError(error.message);
    }
});

// ===== DÉCONNEXION =====
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        currentUser = null;
        localStorage.removeItem('currentUser');
        showAuth();
    }
});

// ===== FONCTIONS AUTH UI =====
function showAuth() {
    authPage.classList.remove('hidden');
    appPage.classList.add('hidden');
    loginForm.reset();
}

function showApp() {
    authPage.classList.add('hidden');
    appPage.classList.remove('hidden');
    applyTheme(userSettings.theme);
    updateUI();
}

function showError(message) {
    authError.textContent = message;
    authError.classList.remove('hidden');
}

function showSuccess(message) {
    authSuccess.textContent = message;
    authSuccess.classList.remove('hidden');
    setTimeout(() => authSuccess.classList.add('hidden'), 3000);
}

function hideMessages() {
    authError.classList.add('hidden');
    authSuccess.classList.add('hidden');
}

// ===== CHARGEMENT DONNÉES UTILISATEUR =====
function loadUserData() {
    userSettings = LocalStorage.getSettings(currentUser.username);
    deliveries = LocalStorage.getDeliveries(currentUser.username);
}

function saveSettings() {
    LocalStorage.saveSettings(currentUser.username, userSettings);
}

// ===== MISE À JOUR UI =====
function updateUI() {
    document.getElementById('userName').textContent = currentUser.username;
    document.getElementById('userIdDisplay').textContent = currentUser.username;
    document.getElementById('settingsUserName').textContent = currentUser.username;

    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = today.toLocaleDateString('fr-FR', options);
    document.getElementById('deliveryDate').value = today.toISOString().split('T')[0];

    const totalKm = deliveries.reduce((sum, d) => sum + (d.distance || 0), 0);
    const totalPayment = deliveries.reduce((sum, d) => sum + (d.payment || 0), 0);
    const avgKm = deliveries.length > 0 ? totalKm / deliveries.length : 0;

    document.getElementById('totalKm').textContent = totalKm.toFixed(1);
    document.getElementById('totalPayment').textContent = totalPayment.toFixed(2) + ' €';
    document.getElementById('totalDeliveries').textContent = deliveries.length;
    document.getElementById('avgKm').textContent = avgKm.toFixed(1) + ' km';
    document.getElementById('deliveryCount').textContent = deliveries.length + ' trajets';

    document.getElementById('settingsRate').value = userSettings.ratePerKm || 0.50;
    document.getElementById('settingsVehicle').value = userSettings.vehicleInfo || '';
    document.getElementById('deliveryRate').value = userSettings.ratePerKm || 0.50;
    document.getElementById('autoRate').value = userSettings.ratePerKm || 0.50;

    updatePresetButtons();
    renderDeliveries();
}

function updatePresetButtons() {
    document.querySelectorAll('.btn-preset').forEach(btn => {
        const rate = parseFloat(btn.dataset.rate);
        if (Math.abs(rate - userSettings.ratePerKm) < 0.01) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// ===== AFFICHAGE LIVRAISONS =====
function renderDeliveries() {
    const container = document.getElementById('deliveriesList');
    
    if (deliveries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p style="color: var(--gray-500); margin-bottom: 16px; font-size: 16px; font-weight: 500;">Aucune livraison enregistrée</p>
                <p style="color: var(--gray-400); margin-bottom: 20px; font-size: 14px;">Cliquez sur le bouton + pour commencer</p>
            </div>
        `;
        return;
    }

    container.innerHTML = deliveries.map(delivery => `
        <div class="delivery-card">
            <div class="delivery-header">
                <div>
                    <div class="delivery-client">📦 ${delivery.clientName}</div>
                    <div class="delivery-date">${formatDate(delivery.date)}</div>
                </div>
                <div class="delivery-payment">${delivery.payment?.toFixed(2) || '0.00'} €</div>
            </div>
            <div class="delivery-details">
                <div class="detail-item">${delivery.startTime || '--:--'} - ${delivery.endTime || '--:--'}</div>
                <div class="detail-item">${delivery.distance?.toFixed(0) || 0} km</div>
                <div class="detail-item">${delivery.startKm || 0} → ${delivery.endKm || 0}</div>
            </div>
            <div class="delivery-rate">${delivery.ratePerKm?.toFixed(2)} €/km</div>
            ${delivery.notes ? `<p style="margin-top: 12px; padding: 12px; background: var(--gray-50); border-radius: 10px; font-size: 13px; color: var(--gray-600); border-left: 3px solid var(--primary);">${delivery.notes}</p>` : ''}
        </div>
    `).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('fr-FR', options);
}

// ===== FAB - BOUTON AJOUTER =====
document.getElementById('fabBtn').addEventListener('click', () => {
    document.getElementById('deliveryFormContainer').classList.remove('hidden');
    document.getElementById('fabBtn').classList.add('hidden');
    
    if (deliveries.length > 0) {
        const last = deliveries[0];
        if (last.endKm) {
            document.getElementById('deliveryStartKm').value = last.endKm;
        }
    }
    
    calculateDelivery();
});

document.getElementById('cancelDeliveryBtn').addEventListener('click', () => {
    document.getElementById('deliveryFormContainer').classList.add('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
    document.getElementById('deliveryForm').reset();
    document.getElementById('deliveryDate').value = new Date().toISOString().split('T')[0];
});

document.getElementById('cancelAutoBtn').addEventListener('click', () => {
    resetTrip();
    document.getElementById('deliveryFormContainer').classList.add('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
});

// ===== MODE SWITCH =====
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const mode = this.dataset.mode;
        
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        if (mode === 'manual') {
            document.getElementById('deliveryForm').classList.remove('hidden');
            document.getElementById('autoModeContainer').classList.add('hidden');
        } else {
            document.getElementById('deliveryForm').classList.add('hidden');
            document.getElementById('autoModeContainer').classList.remove('hidden');
            
            // Demander permission GPS dès le passage en mode automatique
            requestGPSPermission();
        }
    });
});

// ===== DEMANDE PERMISSION GPS =====
function requestGPSPermission() {
    if (!navigator.geolocation) {
        console.warn('Géolocalisation non supportée');
        return;
    }
    
    // Demande silencieuse de permission
    navigator.geolocation.getCurrentPosition(
        () => {
            console.log('✅ Permission GPS accordée');
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
                // Afficher un message uniquement si refusé
                setTimeout(() => {
                    if (confirm('📍 La géolocalisation est nécessaire pour le mode automatique.\n\nAutorisez l\'accès dans les paramètres de votre navigateur.')) {
                        // Sur iOS, proposer d'ouvrir les réglages
                        console.log('Veuillez activer la localisation dans les paramètres');
                    }
                }, 500);
            }
        },
        { enableHighAccuracy: false, timeout: 5000 }
    );
}

// ===== CALCUL MANUEL =====
document.getElementById('deliveryStartKm').addEventListener('input', calculateDelivery);
document.getElementById('deliveryEndKm').addEventListener('input', calculateDelivery);
document.getElementById('deliveryRate').addEventListener('input', calculateDelivery);

function calculateDelivery() {
    const startKm = parseFloat(document.getElementById('deliveryStartKm').value) || 0;
    const endKm = parseFloat(document.getElementById('deliveryEndKm').value) || 0;
    const rate = parseFloat(document.getElementById('deliveryRate').value) || userSettings.ratePerKm;
    const distance = Math.max(0, endKm - startKm);
    const payment = distance * rate;

    document.getElementById('calcDistance').textContent = distance.toFixed(0) + ' km';
    document.getElementById('calcPayment').textContent = payment.toFixed(2) + ' €';
}

// ===== SOUMISSION LIVRAISON MANUELLE =====
document.getElementById('deliveryForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const clientName = document.getElementById('deliveryClient').value.trim();
    const startKm = parseFloat(document.getElementById('deliveryStartKm').value);
    const endKm = parseFloat(document.getElementById('deliveryEndKm').value);
    const rate = parseFloat(document.getElementById('deliveryRate').value) || userSettings.ratePerKm;
    const distance = endKm - startKm;

    if (!clientName) {
        alert('❌ Veuillez entrer le nom du client');
        return;
    }

    if (startKm <= 0 || endKm <= 0) {
        alert('❌ Les kilométrages doivent être supérieurs à 0');
        return;
    }

    if (distance <= 0) {
        alert('❌ Le kilométrage d\'arrivée doit être supérieur au départ');
        return;
    }

    const payment = distance * rate;

    const delivery = {
        id: Date.now(),
        date: document.getElementById('deliveryDate').value,
        clientName: clientName,
        startTime: document.getElementById('deliveryStartTime').value,
        endTime: document.getElementById('deliveryEndTime').value,
        startKm: startKm,
        endKm: endKm,
        distance: distance,
        payment: payment,
        ratePerKm: rate,
        notes: document.getElementById('deliveryNotes').value.trim(),
        createdAt: new Date().toISOString()
    };

    deliveries.unshift(delivery);
    LocalStorage.saveDeliveries(currentUser.username, deliveries);
    
    updateUI();
    document.getElementById('deliveryFormContainer').classList.add('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
    document.getElementById('deliveryForm').reset();
    document.getElementById('deliveryDate').value = new Date().toISOString().split('T')[0];
    
    alert('✅ Livraison enregistrée avec succès !');
});

// ===== GÉOLOCALISATION - CALCUL DISTANCE =====
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// ===== CHRONOMÈTRE =====
function updateTimer() {
    if (!tripData.startTime) return;
    
    const elapsed = Date.now() - tripData.startTime.getTime();
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    
    document.getElementById('tripTimer').textContent = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// ===== DÉMARRER TRAJET GPS =====
function startGPSTrip() {
    if (!navigator.geolocation) {
        alert('❌ Géolocalisation non supportée par votre appareil');
        return;
    }

    const clientName = document.getElementById('autoClient').value.trim();
    if (!clientName) {
        alert('❌ Veuillez entrer le nom du client avant de démarrer');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            tripData.active = true;
            tripData.startTime = new Date();
            tripData.startPos = {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };
            tripData.currentPos = tripData.startPos;
            tripData.positions = [tripData.startPos];
            tripData.distance = 0;
            
            document.getElementById('tripStatus').classList.add('active');
            document.getElementById('tripStatus').querySelector('.trip-info').textContent = 'Trajet en cours...';
            document.getElementById('btnStartTrip').classList.add('hidden');
            document.getElementById('btnStopTrip').classList.remove('hidden');
            
            tripData.timerInterval = setInterval(updateTimer, 1000);
            
            tripData.watchId = navigator.geolocation.watchPosition(
                updatePosition,
                handleGPSError,
                { 
                    enableHighAccuracy: true,
                    maximumAge: 5000,
                    timeout: 10000
                }
            );
            
            // Feedback visuel (pas d'alert)
            console.log('✅ Trajet démarré ! GPS activé');
        },
        (error) => {
            // Afficher erreur uniquement si vraiment nécessaire
            console.error('Erreur GPS:', error);
            if (error.code === error.PERMISSION_DENIED) {
                alert('❌ Permission GPS refusée.\nActivez la localisation dans les paramètres de votre appareil.');
            }
        }
    );
}

// ===== MISE À JOUR POSITION GPS =====
function updatePosition(position) {
    if (!tripData.active) return;
    
    const newPos = {
        lat: position.coords.latitude,
        lon: position.coords.longitude
    };
    
    const dist = calculateDistance(
        tripData.currentPos.lat,
        tripData.currentPos.lon,
        newPos.lat,
        newPos.lon
    );
    
    if (dist > 0.01) {
        tripData.distance += dist;
        tripData.currentPos = newPos;
        tripData.positions.push(newPos);
        
        document.getElementById('tripDistance').textContent = 
            tripData.distance.toFixed(2) + ' km parcourus';
    }
}

// ===== ARRÊTER TRAJET GPS =====
function stopGPSTrip() {
    if (!tripData.active) return;
    
    tripData.endTime = new Date();
    tripData.active = false;
    
    if (tripData.watchId) {
        navigator.geolocation.clearWatch(tripData.watchId);
    }
    if (tripData.timerInterval) {
        clearInterval(tripData.timerInterval);
    }
    
    const clientName = document.getElementById('autoClient').value.trim();
    const rate = parseFloat(document.getElementById('autoRate').value) || userSettings.ratePerKm;
    
    if (!clientName) {
        alert('❌ Entrez le nom du client');
        resetTrip();
        return;
    }
    
    const distanceKm = Math.round(tripData.distance);
    const payment = distanceKm * rate;
    
    const delivery = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        clientName: clientName,
        startTime: tripData.startTime.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
        endTime: tripData.endTime.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'}),
        startKm: 0,
        endKm: 0,
        distance: distanceKm,
        payment: payment,
        ratePerKm: rate,
        notes: `Trajet GPS - ${tripData.distance.toFixed(2)} km réels - ${tripData.positions.length} points enregistrés`,
        createdAt: new Date().toISOString()
    };
    
    deliveries.unshift(delivery);
    LocalStorage.saveDeliveries(currentUser.username, deliveries);
    
    resetTrip();
    updateUI();
    
    document.getElementById('deliveryFormContainer').classList.add('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
    
    // Notification discrète de succès
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #10b981, #059669); color: white;
        padding: 16px 24px; border-radius: 12px; font-weight: 600;
        box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4); z-index: 9999;
        animation: slideDown 0.3s ease-out;
    `;
    successMsg.innerHTML = `✅ Livraison GPS enregistrée !<br><small>${tripData.distance.toFixed(2)} km • ${payment.toFixed(2)} €</small>`;
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
        successMsg.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => successMsg.remove(), 300);
    }, 3000);
}

// ===== RESET TRAJET =====
function resetTrip() {
    if (tripData.watchId) {
        navigator.geolocation.clearWatch(tripData.watchId);
    }
    if (tripData.timerInterval) {
        clearInterval(tripData.timerInterval);
    }
    
    tripData = {
        active: false,
        startTime: null,
        endTime: null,
        startPos: null,
        currentPos: null,
        watchId: null,
        timerInterval: null,
        distance: 0,
        positions: []
    };
    
    document.getElementById('tripStatus').classList.remove('active');
    document.getElementById('tripStatus').querySelector('.trip-info').textContent = 'Trajet non démarré';
    document.getElementById('btnStartTrip').classList.remove('hidden');
    document.getElementById('btnStopTrip').classList.add('hidden');
    document.getElementById('tripTimer').textContent = '00:00:00';
    document.getElementById('tripDistance').textContent = '0 km parcourus';
    document.getElementById('autoClient').value = '';
}

// ===== GESTION ERREURS GPS =====
function handleGPSError(error) {
    console.error('Erreur GPS:', error);
    let message = 'Erreur GPS';
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Permission GPS refusée. Activez-la dans les paramètres de votre appareil.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Position GPS non disponible';
            break;
        case error.TIMEOUT:
            message = 'Timeout GPS';
            break;
    }
    alert('⚠️ ' + message);
}

// ===== EVENT LISTENERS GPS =====
document.getElementById('btnStartTrip').addEventListener('click', startGPSTrip);
document.getElementById('btnStopTrip').addEventListener('click', stopGPSTrip);

// ===== PARAMÈTRES - AUTO-SAUVEGARDE =====
document.getElementById('settingsRate').addEventListener('change', function() {
    userSettings.ratePerKm = parseFloat(this.value);
    saveSettings();
    document.getElementById('deliveryRate').value = userSettings.ratePerKm;
    document.getElementById('autoRate').value = userSettings.ratePerKm;
    updatePresetButtons();
});

document.getElementById('settingsVehicle').addEventListener('change', function() {
    userSettings.vehicleInfo = this.value;
    saveSettings();
});

// ===== PRESETS TARIF =====
document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', function() {
        const rate = parseFloat(this.dataset.rate);
        userSettings.ratePerKm = rate;
        document.getElementById('settingsRate').value = rate;
        document.getElementById('deliveryRate').value = rate;
        document.getElementById('autoRate').value = rate;
        saveSettings();
        updatePresetButtons();
    });
});

// ===== THÈME =====
function applyTheme(theme) {
    document.body.className = `theme-${theme}`;
    document.querySelectorAll('.theme-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.theme === theme);
    });
}

document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', function() {
        const theme = this.dataset.theme;
        userSettings.theme = theme;
        saveSettings();
        applyTheme(theme);
    });
});

// ===== EXPORT EXCEL =====
document.getElementById('btnExportExcel').addEventListener('click', () => {
    if (deliveries.length === 0) {
        alert('⚠️ Aucune donnée à exporter !');
        return;
    }

    // Données
    const data = [
        ['ROUTE NOTE - ' + currentUser.username.toUpperCase()],
        ['Généré le : ' + new Date().toLocaleString('fr-FR')],
        [''],
        ['Date', 'Client', 'Début', 'Fin', 'Km Départ', 'Km Arrivée', 'Distance (km)', 'Tarif (€/km)', 'Paiement (€)', 'Notes']
    ];

    deliveries.forEach(d => {
        data.push([
            d.date,
            d.clientName || '',
            d.startTime || '',
            d.endTime || '',
            d.startKm || 0,
            d.endKm || 0,
            d.distance?.toFixed(0) || 0,
            d.ratePerKm?.toFixed(2) || 0,
            d.payment?.toFixed(2) || 0,
            d.notes || ''
        ]);
    });

    const totalKm = deliveries.reduce((sum, d) => sum + (d.distance || 0), 0);
    const totalPayment = deliveries.reduce((sum, d) => sum + (d.payment || 0), 0);
    
    data.push(['']);
    data.push(['TOTAUX', '', '', '', '', '', totalKm.toFixed(0), '', totalPayment.toFixed(2), '']);
    data.push(['']);
    data.push(['STATISTIQUES']);
    data.push(['Nombre de livraisons', deliveries.length]);
    data.push(['Distance totale', totalKm.toFixed(0) + ' km']);
    data.push(['Paiement total', totalPayment.toFixed(2) + ' €']);
    data.push(['Moyenne par livraison', (totalKm / deliveries.length).toFixed(0) + ' km']);

    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Largeur colonnes
    ws['!cols'] = [
        { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 14 }, { wch: 35 }
    ];

    // STYLES PROFESSIONNELS
    const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" }, size: 12 },
        fill: { fgColor: { rgb: "2563EB" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
        }
    };

    const titleStyle = {
        font: { bold: true, size: 16, color: { rgb: "2563EB" } },
        alignment: { horizontal: "center" }
    };

    const subtitleStyle = {
        font: { italic: true, size: 10, color: { rgb: "6B7280" } },
        alignment: { horizontal: "center" }
    };

    const totalStyle = {
        font: { bold: true, size: 12 },
        fill: { fgColor: { rgb: "FEF3C7" } },
        alignment: { horizontal: "right" }
    };

    const dataStyle = {
        alignment: { horizontal: "center", vertical: "center" },
        border: {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } }
        }
    };

    const statsHeaderStyle = {
        font: { bold: true, size: 12, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "10B981" } },
        alignment: { horizontal: "center" }
    };

    // Appliquer styles
    // Titre
    if (ws['A1']) ws['A1'].s = titleStyle;
    // Sous-titre
    if (ws['A2']) ws['A2'].s = subtitleStyle;
    
    // En-têtes (ligne 4)
    for (let col = 0; col < 10; col++) {
        const cell = String.fromCharCode(65 + col) + '4';
        if (ws[cell]) ws[cell].s = headerStyle;
    }

    // Données (lignes 5 à 4+deliveries.length)
    for (let row = 5; row <= 4 + deliveries.length; row++) {
        for (let col = 0; col < 10; col++) {
            const cell = String.fromCharCode(65 + col) + row;
            if (ws[cell]) {
                ws[cell].s = dataStyle;
                // Alterner couleurs lignes
                if (row % 2 === 0) {
                    ws[cell].s.fill = { fgColor: { rgb: "F9FAFB" } };
                }
            }
        }
    }

    // Ligne TOTAUX
    const totalRow = 4 + deliveries.length + 2;
    for (let col = 0; col < 10; col++) {
        const cell = String.fromCharCode(65 + col) + totalRow;
        if (ws[cell]) ws[cell].s = totalStyle;
    }

    // Statistiques
    const statsRow = totalRow + 2;
    if (ws['A' + statsRow]) ws['A' + statsRow].s = statsHeaderStyle;

    // Fusion cellules titre
    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, // Titre
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }  // Sous-titre
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Livraisons');

    const filename = `Route_Note_${currentUser.username}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);

    // Notification discrète
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: linear-gradient(135deg, #10b981, #059669); color: white;
        padding: 16px 24px; border-radius: 12px; font-weight: 600;
        box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4); z-index: 9999;
    `;
    successMsg.textContent = '✅ Fichier Excel téléchargé !';
    document.body.appendChild(successMsg);
    setTimeout(() => successMsg.remove(), 3000);
});

// ===== NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        const view = this.dataset.view;
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');

        document.getElementById('dashboardView').classList.toggle('hidden', view !== 'dashboard');
        document.getElementById('settingsView').classList.toggle('hidden', view !== 'settings');
        
        document.getElementById('fabBtn').classList.toggle('hidden', view !== 'dashboard');
        
        if (view !== 'dashboard') {
            document.getElementById('deliveryFormContainer').classList.add('hidden');
        }
    });
});

console.log('✅ Route Note PWA chargé avec succès !');