// ─────────────────────────────────────────────────────────────────────────────
// Variables globales
// ─────────────────────────────────────────────────────────────────────────────
let isExtensionActive = true; // Indique si l'extension est active
let areStatsActive = false; // Indique si le suivi des statistiques est actif
let originalTabId = null; // ID de l'onglet original
let loginTabId = null; // ID de l'onglet de connexion

const AUTH_LOGIN_URL = "https://prisms.lezinter.net/fr/login"; // URL de connexion
const AUTH_BALEX_URL = "https://prisms.lezinter.net/fr/headquarters/balex"; // URL de redirection vers BaLex

// ─────────────────────────────────────────────────────────────────────────────
// Logs de démarrage et initialisation
// ─────────────────────────────────────────────────────────────────────────────
log("ff2BaLex (background) chargé.");
browser.runtime.onInstalled.addListener((details) => {
  log("Extension installée ou mise à jour. Raison :", details.reason);
});
browser.runtime.onStartup.addListener(() => {
  log("Extension démarrée (onStartup).");
});
browser.runtime.onInstalled.addListener(() => {
  browser.storage.local.set({ extensionActive: false });
  log("Extension installée, état initialisé à désactivé.");
  sendAuthTokenToWorker();
});

// ─────────────────────────────────────────────────────────────────────────────
// Suivi des changements dans le stockage
// ─────────────────────────────────────────────────────────────────────────────
browser.storage.onChanged.addListener((changes) => {
  // Vérifie si l'état de l'extension a changé
  if (changes.extensionActive) {
    isExtensionActive = changes.extensionActive.newValue; // Met à jour la variable d'état de l'extension
    log("Extension activée :", isExtensionActive);
  }
  // Vérifie si l'état des statistiques a changé
  if (changes.statsActive) {
    areStatsActive = changes.statsActive.newValue; // Met à jour la variable d'état des statistiques
    log("Statistiques activées :", areStatsActive);
  }
  // Rafraîchit l'interface utilisateur globale
  refreshAllUI();
});

