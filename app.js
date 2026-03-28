// ================================
// ROUTE NOTE - PWA JavaScript
// Version 3 : Auth Supabase réelle + Sync automatique
// ================================

// ===== CONFIGURATION SUPABASE =====
const SUPABASE_URL = 'https://picyuqnjhjmmomxxcgrg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpY3l1cW5qaGptbW9teHhjZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTcxNDEsImV4cCI6MjA5MDEzMzE0MX0.9IypoAHc5Z1z2j3BIT6FQQOZtoak-KJ7beoPgjtji20';

// Client Supabase
let supabaseClient = null;

// ===== UTILITAIRES SÉCURITÉ =====

// Hash SHA-256 via Web Crypto API (remplace btoa)
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Échappement HTML anti-XSS
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== ENREGISTREMENT SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('✅ Service Worker enregistré'))
            .catch(err => console.log('❌ Erreur SW:', err));
    });
}

// ===== INITIALISATION SUPABASE =====
function initSupabase() {
    console.log('🔄 Initialisation Supabase...');
    if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
        try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase connecté !');
            return true;
        } catch (error) {
            console.error('❌ Erreur Supabase:', error);
            return false;
        }
    }
    console.warn('⚠️ Supabase non disponible - Mode hors ligne');
    return false;
}

// Retry initSupabase si le SDK n'était pas encore chargé (defer timing)
function initSupabaseWithRetry(maxRetries = 5, delay = 200) {
    if (initSupabase()) return Promise.resolve(true);
    
    return new Promise((resolve) => {
        let attempt = 0;
        const retry = setInterval(() => {
            attempt++;
            if (initSupabase()) {
                clearInterval(retry);
                resolve(true);
            } else if (attempt >= maxRetries) {
                clearInterval(retry);
                console.warn('⚠️ Supabase indisponible après ' + maxRetries + ' tentatives');
                resolve(false);
            }
        }, delay);
    });
}

// ===== SYSTÈME DE STOCKAGE LOCAL =====
class LocalStorage {
    static getDeliveries(username) {
        return JSON.parse(localStorage.getItem(`deliveries_${username}`) || '[]');
    }
    static saveDeliveries(username, deliveries) {
        localStorage.setItem(`deliveries_${username}`, JSON.stringify(deliveries));
    }
    static getSettings(username) {
        const defaults = { vehicleType:'auto', motorisation:'thermique', fiscalPower:'cv4', annualKm:'tranche2', theme:'blue' };
        return JSON.parse(localStorage.getItem(`settings_${username}`) || JSON.stringify(defaults));
    }
    static saveSettings(username, settings) {
        localStorage.setItem(`settings_${username}`, JSON.stringify(settings));
    }
}

// ===== AUTHENTIFICATION SUPABASE =====
class Auth {
    static usernameToEmail(username) {
        return `${username.toLowerCase().replace(/[^a-z0-9]/g, '_')}@routenote.app`;
    }

    // Inscription : Supabase d'abord, fallback local si offline
    static async register(username, password) {
        if (supabaseClient && navigator.onLine) {
            const email = this.usernameToEmail(username);
            const { data, error } = await supabaseClient.auth.signUp({
                email, password,
                options: { data: { username } }
            });
            if (error) {
                if (error.message.includes('already') || error.message.includes('exists')) {
                    throw new Error('Ce pseudo est déjà utilisé');
                }
                throw new Error('Erreur inscription : ' + error.message);
            }
            if (!data.user) throw new Error('Erreur lors de la création du compte');

            console.log('✅ Compte Supabase créé:', data.user.id);
            const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
            const pwHash = await hashPassword(password);
            localUsers[username] = { supabaseId: data.user.id, email, passwordHash: pwHash, createdAt: new Date().toISOString() };
            localStorage.setItem('users', JSON.stringify(localUsers));
            return { username, supabaseId: data.user.id };
        }

        // Mode offline
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        if (localUsers[username]) throw new Error('Ce pseudo est déjà utilisé');
        const pwHash = await hashPassword(password);
        localUsers[username] = { supabaseId: null, email: this.usernameToEmail(username), passwordHash: pwHash, pendingRegistration: true, createdAt: new Date().toISOString() };
        localStorage.setItem('users', JSON.stringify(localUsers));
        return { username, supabaseId: null };
    }

    // Connexion : Supabase d'abord, fallback local
    static async login(username, password) {
        const email = this.usernameToEmail(username);

        if (supabaseClient && navigator.onLine) {
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (!error && data.user) {
                    console.log('✅ Connexion Supabase réussie');
                    const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
                    const pwHash = await hashPassword(password);
                    localUsers[username] = { supabaseId: data.user.id, email, passwordHash: pwHash, createdAt: localUsers[username]?.createdAt || new Date().toISOString() };
                    localStorage.setItem('users', JSON.stringify(localUsers));
                    return { username, supabaseId: data.user.id };
                }
                if (error) console.log('⚠️ Supabase login:', error.message);
            } catch (err) {
                console.log('⚠️ Erreur réseau login:', err.message);
            }
        }

        // Fallback local
        const localUsers = JSON.parse(localStorage.getItem('users') || '{}');
        const user = localUsers[username];
        if (!user) throw new Error('Prénom ou mot de passe incorrect');
        const pwHash = await hashPassword(password);
        if (user.passwordHash !== pwHash) throw new Error('Prénom ou mot de passe incorrect');
        console.log('✅ Connexion locale (mode offline)');
        return { username, supabaseId: user.supabaseId || null };
    }

    // Déconnexion
    static async logout() {
        if (supabaseClient) {
            try { await supabaseClient.auth.signOut(); } catch (err) { console.log('⚠️', err.message); }
        }
        localStorage.removeItem('currentUser');
    }

    // Restaurer session Supabase au chargement
    static async restoreSession() {
        if (!supabaseClient) return null;
        try {
            const { data } = await supabaseClient.auth.getSession();
            if (data.session) { console.log('✅ Session Supabase restaurée'); return data.session.user; }
        } catch (err) { console.log('⚠️ Pas de session Supabase active'); }
        return null;
    }
}

// ===== SYNCHRONISATION CLOUD =====
class CloudSync {
    static isOnline() { return navigator.onLine && supabaseClient !== null; }

    static async ensureSession() {
        if (!supabaseClient) return false;
        try { const { data } = await supabaseClient.auth.getSession(); return !!data.session; }
        catch { return false; }
    }

    static async getUser() {
        try { const { data: { user } } = await supabaseClient.auth.getUser(); return user; }
        catch { return null; }
    }

