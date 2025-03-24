log("api.js chargé.");

window.authToken = null;

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Sélection de texte sur la page
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("mouseup", () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText) {
    browser.runtime.sendMessage({
      action: "mot_selectionne",
      selectedText
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Fonction utilitaire pour appeler l'API
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Effectue une requête API (GET, POST, etc.) avec ou sans body JSON
 * @param {string} url - L'URL de l'API à appeler.
 * @param {string|null} authToken - Le token d'authentification.
 * @param {string} [method='GET'] - La méthode HTTP.
 * @param {object|null} [data=null] - Les données à envoyer dans le body (pour POST/PUT...).
 * @returns {Promise<any>} - La réponse en JSON.
 * @throws {Error} - En cas d'échec.
 */
async function callApi(url, authToken = null, method = 'GET', data = null) {
  // Définition des en-têtes de la requête
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  // Options de la requête fetch
  const fetchOptions = { method, headers };
  log("Envoi de la requête vers :", url);
  // Si des données sont fournies, les ajouter au corps de la requête
  if (data) {
    log("Body JSON :", JSON.stringify(data, null, 2));
    fetchOptions.body = JSON.stringify(data);
  }

  try {
    // Effectuer la requête fetch
    const response = await fetch(url, fetchOptions);
    // Vérifier si la réponse est correcte
    if (!response.ok) {
      throw new Error(`Erreur API (${response.status}): ${response.statusText}`);
    }
    // Retourner la réponse en JSON
    return await response.json();
  } catch (error) {
    log(`Erreur lors de l'appel API [${url}]:`, error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Récupération des lexiques de l'utilisateur
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Récupère les lexiques de l'utilisateur
 * 
 * @param {string} authToken - Le token d'authentification.
 * @returns {Promise<any[]>} - Liste des lexiques trouvés.
 */
async function getLexicons(authToken) {
  const url = "https://babalex.lezinter.net/api/lexicon/search";

  return callApi(url, authToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Récupération des entrées d'un lexique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Récupère les entrées d'un lexique donné.
 * @param {string} authToken - Le token d'authentification.
 * @param {string} lexiconId - L'ID du lexique dont on veut récupérer les entrées.
 * @returns {Promise<any[]>} - Liste des entrées du lexique.
 */
async function getLexiconEntries(authToken, lexiconId) {
  const url = `https://babalex.lezinter.net/api/lexicon/entries/${lexiconId}`;
  return callApi(url, authToken);
}

/**
 * Récupère toutes les graphies présentes dans tous les lexiques de l'utilisateur.
 * @param {string} authToken - Le token d'authentification.
 * @returns {Promise<object>} - Un objet contenant les graphies par lexique.
 */
async function getAllLexiconWords(authToken) {
  try {
    // 1) Récupération de la liste des lexiques
    const lexicons = await getLexicons(authToken);

        // Vérification si la liste des lexiques est valide
        if (!Array.isArray(lexicons) || lexicons.length === 0) {
          console.warn("️ Aucun lexique retourné par l'API pour ces paramètres.");
          return {};
        }
    
        // 2) Pour chaque lexique, on récupère ses entrées via /api/lexicon/entries/{id}
        const allGraphiesByLexicon = {};
        
        for (const lexicon of lexicons) {
          // Récupération des entrées pour le lexique actuel
          const entries = await getLexiconEntries(authToken, lexicon.id);
          // Vérification que entries est bien un tableau
          if (!Array.isArray(entries)) {
            console.warn(`️ Format invalide pour les entrées du lexique ${lexicon.id}:`, entries);
            continue;
          }
          // Extraction des graphies des entrées
          const allGraphies = entries.map(entry => entry.graphy);
          
          // Création d'un libellé unique pour le lexique
          const lexiconName =
            lexicon.category === "User"
              ? `Lexique personnel (${lexicon.user?.pseudo || "Inconnu"}) [${lexicon.id}]`
              : `Lexique de groupe (${lexicon.group?.name || "Inconnu"}) [${lexicon.id}]`;
          
          // Stockage des graphies par lexique
          allGraphiesByLexicon[lexiconName] = allGraphies;
        }
    
        log("Toutes les graphies récupérées :", allGraphiesByLexicon);
        return allGraphiesByLexicon;
      } catch (error) {
        log("Erreur lors de la récupération des graphies des lexiques :", error);
        return {};
      }
    }
    
// ─────────────────────────────────────────────────────────────────────────────
// ▌ Récupération de définition du Wiktionnaire
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Récupère une définition du Wiktionnaire.
 * @param {string} word - Le mot dont on veut la définition.
 * @returns {Promise<string[]>} - Une promesse contenant la définition trouvée.
 */
async function getWiktionaryDefinition(word) {
  try {
    // Construction de l'URL pour l'API du Wiktionnaire avec le mot spécifié
    const url = `https://fr.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=true&titles=${encodeURIComponent(word)}`;
    // Envoi de la requête fetch à l'API
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur API Wiktionnaire: ${response.statusText}`);
    }

    // Traitement de la réponse JSON
    const data = await response.json();
    const pages = data.query?.pages;
    // Récupération de la première page de résultats
    const page = pages ? Object.values(pages)[0] : null;
    // Extraction de la définition ou message par défaut si aucune définition n'est trouvée
    const definition = page?.extract?.trim() || "Aucune définition trouvée.";

    log(`Définition trouvée pour '${word}':`, definition);
    return [definition]; // Retourner la définition sous forme de tableau
  } catch (error) {
    log("Erreur lors de la récupération du Wiktionnaire :", error);
    return ["Erreur : " + error.message];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Ajout d'un mot dans un/des lexique(s)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Ajoute un mot (selectedWord) dans un ou plusieurs lexiques (lexiconIds).
 * @param {string} authToken     - Jeton d'authentification (Bearer).
 * @param {string} selectedWord  - Le mot à ajouter.
 * @param {number[]} lexiconIds  - Tableau d'IDs de lexiques cibles.
 * @param {boolean} [force=false] - Paramètre optionnel pour l'API.
 * @returns {Promise<any>} - La réponse JSON de l'API, ou une exception si échec.
 */
async function AddWord(authToken, selectedWord, lexiconIds, force = false) {
  if (!authToken) {
    throw new Error("Aucun token d'authentification fourni.");
  }
  if (!selectedWord) {
    throw new Error("Aucun mot n'a été spécifié pour l'ajout.");
  }
  if (!Array.isArray(lexiconIds) || lexiconIds.length === 0) {
    throw new Error("Aucun lexique sélectionné pour l'ajout.");
  }

  const url = "https://babalex.lezinter.net/api/entry/create"; 
  // Corps de la requête contenant le mot et les lexiques cibles
  const body = {
    graphy: selectedWord,
    force,
    target_lex: lexiconIds
  };
  log("Body envoyé à AddWord :", body);
  return callApi(url, authToken, "POST", body);
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Exposition des fonctions pour un usage global
// ─────────────────────────────────────────────────────────────────────────────

window.callApi = callApi;
window.getLexicons = getLexicons;
window.getLexiconEntries = getLexiconEntries;
window.getAllLexiconWords = getAllLexiconWords;
window.getWiktionaryDefinition = getWiktionaryDefinition;
window.AddWord = AddWord;


