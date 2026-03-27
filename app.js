// ================================
// ROUTE NOTE - PWA JavaScript
// Version avec Supabase + LocalStorage hybride
// ================================

// ===== CONFIGURATION SUPABASE =====
const SUPABASE_URL = 'https://picyuqnjhjmmomxxcgrg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpY3l1cW5qaGptbW9teHhjZ3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NTcxNDEsImV4cCI6MjA5MDEzMzE0MX0.9IypoAHc5Z1z2j3BIT6FQQOZtoak-KJ7beoPgjtji20';

// Client Supabase (sera initialisé après chargement du SDK)
let supabase = null;

// ===== ENREGISTREMENT SERVICE WORKER =====
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker enregistré'))
            .catch(err => console.log('❌ Erreur SW:', err));
    });
}

// ===== INITIALISATION SUPABASE =====
function initSupabase() {
    console.log('🔄 Tentative d\'initialisation Supabase...');
    console.log('window.supabase existe ?', !!window.supabase);
    
    if (window.supabase && window.supabase.createClient) {
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase initialisé avec succès');
            console.log('URL:', SUPABASE_URL);
            return true;
        } catch (error) {
            console.error('❌ Erreur création client Supabase:', error);
            return false;
        }
    }
    console.warn('⚠️ SDK Supabase non chargé, mode hors ligne activé');
    return false;
}

// ===== SYSTÈME DE STOCKAGE HYBRIDE =====
class HybridStorage {
    // ===== LOCAL STORAGE (Cache/Offline) =====
    static getLocalUsers() {
        return JSON.parse(localStorage.getItem('users') || '{}');
    }

    static saveLocalUsers(users) {
        localStorage.setItem('users', JSON.stringify(users));
    }

    static getLocalDeliveries(username) {
        const key = `deliveries_${username}`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    }

    static saveLocalDeliveries(username, deliveries) {
        const key = `deliveries_${username}`;
        localStorage.setItem(key, JSON.stringify(deliveries));
    }