    // Sync trajets locaux → Supabase
    static async syncDeliveries(username) {
        if (!this.isOnline()) return;
        if (!(await this.ensureSession())) { console.log('⚠️ Pas de session, sync impossible'); return; }
        const user = await this.getUser();
        if (!user) return;

        const allDeliveries = LocalStorage.getDeliveries(username);
        const unsynced = allDeliveries.filter(d => !d.synced);
        if (unsynced.length === 0) return;

        console.log(`📤 Sync ${unsynced.length} trajets...`);
        let syncCount = 0;

        for (const delivery of unsynced) {
            try {
                const { error } = await supabaseClient.from('deliveries').upsert({
                    user_id: user.id, local_id: delivery.id,
                    date: delivery.date, client_name: delivery.clientName,
                    start_time: delivery.startTime || null, end_time: delivery.endTime || null,
                    start_km: delivery.startKm || 0, end_km: delivery.endKm || 0,
                    distance: delivery.distance || 0, payment: delivery.payment || 0,
                    vehicle_config: delivery.vehicleConfig || {}, notes: delivery.notes || null
                }, { onConflict: 'user_id,local_id' });
                if (!error) { delivery.synced = true; syncCount++; }
                else console.log('⚠️ Sync trajet:', error.message);
            } catch (err) { console.log('⚠️ Sync trajet:', err.message); }
        }

        LocalStorage.saveDeliveries(username, allDeliveries);
        if (syncCount > 0) updateSyncStatus();
        console.log(`✅ ${syncCount}/${unsynced.length} trajets synchronisés`);
    }

    // Supprimer du cloud
    static async deleteDelivery(username, localId) {
        if (!this.isOnline()) return;
        if (!(await this.ensureSession())) return;
        const user = await this.getUser();
        if (!user) return;
        try {
            await supabaseClient.from('deliveries').delete().eq('user_id', user.id).eq('local_id', localId);
            console.log('✅ Trajet supprimé du cloud');
        } catch (err) { console.log('⚠️ Suppression cloud:', err.message); }
    }

    // Sync settings → Supabase
    static async syncSettings(username, settings) {
        if (!this.isOnline()) return;
        if (!(await this.ensureSession())) return;
        const user = await this.getUser();
        if (!user) return;
        try {
            await supabaseClient.from('profiles').update({
                vehicle_type: settings.vehicleType, motorisation: settings.motorisation,
                fiscal_power: settings.fiscalPower, annual_km: settings.annualKm, theme: settings.theme
            }).eq('id', user.id);
            console.log('✅ Settings synchronisés');
        } catch (err) { console.log('⚠️ Sync settings:', err.message); }
    }

    // Récupérer trajets depuis le cloud
    static async fetchFromCloud(username) {
        if (!this.isOnline()) return;
        if (!(await this.ensureSession())) return;
        const user = await this.getUser();
        if (!user) return;

        try {
            const { data, error } = await supabaseClient.from('deliveries').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
            if (error || !data) return;

            const cloudDeliveries = data.map(d => ({
                id: d.local_id || d.id, date: d.date, clientName: d.client_name,
                startTime: d.start_time, endTime: d.end_time,
                startKm: d.start_km, endKm: d.end_km,
                distance: d.distance, payment: d.payment,
                vehicleConfig: d.vehicle_config, notes: d.notes,
                createdAt: d.created_at, synced: true
            }));

            const localDeliveries = LocalStorage.getDeliveries(username);
            const localUnsynced = localDeliveries.filter(d => !d.synced);
            const cloudIds = new Set(cloudDeliveries.map(d => d.id));
            const merged = [...cloudDeliveries];
            for (const local of localUnsynced) { if (!cloudIds.has(local.id)) merged.push(local); }
            merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            LocalStorage.saveDeliveries(username, merged);
            console.log(`✅ ${cloudDeliveries.length} trajets récupérés du cloud`);

            // Aussi récupérer les settings
            await this.fetchSettingsFromCloud(username, user.id);
        } catch (err) { console.log('⚠️ Fetch cloud:', err.message); }
    }

    static async fetchSettingsFromCloud(username, userId) {
        try {
            const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
            if (!error && data) {
                const settings = {
                    vehicleType: data.vehicle_type || 'auto', motorisation: data.motorisation || 'thermique',
                    fiscalPower: data.fiscal_power || 'cv4', annualKm: data.annual_km || 'tranche2', theme: data.theme || 'blue'
                };
                LocalStorage.saveSettings(username, settings);
            }
        } catch (err) { console.log('⚠️ Fetch settings:', err.message); }
    }

    // Sync complète bidirectionnelle
    static async fullSync(username) {
        if (!this.isOnline()) return;
        console.log('🔄 Sync complète...');
        await this.syncDeliveries(username);
        await this.fetchFromCloud(username);
    }
}

function updateSyncStatus() {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = 'Dernière sync : ' + new Date().toLocaleTimeString('fr-FR');
}

