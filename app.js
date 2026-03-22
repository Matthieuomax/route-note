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
            vehicleType: 'auto',
            motorisation: 'thermique',
            fiscalPower: 'cv4',
            annualKm: 'tranche2',
            theme: 'blue'
        };
        return JSON.parse(localStorage.getItem(key) || JSON.stringify(defaults));
    }

    static saveSettings(username, settings) {
        const key = `settings_${username}`;
        localStorage.setItem(key, JSON.stringify(settings));
    }
}

// ===== BARÈME KILOMÉTRIQUE 2025 =====
const BAREME_KM = {
    auto_thermique: {
        cv3: {
            tranche1: { max: 5000, calc: (d) => d * 0.529 },
            tranche2: { max: 20000, calc: (d) => (d * 0.316) + 1065 },
            tranche3: { calc: (d) => d * 0.370 }
        },
        cv4: {
            tranche1: { max: 5000, calc: (d) => d * 0.606 },
            tranche2: { max: 20000, calc: (d) => (d * 0.340) + 1330 },
            tranche3: { calc: (d) => d * 0.407 }
        },
        cv5: {
            tranche1: { max: 5000, calc: (d) => d * 0.636 },
            tranche2: { max: 20000, calc: (d) => (d * 0.357) + 1395 },
            tranche3: { calc: (d) => d * 0.427 }
        },
        cv6: {
            tranche1: { max: 5000, calc: (d) => d * 0.665 },
            tranche2: { max: 20000, calc: (d) => (d * 0.374) + 1457 },
            tranche3: { calc: (d) => d * 0.447 }
        },
        cv7: {
            tranche1: { max: 5000, calc: (d) => d * 0.697 },
            tranche2: { max: 20000, calc: (d) => (d * 0.394) + 1515 },
            tranche3: { calc: (d) => d * 0.470 }
        }
    },
    auto_electrique: {
        cv3: {
            tranche1: { max: 5000, calc: (d) => d * 0.635 },
            tranche2: { max: 20000, calc: (d) => (d * 0.379) + 1278 },
            tranche3: { calc: (d) => d * 0.444 }
        },
        cv4: {
            tranche1: { max: 5000, calc: (d) => d * 0.727 },
            tranche2: { max: 20000, calc: (d) => (d * 0.408) + 1596 },
            tranche3: { calc: (d) => d * 0.488 }
        },
        cv5: {
            tranche1: { max: 5000, calc: (d) => d * 0.763 },
            tranche2: { max: 20000, calc: (d) => (d * 0.428) + 1674 },
            tranche3: { calc: (d) => d * 0.512 }
        },
        cv6: {
            tranche1: { max: 5000, calc: (d) => d * 0.798 },
            tranche2: { max: 20000, calc: (d) => (d * 0.449) + 1748 },
            tranche3: { calc: (d) => d * 0.536 }
        },
        cv7: {
            tranche1: { max: 5000, calc: (d) => d * 0.836 },
            tranche2: { max: 20000, calc: (d) => (d * 0.473) + 1818 },
            tranche3: { calc: (d) => d * 0.564 }
        }
    },
    moto_thermique: {
        cv12: {
            tranche1: { max: 3000, calc: (d) => d * 0.395 },
            tranche2: { max: 6000, calc: (d) => (d * 0.099) + 891 },
            tranche3: { calc: (d) => d * 0.248 }
        },
        cv345: {
            tranche1: { max: 3000, calc: (d) => d * 0.468 },
            tranche2: { max: 6000, calc: (d) => (d * 0.082) + 1158 },
            tranche3: { calc: (d) => d * 0.275 }
        },
        cv5plus: {
            tranche1: { max: 3000, calc: (d) => d * 0.606 },
            tranche2: { max: 6000, calc: (d) => (d * 0.079) + 1583 },
            tranche3: { calc: (d) => d * 0.343 }
        }
    },
    moto_electrique: {
        cv12: {
            tranche1: { max: 3000, calc: (d) => d * 0.474 },
            tranche2: { max: 6000, calc: (d) => (d * 0.119) + 1069 },
            tranche3: { calc: (d) => d * 0.298 }
        },
        cv345: {
            tranche1: { max: 3000, calc: (d) => d * 0.562 },
            tranche2: { max: 6000, calc: (d) => (d * 0.098) + 1390 },
            tranche3: { calc: (d) => d * 0.330 }
        },
        cv5plus: {
            tranche1: { max: 3000, calc: (d) => d * 0.727 },
            tranche2: { max: 6000, calc: (d) => (d * 0.095) + 1900 },
            tranche3: { calc: (d) => d * 0.412 }
        }
    },
    cyclo_thermique: {
        unique: {
            tranche1: { max: 3000, calc: (d) => d * 0.315 },
            tranche2: { max: 6000, calc: (d) => (d * 0.079) + 711 },
            tranche3: { calc: (d) => d * 0.198 }
        }
    },
    cyclo_electrique: {
        unique: {
            tranche1: { max: 3000, calc: (d) => d * 0.378 },
            tranche2: { max: 6000, calc: (d) => (d * 0.095) + 853 },
            tranche3: { calc: (d) => d * 0.238 }
        }
    }
};