    static getLocalSettings(username) {
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

    static saveLocalSettings(username, settings) {
        const key = `settings_${username}`;
        localStorage.setItem(key, JSON.stringify(settings));
    }

    // ===== SUPABASE AUTH =====
    static async signUp(email, password, username) {
        console.log('📝 Tentative inscription...', { email, username });
        
        if (!supabase) {
            console.error('❌ Supabase non initialisé');
            throw new Error('Mode hors ligne - inscription impossible. Vérifiez votre connexion internet.');
        }
        
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: { username: username }
                }
            });
            
            console.log('Réponse signUp:', { data, error });
            
            if (error) {
                console.error('❌ Erreur Supabase signUp:', error);
                throw error;
            }
            
            // Sauvegarder aussi en local pour le mode offline
            const users = this.getLocalUsers();
            users[username] = {
                email: email,
                password: btoa(password),
                supabaseId: data.user?.id,
                createdAt: new Date().toISOString()
            };
            this.saveLocalUsers(users);
            
            console.log('✅ Inscription réussie');
            return data;
            
        } catch (err) {
            console.error('❌ Exception signUp:', err);
            throw err;
        }
    }

    static async signIn(emailOrUsername, password) {
        console.log('🔐 Tentative connexion...', { emailOrUsername });
        
        // Essayer d'abord Supabase
        if (supabase) {
            try {
                // Déterminer si c'est un email ou username
                let email = emailOrUsername;
                if (!emailOrUsername.includes('@')) {
                    // C'est un username, chercher l'email en local
                    const users = this.getLocalUsers();
                    console.log('Users locaux:', Object.keys(users));
                    if (users[emailOrUsername]?.email) {
                        email = users[emailOrUsername].email;
                        console.log('Email trouvé pour username:', email);
                    } else {
                        console.log('Pas d\'email trouvé, essai mode local');
                        throw new Error('Username sans email associé');
                    }
                }

                console.log('Connexion Supabase avec email:', email);
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                console.log('Réponse signIn:', { data, error });
                
                if (error) {
                    console.error('❌ Erreur Supabase signIn:', error);
                    throw error;
                }
                
                // Récupérer le profil depuis Supabase
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();
                
                console.log('Profil récupéré:', { profile, profileError });
                
                const username = profile?.username || emailOrUsername.split('@')[0];
                
                // Mettre à jour le cache local
                const users = this.getLocalUsers();
                users[username] = {
                    email: email,
                    password: btoa(password),
                    supabaseId: data.user.id,
                    createdAt: users[username]?.createdAt || new Date().toISOString()
                };
                this.saveLocalUsers(users);
                
                // Sync les settings depuis Supabase
                if (profile) {
                    const settings = {
                        vehicleType: profile.vehicle_type || 'auto',
                        motorisation: profile.motorisation || 'thermique',
                        fiscalPower: profile.fiscal_power || 'cv4',
                        annualKm: profile.annual_km || 'tranche2',
                        theme: profile.theme || 'blue'
                    };
                    this.saveLocalSettings(username, settings);
                }
                
                // Sync les livraisons depuis Supabase
                await this.syncDeliveriesFromCloud(username, data.user.id);
                
                console.log('✅ Connexion Supabase réussie');
                return { 
                    user: data.user, 
                    username: username,
                    isOnline: true 
                };
                
            } catch (error) {
                console.warn('⚠️ Connexion Supabase échouée:', error.message);
                console.log('Tentative connexion locale...');
            }
        } else {
            console.log('Supabase non disponible, mode local');
        }
        
        // Fallback : connexion locale
        return this.signInLocal(emailOrUsername, password);
    }

    static signInLocal(username, password) {
        const users = this.getLocalUsers();
        const user = users[username];
        
        if (!user || user.password !== btoa(password)) {
            throw new Error('Identifiant ou mot de passe incorrect');
        }
        
        return { 
            user: { id: user.supabaseId || username },
            username: username,
            isOnline: false 
        };
    }

    static async signOut() {
        if (supabase) {
            await supabase.auth.signOut();
        }
        localStorage.removeItem('currentUser');
    }

    // ===== SYNC DELIVERIES =====
    static async syncDeliveriesFromCloud(username, userId) {
        if (!supabase || !userId) return;
        
        try {
            const { data: cloudDeliveries, error } = await supabase
                .from('deliveries')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            // Convertir format Supabase vers format local
            const localFormat = cloudDeliveries.map(d => ({
                id: d.local_id || d.id,
                date: d.date,
                clientName: d.client_name,
                startTime: d.start_time,
                endTime: d.end_time,
                startKm: d.start_km,
                endKm: d.end_km,
                distance: d.distance,
                payment: d.payment,
                vehicleConfig: d.vehicle_config,
                notes: d.notes,
                createdAt: d.created_at,
                supabaseId: d.id,
                synced: true
            }));
            
            // Fusionner avec les données locales non synchronisées
            const localDeliveries = this.getLocalDeliveries(username);
            const unsyncedLocal = localDeliveries.filter(d => !d.synced);
            
            // Combiner : cloud + local non synchronisé
            const merged = [...localFormat];
            for (const local of unsyncedLocal) {
                if (!merged.find(d => d.id === local.id)) {
                    merged.push(local);
                }
            }
            
            // Trier par date décroissante
            merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            this.saveLocalDeliveries(username, merged);
            console.log(`✅ Sync: ${cloudDeliveries.length} trajets récupérés du cloud`);
            
        } catch (error) {
            console.error('❌ Erreur sync cloud:', error);
        }
    }

    static async syncDeliveriesToCloud(username) {
        if (!supabase) return;
        
        const session = await supabase.auth.getSession();
        const userId = session?.data?.session?.user?.id;
        
        if (!userId) return;
        
        const localDeliveries = this.getLocalDeliveries(username);
        const unsynced = localDeliveries.filter(d => !d.synced);
        
        if (unsynced.length === 0) return;
        
        console.log(`📤 Synchronisation de ${unsynced.length} trajets vers le cloud...`);
        
        for (const delivery of unsynced) {
            try {
                const cloudData = {
                    user_id: userId,
                    local_id: delivery.id,
                    date: delivery.date,
                    client_name: delivery.clientName,
                    start_time: delivery.startTime || null,
                    end_time: delivery.endTime || null,
                    start_km: delivery.startKm || 0,
                    end_km: delivery.endKm || 0,
                    distance: delivery.distance || 0,
                    payment: delivery.payment || 0,
                    vehicle_config: delivery.vehicleConfig || {},
                    notes: delivery.notes || null
                };
                
                const { data, error } = await supabase
                    .from('deliveries')
                    .upsert(cloudData, { 
                        onConflict: 'user_id,local_id',
                        ignoreDuplicates: false 
                    })
                    .select()
                    .single();
                
                if (error) throw error;
                
                // Marquer comme synchronisé
                delivery.synced = true;
                delivery.supabaseId = data.id;
                
            } catch (error) {
                console.error('❌ Erreur sync trajet:', error);
            }
        }
        
        this.saveLocalDeliveries(username, localDeliveries);
        console.log('✅ Synchronisation terminée');
    }

    static async saveDelivery(username, delivery) {
        // Toujours sauvegarder en local d'abord
        const deliveries = this.getLocalDeliveries(username);
        
        // Marquer comme non synchronisé
        delivery.synced = false;
        
        // Ajouter ou mettre à jour
        const existingIndex = deliveries.findIndex(d => d.id === delivery.id);
        if (existingIndex >= 0) {
            deliveries[existingIndex] = delivery;
        } else {
            deliveries.unshift(delivery);
        }
        
        this.saveLocalDeliveries(username, deliveries);
        
        // Tenter de sync vers le cloud en arrière-plan
        this.syncDeliveriesToCloud(username).catch(console.error);
        
        return delivery;
    }

    static async deleteDelivery(username, deliveryId) {
        // Supprimer en local
        let deliveries = this.getLocalDeliveries(username);
        const toDelete = deliveries.find(d => d.id === deliveryId);
        deliveries = deliveries.filter(d => d.id !== deliveryId);
        this.saveLocalDeliveries(username, deliveries);
        
        // Supprimer du cloud si synchronisé
        if (supabase && toDelete?.supabaseId) {
            try {
                await supabase
                    .from('deliveries')
                    .delete()
                    .eq('id', toDelete.supabaseId);
            } catch (error) {
                console.error('❌ Erreur suppression cloud:', error);
            }
        }
    }

    // ===== SYNC SETTINGS =====
    static async saveSettings(username, settings) {
        // Toujours sauvegarder en local
        this.saveLocalSettings(username, settings);
        
        // Sync vers Supabase si connecté
        if (supabase) {
            try {
                const session = await supabase.auth.getSession();
                const userId = session?.data?.session?.user?.id;
                
                if (userId) {
                    await supabase
                        .from('profiles')
                        .update({
                            vehicle_type: settings.vehicleType,
                            motorisation: settings.motorisation,
                            fiscal_power: settings.fiscalPower,
                            annual_km: settings.annualKm,
                            theme: settings.theme
                        })
                        .eq('id', userId);
                }
            } catch (error) {
                console.error('❌ Erreur sync settings:', error);
            }
        }
    }

    // ===== MIGRATION DES DONNÉES EXISTANTES =====
    static async migrateExistingData(username) {
        if (!supabase) return;
        
        const session = await supabase.auth.getSession();
        const userId = session?.data?.session?.user?.id;
        
        if (!userId) return;
        
        const localDeliveries = this.getLocalDeliveries(username);
        const unsynced = localDeliveries.filter(d => !d.synced && !d.supabaseId);
        
        if (unsynced.length > 0) {
            console.log(`🔄 Migration de ${unsynced.length} trajets existants...`);
            await this.syncDeliveriesToCloud(username);
        }
    }
}