// ===== BARÈME KILOMÉTRIQUE 2025 =====
const BAREME_KM = {
    auto_thermique: {
        cv3: { tranche1: { max: 5000, calc: d => d * 0.529 }, tranche2: { max: 20000, calc: d => (d * 0.316) + 1065 }, tranche3: { calc: d => d * 0.370 } },
        cv4: { tranche1: { max: 5000, calc: d => d * 0.606 }, tranche2: { max: 20000, calc: d => (d * 0.340) + 1330 }, tranche3: { calc: d => d * 0.407 } },
        cv5: { tranche1: { max: 5000, calc: d => d * 0.636 }, tranche2: { max: 20000, calc: d => (d * 0.357) + 1395 }, tranche3: { calc: d => d * 0.427 } },
        cv6: { tranche1: { max: 5000, calc: d => d * 0.665 }, tranche2: { max: 20000, calc: d => (d * 0.374) + 1457 }, tranche3: { calc: d => d * 0.447 } },
        cv7: { tranche1: { max: 5000, calc: d => d * 0.697 }, tranche2: { max: 20000, calc: d => (d * 0.394) + 1515 }, tranche3: { calc: d => d * 0.470 } }
    },
    auto_electrique: {
        cv3: { tranche1: { max: 5000, calc: d => d * 0.635 }, tranche2: { max: 20000, calc: d => (d * 0.379) + 1278 }, tranche3: { calc: d => d * 0.444 } },
        cv4: { tranche1: { max: 5000, calc: d => d * 0.727 }, tranche2: { max: 20000, calc: d => (d * 0.408) + 1596 }, tranche3: { calc: d => d * 0.488 } },
        cv5: { tranche1: { max: 5000, calc: d => d * 0.763 }, tranche2: { max: 20000, calc: d => (d * 0.428) + 1674 }, tranche3: { calc: d => d * 0.512 } },
        cv6: { tranche1: { max: 5000, calc: d => d * 0.798 }, tranche2: { max: 20000, calc: d => (d * 0.449) + 1748 }, tranche3: { calc: d => d * 0.536 } },
        cv7: { tranche1: { max: 5000, calc: d => d * 0.836 }, tranche2: { max: 20000, calc: d => (d * 0.473) + 1818 }, tranche3: { calc: d => d * 0.564 } }
    },
    moto_thermique: {
        cv12: { tranche1: { max: 3000, calc: d => d * 0.395 }, tranche2: { max: 6000, calc: d => (d * 0.099) + 891 }, tranche3: { calc: d => d * 0.248 } },
        cv345: { tranche1: { max: 3000, calc: d => d * 0.468 }, tranche2: { max: 6000, calc: d => (d * 0.082) + 1158 }, tranche3: { calc: d => d * 0.275 } },
        cv5plus: { tranche1: { max: 3000, calc: d => d * 0.606 }, tranche2: { max: 6000, calc: d => (d * 0.079) + 1583 }, tranche3: { calc: d => d * 0.343 } }
    },
    moto_electrique: {
        cv12: { tranche1: { max: 3000, calc: d => d * 0.474 }, tranche2: { max: 6000, calc: d => (d * 0.119) + 1069 }, tranche3: { calc: d => d * 0.298 } },
        cv345: { tranche1: { max: 3000, calc: d => d * 0.562 }, tranche2: { max: 6000, calc: d => (d * 0.098) + 1390 }, tranche3: { calc: d => d * 0.330 } },
        cv5plus: { tranche1: { max: 3000, calc: d => d * 0.727 }, tranche2: { max: 6000, calc: d => (d * 0.095) + 1900 }, tranche3: { calc: d => d * 0.412 } }
    },
    cyclo_thermique: { unique: { tranche1: { max: 3000, calc: d => d * 0.315 }, tranche2: { max: 6000, calc: d => (d * 0.079) + 711 }, tranche3: { calc: d => d * 0.198 } } },
    cyclo_electrique: { unique: { tranche1: { max: 3000, calc: d => d * 0.378 }, tranche2: { max: 6000, calc: d => (d * 0.095) + 853 }, tranche3: { calc: d => d * 0.238 } } }
};

function calculateIndemnitePourTrajet(distance, vehicleType, motorisation, fiscalPower, annualKm) {
    const key = `${vehicleType}_${motorisation}`;
    const bareme = BAREME_KM[key];
    if (!bareme) return 0;
    let powerKey = vehicleType === 'cyclo' ? 'unique' : fiscalPower;
    const tranches = bareme[powerKey];
    if (!tranches) return 0;
    const tranche = tranches[annualKm];
    if (!tranche) return 0;
    if (annualKm === 'tranche1' || annualKm === 'tranche3') return tranche.calc(distance);
    return distance * getCoefMultiplication(vehicleType, motorisation, powerKey);
}

function getCoefMultiplication(vehicleType, motorisation, powerKey) {
    const coefficients = {
        auto_thermique: { cv3: 0.316, cv4: 0.340, cv5: 0.357, cv6: 0.374, cv7: 0.394 },
        auto_electrique: { cv3: 0.379, cv4: 0.408, cv5: 0.428, cv6: 0.449, cv7: 0.473 },
        moto_thermique: { cv12: 0.099, cv345: 0.082, cv5plus: 0.079 },
        moto_electrique: { cv12: 0.119, cv345: 0.098, cv5plus: 0.095 },
        cyclo_thermique: { unique: 0.079 }, cyclo_electrique: { unique: 0.095 }
    };
    return coefficients[`${vehicleType}_${motorisation}`]?.[powerKey] || 0;
}

function getPartieFixeAnnuelle(vehicleType, motorisation, fiscalPower, annualKm) {
    if (annualKm !== 'tranche2') return 0;
    const partiesFixes = {
        auto_thermique: { cv3: 1065, cv4: 1330, cv5: 1395, cv6: 1457, cv7: 1515 },
        auto_electrique: { cv3: 1278, cv4: 1596, cv5: 1674, cv6: 1748, cv7: 1818 },
        moto_thermique: { cv12: 891, cv345: 1158, cv5plus: 1583 },
        moto_electrique: { cv12: 1069, cv345: 1390, cv5plus: 1900 },
        cyclo_thermique: { unique: 711 }, cyclo_electrique: { unique: 853 }
    };
    let powerKey = vehicleType === 'cyclo' ? 'unique' : fiscalPower;
    return partiesFixes[`${vehicleType}_${motorisation}`]?.[powerKey] || 0;
}

// ===== VARIABLES GLOBALES =====
let currentUser = null;
let userSettings = { vehicleType:'auto', motorisation:'thermique', fiscalPower:'cv4', annualKm:'tranche2', theme:'blue' };
let deliveries = [];
let tripData = { active:false, startTime:null, endTime:null, startPos:null, currentPos:null, watchId:null, timerInterval:null, distance:0, positions:[] };

// ===== ÉLÉMENTS DOM =====
const authPage = document.getElementById('authPage');
const appPage = document.getElementById('appPage');
const loginForm = document.getElementById('loginForm');
const authError = document.getElementById('authError');
const authSuccess = document.getElementById('authSuccess');

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Route Note v3 démarrage...');
    await initSupabaseWithRetry();

    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        loadUserData();
        showApp();
        setTimeout(() => updateUI(), 0);

        // Restaurer session Supabase + sync auto
        const supaUser = await Auth.restoreSession();
        if (supaUser) {
            CloudSync.fullSync(currentUser.username).then(() => {
                deliveries = LocalStorage.getDeliveries(currentUser.username);
                userSettings = LocalStorage.getSettings(currentUser.username);
                updateUI();
            });
        }
    }

    window.addEventListener('online', async () => {
        console.log('📶 Connexion rétablie');
        showNotification('📶 Connexion rétablie - Sync...', 'info');
        updateConnectionUI();
        if (currentUser) {
            const supaUser = await Auth.restoreSession();
            if (supaUser) {
                await CloudSync.fullSync(currentUser.username);
                deliveries = LocalStorage.getDeliveries(currentUser.username);
                userSettings = LocalStorage.getSettings(currentUser.username);
                updateUI();
                showNotification('✅ Synchronisation terminée !');
            }
        }
    });

    window.addEventListener('offline', () => {
        console.log('📴 Mode hors ligne');
        showNotification('📴 Mode hors ligne', 'warning');
        updateConnectionUI();
    });
});