browser.storage.onChanged.addListener((changes, area) => {
    // Vérifie si les changements concernent le stockage local et le token d'accès
  if (area === "local" && changes.accessToken) {
    const newToken = changes.accessToken.newValue; // Récupère la nouvelle valeur du token
    if (newToken) {
    // Vérifie l'état de l'extension dans le stockage local
      browser.storage.local.get("extensionActive").then(({ extensionActive }) => {
      // Si l'extension n'est pas active, l'active automatiquement
        if (!extensionActive) {
          log("Token ajouté, activation automatique de l'extension.");
          browser.storage.local.set({ extensionActive: true }); // Met à jour l'état de l'extension
          // updateExtension(); // Met à jour les fonctionnalités de l'extension
         // Envoie un message pour mettre à jour l'interface utilisateur
          browser.runtime.sendMessage({
            action: "updateUI",
            extensionActive: true,
            isTrackingActive: true,
            autoAdd: true
          });
        }
      });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions utilitaires
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Vérifie si l'utilisateur est connecté en vérifiant le token d'accès.
 * @returns {Promise<boolean>} True si l'utilisateur est connecté, sinon false.
 */
async function isUserConnected() {
  const { accessToken } = await browser.storage.local.get("accessToken");
  return !!accessToken;
}

/**
 * Rafraîchit l'interface utilisateur globale.
 * Envoie un message pour demander le rafraîchissement de l'UI.
 * @returns {Promise<void>}
 */
async function refreshAllUI() {
  log("Rafraîchissement global de l'UI...");
  try {
    await browser.runtime.sendMessage({ action: "refreshUI" });
  } catch (error) {
    console.warn("Aucun récepteur pour 'refreshUI' :", error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions d'authentification & de redirection
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Gère la connexion ou la déconnexion de l'utilisateur
 * @param {Object} port - Le port de communication avec le plugin
 */
browser.runtime.onConnect.addListener((port) => {
  if (port.name === "auth") {
    port.onMessage.addListener(async (message) => {
      if (message.action === "toggleAuth") {
        log("toggleAuth reçu via port dans le background.");
        const isConnected = await isUserConnected(); // Vérifie si l'utilisateur est connecté
        if (isConnected) {
          await disconnectFromLexicalDB(); // Déconnecte l'utilisateur
        } else {
          actuallyOpenLoginPage(); // Ouvre la page de connexion
        }
      }
    });
  }
});

/**
 * Ouvre la page de connexion pour l'utilisateur.
 * Mémorise l'onglet actif et crée un nouvel onglet pour la connexion.
 * @returns {Promise<void>}
 */
async function actuallyOpenLoginPage() {
  log("Ouverture de la page de connexion.");

  // Mémoriser l'onglet actif
  const [currentTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (currentTab) {
    originalTabId = currentTab.id; // Mémorise l'ID de l'onglet courant
    log("Onglet courant mémorisé, ID =", originalTabId);
  }
  // Ouvre un nouvel onglet pour la page de connexion et l'active
  const loginTab = await browser.tabs.create({ url: AUTH_LOGIN_URL, active: true });
  loginTabId = loginTab.id; // Mémorise l'ID de l'onglet de connexion
  log("Onglet de login créé, ID =", loginTabId);
  browser.runtime.sendMessage({ action: "authStatusChanged", isLoggedIn: false });
}

/**
 * Déconnecte l'utilisateur.
 * Supprime le token d'accès et désactive l'extension.
 * @returns {Promise<void>}
 */
async function disconnectFromLexicalDB() {
  await browser.storage.local.remove("accessToken"); // Supprime le token d'accès
  log("Token supprimé avec succès.");

  await browser.storage.local.remove("lexiconColors"); // Supprime les couleurs du lexique

  // Désactivation automatique de l'extension
  await browser.storage.local.set({ extensionActive: false }); // Met à jour l'état de l'extension
  disableExtensionFeatures(); // Désactive les fonctionnalités de l'extension
  browser.runtime.sendMessage({
    action: "updateUI",
    extensionActive: false,
    isTrackingActive: false,
    autoAdd: false
  });

  setTimeout(async () => {
    await refreshAllUI(); // Rafraîchit l'UI après un délai
  }, 500);
}

/**
 * Sauvegarde le token d'accès dans le stockage local.
 * @param {string} token - Le token à sauvegarder.
 * @returns {Promise<void>}
 */
async function saveToken(token) {
  log("Sauvegarde du token :", token);
  await browser.storage.local.set({ accessToken: token });

  if (loginTabId) {
    try {
      await browser.tabs.remove(loginTabId); // Ferme l'onglet de connexion
      log("Onglet de login fermé après connexion réussie.");
    } catch (err) {
      console.warn("Impossible de fermer l'onglet de login :", err);
    }
    loginTabId = null; // Réinitialise l'ID de l'onglet de connexion
  }
  if (originalTabId) {
    try {
      await browser.tabs.update(originalTabId, { active: true }); // Retourne sur l'onglet initial
      log("Retour sur l'onglet initial :", originalTabId);
    } catch (err) {
      console.warn("Impossible de basculer sur l'onglet initial :", err);
    }
    originalTabId = null; // Réinitialise l'ID de l'onglet original
  }

  // Activer automatiquement l'extension
  const { extensionActive } = await browser.storage.local.get("extensionActive");
  if (!extensionActive) {
    await browser.storage.local.set({ extensionActive: true }); // Met à jour l'état de l'extension
    // updateExtension(); // Met à jour les fonctionnalités de l'extension    
    browser.runtime.sendMessage({
      action: "updateUI",
      extensionActive: true,
      isTrackingActive: true,
      autoAdd: true
    });
  }
  await refreshAllUI();
}

/**
 * Gère les événements de navigation web pour injecter des scripts et récupérer le token.
 * @param {Object} details - Détails de l'événement de navigation.
 * @returns {Promise<void>}
 */
browser.webNavigation.onCompleted.addListener(async (details) => {
  const url = new URL(details.url);

  // Injection d'un popup d'instruction sur la page de login
  if (url.hostname === "prisms.lezinter.net" && url.pathname === "/fr/login") {
    log("Injection du popup d'instruction sur la page de login Prisms.");
    showInstructionPopup(details);
  }
  // Récupération du token sur la page /balex
  if (url.hostname === "prisms.lezinter.net" && url.pathname === "/fr/headquarters/balex") {
    log("Page /balex détectée. Tentative de récupération du token.");
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      await browser.tabs.executeScript(details.tabId, {
        code: `
          (function() {
            log("Recherche du token...");
            const tokenElement = document.getElementById("accessToken") || document.getElementById("accesToken");
            if (tokenElement) {
              const token = tokenElement.innerText.trim();
              log("Token détecté :", token);
              browser.runtime.sendMessage({ action: "saveToken", token });
            } else {
              log("Token introuvable.");
            }
            return null;
          })();
        `
      });
    } catch (error) {
      log("Erreur lors de la récupération du token :", error);
    }
  }
}, { url: [{ hostContains: "prisms.lezinter.net" }] });

/**
 * Redirige automatiquement vers /balex.
 * @param {Object} details - Détails de la requête.
 */
browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.url === "https://prisms.lezinter.net/fr/headquarters/") {
      log("Redirection automatique vers /balex.");
      return { redirectUrl: AUTH_BALEX_URL };
    }
  },
  { urls: ["https://prisms.lezinter.net/fr/headquarters/*"] },
  ["blocking"]
);

/**
 * Affiche un popup d'instruction sur /fr/login.
 * @param {Object} details - Détails de l'onglet.
 */
function showInstructionPopup(details) {
  browser.tabs.executeScript(details.tabId, {
    code: `
      if (!document.getElementById("balex-instruction-popup")) {
        const popup = document.createElement("div");
        popup.id = "balex-instruction-popup";
        popup.style.position = "fixed";
        popup.style.top = "50%";
        popup.style.left = "50%";
        popup.style.transform = "translate(-50%, -50%)";
        popup.style.backgroundColor = "#a08e9f";
        popup.style.color = "#323046";
        popup.style.padding = "12px";
        popup.style.borderRadius = "10px";
        popup.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.3)";
        popup.style.zIndex = "10000";
        popup.style.fontFamily = "Luciole";
        popup.style.fontSize = "16px";
        popup.style.width = "300px";
        popup.style.textAlign = "center";
  
        popup.innerHTML = \`
          <h5 style="color: #fff; font-weight: bold; margin-top: 2px;">Connexion à l'extension</h5>
          <p style="margin: 8px 0;">
            Après avoir renseigné vos identifiants, veuillez cliquer sur 
            <strong>"Se connecter avec BaLex"</strong>.
          </p>
          <button id="close-popup-btn" style="
            width: 100%;
            margin-top: 15px;
            padding: 8px;
            border: none;
            background-color: #8d5c70;
            color: #fbfcfc;
            font-weight: bold;
            cursor: pointer;
            border-radius: 5px;
          ">Fermer</button>
        \`;
  
        document.body.appendChild(popup);
  
        const closeBtn = document.getElementById("close-popup-btn");
        closeBtn.onclick = () => popup.remove();
      }
    `
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestion des messages reçus 
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Écouteur de messages reçus dans le script d'arrière-plan
 */
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  log("[Background] Message reçu :", message);

  // Traitement des actions basées sur le message reçu
  switch (message.action) {
    case "toggleAuth": {
      // Vérifie si l'utilisateur est connecté
      const isConnected = await isUserConnected();
      if (isConnected) {
        await disconnectFromLexicalDB();
        await browser.storage.local.remove("lexiconColors");
      } else {
        actuallyOpenLoginPage();
      }
      break;
    }
    case "getDefinitionWiki": {
      // Vérifie si le texte sélectionné est valide
      if (message.selectedText && message.selectedText.trim() !== "") {
        log("Requête Wiktionnaire pour :", message.selectedText);
        // Récupère la définition du texte sélectionné depuis le Wiktionnaire
        const definition = await window.fetchWiktionaryDefinition(message.selectedText.trim());
        // Envoie la réponse avec la définition récupérée
        browser.runtime.sendMessage({
          action: "fetchWiktionaryDefinitionResponse",
          selectedText: message.selectedText,
          definitions: [{
            source: "Wiktionnaire",
            text: definition,
          }],
        });
      } else {
        console.warn("️ Texte sélectionné vide. Annulation de la requête.");
      }
      break;
    }
    case "checkAuthStatus": {
      // Vérifie l'état de connexion de l'utilisateur et envoie la réponse
      const connected = await isUserConnected();
      sendResponse(connected);
      break;
    }
    case "authStatusChanged": {
      // Log l'état d'authentification mis à jour
      log("Mise à jour de l'état d'authentification :", message.isLoggedIn);
      break;
    }
    case "saveToken": {
      // Vérifie si un token a été reçu et le sauvegarde
      if (message.token) {
        await saveToken(message.token);
      } else {
        console.warn("️ Aucune valeur de token reçue.");
      }
      break;
    }
    case "toggleLexiconHighlight": {
      // Récupère l'onglet actif et applique le script de surlignage
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      if (tabs[0]) {
        try {
          // Injecte le script de surlignage dans l'onglet actif
          await browser.scripting.executeScript({
              target: { tabId: tabs[0].id },
              files: ["src/utils/highlighting.js"]
          });

          // Envoie un message pour activer ou désactiver le surlignage
          await browser.tabs.sendMessage(tabs[0].id, {
            command: message.isActive ? "activate-highlighting" : "deactivate-highlighting",
            lexiconId: message.lexiconId
          });
          log(`Message de surlignage transmis à l'onglet ${tabs[0].id}`);
        } catch (error) {
          log("Erreur lors de la gestion du surlignage:", error);
        }
      }
      break;
    }

    case "register-highlighting-script": {
      // Log l'enregistrement du script de surlignage pour l'onglet
      log("Script de surlignage enregistré pour l'onglet", sender.tab.id);
      break;
    }

    case "toggleExtension": {
      // Met à jour l'état de l'extension en fonction du message reçu
      const newState = message.isActive;
      isExtensionActive = newState;
      browser.storage.local.set({ extensionActive: isExtensionActive });
      log("État de l'extension mis à jour :", isExtensionActive);
      break;
    }
    
    default:
      break;
  }
  return true; // Indique que la réponse sera envoyée de manière asynchrone
});

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation du WebWorker
// ─────────────────────────────────────────────────────────────────────────────
let worker = null;

/**
 * Initialise le WebWorker pour le traitement en arrière-plan.
 * @returns {void}
 */
function initWorker() {
  if (!worker) {
    log("[Background] Initialisation du WebWorker...");
    try {
      worker = new Worker(browser.runtime.getURL("src/workers/pyodide_worker.js"));
      worker.addEventListener("message", handleWorkerMessage);
      worker.addEventListener("error", handleWorkerError);
      log("[Background] WebWorker initialisé avec succès.");
      // Charger Pyodide et Simplemma
      worker.postMessage({ command: "pyodide-simplemma" });
    } catch (error) {
      log("[Background] Erreur lors de l'initialisation du WebWorker :", error);
    }
  }
}

/**
 * Gère les erreurs du WebWorker.
 * @param {Error} error - L'erreur.
 */
function handleWorkerError(error) {
  log("Erreur du WebWorker :", error.message);
}

/**
 * Gère les messages du WebWorker.
 * @param {Object} event - L'événement.
 */
function handleWorkerMessage(event) {
  const data = event.data;
  log("[Background] Message du WebWorker :", data);

  switch (data.type) {
    case "pyodide-simplemma":
      // Vérifie le statut de Pyodide et Simplemma
      if (data.status === "success") {
        log("[Background] Pyodide et Simplemma prêts. Mise à jour de l'état.");
        // Met à jour l'état dans le stockage local
        browser.storage.local.set({ pyodideSimplemmaReady: true });
        // Vérifie et met à jour le suivi des statistiques
        checkAndUpdateTracking();
      } else if (data.status === "error") {
        log("[Background] Erreur lors du chargement :", data.message);
      } else if (data.status === "already_loaded") {
        log("[Background] Pyodide et Simplemma déjà chargés.");
      }
      break;
    case "update-frequencies":
      log("[Background] Mise à jour des fréquences :", data.frequencies);
      // Notifie tous les onglets de la mise à jour des fréquences
      notifyAllTabs({ command: "update-frequencies", frequencies: data.frequencies });
      // Met à jour les fréquences dans le stockage local
      browser.storage.local.set({ lemmaFrequencies: data.frequencies });
      break;
    case "threshold-exceeded":
      log("[Background] Mots dépassant le seuil :", data.wordsAboveThreshold);
      // Notifie tous les onglets que le seuil a été dépassé
      notifyAllTabs({ command: "threshold-exceeded", wordsAboveThreshold: data.wordsAboveThreshold });
      break;
    default:
      console.warn("[Background] Message non traité du Worker :", data);
      break;
  }
}

// Initialisation du worker dès le démarrage
initWorker();

browser.runtime.onStartup.addListener(() => {
  log("[Background] Chargement de Pyodide et Simplemma au démarrage.");
  browser.runtime.sendMessage({ command: "pyodide-simplemma" });
});

// ─────────────────────────────────────────────────────────────────────────────
// Écoute des messages de l'extension et transmission au WebWorker
// ─────────────────────────────────────────────────────────────────────────────
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  log("[Background] Message reçu :", message);
  // Initialise le WebWorker si ce n'est pas déjà fait
  if (!worker) {
    initWorker();
  }

  if (message.command === "toggle-stats") {
    log(`[Background] Statistiques ${message.isActive ? "activées" : "désactivées"}`);
    const { isActive } = message;
    // Met à jour l'état du suivi des statistiques dans le stockage local
    await browser.storage.local.set({ isTrackingActive: isActive });
    // Vérifie et met à jour l'état du suivi des statistiques
    checkAndUpdateTracking();
  }

  if (message.command === "pyodide-simplemma") {
    log("[Background] Demande d'initialisation de Pyodide et Simplemma...");
    // Envoie un message au WebWorker pour initialiser Pyodide et Simplemma
    worker.postMessage({ command: "pyodide-simplemma" });
  }

  return true;
});

// ─────────────────────────────────────────────────────────────────────────────
// Fonction : Chargement des lexiques personnels dans le local storage
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Sauvegarde les lexiques personnels dans le stockage local
 * @returns {Promise<void>}
 */
async function saveUserLexicons() {
  const { accessToken } = await browser.storage.local.get("accessToken");
  if (!accessToken) {
    console.warn("Aucun token disponible, impossible de récupérer les lexiques.");
    return;
  }
  log("Récupération des lexiques...");
  const lexicons = await getLexicons(accessToken);
  const userLexicons = lexicons.filter(lexicon => lexicon.category === "User");
  if (userLexicons.length > 0) {
    await browser.storage.local.set({ lexicons: userLexicons });
    log("Lexiques enregistrés dans le local storage :", userLexicons);
  } else {
    log("Aucun lexique utilisateur trouvé.");
  }
  
}

// ─────────────────────────────────────────────────────────────────────────────
// Envoi des données au WebWorker : lexiques personnels et token
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Envoie les lexiques et stoplists au WebWorker
 * @param {Array} userLexicons - Les lexiques personnels
 */
// Charger et envoyer les lexiques au worker à la connexion + les stoplists associées 
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area === "local" && changes.accessToken) {
    log("Token mis à jour, récupération des lexiques...");
    const userLexicons = await saveUserLexicons();  // Récupérer les lexiques
    sendLexiconsToWorker(userLexicons); // Envoyer les lexiques au Worker après une connexion
    sendAuthTokenToWorker();
  }
});