// ===== ÉTAT DE CONNEXION =====
class ConnectionStatus {
    static isOnline() {
        return navigator.onLine;
    }

    static init() {
        window.addEventListener('online', () => {
            console.log('📶 Connexion rétablie');
            this.showStatus('online');
            // Synchroniser les données en attente
            if (currentUser) {
                HybridStorage.syncDeliveriesToCloud(currentUser.username);
            }
        });

        window.addEventListener('offline', () => {
            console.log('📴 Mode hors ligne');
            this.showStatus('offline');
        });
    }

    static showStatus(status) {
        // Créer ou mettre à jour l'indicateur de statut
        let indicator = document.getElementById('connectionStatus');
        
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'connectionStatus';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                z-index: 9999;
                transition: all 0.3s ease;
                opacity: 0;
            `;
            document.body.appendChild(indicator);
        }

        if (status === 'online') {
            indicator.textContent = '📶 En ligne';
            indicator.style.background = 'linear-gradient(135deg, #d1fae5, #10b981)';
            indicator.style.color = '#065f46';
        } else {
            indicator.textContent = '📴 Hors ligne';
            indicator.style.background = 'linear-gradient(135deg, #fee2e2, #ef4444)';
            indicator.style.color = '#991b1b';
        }

        indicator.style.opacity = '1';
        
        setTimeout(() => {
            indicator.style.opacity = '0';
        }, 3000);
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
function calculateIndemnitePourTrajet(distance, vehicleType, motorisation, fiscalPower, annualKm) {
    const key = `${vehicleType}_${motorisation}`;
    const bareme = BAREME_KM[key];
    
    if (!bareme) return 0;
    
    let powerKey = fiscalPower;
    if (vehicleType === 'cyclo') {
        powerKey = 'unique';
    }
    
    const tranches = bareme[powerKey];
    if (!tranches) return 0;
    
    const tranche = tranches[annualKm];
    if (!tranche) return 0;
    
    if (annualKm === 'tranche1' || annualKm === 'tranche3') {
        return tranche.calc(distance);
    } else {
        const coef = getCoefMultiplication(vehicleType, motorisation, powerKey);
        return distance * coef;
    }
}

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

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', async () => {
    // Initialiser Supabase
    initSupabase();
    
    // Initialiser le monitoring de connexion
    ConnectionStatus.init();
    
    // Vérifier si utilisateur déjà connecté
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        await loadUserData();
        showApp();
        setTimeout(() => updateUI(), 0);
        
        // Tenter une sync en arrière-plan
        if (supabase && ConnectionStatus.isOnline()) {
            HybridStorage.syncDeliveriesToCloud(currentUser.username).catch(console.error);
        }
    }
});

// ===== INSCRIPTION =====
document.getElementById('switchToRegister').addEventListener('click', async () => {
    // Afficher le formulaire d'inscription
    const email = prompt('Entrez votre email :');
    if (!email || !email.includes('@')) {
        showError('Email invalide');
        return;
    }

    const username = prompt('Choisissez un identifiant :');
    if (!username || username.trim() === '') {
        showError('Identifiant requis');
        return;
    }

    const password = prompt('Choisissez un mot de passe (min 6 caractères) :');
    if (!password || password.length < 6) {
        showError('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }

    try {
        if (supabase && ConnectionStatus.isOnline()) {
            await HybridStorage.signUp(email, password, username.trim());
            showSuccess('Compte créé ! Vérifiez votre email pour confirmer, puis connectez-vous.');
        } else {
            // Mode hors ligne : création locale uniquement
            const users = HybridStorage.getLocalUsers();
            if (users[username.trim()]) {
                throw new Error('Cet identifiant existe déjà');
            }
            users[username.trim()] = {
                email: email,
                password: btoa(password),
                createdAt: new Date().toISOString(),
                localOnly: true
            };
            HybridStorage.saveLocalUsers(users);
            showSuccess('Compte créé en mode hors ligne. Reconnectez-vous quand vous aurez internet pour synchroniser.');
        }
    } catch (error) {
        showError(error.message);
    }
});

// ===== CONNEXION =====
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessages();

    const emailOrUsername = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    // Afficher un indicateur de chargement
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Connexion...';
    submitBtn.disabled = true;

    try {
        const result = await HybridStorage.signIn(emailOrUsername, password);
        
        currentUser = {
            username: result.username,
            id: result.user.id,
            isOnline: result.isOnline
        };
        
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        await loadUserData();
        showApp();
        
        // Afficher un message selon le mode
        if (result.isOnline) {
            ConnectionStatus.showStatus('online');
        } else {
            ConnectionStatus.showStatus('offline');
        }
        
    } catch (error) {
        showError(error.message);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
});

// ===== DÉCONNEXION =====
document.getElementById('logoutBtn').addEventListener('click', async () => {
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        // Synchroniser avant déconnexion si possible
        if (currentUser && supabase && ConnectionStatus.isOnline()) {
            await HybridStorage.syncDeliveriesToCloud(currentUser.username);
        }
        
        await HybridStorage.signOut();
        currentUser = null;
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
    setTimeout(() => authSuccess.classList.add('hidden'), 5000);
}

function hideMessages() {
    authError.classList.add('hidden');
    authSuccess.classList.add('hidden');
}

// ===== CHARGEMENT DONNÉES UTILISATEUR =====
async function loadUserData() {
    userSettings = HybridStorage.getLocalSettings(currentUser.username);
    deliveries = HybridStorage.getLocalDeliveries(currentUser.username);
}

async function saveSettings() {
    await HybridStorage.saveSettings(currentUser.username, userSettings);
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
    
    const partieFixe = getPartieFixeAnnuelle(
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    );
    
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
    
    updateKmRanges();
    updateFiscalPowerOptions();
    displayCalculatedRate();
}

function displayCalculatedRate() {
    const kmReference = (userSettings.vehicleType === 'auto') ? 12500 : 4500;
    
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

function updatePresetButtons() {}

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
        <div class="delivery-card ${delivery.synced ? '' : 'unsynced'}">
            <div class="delivery-header">
                <div style="flex:1;">
                    <div class="delivery-client">
                        📦 ${delivery.clientName}
                        ${!delivery.synced ? '<span class="sync-badge" title="Non synchronisé">⏳</span>' : ''}
                    </div>
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
async function deleteDelivery(id) {
    if (!confirm('Supprimer ce trajet ?')) return;
    
    await HybridStorage.deleteDelivery(currentUser.username, id);
    deliveries = HybridStorage.getLocalDeliveries(currentUser.username);
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
    
    navigator.geolocation.getCurrentPosition(
        () => {
            console.log('✅ Permission GPS accordée');
        },
        (error) => {
            if (error.code === error.PERMISSION_DENIED) {
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
document.getElementById('deliveryForm').addEventListener('submit', async (e) => {
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
        createdAt: new Date().toISOString(),
        synced: false
    };

    await HybridStorage.saveDelivery(currentUser.username, delivery);
    deliveries = HybridStorage.getLocalDeliveries(currentUser.username);
    
    updateUI();
    document.getElementById('deliveryFormContainer').classList.add('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
    document.getElementById('deliveryForm').reset();
    document.getElementById('deliveryDate').value = new Date().toISOString().split('T')[0];
    
    showNotification('✅ Déplacement enregistré !');
});

// ===== NOTIFICATION HELPER =====
function showNotification(message, type = 'success') {
    const msgDiv = document.createElement('div');
    const bgColor = type === 'success' 
        ? 'linear-gradient(135deg, #10b981, #059669)'
        : 'linear-gradient(135deg, #f59e0b, #d97706)';
    
    msgDiv.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: ${bgColor}; color: white;
        padding: 16px 24px; border-radius: 12px; font-weight: 600;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 9999;
        animation: slideDown 0.3s ease-out;
    `;
    msgDiv.innerHTML = message;
    document.body.appendChild(msgDiv);
    
    setTimeout(() => {
        msgDiv.style.animation = 'slideUp 0.3s ease-out';
        setTimeout(() => msgDiv.remove(), 300);
    }, 3000);
}

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
            