// ===== TOGGLE LOGIN / REGISTER =====
document.getElementById('toggleToRegister').addEventListener('click', () => {
    hideMessages();
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('toggleToRegister').classList.add('hidden');
    document.getElementById('toggleToLogin').classList.remove('hidden');
});
document.getElementById('toggleToLogin').addEventListener('click', () => {
    hideMessages();
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('toggleToLogin').classList.add('hidden');
    document.getElementById('toggleToRegister').classList.remove('hidden');
});

// ===== INSCRIPTION =====
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

    if (!username) { showError('Veuillez entrer un pseudo'); return; }
    if (password.length < 6) { showError('Le mot de passe doit contenir au moins 6 caractères'); return; }
    if (password !== passwordConfirm) { showError('Les mots de passe ne correspondent pas'); return; }

    try {
        await Auth.register(username, password);
        showSuccess('✅ Compte créé ! Connectez-vous maintenant.');
        // Marquer pour afficher la bienvenue au prochain login
        localStorage.removeItem(`welcomeShown_${username}`);
        // Basculer vers le formulaire de connexion
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
        document.getElementById('toggleToLogin').classList.add('hidden');
        document.getElementById('toggleToRegister').classList.remove('hidden');
        // Pré-remplir le pseudo
        document.getElementById('loginUsername').value = username;
        document.getElementById('registerForm').reset();
    } catch (error) { showError(error.message); }
});

// ===== CONNEXION =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!username || !password) { showError('Remplissez tous les champs'); return; }

    try {
        const user = await Auth.login(username, password);
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        loadUserData();
        showApp();

        if (!localStorage.getItem(`welcomeShown_${username}`)) showWelcomeModal();

        CloudSync.fetchFromCloud(username).then(() => {
            deliveries = LocalStorage.getDeliveries(username);
            userSettings = LocalStorage.getSettings(username);
            updateUI();
        }).catch(() => updateUI());
    } catch (error) { showError(error.message); }
});

// ===== DÉCONNEXION =====
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        if (currentUser) await CloudSync.syncDeliveries(currentUser.username);
        await Auth.logout();
        currentUser = null;
        showAuth();
    }
});

// ===== UI HELPERS =====
function showAuth() {
    authPage.classList.remove('hidden');
    appPage.classList.add('hidden');
    loginForm.reset();
    document.getElementById('registerForm')?.reset();
    // Toujours revenir au formulaire de connexion
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('toggleToRegister').classList.remove('hidden');
    document.getElementById('toggleToLogin').classList.add('hidden');
    hideMessages();
}
function showApp() { authPage.classList.add('hidden'); appPage.classList.remove('hidden'); applyTheme(userSettings.theme); updateUI(); }
function showError(msg) { authError.textContent = msg; authError.classList.remove('hidden'); }
function showSuccess(msg) { authSuccess.textContent = msg; authSuccess.classList.remove('hidden'); setTimeout(() => authSuccess.classList.add('hidden'), 3000); }
function hideMessages() { authError.classList.add('hidden'); authSuccess.classList.add('hidden'); }

function showNotification(message, type = 'success') {
    const msgDiv = document.createElement('div');
    let bgColor;
    switch(type) {
        case 'warning': bgColor = 'linear-gradient(135deg, #f59e0b, #d97706)'; break;
        case 'info': bgColor = 'linear-gradient(135deg, #3b82f6, #2563eb)'; break;
        case 'error': bgColor = 'linear-gradient(135deg, #ef4444, #dc2626)'; break;
        default: bgColor = 'linear-gradient(135deg, #10b981, #059669)';
    }
    msgDiv.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${bgColor};color:white;padding:16px 24px;border-radius:12px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.3);z-index:9999;animation:slideDown 0.3s ease-out;text-align:center;max-width:90vw;`;
    msgDiv.innerHTML = message;
    document.body.appendChild(msgDiv);
    setTimeout(() => { msgDiv.style.opacity = '0'; msgDiv.style.transform = 'translateX(-50%) translateY(-20px)'; setTimeout(() => msgDiv.remove(), 300); }, 3000);
}

// ===== DONNÉES UTILISATEUR =====
function loadUserData() {
    userSettings = LocalStorage.getSettings(currentUser.username);
    deliveries = LocalStorage.getDeliveries(currentUser.username);
}
function saveSettings() {
    LocalStorage.saveSettings(currentUser.username, userSettings);
    CloudSync.syncSettings(currentUser.username, userSettings);
}

// ===== MISE À JOUR UI =====
function updateUI() {
    document.getElementById('userName').textContent = currentUser.username;
    document.getElementById('userIdDisplay').textContent = currentUser.username;
    document.getElementById('settingsUserName').textContent = currentUser.username;

    const today = new Date();
    document.getElementById('currentDate').textContent = today.toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    document.getElementById('deliveryDate').value = today.toISOString().split('T')[0];

    const totalKm = deliveries.reduce((s, d) => s + (d.distance || 0), 0);
    const baseTrajets = deliveries.reduce((s, d) => s + (d.payment || 0), 0);
    const avgKm = deliveries.length > 0 ? totalKm / deliveries.length : 0;
    const partieFixe = getPartieFixeAnnuelle(userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const totalAvecPartieFixe = baseTrajets + partieFixe;

    const totalLabel = document.querySelector('#totalPayment')?.closest('.stat-card')?.querySelector('.stat-label');
    if (totalLabel) totalLabel.textContent = 'Total annuel';

    document.getElementById('totalKm').textContent = totalKm.toFixed(1);
    document.getElementById('baseTrajets').textContent = baseTrajets.toFixed(2) + ' €';
    document.getElementById('partieFixe').textContent = partieFixe.toFixed(2) + ' €';
    document.getElementById('totalPayment').textContent = totalAvecPartieFixe.toFixed(2) + ' €';
    document.getElementById('totalDeliveries').textContent = deliveries.length;
    document.getElementById('avgKm').textContent = avgKm.toFixed(1) + ' km';
    document.getElementById('deliveryCount').textContent = deliveries.length + ' trajets';

    updateVehicleSettings();
    renderDeliveries();
}

function updateVehicleSettings() {
    document.querySelectorAll('input[name="vehicleType"]').forEach(i => i.checked = i.value === userSettings.vehicleType);
    document.querySelectorAll('input[name="motorisation"]').forEach(i => i.checked = i.value === userSettings.motorisation);
    const fp = document.getElementById('fiscalPower'); if (fp) fp.value = userSettings.fiscalPower;
    const ak = document.getElementById('annualKm'); if (ak) ak.value = userSettings.annualKm;
    updateKmRanges(); updateFiscalPowerOptions(); displayCalculatedRate();
}

function displayCalculatedRate() {
    const kmRef = userSettings.vehicleType === 'auto' ? 12500 : 4500;
    const baseKm = calculateIndemnitePourTrajet(kmRef, userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const partieFixe = getPartieFixeAnnuelle(userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const moyParKm = (baseKm + partieFixe) / kmRef;
    const el = document.getElementById('calculatedRate');
    if (el) el.textContent = moyParKm.toFixed(3) + ' €/km';
}

// ===== AFFICHAGE LIVRAISONS =====
function renderDeliveries() {
    const container = document.getElementById('deliveriesList');
    if (deliveries.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📦</div><p style="color:var(--gray-500);margin-bottom:16px;font-size:16px;font-weight:500;">Aucun déplacement enregistré</p><p style="color:var(--gray-400);margin-bottom:20px;font-size:14px;">Cliquez sur le bouton + pour commencer</p></div>`;
        return;
    }
    container.innerHTML = deliveries.map(d => `
        <div class="delivery-card ${d.synced === false ? 'unsynced' : ''}">
            <div class="delivery-header">
                <div style="flex:1;">
                    <div class="delivery-client">📦 ${escapeHtml(d.clientName)} ${d.synced === false ? '<span class="sync-badge" title="Non synchronisé">⏳</span>' : '<span style="font-size:10px;" title="Synchronisé">☁️</span>'}</div>
                    <div class="delivery-date">${formatDate(d.date)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="delivery-payment">${d.payment?.toFixed(2) || '0.00'} €</div>
                    <button class="btn-delete" onclick="deleteDelivery(${d.id})" title="Supprimer">✕</button>
                </div>
            </div>
            <div class="delivery-details">
                <div class="detail-item">${d.startTime || '--:--'} - ${d.endTime || '--:--'}</div>
                <div class="detail-item">${d.distance?.toFixed(0) || 0} km</div>
                <div class="detail-item">${d.startKm || 0} → ${d.endKm || 0}</div>
            </div>
            ${d.notes ? `<p style="margin-top:12px;padding:12px;background:var(--gray-50);border-radius:10px;font-size:13px;color:var(--gray-600);border-left:3px solid var(--primary);">${escapeHtml(d.notes)}</p>` : ''}
        </div>
    `).join('');
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}