/**
 * Envoie les lexiques au WebWorker
 * @param {Array} userLexicons - Les lexiques personnels
 */
async function sendLexiconsToWorker(userLexicons = null) { 
  if (!userLexicons) {
    const storedData = await browser.storage.local.get("lexicons");
    userLexicons = storedData.lexicons || [];
  }
  if (!Array.isArray(userLexicons) || userLexicons.length === 0) {
    console.warn("[Background] Aucun lexique à envoyer au Worker.");
    return;
  }
  log("[Background] Envoi des lexiques au Worker...");
  if (worker) {
    worker.postMessage({
      command: "update-lexicons",
      lexicons: JSON.stringify(userLexicons)
    });

  // Charger et envoyer uniquement les stoplists des langues des lexiques utilisateur
  const languages = [...new Set(userLexicons.map(lexicon => lexicon.language))];
  log("[Background] Langues détectées :", languages);
  loadStoplistsForLanguages(languages);
  log("Lexiques envoyés au WebWorker !");
  }
}

/**
 * Envoie le token d'authentification au WebWorker
 */
async function sendAuthTokenToWorker() {
  log("[Background] sendAuthTokenToWorker() appelée.");
  if (!worker) {
    console.warn("Worker non initialisé. Impossible d'envoyer le token.");
    return;
  }
  const { accessToken } = await browser.storage.local.get("accessToken");
  if (!accessToken) {
    console.warn("Aucun token disponible. Le worker ne pourra pas interagir avec l’API.");
    return;
  }
  log("Envoi du token au Worker...");
  worker.postMessage({ command: "update-auth-token", accessToken });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stoplists : Chargement et envoi au Worker
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Charge et envoie les stoplists pour les langues spécifiées au WebWorker
 * @param {Array} languages - Les langues pour lesquelles les stoplists doivent être chargées
 */
async function loadStoplistsForLanguages(languages) {
  const stoplists = {};
  // Charger toutes les stoplists en parallèle
  await Promise.all(
    languages.map(async (lang) => {
      const stoplistPath = `src/stoplists/stoplist_${lang}.txt`;
      try {
        const response = await fetch(browser.runtime.getURL(stoplistPath));
        const text = await response.text();
        stoplists[lang] = text.split("\n").map(word => word.trim());
        log(`[Background] Stoplist chargée pour '${lang}' : ${stoplists[lang].length} mots`);
      } catch (error) {
        console.warn(`[Background] Stoplist introuvable pour '${lang}', aucun filtrage ne sera appliqué.`);
      }
    })
  );
  sendStoplistsToWorker(stoplists);
}

function sendStoplistsToWorker(stoplists) {
  log("[Background] Envoi des stoplists au Worker...");
  worker.postMessage({ command: "update-stoplist", stoplists });
}

// Charger les stoplists uniquement quand les lexiques sont disponibles
browser.runtime.onStartup.addListener(sendLexiconsToWorker);
browser.runtime.onInstalled.addListener(sendLexiconsToWorker);

// ─────────────────────────────────────────────────────────────────────────────
// Chargement et sauvegarde des fréquences stockées
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Charge les fréquences stockées depuis le stockage local.
 * @returns {Promise<Object>} Un objet contenant les fréquences stockées.
 */
async function loadStoredFrequencies() {
  const { storedFrequencies } = await browser.storage.local.get("storedFrequencies");
  return storedFrequencies || {};
}

let storedFrequencies = {};

loadStoredFrequencies().then(frequencies => {
  storedFrequencies = frequencies;
  log("[Background] Fréquences initialisées :", storedFrequencies);
});

// ─────────────────────────────────────────────────────────────────────────────
// Statistiques : Vérification et activation/désactivation du tracking
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Vérifie et met à jour l'état du suivi des statistiques.
 * Active ou désactive le suivi en fonction des préférences.
 * @returns {Promise<void>}
 */
async function checkAndUpdateTracking() {
  const { isTrackingActive, pyodideSimplemmaReady } = await browser.storage.local.get(["isTrackingActive", "pyodideSimplemmaReady"]);
  if (isTrackingActive && pyodideSimplemmaReady) {
    log("[Background] Activation du tracking.");
    notifyAllTabs({ command: "activate-stats" });
  } else {
    log("[Background] Désactivation du tracking.");
    notifyAllTabs({ command: "deactivate-stats" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistiques
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Envoie un message à tous les onglets.
 * @param {Object} message - Le message à envoyer.
 */
async function notifyAllTabs(message) {
  browser.tabs.query({}).then((tabs) => {
    tabs.forEach((tab) => {
      browser.tabs.sendMessage(tab.id, message)
        .catch((error) => console.warn(`[Background] Impossible d'envoyer un message à l'onglet ${tab.id} : ${error}`));
    });
  });
}

/**
 * Écoute les changements dans le stockage local et met à jour le suivi des statistiques
 */
browser.storage.onChanged.addListener(async (changes, area) => {
  // Vérifie si les changements concernent le stockage local et les paramètres de suivi
  if (area === "local" && (changes.isTrackingActive || changes.pyodideSimplemmaReady)) {
    // Met à jour l'état du suivi des statistiques
    checkAndUpdateTracking();
  }

  // Vérifie si les changements concernent les préférences d'authentification ou de configuration
  if (area === "local" && (changes.accessToken || changes.threshold || changes.trackedLanguages || changes.autoAdd)) {
    log("[Background] Mise à jour des préférences détectée.");
    // Récupère les valeurs mises à jour depuis le stockage local
    const { accessToken, trackedLanguages, threshold, autoAdd } = await browser.storage.local.get([
      "accessToken", "trackedLanguages", "threshold", "autoAdd"
    ]);
    // Vérifie si l'utilisateur est authentifié
    const isAuthenticated = !!accessToken;
    // Envoie un message au WebWorker pour mettre à jour les préférences
    worker.postMessage({
      command: "update-preferences",
      isAuthenticated,
      trackedLanguages: trackedLanguages || [],
      threshold: threshold || 10,
      autoAdd: autoAdd || false
    });
  }

  // Écoute sur le bouton d'inclusion des mots outils
  if (area === "local" && changes.includeStopwords) {
    const includeStopwords = changes.includeStopwords.newValue;
    log(`[Background] Inclusion des mots outils activé/désactivé: ${includeStopwords}`);

    if (worker) {
      worker.postMessage({ command: "update-include-stopwords", includeStopwords });
    }
  }
});

/**
 * Écoute l'inscription de stats.js
 * @param {Object} message - Le message reçu
 * @param {Object} sender - L'expéditeur du message
 */
browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.command === "register-stats-script") {
    log("[Background] stats.js s'est enregistré.");
    const { isTrackingActive, pyodideSimplemmaReady } = await browser.storage.local.get(["isTrackingActive", "pyodideSimplemmaReady"]);
    if (isTrackingActive && pyodideSimplemmaReady) {
      browser.tabs.sendMessage(sender.tab.id, { command: "activate-stats" })
        .catch((error) => console.warn(`[Background] Impossible d'envoyer activate-stats à ${sender.tab.id} : ${error}`));
    }
  }
});

/**
 * Gère la connexion entre stats.js et le Worker via un port dédié
 * @param {Object} port - Le port de communication avec le Worker
 */
// Tableau pour stocker tous les ports connectés depuis stats.js
let statsPorts = [];

// Lorsqu'un content script se connecte via le port "stats-worker-port"
browser.runtime.onConnect.addListener((port) => {
  if (port.name === "stats-worker-port") {
    log("[Background] Connexion établie sur stats-worker-port.");
    statsPorts.push(port);

    // Rediriger les messages reçus de ce port vers le Worker
    port.onMessage.addListener((message) => {
      log("[Background] Message reçu de stats.js :", message);
      worker.postMessage(message);
    });

    // Lors de la déconnexion, retirer le port du tableau
    port.onDisconnect.addListener(() => {
      log("[Background] Déconnexion d'un port stats-worker-port.");
      statsPorts = statsPorts.filter((p) => p !== port);
    });
  }
});

// Écoute des messages du worker et on les envoie à tous les ports actifs
worker.addEventListener("message", (event) => {
  const data = event.data;
  // Envoi des messages à tous les ports connectés
  statsPorts.forEach((port) => {
    if (data.type === "update-frequencies") {
      port.postMessage({ command: "update-frequencies", frequencies: data.frequencies });
    } else if (data.type === "threshold-exceeded") {
      port.postMessage({ command: "threshold-exceeded", wordsAboveThreshold: data.wordsAboveThreshold });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Surlignage 
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Gestion du surlignage.
 * @param {string} command - La commande à exécuter.
 * @param {string} lexiconId - L'identifiant du lexique.
 * @param {number} tabId - L'identifiant de l'onglet.
 * @returns {Promise<boolean>} - True si le surlignage a été effectué, false sinon.
 */
async function handleHighlighting(command, lexiconId, tabId) {
  log(`Gestion du surlignage: ${command} pour le lexique ${lexiconId}`);
  
  try {
      // S'assurer que le script est injecté
      await browser.scripting.executeScript({
          target: { tabId: tabId },
          files: ["utils/highlighting.js"]
      });

      // Envoyer le message d'activation
      const response = await browser.tabs.sendMessage(tabId, {
          command: command,
          lexiconId: lexiconId
      });
      
      log("Réponse du content script:", response);
      return response;
  } catch (error) {
      log("Erreur lors de la gestion du surlignage:", error);
      return false;
  }
}