            console.log('✅ Trajet démarré ! GPS activé');
        },
        (error) => {
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
async function stopGPSTrip() {
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
        createdAt: new Date().toISOString(),
        synced: false
    };
    
    await HybridStorage.saveDelivery(currentUser.username, delivery);
    deliveries = HybridStorage.getLocalDeliveries(currentUser.username);
    
    resetTrip();
    updateUI();
    
    document.getElementById('deliveryFormContainer').classList.add('hidden');
    document.getElementById('fabBtn').classList.remove('hidden');
    
    showNotification(`✅ Trajet GPS enregistré !<br><small>${tripData.distance.toFixed(2)} km • ${payment.toFixed(2)} €</small>`);
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
document.querySelectorAll('input[name="vehicleType"]').forEach(input => {
    input.addEventListener('change', function() {
        userSettings.vehicleType = this.value;
        updateKmRanges();
        updateFiscalPowerOptions();
        saveSettings();
        displayCalculatedRate();
    });
});

document.querySelectorAll('input[name="motorisation"]').forEach(input => {
    input.addEventListener('change', function() {
        userSettings.motorisation = this.value;
        saveSettings();
        displayCalculatedRate();
    });
});

const fiscalPowerSelect = document.getElementById('fiscalPower');
if (fiscalPowerSelect) {
    fiscalPowerSelect.addEventListener('change', function() {
        userSettings.fiscalPower = this.value;
        saveSettings();
        displayCalculatedRate();
    });
}

const annualKmSelect = document.getElementById('annualKm');
if (annualKmSelect) {
    annualKmSelect.addEventListener('change', function() {
        userSettings.annualKm = this.value;
        saveSettings();
        displayCalculatedRate();
    });
}

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
    
    annualKmSelect.value = userSettings.annualKm;
}

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

    const totalKm = deliveries.reduce((sum, d) => sum + (d.distance || 0), 0);
    const baseTrajets = deliveries.reduce((sum, d) => sum + (d.payment || 0), 0);
    
    const partieFixe = typeof getPartieFixeAnnuelle === 'function' ? getPartieFixeAnnuelle(
        userSettings.vehicleType,
        userSettings.motorisation,
        userSettings.fiscalPower,
        userSettings.annualKm
    ) : 0;
    
    const totalAvecPartieFixe = baseTrajets + partieFixe;

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

    data.push(['']);
    data.push(['TOTAUX', '', '', '', '', '', totalKm.toFixed(0), baseTrajets.toFixed(2), '']);
    
    data.push(['']);
    data.push(['DÉTAIL DU CALCUL FINANCIER', '', '', '', '']); 
    data.push(['Base trajets cumulée (km × tarif)', '', '', '', baseTrajets.toFixed(2) + ' €']);
    data.push(['Forfait annuel (selon barème)', '', '', '', partieFixe.toFixed(2) + ' €']);
    data.push(['TOTAL GLOBAL', '', '', '', totalAvecPartieFixe.toFixed(2) + ' €']);
    
    data.push(['']);
    data.push(['STATISTIQUES D\'ACTIVITÉ', '', '', '', '']);
    data.push(['Nombre total de déplacements', '', '', '', deliveries.length]);
    data.push(['Distance totale parcourue', '', '', '', totalKm.toFixed(0) + ' km']);
    data.push(['Moyenne par trajet', '', '', '', (deliveries.length > 0 ? (totalKm / deliveries.length).toFixed(0) : 0) + ' km']);

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws['!cols'] = [
        { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 35 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Déplacements');

    const filename = `Route_Note_${currentUser.username}_${new Date().toISOString().split('T')[0]}.xlsx`;

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const file = new File([blob], filename, { type: blob.type });

    if (isMobile && navigator.canShare && navigator.canShare({ files: [file] })) {
        const userChoice = confirm("Comment voulez-vous enregistrer le fichier ?\n\n[OK] = Choisir mon dossier (Partager)\n[Annuler] = Téléchargement rapide");

        if (userChoice) {
            navigator.share({
                files: [file],
                title: 'Export Route Note'
            })
            .then(() => showNotification('✅ Export réussi !'))
            .catch((error) => console.log('Partage annulé', error));
        } else {
            XLSX.writeFile(wb, filename);
            showNotification('✅ Fichier téléchargé !<br><small>Vérifiez votre dossier "Téléchargements".</small>');
        }
    } else {
        XLSX.writeFile(wb, filename);
        showNotification('✅ Fichier téléchargé !<br><small>Regardez dans votre dossier Téléchargements.</small>');
    }
});

// ===== BOUTON SYNC MANUEL =====
// Ajouter dans les settings pour forcer une sync
async function forceSync() {
    if (!currentUser) return;
    
    showNotification('🔄 Synchronisation en cours...', 'info');
    
    try {
        await HybridStorage.syncDeliveriesToCloud(currentUser.username);
        deliveries = HybridStorage.getLocalDeliveries(currentUser.username);
        updateUI();
        showNotification('✅ Synchronisation terminée !');
    } catch (error) {
        showNotification('❌ Erreur de synchronisation', 'error');
    }
}

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

console.log('✅ Route Note PWA avec Supabase chargé !');