// ===== SUPPRESSION =====
function deleteDelivery(id) {
    if (!confirm('Supprimer ce trajet ?')) return;
    deliveries = deliveries.filter(d => d.id !== id);
    LocalStorage.saveDeliveries(currentUser.username, deliveries);
    updateUI();
    CloudSync.deleteDelivery(currentUser.username, id);
}

// ===== MODAL DÉPLACEMENT =====
function openDeliveryModal() {
    document.getElementById('deliveryFormContainer').classList.add('open');
}
function closeDeliveryModal() {
    document.getElementById('deliveryFormContainer').classList.remove('open');
}

// ===== MODAL DE BIENVENUE =====
function showWelcomeModal() {
    document.getElementById('welcomeModal').classList.add('open');
}
function closeWelcomeModal() {
    document.getElementById('welcomeModal').classList.remove('open');
    if (currentUser) localStorage.setItem(`welcomeShown_${currentUser.username}`, '1');
}

// ===== FAB =====
document.getElementById('fabBtn').addEventListener('click', () => {
    openDeliveryModal();
    if (deliveries.length > 0 && deliveries[0].endKm) {
        document.getElementById('deliveryStartKm').value = deliveries[0].endKm;
    }
    calculateDelivery();
});

document.getElementById('cancelDeliveryBtn').addEventListener('click', () => {
    closeDeliveryModal();
    document.getElementById('deliveryForm').reset();
    document.getElementById('deliveryDate').value = new Date().toISOString().split('T')[0];
});

document.getElementById('cancelAutoBtn').addEventListener('click', () => {
    resetTrip();
    closeDeliveryModal();
});

// ===== MODE SWITCH =====
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        if (this.dataset.mode === 'manual') {
            document.getElementById('deliveryForm').classList.remove('hidden');
            document.getElementById('autoModeContainer').classList.add('hidden');
        } else {
            document.getElementById('deliveryForm').classList.add('hidden');
            document.getElementById('autoModeContainer').classList.remove('hidden');
            requestGPSPermission();
        }
    });
});

// ===== GPS =====
function requestGPSPermission() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(() => console.log('✅ GPS OK'), (error) => {
        if (error.code === error.PERMISSION_DENIED) {
            setTimeout(() => {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
                alert(isIOS ? '📍 Activez la géolocalisation dans :\nRéglages > Confidentialité > Service de localisation > Safari' : '📍 Autorisez l\'accès GPS dans les paramètres du navigateur.');
            }, 500);
        }
    }, { enableHighAccuracy: false, timeout: 5000 });
}

document.getElementById('deliveryStartKm').addEventListener('input', calculateDelivery);
document.getElementById('deliveryEndKm').addEventListener('input', calculateDelivery);