// ===== CALCUL INDEMNITÉ =====
// Calcul pour UN TRAJET (juste multiplication, sans partie fixe)
function calculateIndemnitePourTrajet(distance, vehicleType, motorisation, fiscalPower, annualKm) {
    const key = `${vehicleType}_${motorisation}`;
    const bareme = BAREME_KM[key];
    
    if (!bareme) return 0;
    
    // Déterminer la puissance fiscale
    let powerKey = fiscalPower;
    if (vehicleType === 'cyclo') {
        powerKey = 'unique';
    }
    
    const tranches = bareme[powerKey];
    if (!tranches) return 0;
    
    // Sélectionner la bonne tranche selon kilométrage annuel
    const tranche = tranches[annualKm];
    if (!tranche) return 0;
    
    // Pour tranche 1 et 3 : juste multiplication
    // Pour tranche 2 : extraire le coefficient (sans la partie fixe)
    if (annualKm === 'tranche1' || annualKm === 'tranche3') {
        return tranche.calc(distance);
    } else {
        // Tranche 2 : extraire coefficient de multiplication
        const coef = getCoefMultiplication(vehicleType, motorisation, powerKey);
        return distance * coef;
    }
}

// Récupérer coefficient de multiplication pour tranche 2
function getCoefMultiplication(vehicleType, motorisation, powerKey) {
    const coefficients = {
        auto_thermique: { cv3: 0.316, cv4: 0.340, cv5: 0.357, cv6: 0.374, cv7: 0.394 },
        auto_electrique: { cv3: 0.379, cv4: 0.408, cv5: 0.428, cv6: 0.449, cv7: 0.473 },
        moto_thermique: { cv12: 0.099, cv345: 0.082, cv5plus: 0.079 },
        moto_electrique: { cv12: 0.119, cv345: 0.098, cv5plus: 0.095 },
        cyclo_thermique: { unique: 0.079 },
        cyclo_electrique: { unique: 0.095 }
    };
    
    const key = `${vehicleType}_${motorisation}`;
    return coefficients[key]?.[powerKey] || 0;
}

// Récupérer partie fixe annuelle (pour tranche 2 uniquement)
function getPartieFixeAnnuelle(vehicleType, motorisation, fiscalPower, annualKm) {
    if (annualKm !== 'tranche2') return 0;
    
    const partiesFixes = {
        auto_thermique: { cv3: 1065, cv4: 1330, cv5: 1395, cv6: 1457, cv7: 1515 },
        auto_electrique: { cv3: 1278, cv4: 1596, cv5: 1674, cv6: 1748, cv7: 1818 },
        moto_thermique: { cv12: 891, cv345: 1158, cv5plus: 1583 },
        moto_electrique: { cv12: 1069, cv345: 1390, cv5plus: 1900 },
        cyclo_thermique: { unique: 711 },
        cyclo_electrique: { unique: 853 }
    };
    
    let powerKey = fiscalPower;
    if (vehicleType === 'cyclo') {
        powerKey = 'unique';
    }
    
    const key = `${vehicleType}_${motorisation}`;
    return partiesFixes[key]?.[powerKey] || 0;
}

