// ─────────────────────────────────────────────────────────────────────────────
// Variables globales et logs
// ─────────────────────────────────────────────────────────────────────────────
log("browser_context_menu.js chargé.");
let authToken = null; // Token d'authentification
let selectedLexicons = new Set(); // Ensemble des lexiques sélectionnés

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions liées à l'authentification et au menu contextuel
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Charge le token depuis le stockage local.
 */
async function loadAuthToken() {
  try {
    const result = await browser.storage.local.get("accessToken");
    authToken = result.accessToken;
    log("Token chargé au démarrage :", authToken);
  } catch (error) {
    log("Erreur lors de la récupération du token :", error);
  }
}

/**
 * Crée le menu contextuel en fonction de l'authentification.
 */
async function createContextMenu() {
  await browser.contextMenus.removeAll(); // Supprime tous les éléments du menu contextuel

  // Récupération de la valeur depuis le stockage local avec des logs détaillés
  let storageData;
  try {
    storageData = await browser.storage.local.get("extensionActive");
    log("Données récupérées depuis le stockage :", storageData);
  } catch (error) {
    log("Erreur lors de la récupération de extensionActive :", error);
  }

  const extensionActive = storageData && storageData.extensionActive;
  log("État de l'extension (extensionActive) :", extensionActive);

  if (extensionActive) {
    // Création des éléments du menu contextuel si l'extension est active
    browser.contextMenus.create({
      id: "searchInLexicons",
      title: "Rechercher dans mes lexiques",
      contexts: ["selection"],
      icons: { "16": "src/assets/icons/quel_lexique.png" },
    });

    browser.contextMenus.create({
      id: "addToLexicon",
      title: "Ajouter ce mot à mes lexiques",
      contexts: ["selection"],
      icons: { "16": "src/assets/icons/ajout_lexique.png" },
    });

    browser.contextMenus.create({
      id: "getDefinition",
      title: "Obtenir une définition",
      contexts: ["selection"],
      icons: { "16": "src/assets/icons/definition.png" },
    });

    browser.contextMenus.create({
      id: "separatorExtension",
      type: "separator",
      contexts: ["all"],
    });
  } else {
    log("️ L'extension est désactivée, aucune option d'analyse ne sera affichée.");
  }

  // Création de l'élément de menu pour la connexion/déconnexion
  browser.contextMenus.create({
    id: "login",
    title: authToken ? "Se déconnecter de BaLex" : "Se connecter à BaLex",
    contexts: ["all"],
  });
}

// Chargement du token et création du menu contextuel
loadAuthToken().then(createContextMenu);

// Écoute des messages pour rafraîchir l'interface utilisateur
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "refreshUI" || message.action === "updateUI") {
    log("refreshUI reçu dans browser_context_menu.js");
    loadAuthToken().then(createContextMenu);
  }
});

// Écoute des changements dans le stockage local
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.accessToken) {
      log("Token modifié, actualisation du menu contextuel.");
      loadAuthToken().then(createContextMenu);
    }
    if (changes.extensionActive) {
      log("extensionActive modifié, nouvelle valeur :", changes.extensionActive.newValue);
      createContextMenu();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions liées aux définitions
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Récupère les définitions d'un mot
 * @param {string} selectedText - Le mot à rechercher
 */
async function getDefinition(selectedText) {
  try {
    let lexiconDefs = []; // Définitions des lexiques
    if (authToken) {
      lexiconDefs = await fetchLexiconDefinitions(selectedText); // Récupère les définitions des lexiques
    }
    const wikiDefs = await fetchWiktionaryDefinition(selectedText); // Récupère les définitions du Wiktionnaire
    const allDefinitions = [...lexiconDefs, ...wikiDefs]; // Combine les définitions
    log("Définitions combinées :", allDefinitions);
    browser.runtime.sendMessage({
      action: "showDefinitions",
      selectedText,
      definitions: allDefinitions,
    });
  } catch (error) {
    log("Erreur lors de la recherche combinée des définitions :", error);
  }
}

/**
 * Recherche si un mot est présent dans les lexiques
 * @param {string} selectedText - Le mot à rechercher
 */
async function searchInLexicons(selectedText) {
  try {
    log("Recherche dans mes lexiques :", selectedText);
    const allDefinitions = await fetchLexiconDefinitions(selectedText); // Récupère toutes les définitions
    if (!allDefinitions || allDefinitions.length === 0) {
      log("Aucun lexique trouvé pour ce mot.");
      browser.runtime.sendMessage({
        action: "showLexiconResult",
        lexicons: [],
        selectedText,
      });
      return;
    }
    const lexMap = new Map(); // Map pour stocker les résultats
    for (const def of allDefinitions) {
      if (def.lexiconId) {
        lexMap.set(def.lexiconId, def.source); // Ajoute les définitions à la map
      }
    }
    const foundInLexicons = [];
    for (const [id, name] of lexMap.entries()) {
      foundInLexicons.push({ id, name });
    }
    log("Envoi du message 'showLexiconResult' avec :", foundInLexicons);
    browser.runtime.sendMessage({
      action: "showLexiconResult",
      lexicons: foundInLexicons,
      selectedText,
    });
  } catch (error) {
    log("Erreur lors de la recherche dans les lexiques :", error);
    browser.runtime.sendMessage({
      action: "showLexiconResult",
      lexicons: [],
      selectedText,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gestion des clics sur le menu contextuel
// ─────────────────────────────────────────────────────────────────────────────
browser.contextMenus.onClicked.addListener(async (info, tab) => {
  log("Item de menu cliqué :", info.menuItemId);

  // Action pour le bouton de connexion/déconnexion
  if (info.menuItemId === "login") {
    log("Action login/déconnexion demandée.");
    if (authToken) {
      await disconnectFromLexicalDB();
    } else {
      if (typeof actuallyOpenLoginPage === "function") {
        actuallyOpenLoginPage();
      } else {
        log("La fonction actuallyOpenLoginPage n'est pas accessible.");
      }
    }
    return;
  }

  if (!info.selectionText) {
    console.warn("Aucun texte sélectionné pour cette action :", info.menuItemId);
    return;
  }

  const selectedText = info.selectionText.trim();
  log(`Texte sélectionné : ${selectedText}`);

  // Item "Ajouter ce mot à mes lexiques"
  if (info.menuItemId === "addToLexicon") {
    if (!authToken) {
      alert("️ Vous devez être connecté pour ajouter un mot à un lexique.");
      return;
    }
    browser.runtime.sendMessage({
      action: "addToLexicon",
      selectedText,
    });
    return;
  }

  // Item "Obtenir une définition"
  if (info.menuItemId === "getDefinition") {
    await browser.runtime.sendMessage({
      action: "getDefinition",
      selectedText,
    });
    return;
  }

  // Item "Rechercher dans mes lexiques"
  switch (info.menuItemId) {
    case "searchInLexicons":
      if (!authToken) {
        alert("️ Vous devez être connecté pour utiliser cette fonction.");
        return;
      }
      await searchInLexicons(selectedText);
      break;
  }
  
  log(`Action inconnue : ${info.menuItemId}`);
});