function calculateDelivery() {
    const startKm = parseFloat(document.getElementById('deliveryStartKm').value) || 0;
    const endKm = parseFloat(document.getElementById('deliveryEndKm').value) || 0;
    const distance = Math.max(0, endKm - startKm);
    const payment = calculateIndemnitePourTrajet(distance, userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
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

    if (!clientName) { alert('❌ Veuillez entrer le nom du client'); return; }
    if (startKm <= 0 || endKm <= 0) { alert('❌ Les kilométrages doivent être supérieurs à 0'); return; }
    if (distance <= 0) { alert('❌ Le kilométrage d\'arrivée doit être supérieur au départ'); return; }

    const payment = calculateIndemnitePourTrajet(distance, userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const delivery = {
        id: Date.now(), date: document.getElementById('deliveryDate').value,
        clientName, startTime: document.getElementById('deliveryStartTime').value,
        endTime: document.getElementById('deliveryEndTime').value, startKm, endKm, distance, payment,
        vehicleConfig: { type: userSettings.vehicleType, motorisation: userSettings.motorisation, fiscalPower: userSettings.fiscalPower, annualKm: userSettings.annualKm },
        notes: document.getElementById('deliveryNotes').value.trim(), createdAt: new Date().toISOString(), synced: false
    };

    deliveries.unshift(delivery);
    LocalStorage.saveDeliveries(currentUser.username, deliveries);
    CloudSync.syncDeliveries(currentUser.username);
    updateUI();
    closeDeliveryModal();
    document.getElementById('deliveryForm').reset();
    document.getElementById('deliveryDate').value = new Date().toISOString().split('T')[0];
    showNotification('✅ Déplacement enregistré !');
});

// ===== GÉOLOCALISATION =====
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function updateTimer() {
    if (!tripData.startTime) return;
    const elapsed = Date.now() - tripData.startTime.getTime();
    const h = Math.floor(elapsed/3600000), m = Math.floor((elapsed%3600000)/60000), s = Math.floor((elapsed%60000)/1000);
    document.getElementById('tripTimer').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startGPSTrip() {
    if (!navigator.geolocation) { alert('❌ Géolocalisation non supportée'); return; }
    const clientName = document.getElementById('autoClient').value.trim();
    if (!clientName) {
        const input = document.getElementById('autoClient');
        input.style.borderColor = 'var(--danger)'; input.placeholder = '⚠️ Champ obligatoire'; input.focus();
        setTimeout(() => { input.style.borderColor = ''; input.placeholder = 'Ex : Visite client, Réunion...'; }, 2500);
        return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
        tripData.active = true; tripData.startTime = new Date();
        tripData.startPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        tripData.currentPos = tripData.startPos; tripData.positions = [tripData.startPos]; tripData.distance = 0;
        document.getElementById('tripStatus').classList.add('active');
        document.getElementById('tripStatus').querySelector('.trip-info').textContent = 'Trajet en cours...';
        document.getElementById('btnStartTrip').classList.add('hidden');
        document.getElementById('btnStopTrip').classList.remove('hidden');
        tripData.timerInterval = setInterval(updateTimer, 1000);
        tripData.watchId = navigator.geolocation.watchPosition(updatePosition, handleGPSError, { enableHighAccuracy:true, maximumAge:5000, timeout:10000 });
    }, (error) => { if (error.code === error.PERMISSION_DENIED) alert('❌ Permission GPS refusée.'); });
}

function updatePosition(position) {
    if (!tripData.active) return;
    const newPos = { lat: position.coords.latitude, lon: position.coords.longitude };
    const dist = calculateDistance(tripData.currentPos.lat, tripData.currentPos.lon, newPos.lat, newPos.lon);
    if (dist > 0.01) {
        tripData.distance += dist; tripData.currentPos = newPos; tripData.positions.push(newPos);
        document.getElementById('tripDistance').textContent = tripData.distance.toFixed(2) + ' km parcourus';
    }
}

function stopGPSTrip() {
    if (!tripData.active) return;
    tripData.endTime = new Date(); tripData.active = false;
    if (tripData.watchId) navigator.geolocation.clearWatch(tripData.watchId);
    if (tripData.timerInterval) clearInterval(tripData.timerInterval);
    const clientName = document.getElementById('autoClient').value.trim();
    if (!clientName) { alert('❌ Entrez le nom du client'); resetTrip(); return; }

    const distanceKm = Math.round(tripData.distance);
    const payment = calculateIndemnitePourTrajet(distanceKm, userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const delivery = {
        id: Date.now(), date: new Date().toISOString().split('T')[0], clientName,
        startTime: tripData.startTime.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}),
        endTime: tripData.endTime.toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}),
        startKm: 0, endKm: 0, distance: distanceKm, payment,
        vehicleConfig: { type: userSettings.vehicleType, motorisation: userSettings.motorisation, fiscalPower: userSettings.fiscalPower, annualKm: userSettings.annualKm },
        notes: `Trajet GPS - ${tripData.distance.toFixed(2)} km réels`, createdAt: new Date().toISOString(), synced: false
    };
    deliveries.unshift(delivery);
    LocalStorage.saveDeliveries(currentUser.username, deliveries);
    CloudSync.syncDeliveries(currentUser.username);
    const savedDist = tripData.distance;
    resetTrip(); updateUI();
    closeDeliveryModal();
    showNotification(`✅ Trajet GPS enregistré !<br><small>${savedDist.toFixed(2)} km • ${payment.toFixed(2)} €</small>`);
}

function resetTrip() {
    if (tripData.watchId) navigator.geolocation.clearWatch(tripData.watchId);
    if (tripData.timerInterval) clearInterval(tripData.timerInterval);
    tripData = { active:false, startTime:null, endTime:null, startPos:null, currentPos:null, watchId:null, timerInterval:null, distance:0, positions:[] };
    document.getElementById('tripStatus').classList.remove('active');
    document.getElementById('tripStatus').querySelector('.trip-info').textContent = 'Trajet non démarré';
    document.getElementById('btnStartTrip').classList.remove('hidden');
    document.getElementById('btnStopTrip').classList.add('hidden');
    document.getElementById('tripTimer').textContent = '00:00:00';
    document.getElementById('tripDistance').textContent = '0 km parcourus';
    document.getElementById('autoClient').value = '';
}

function handleGPSError(error) { console.error('Erreur GPS:', error); }
document.getElementById('btnStartTrip').addEventListener('click', startGPSTrip);
document.getElementById('btnStopTrip').addEventListener('click', stopGPSTrip);

// ===== PARAMÈTRES VÉHICULE =====
document.querySelectorAll('input[name="vehicleType"]').forEach(i => i.addEventListener('change', function() { userSettings.vehicleType = this.value; updateKmRanges(); updateFiscalPowerOptions(); saveSettings(); displayCalculatedRate(); }));
document.querySelectorAll('input[name="motorisation"]').forEach(i => i.addEventListener('change', function() { userSettings.motorisation = this.value; saveSettings(); displayCalculatedRate(); }));
document.getElementById('fiscalPower')?.addEventListener('change', function() { userSettings.fiscalPower = this.value; saveSettings(); displayCalculatedRate(); });
document.getElementById('annualKm')?.addEventListener('change', function() { userSettings.annualKm = this.value; saveSettings(); displayCalculatedRate(); });

function updateKmRanges() {
    const el = document.getElementById('annualKm'); if (!el) return;
    el.innerHTML = userSettings.vehicleType === 'auto'
        ? `<option value="tranche1">Moins de 5 000 km/an (~14 km/jour)</option><option value="tranche2">Entre 5 001 et 20 000 km/an (~27 à 55 km/jour)</option><option value="tranche3">Plus de 20 000 km/an (~55+ km/jour)</option>`
        : `<option value="tranche1">Moins de 3 000 km/an (~8 km/jour)</option><option value="tranche2">Entre 3 001 et 6 000 km/an (~16 km/jour)</option><option value="tranche3">Plus de 6 000 km/an (~16+ km/jour)</option>`;
    el.value = userSettings.annualKm;
}

function updateFiscalPowerOptions() {
    const el = document.getElementById('fiscalPower'); if (!el) return;
    if (userSettings.vehicleType === 'auto') {
        el.innerHTML = `<option value="cv3">3 CV et moins</option><option value="cv4">4 CV</option><option value="cv5">5 CV</option><option value="cv6">6 CV</option><option value="cv7">7 CV et plus</option>`;
    } else if (userSettings.vehicleType === 'moto') {
        el.innerHTML = `<option value="cv12">1 ou 2 CV</option><option value="cv345">3, 4 ou 5 CV</option><option value="cv5plus">Plus de 5 CV</option>`;
    } else {
        el.innerHTML = `<option value="unique">Cyclomoteur (pas de CV)</option>`;
        el.disabled = true; userSettings.fiscalPower = 'unique'; return;
    }
    el.disabled = false; el.value = userSettings.fiscalPower;
}