// ===== VARIABLES GLOBALES =====
let currentUser = null;
let userSettings = { 
    vehicleType: 'auto',
    motorisation: 'thermique', 
    fiscalPower: 'cv4',
    annualKm: 'tranche2',
    theme: 'blue'
};
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
    // Forcer re-calcul partie fixe après rendu DOM complet
    setTimeout(() => updateUI(), 0);
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
    const baseTrajets = deliveries.reduce((sum, d) => sum + (d.payment || 0), 0);
    const avgKm = deliveries.length > 0 ? totalKm / deliveries.length : 0;
    
    // Calculer partie fixe annuelle
    const partieFixe = getPartieFixeAnnuelle(
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    );
    
    // Total avec partie fixe
    const totalAvecPartieFixe = baseTrajets + partieFixe;

    // Mise à jour label "Total annuel" si pas encore fait
    const totalLabel = document.querySelector('#totalPayment')?.closest('.stat-card')?.querySelector('.stat-label');
    if (totalLabel) totalLabel.textContent = 'Total annuel';
    
    document.getElementById('totalKm').textContent = totalKm.toFixed(1);
    document.getElementById('baseTrajets').textContent = baseTrajets.toFixed(2) + ' €';
    document.getElementById('partieFixe').textContent = partieFixe.toFixed(2) + ' €';
    document.getElementById('totalPayment').textContent = totalAvecPartieFixe.toFixed(2) + ' €';
    document.getElementById('totalDeliveries').textContent = deliveries.length;
    document.getElementById('avgKm').textContent = avgKm.toFixed(1) + ' km';
    document.getElementById('deliveryCount').textContent = deliveries.length + ' trajets';

    // Mettre à jour l'interface des paramètres véhicule
    updateVehicleSettings();
    renderDeliveries();
}

function updateVehicleSettings() {
    // Mettre à jour les sélections dans l'interface
    document.querySelectorAll('input[name="vehicleType"]').forEach(input => {
        input.checked = input.value === userSettings.vehicleType;
    });
    document.querySelectorAll('input[name="motorisation"]').forEach(input => {
        input.checked = input.value === userSettings.motorisation;
    });
    
    const fiscalPowerSelect = document.getElementById('fiscalPower');
    if (fiscalPowerSelect) fiscalPowerSelect.value = userSettings.fiscalPower;
    
    const annualKmSelect = document.getElementById('annualKm');
    if (annualKmSelect) annualKmSelect.value = userSettings.annualKm;
    
    // Mettre à jour options selon type véhicule
    updateKmRanges();
    updateFiscalPowerOptions();
    
    // Afficher le tarif calculé
    displayCalculatedRate();
}

function displayCalculatedRate() {
    // Calculer moyenne sur distance représentative
    const kmReference = (userSettings.vehicleType === 'auto') ? 12500 : 4500;
    
    // Calcul total avec partie fixe
    const baseKm = calculateIndemnitePourTrajet(
        kmReference, 
        userSettings.vehicleType, 
        userSettings.motorisation, 
        userSettings.fiscalPower, 
        userSettings.annualKm
    );
    
    const partieFixe = getPartieFixeAnnuelle(
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    );
    
    const totalIndemnite = baseKm + partieFixe;
    const moyenneParKm = totalIndemnite / kmReference;
    
    const rateDisplay = document.getElementById('calculatedRate');
    if (rateDisplay) {
        rateDisplay.textContent = moyenneParKm.toFixed(3) + ' €/km';
    }
}

function updatePresetButtons() {
    // Cette fonction n'est plus nécessaire avec le barème
    // On la garde vide pour éviter les erreurs
}

// ===== AFFICHAGE LIVRAISONS =====
function renderDeliveries() {
    const container = document.getElementById('deliveriesList');
    
    if (deliveries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p style="color: var(--gray-500); margin-bottom: 16px; font-size: 16px; font-weight: 500;">Aucun déplacement enregistré</p>
                <p style="color: var(--gray-400); margin-bottom: 20px; font-size: 14px;">Cliquez sur le bouton + pour commencer</p>
            </div>
        `;
        return;
    }

    container.innerHTML = deliveries.map(delivery => `
        <div class="delivery-card">
            <div class="delivery-header">
                <div style="flex:1;">
                    <div class="delivery-client">📦 ${delivery.clientName}</div>
                    <div class="delivery-date">${formatDate(delivery.date)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="delivery-payment">${delivery.payment?.toFixed(2) || '0.00'} €</div>
                    <button class="btn-delete" onclick="deleteDelivery(${delivery.id})" title="Supprimer ce trajet">✕</button>
                </div>
            </div>
            <div class="delivery-details">
                <div class="detail-item">${delivery.startTime || '--:--'} - ${delivery.endTime || '--:--'}</div>
                <div class="detail-item">${delivery.distance?.toFixed(0) || 0} km</div>
                <div class="detail-item">${delivery.startKm || 0} → ${delivery.endKm || 0}</div>
            </div>
            ${delivery.notes ? `<p style="margin-top: 12px; padding: 12px; background: var(--gray-50); border-radius: 10px; font-size: 13px; color: var(--gray-600); border-left: 3px solid var(--primary);">${delivery.notes}</p>` : ''}
        </div>
    `).join('');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    return date.toLocaleDateString('fr-FR', options);
}

// ===== SUPPRESSION D'UN TRAJET =====
function deleteDelivery(id) {
    if (!confirm('Supprimer ce trajet ?')) return;
    deliveries = deliveries.filter(d => d.id !== id);
    LocalStorage.saveDeliveries(currentUser.username, deliveries);
    updateUI();
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
                // Afficher message avec chemin iOS
                setTimeout(() => {
                    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                    const message = isIOS 
                        ? '📍 Géolocalisation nécessaire pour le mode automatique.\n\n' +
                          'Activez-la dans :\n' +
                          'Réglages > Confidentialité et sécurité > Service de localisation > Safari\n\n' +
                          'Puis actualisez la page.'
                        : '📍 Géolocalisation nécessaire pour le mode automatique.\n\n' +
                          'Autorisez l\'accès dans les paramètres de votre navigateur.';
                    alert(message);
                }, 500);
            }
        },
        { enableHighAccuracy: false, timeout: 5000 }
    );
}

// ===== CALCUL MANUEL =====
document.getElementById('deliveryStartKm').addEventListener('input', calculateDelivery);
document.getElementById('deliveryEndKm').addEventListener('input', calculateDelivery);

function calculateDelivery() {
    const startKm = parseFloat(document.getElementById('deliveryStartKm').value) || 0;
    const endKm = parseFloat(document.getElementById('deliveryEndKm').value) || 0;
    const distance = Math.max(0, endKm - startKm);
    
    const payment = calculateIndemnitePourTrajet(
        distance,
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    );

    document.getElementById('calcDistance').textContent = distance.toFixed(0) + ' km';
    document.getElementById('calcPayment').textContent = payment.toFixed(2) + ' €';
}

// ===== SOUMISSION LIVRAISON MANUELLE =====
document.getElementById('deliveryForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const clientName = document.getElementById('deliveryClient').value.trim();
    const startKm = parseFloat(document.getElementById('deliveryStartKm').value);
    const endKm = parseFloat(document.getElementById('deliveryEndKm').value);
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

    const payment = calculateIndemnitePourTrajet(
        distance,
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    );

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
        vehicleConfig: {
            type: userSettings.vehicleType,
            motorisation: userSettings.motorisation,
            fiscalPower: userSettings.fiscalPower,
            annualKm: userSettings.annualKm
        },
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
    
    alert('✅ Déplacement enregistré avec succès !');
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
        const input = document.getElementById('autoClient');
        input.style.borderColor = 'var(--danger)';
        input.placeholder = '⚠️ Champ obligatoire';
        input.focus();
        setTimeout(() => {
            input.style.borderColor = '';
            input.placeholder = 'Ex : Visite client, Réunion...';
        }, 2500);
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
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                const message = isIOS 
                    ? '❌ Permission GPS refusée.\n\n' +
                      'Activez-la dans :\n' +
                      'Réglages > Confidentialité et sécurité > Service de localisation > Safari\n\n' +
                      'Puis actualisez la page.'
                    : '❌ Permission GPS refusée.\n\n' +
                      'Activez la localisation dans les paramètres de votre appareil.';
                alert(message);
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
    
    if (!clientName) {
        alert('❌ Entrez le nom du client');
        resetTrip();
        return;
    }
    
    const distanceKm = Math.round(tripData.distance);
    const payment = calculateIndemnitePourTrajet(
        distanceKm,
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    );
    
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
        vehicleConfig: {
            type: userSettings.vehicleType,
            motorisation: userSettings.motorisation,
            fiscalPower: userSettings.fiscalPower,
            annualKm: userSettings.annualKm
        },
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
    successMsg.innerHTML = `✅ Trajet GPS enregistré !<br><small>${tripData.distance.toFixed(2)} km • ${payment.toFixed(2)} €</small>`;
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

// ===== PARAMÈTRES VÉHICULE - AUTO-SAUVEGARDE =====
// Type de véhicule
document.querySelectorAll('input[name="vehicleType"]').forEach(input => {
    input.addEventListener('change', function() {
        userSettings.vehicleType = this.value;
        updateKmRanges();
        updateFiscalPowerOptions();
        saveSettings();
        displayCalculatedRate();
    });
});

// Motorisation
document.querySelectorAll('input[name="motorisation"]').forEach(input => {
    input.addEventListener('change', function() {
        userSettings.motorisation = this.value;
        saveSettings();
        displayCalculatedRate();
    });
});

// Chevaux fiscaux
const fiscalPowerSelect = document.getElementById('fiscalPower');
if (fiscalPowerSelect) {
    fiscalPowerSelect.addEventListener('change', function() {
        userSettings.fiscalPower = this.value;
        saveSettings();
        displayCalculatedRate();
    });
}

// Kilométrage annuel
const annualKmSelect = document.getElementById('annualKm');
if (annualKmSelect) {
    annualKmSelect.addEventListener('change', function() {
        userSettings.annualKm = this.value;
        saveSettings();
        displayCalculatedRate();
    });
}

// Mettre à jour les options de kilométrage selon le type de véhicule
function updateKmRanges() {
    const annualKmSelect = document.getElementById('annualKm');
    if (!annualKmSelect) return;
    
    const isAuto = userSettings.vehicleType === 'auto';
    
    annualKmSelect.innerHTML = isAuto
        ? `<option value="tranche1">Moins de 5 000 km/an (~14 km/jour)</option>
           <option value="tranche2">Entre 5 001 et 20 000 km/an (~27 à 55 km/jour)</option>
           <option value="tranche3">Plus de 20 000 km/an (~55+ km/jour)</option>`
        : `<option value="tranche1">Moins de 3 000 km/an (~8 km/jour)</option>
           <option value="tranche2">Entre 3 001 et 6 000 km/an (~16 km/jour)</option>
           <option value="tranche3">Plus de 6 000 km/an (~16+ km/jour)</option>`;
    
    // Sélectionner la tranche sauvegardée
    annualKmSelect.value = userSettings.annualKm;
}

// Mettre à jour les options de puissance fiscale selon le type de véhicule
function updateFiscalPowerOptions() {
    const fiscalPowerSelect = document.getElementById('fiscalPower');
    if (!fiscalPowerSelect) return;
    
    if (userSettings.vehicleType === 'auto') {
        fiscalPowerSelect.innerHTML = `
            <option value="cv3">3 CV et moins</option>
            <option value="cv4">4 CV</option>
            <option value="cv5">5 CV</option>
            <option value="cv6">6 CV</option>
            <option value="cv7">7 CV et plus</option>
        `;
    } else if (userSettings.vehicleType === 'moto') {
        fiscalPowerSelect.innerHTML = `
            <option value="cv12">1 ou 2 CV</option>
            <option value="cv345">3, 4 ou 5 CV</option>
            <option value="cv5plus">Plus de 5 CV</option>
        `;
    } else {
        // Cyclo n'a pas de choix de CV
        fiscalPowerSelect.innerHTML = `<option value="unique">Cyclomoteur (pas de CV)</option>`;
        fiscalPowerSelect.disabled = true;
        userSettings.fiscalPower = 'unique';
        return;
    }
    
    fiscalPowerSelect.disabled = false;
    fiscalPowerSelect.value = userSettings.fiscalPower;
}

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

    // 1. PRÉPARATION DES DONNÉES
    const totalKm = deliveries.reduce((sum, d) => sum + (d.distance || 0), 0);
    const baseTrajets = deliveries.reduce((sum, d) => sum + (d.payment || 0), 0);
    
    // (Assure-toi que la fonction getPartieFixeAnnuelle existe, sinon ça renverra 0 pour l'instant)
    const partieFixe = typeof getPartieFixeAnnuelle === 'function' ? getPartieFixeAnnuelle(
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    ) : 0;
    
    const totalAvecPartieFixe = baseTrajets + partieFixe;

    // 2. CONSTRUCTION DU TABLEAU
    const data = [
        ['ROUTE NOTE - ' + currentUser.username.toUpperCase()],
        ['Généré le : ' + new Date().toLocaleString('fr-FR')],
        [''],
        ['Date', 'Client', 'Début', 'Fin', 'Km Départ', 'Km Arrivée', 'Distance (km)', 'Paiement (€)', 'Notes']
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
            d.payment?.toFixed(2) || 0,
            d.notes || ''
        ]);
    });

    // Ligne TOTAUX
    data.push(['']);
    data.push(['TOTAUX', '', '', '', '', '', totalKm.toFixed(0), baseTrajets.toFixed(2), '']);
    
    data.push(['']);
    
    // --- SECTION : DÉTAIL DU CALCUL FINANCIER ---
    // Le texte va en colonne 0 (A), la valeur en colonne 4 (E). On fusionnera tout ça après.
    data.push(['DÉTAIL DU CALCUL FINANCIER', '', '', '', '']); 
    data.push(['Base trajets cumulée (km × tarif)', '', '', '', baseTrajets.toFixed(2) + ' €']);
    data.push(['Forfait annuel (selon barème)', '', '', '', partieFixe.toFixed(2) + ' €']);
    data.push(['TOTAL GLOBAL', '', '', '', totalAvecPartieFixe.toFixed(2) + ' €']);
    
    data.push(['']);
    
    // --- SECTION : STATISTIQUES D'ACTIVITÉ ---
    data.push(['STATISTIQUES D\'ACTIVITÉ', '', '', '', '']);
    data.push(['Nombre total de déplacements', '', '', '', deliveries.length]);
    data.push(['Distance totale parcourue', '', '', '', totalKm.toFixed(0) + ' km']);
    data.push(['Moyenne par trajet', '', '', '', (deliveries.length > 0 ? (totalKm / deliveries.length).toFixed(0) : 0) + ' km']);

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Largeur des colonnes
    ws['!cols'] = [
        { wch: 15 }, // A
        { wch: 25 }, // B
        { wch: 10 }, // C
        { wch: 10 }, // D
        { wch: 12 }, // E
        { wch: 12 }, // F
        { wch: 14 }, // G
        { wch: 14 }, // H
        { wch: 35 }  // I
    ];

    // 3. STYLES AVANCÉS (Nécessite xlsx-js-style dans le HTML)
    const styles = {
        title: { font: { bold: true, size: 16, color: { rgb: "2563EB" } }, alignment: { horizontal: "center" } },
        subtitle: { font: { italic: true, size: 10, color: { rgb: "6B7280" } }, alignment: { horizontal: "center" } },
        header: { 
            font: { bold: true, color: { rgb: "FFFFFF" }, size: 12 }, 
            fill: { fgColor: { rgb: "2563EB" } }, 
            alignment: { horizontal: "center", vertical: "center" },
            border: { top: {style:"thin"}, bottom: {style:"thin"}, left: {style:"thin"}, right: {style:"thin"} }
        },
        dataEven: { alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: "F9FAFB" } }, border: { top: {style:"thin", color:{rgb:"E5E7EB"}}, bottom: {style:"thin", color:{rgb:"E5E7EB"}}, left: {style:"thin", color:{rgb:"E5E7EB"}}, right: {style:"thin", color:{rgb:"E5E7EB"}} } },
        dataOdd: { alignment: { horizontal: "center", vertical: "center" }, border: { top: {style:"thin", color:{rgb:"E5E7EB"}}, bottom: {style:"thin", color:{rgb:"E5E7EB"}}, left: {style:"thin", color:{rgb:"E5E7EB"}}, right: {style:"thin", color:{rgb:"E5E7EB"}} } },
        totalRow: { font: { bold: true, size: 12 }, fill: { fgColor: { rgb: "DBEAFE" } }, alignment: { horizontal: "center", vertical: "center" }, border: { top: {style:"medium", color:{rgb:"2563EB"}}, bottom: {style:"medium", color:{rgb:"2563EB"}} } },
        
        // Styles pour les résumés en bas (Centrés et larges)
        sectionTitle: { font: { bold: true, size: 12, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "4B5563" } }, alignment: { horizontal: "center", vertical: "center" } },
        summaryLabel: { font: { bold: true, size: 11 }, alignment: { horizontal: "left", vertical: "center" }, border: { left: {style:"thin", color:{rgb:"E5E7EB"}}, bottom: {style:"thin", color:{rgb:"E5E7EB"}} } },
        summaryValue: { font: { size: 11 }, alignment: { horizontal: "center", vertical: "center" }, border: { right: {style:"thin", color:{rgb:"E5E7EB"}}, bottom: {style:"thin", color:{rgb:"E5E7EB"}} } },
        grandTotalLabel: { font: { bold: true, size: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "10B981" } }, alignment: { horizontal: "left", vertical: "center" }, border: { left: {style:"thin", color:{rgb:"059669"}}, bottom: {style:"thin", color:{rgb:"059669"}} } },
        grandTotalValue: { font: { bold: true, size: 13, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "10B981" } }, alignment: { horizontal: "center", vertical: "center" }, border: { right: {style:"thin", color:{rgb:"059669"}}, bottom: {style:"thin", color:{rgb:"059669"}} } }
    };

    // 4. APPLICATION DES STYLES ET FUSIONS
    const merges = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, // Titre principal
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }  // Sous-titre
    ];

    if(ws['A1']) ws['A1'].s = styles.title;
    if(ws['A2']) ws['A2'].s = styles.subtitle;

    // Headers
    for (let c = 0; c < 9; c++) {
        const cell = XLSX.utils.encode_cell({r: 3, c: c});
        if (ws[cell]) ws[cell].s = styles.header;
    }

    // Lignes de données
    let rowIdx = 4;
    for (let i = 0; i < deliveries.length; i++) {
        for (let c = 0; c < 9; c++) {
            const cell = XLSX.utils.encode_cell({r: rowIdx, c: c});
            if (ws[cell]) ws[cell].s = (rowIdx % 2 === 0) ? styles.dataEven : styles.dataOdd;
        }
        rowIdx++;
    }

    rowIdx++; // Ligne vide

    // Ligne TOTAUX du grand tableau
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 5 } }); // fusion de A à F
    for (let c = 0; c < 9; c++) {
        const cell = XLSX.utils.encode_cell({r: rowIdx, c: c});
        if (!ws[cell]) ws[cell] = { t: 's', v: '' };
        ws[cell].s = styles.totalRow;
    }
    
    rowIdx += 2; // Saut jusqu'au tableau DÉTAIL

    // --- Rendu Section DÉTAIL ---
    // Titre
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 8 } }); // Fusionne sur toute la largeur
    if (!ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})]) ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})] = {t:'s', v:''};
    ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})].s = styles.sectionTitle;
    rowIdx++;
    
    // 3 lignes de détails
    for(let i=0; i<3; i++) {
        // Fusion A à D pour le label (très large)
        merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 3 } });
        // Fusion E à I pour la valeur (très large et centrée)
        merges.push({ s: { r: rowIdx, c: 4 }, e: { r: rowIdx, c: 8 } });
        
        let isGrandTotal = (i === 2);
        let lblStyle = isGrandTotal ? styles.grandTotalLabel : styles.summaryLabel;
        let valStyle = isGrandTotal ? styles.grandTotalValue : styles.summaryValue;

        if(!ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})]) ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})]={t:'s',v:''};
        ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})].s = lblStyle;
        
        if(!ws[XLSX.utils.encode_cell({r: rowIdx, c: 4})]) ws[XLSX.utils.encode_cell({r: rowIdx, c: 4})]={t:'s',v:''};
        ws[XLSX.utils.encode_cell({r: rowIdx, c: 4})].s = valStyle;
        
        rowIdx++;
    }

    rowIdx++; // Ligne vide

    // --- Rendu Section STATS ---
    // Titre
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 8 } });
    if (!ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})]) ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})] = {t:'s', v:''};
    ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})].s = styles.sectionTitle;
    rowIdx++;
    
    // 3 lignes de stats
    for(let i=0; i<3; i++) {
        merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 3 } });
        merges.push({ s: { r: rowIdx, c: 4 }, e: { r: rowIdx, c: 8 } });
        
        if(!ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})]) ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})]={t:'s',v:''};
        ws[XLSX.utils.encode_cell({r: rowIdx, c: 0})].s = styles.summaryLabel;
        
        if(!ws[XLSX.utils.encode_cell({r: rowIdx, c: 4})]) ws[XLSX.utils.encode_cell({r: rowIdx, c: 4})]={t:'s',v:''};
        ws[XLSX.utils.encode_cell({r: rowIdx, c: 4})].s = styles.summaryValue;
        
        rowIdx++;
    }

    ws['!merges'] = merges;

    // 5. GÉNÉRATION
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Déplacements');

    const filename = `Route_Note_${currentUser.username}_${new Date().toISOString().split('T')[0]}.xlsx`;

    // Fonction pour afficher notre notification stylée
    const notifyUser = (message) => {
        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #10b981, #059669); color: white;
            padding: 16px 24px; border-radius: 12px; font-weight: 600;
            box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4); z-index: 9999;
            text-align: center; width: 80%; max-width: 350px;
        `;
        msgDiv.innerHTML = message;
        document.body.appendChild(msgDiv);
        setTimeout(() => msgDiv.remove(), 4500); // Reste affiché 4.5 secondes
    };

    // On prépare le fichier pour le mobile
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });

    // On demande à l'utilisateur ce qu'il préfère
    const userChoice = confirm("Comment voulez-vous enregistrer le fichier ?\n\n[OK] = Choisir mon dossier moi-même\n[Annuler] = Téléchargement rapide (dossier par défaut)");

    if (userChoice) {
        // L'utilisateur veut CHOISIR LE DOSSIER (Ouverture du menu de partage natif)
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            navigator.share({
                files: [file],
                title: 'Export Route Note'
            })
            .then(() => notifyUser('✅ Export réussi !'))
            .catch((error) => console.log('Partage annulé', error));
        } else {
            alert("⚠️ Votre appareil ne permet pas de choisir le dossier. Téléchargement classique en cours...");
            XLSX.writeFile(wb, filename);
            notifyUser('✅ Fichier téléchargé !<br><small>Regardez dans le dossier Téléchargements de votre appareil.</small>');
        }
    } else {
        // L'utilisateur veut le TÉLÉCHARGEMENT DIRECT
        XLSX.writeFile(wb, filename);
        notifyUser('✅ Fichier téléchargé !<br><small>Vérifiez votre dossier "Téléchargements" ou "Fichiers".</small>');
    }
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