// ===== THÈME =====
function applyTheme(theme) {
    document.body.className = `theme-${theme}`;
    document.querySelectorAll('.theme-option').forEach(opt => opt.classList.toggle('active', opt.dataset.theme === theme));
}
document.querySelectorAll('.theme-option').forEach(opt => opt.addEventListener('click', function() { userSettings.theme = this.dataset.theme; saveSettings(); applyTheme(this.dataset.theme); }));

// ===== SYNC MANUEL =====
async function forceSync() {
    if (!currentUser) return;
    showNotification('🔄 Synchronisation...', 'info');
    try {
        await CloudSync.fullSync(currentUser.username);
        deliveries = LocalStorage.getDeliveries(currentUser.username);
        userSettings = LocalStorage.getSettings(currentUser.username);
        updateUI(); updateSyncStatus();
        showNotification('✅ Synchronisation terminée !');
    } catch (err) { showNotification('❌ Erreur de synchronisation', 'error'); }
}

// ===== EXPORT EXCEL =====
document.getElementById('btnExportExcel').addEventListener('click', async () => {
    if (deliveries.length === 0) { alert('⚠️ Aucune donnée à exporter !'); return; }

    const totalKm = deliveries.reduce((s, d) => s + (d.distance || 0), 0);
    const baseTrajets = deliveries.reduce((s, d) => s + (d.payment || 0), 0);
    const partieFixe = getPartieFixeAnnuelle(userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const totalAvecPartieFixe = baseTrajets + partieFixe;

    // ---- Données brutes ----
    const rows = [
        ['ROUTE NOTE - ' + currentUser.username.toUpperCase(), '', '', '', '', '', '', '', ''],
        ['Généré le : ' + new Date().toLocaleString('fr-FR'), '', '', '', '', '', '', '', ''],
        [],
        ['Date', 'Motif', 'Départ', 'Arrivée', 'Km Départ', 'Km Arrivée', 'Distance (km)', 'Indemnité (€)', 'Notes']
    ];
    deliveries.forEach(d => rows.push([
        d.date, d.clientName || '', d.startTime || '', d.endTime || '',
        d.startKm || 0, d.endKm || 0,
        parseFloat(d.distance?.toFixed(0)) || 0,
        parseFloat(d.payment?.toFixed(2)) || 0,
        d.notes || ''
    ]));
    const dataEndRow = rows.length;
    rows.push([]);
    rows.push(['TOTAUX', '', '', '', '', '', parseFloat(totalKm.toFixed(0)), parseFloat(baseTrajets.toFixed(2)), '']);
    rows.push([]);
    rows.push(['DÉTAIL DU CALCUL FINANCIER', '', '', '', '', '', '', '', '']);
    rows.push(['Base trajets (variable)', '', '', '', parseFloat(baseTrajets.toFixed(2)), '', '', '', '']);
    rows.push(['Forfait annuel (fixe)', '', '', '', parseFloat(partieFixe.toFixed(2)), '', '', '', '']);
    rows.push(['TOTAL ANNUEL', '', '', '', parseFloat(totalAvecPartieFixe.toFixed(2)), '', '', '', '']);

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // ---- Styles ----
    const setStyle = (r, c, s) => {
        const key = XLSX.utils.encode_cell({ r, c });
        if (!ws[key]) ws[key] = { v: '', t: 's' };
        ws[key].s = s;
    };

    const S = {
        title:    { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '2563EB' } }, alignment: { horizontal: 'center' } },
        subtitle: { font: { italic: true, sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'center' } },
        header:   { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1E40AF' } }, alignment: { horizontal: 'center', wrapText: true } },
        rowEven:  { fill: { patternType: 'solid', fgColor: { rgb: 'F0F4FF' } }, font: { sz: 10 } },
        rowOdd:   { fill: { patternType: 'solid', fgColor: { rgb: 'FFFFFF' } }, font: { sz: 10 } },
        rowNum:   bg => ({ fill: { patternType: 'solid', fgColor: { rgb: bg } }, font: { sz: 10 }, alignment: { horizontal: 'right' } }),
        totalLbl: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '059669' } } },
        totalVal: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '059669' } }, alignment: { horizontal: 'right' } },
        section:  { font: { bold: true, sz: 12, color: { rgb: '1E40AF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'DBEAFE' } } },
        sumLbl:   { font: { bold: true, sz: 11, color: { rgb: '374151' } } },
        sumVal:   { font: { bold: true, sz: 11, color: { rgb: '059669' } }, alignment: { horizontal: 'right' } },
        finalLbl: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '059669' } } },
        finalVal: { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '059669' } }, alignment: { horizontal: 'right' } },
    };

    for (let c = 0; c < 9; c++) setStyle(0, c, S.title);
    for (let c = 0; c < 9; c++) setStyle(1, c, S.subtitle);
    for (let c = 0; c < 9; c++) setStyle(3, c, S.header);
    for (let r = 4; r < dataEndRow; r++) {
        const bg = r % 2 === 0 ? 'F0F4FF' : 'FFFFFF';
        for (let c = 0; c < 9; c++) setStyle(r, c, c >= 4 ? S.rowNum(bg) : (r % 2 === 0 ? S.rowEven : S.rowOdd));
    }
    const totalRow = dataEndRow + 1;
    for (let c = 0; c < 9; c++) setStyle(totalRow, c, c < 6 ? S.totalLbl : S.totalVal);
    const sectionRow = totalRow + 2;
    for (let c = 0; c < 9; c++) setStyle(sectionRow, c, S.section);
    setStyle(sectionRow + 1, 0, S.sumLbl); setStyle(sectionRow + 1, 4, S.sumVal);
    setStyle(sectionRow + 2, 0, S.sumLbl); setStyle(sectionRow + 2, 4, S.sumVal);
    for (let c = 0; c < 9; c++) setStyle(sectionRow + 3, c, c === 4 ? S.finalVal : S.finalLbl);

    ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
        { s: { r: sectionRow, c: 0 }, e: { r: sectionRow, c: 8 } },
    ];
    ws['!cols'] = [{wch:12},{wch:22},{wch:8},{wch:8},{wch:10},{wch:10},{wch:13},{wch:14},{wch:30}];
    ws['!rows'] = [{hpt:22},{hpt:16}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Déplacements');
    const filename = `Route_Note_${currentUser.username}_${new Date().toISOString().split('T')[0]}.xlsx`;

    // ---- Générer le xlsx en binaire ----
    let wbBytes = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

    // ---- Injecter le logo PNG dans le fichier xlsx via JSZip ----
    try {
        const logoResp = await fetch('icons/logo-display-512.png');
        if (logoResp.ok && typeof JSZip !== 'undefined') {
            const logoBytes = new Uint8Array(await logoResp.arrayBuffer());
            const zip = await JSZip.loadAsync(wbBytes);

            // Image dans xl/media/
            zip.file('xl/media/logo.png', logoBytes);

            // XML du dessin — oneCellAnchor avec cx=cy pour garder le logo carré
            zip.file('xl/drawings/drawing1.xml',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"' +
                ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
                ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
                '<xdr:oneCellAnchor>' +
                '<xdr:from><xdr:col>7</xdr:col><xdr:colOff>114300</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from>' +
                '<xdr:ext cx="600000" cy="600000"/>' +
                '<xdr:pic>' +
                '<xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
                '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
                '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="600000" cy="600000"/></a:xfrm>' +
                '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>' +
                '</xdr:pic><xdr:clientData/>' +
                '</xdr:oneCellAnchor></xdr:wsDr>'
            );

            // Relations du dessin → image
            zip.file('xl/drawings/_rels/drawing1.xml.rels',
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/>' +
                '</Relationships>'
            );

            // Relations de sheet1 → dessin
            const existingRels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels')?.async('string');
            const drawingRel = '<Relationship Id="rId_d1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>';
            zip.file('xl/worksheets/_rels/sheet1.xml.rels',
                existingRels
                    ? existingRels.replace('</Relationships>', drawingRel + '</Relationships>')
                    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
                      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
                      drawingRel + '</Relationships>'
            );

            // Référencer le dessin dans sheet1.xml
            let sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
            if (!sheetXml.includes('xmlns:r=')) {
                sheetXml = sheetXml.replace('<worksheet ', '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
            }
            if (!sheetXml.includes('<drawing')) {
                sheetXml = sheetXml.replace('</worksheet>', '<drawing r:id="rId_d1"/></worksheet>');
            }
            zip.file('xl/worksheets/sheet1.xml', sheetXml);

            // Déclarer le type de contenu pour le dessin
            let ct = await zip.file('[Content_Types].xml').async('string');
            if (!ct.includes('drawing+xml')) {
                ct = ct.replace('</Types>',
                    '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
            }
            zip.file('[Content_Types].xml', ct);

            wbBytes = new Uint8Array(await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } }));
        }
    } catch(e) { console.warn('Logo Excel non injecté :', e); }

    // ---- Téléchargement ----
    const blob = new Blob([wbBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

    if (isIOS && navigator.share) {
        // iOS/iPadOS : feuille de partage native
        navigator.share({ files: [file] }).catch(err => {
            if (err.name !== 'AbortError') {
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
                setTimeout(() => URL.revokeObjectURL(url), 10000);
            }
        });
    } else if (isIOS) {
        // iOS sans Share API (très ancien Safari)
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } else {
        // Android + Desktop : lien download standard
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    showNotification('✅ Export téléchargé !');
});

// ===== EXPORT PDF =====
document.getElementById('btnExportPdf').addEventListener('click', async () => {
    if (deliveries.length === 0) { alert('⚠️ Aucune donnée à exporter !'); return; }

    const totalKm = deliveries.reduce((s, d) => s + (d.distance || 0), 0);
    const baseTrajets = deliveries.reduce((s, d) => s + (d.payment || 0), 0);
    const partieFixe = getPartieFixeAnnuelle(userSettings.vehicleType, userSettings.motorisation, userSettings.fiscalPower, userSettings.annualKm);
    const totalAvecPartieFixe = baseTrajets + partieFixe;
    const today = new Date().toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

    // Pré-charger le logo en base64 pour que print() l'affiche sans délai réseau
    let logoSrc = 'icons/logo-display-512.png';
    try {
        const resp = await fetch('icons/logo-display-512.png');
        if (resp.ok) {
            const buf = await resp.arrayBuffer();
            const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
            logoSrc = `data:image/png;base64,${b64}`;
        }
    } catch(e) { /* on garde l'URL relative en fallback */ }

    const rows = deliveries.map(d => `
        <tr>
            <td>${escapeHtml(d.date || '')}</td>
            <td>${escapeHtml(d.clientName || '')}</td>
            <td>${escapeHtml(d.startTime || '')}</td>
            <td>${escapeHtml(d.endTime || '')}</td>
            <td style="text-align:right">${d.startKm || 0}</td>
            <td style="text-align:right">${d.endKm || 0}</td>
            <td style="text-align:right">${(d.distance || 0).toFixed(0)}</td>
            <td style="text-align:right">${(d.payment || 0).toFixed(2)} €</td>
            <td>${escapeHtml(d.notes || '')}</td>
        </tr>`).join('');

    document.getElementById('printContent').innerHTML = `
        <div class="print-header">
            <img src="${logoSrc}" class="print-logo" alt="Route Note">
            <div class="print-header-text">
                <h1>Route Note — Rapport de déplacements</h1>
                <p>${escapeHtml(currentUser.username)} · Généré le ${today} · ${deliveries.length} trajet${deliveries.length > 1 ? 's' : ''}</p>
            </div>
        </div>
        <table class="print-table">
            <thead>
                <tr>
                    <th>Date</th><th>Motif</th><th>Départ</th><th>Arrivée</th>
                    <th>Km départ</th><th>Km arrivée</th><th>Distance</th><th>Indemnité</th><th>Notes</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="print-totals">
            <div class="print-total-row"><span>Distance totale</span><strong>${totalKm.toFixed(1)} km</strong></div>
            <div class="print-total-row"><span>Indemnités trajets</span><strong>${baseTrajets.toFixed(2)} €</strong></div>
            ${partieFixe > 0 ? `<div class="print-total-row"><span>Partie fixe annuelle</span><strong>${partieFixe.toFixed(2)} €</strong></div>` : ''}
            <div class="print-total-row print-total-final"><span>Total remboursement</span><strong>${totalAvecPartieFixe.toFixed(2)} €</strong></div>
        </div>`;

    window.print();
    showNotification('✅ Impression lancée !');
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
        if (view !== 'dashboard') closeDeliveryModal();
    });
});


// ===== SYNC AUTOMATIQUE EN ARRIÈRE-PLAN =====
// Sync toutes les 2 minutes si en ligne et connecté
setInterval(() => {
    if (currentUser && navigator.onLine && supabaseClient) {
        CloudSync.syncDeliveries(currentUser.username).catch(() => {});
    }
}, 2 * 60 * 1000);

console.log('✅ Route Note PWA v3 chargé !');