// ─────────────────────────────────────────────────────────────
// ▌ Configuration initiale, logs et gestion des erreurs
// ─────────────────────────────────────────────────────────────
log("highlighting.js chargé.");
window.activeLexiconIds = window.activeLexiconIds || new Set();

// Vérification de l'environnement
log("Vérification de l'environnement:", {
    hasBrowser: typeof browser !== 'undefined',
    windowLocation: window.location.href
});

// Gestion globale des erreurs
window.onerror = function(msg, url, line, col, error) {
    log("Erreur globale:", { message: msg, url: url, line: line, col: col, error: error });
    return false;
};

// ─────────────────────────────────────────────────────────────
// ▌ Authentification et gestion du token
// ─────────────────────────────────────────────────────────────
/**
 * Récupère le token d'authentification depuis le stockage local.
 * @returns {Promise<boolean>} true si le token est récupéré, false sinon.
 */ 
async function initAuthToken() {
    try {
        const { accessToken } = await browser.storage.local.get("accessToken");
        if (accessToken) {
            window.authToken = accessToken;
            authToken = accessToken;
            log("Token récupéré depuis le stockage local");
            return true;
        } else {
            log("️ Aucun token trouvé dans le stockage local");
            return false;
        }
    } catch (error) {
        log("Erreur lors de la récupération du token:", error);
        return false;
    }
}
initAuthToken();

// Mise à jour du token via messages du background
browser.runtime.onMessage.addListener((message) => {
    if (message.command === "updateAuthToken" && message.token) {
        window.authToken = message.token;
        authToken = message.token;
        log("Token mis à jour via message:", !!message.token);
    }
});

// ─────────────────────────────────────────────────────────────
// ▌ Suppression de tous les surlignages
// ─────────────────────────────────────────────────────────────
/**
 * Supprime tous les surlignages de la page
 */
async function removeAllHighlights() {
    log("Suppression de tous les surlignages");
    const highlights = document.querySelectorAll('.lexicon-highlight');
    log(`${highlights.length} surlignages à supprimer`);
    highlights.forEach(highlight => {
        const text = highlight.textContent;
        const textNode = document.createTextNode(text);
        highlight.parentNode.replaceChild(textNode, highlight);
    });
}

// ─────────────────────────────────────────────────────────────
// ▌ Gestion des événements globaux
// ─────────────────────────────────────────────────────────────
/**
 * Gestion de l'événement visibilitychange pour réinitialiser le surlignage
 * @param {Event} event - L'événement visibilitychange
 */
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && window.highlightingActive && window.activeLexiconIds.size > 0) {
        log("Page redevenue visible, réinitialisation du surlignage");
        await removeAllHighlights();
        await window.updateLexiconCache();
        window.highlightVisibleContent();
        window.attachMutationObserver();
    }
});
/**
 * Gestion de l'événement pageshow pour réinitialiser le surlignage
 * @param {Event} event - L'événement pageshow
 */
window.addEventListener('pageshow', async () => {
    if (window.highlightingActive && window.activeLexiconIds.size > 0) {
        log("Page affichée (pageshow), réinitialisation du surlignage");
        await removeAllHighlights();
        await window.updateLexiconCache();
        window.highlightVisibleContent();
        window.attachMutationObserver();
    }
});

// Enregistrement du script auprès du background
log("Enregistrement du script auprès du background");
browser.runtime.sendMessage({ command: "register-highlighting-script" });
log("Initialisation de highlighting.js");

// ─────────────────────────────────────────────────────────────
// ▌ Logique de surlignage et gestion des mutations DOM
// ─────────────────────────────────────────────────────────────
(function () {
    try {
        if (window.hasRunHighlighting) {
            log("️ highlighting.js déjà chargé");
            return;
        }
        window.hasRunHighlighting = true;        
        
        // Variables internes
        let lexiconWordsCache = new Map();
        let highlightingActive = false;
        window.highlightingActive = false;
        let observer = null;
        
        // ───────────────────────────────
        // ▌ Fonctions utilitaires
        // ───────────────────────────────
        /**
         * Échappe les caractères spéciaux pour utilisation dans une expression régulière
         * @param {string} string - La chaîne à échapper
         * @returns {string} La chaîne échappée
         */
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        
        /**
         * Extrait l'ID d'un lexique depuis son nom
         * @param {string} lexiconName - Le nom du lexique
         * @returns {number|null} L'ID du lexique ou null si l'extraction échoue
         */
        function getLexiconIdFromName(lexiconName) {
            const match = lexiconName.match(/\[(\d+)\]$/);
            const id = match ? parseInt(match[1]) : null;
            log(`️Extraction de l'ID depuis '${lexiconName}': ${id}`);
            return id;
        }
        
        // ───────────────────────────────
        // ▌ Gestion du style de surlignage
        // ───────────────────────────────
        /**
         * Met à jour le style du surlignage pour un élément spécifié
         * @param {Element} span - L'élément à surligner
         * @param {Array} lexIds - Les identifiants des lexiques à surligner
         * @returns {Promise<void>}
         */
        async function updateHighlightStyle(span, lexIds) {
            if (!lexIds || lexIds.length === 0) {
                // Définit une couleur de fond par défaut si aucun lexique n'est actif
                span.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
                span.style.backgroundImage = "";
                return;
            }
            // Si un seul lexique est actif
            if (lexIds.length === 1) {
                // Récupère la couleur hexadécimale pour le lexique
                const hexColor = await getColorForLexicon(lexIds[0]);
                const rgbaColor = hexToRgba(hexColor, 0.3);
                span.style.backgroundColor = rgbaColor;
                span.style.backgroundImage = "";
            } else {
                // Si plusieurs lexiques sont actifs, récupère les couleurs pour chacun
                const hexColors = await Promise.all(lexIds.map(id => getColorForLexicon(id)));
                const colors = hexColors.map(hex => hexToRgba(hex, 0.3));
                const n = colors.length; // Nombre de couleurs
                let stops = []; // Tableau pour stocker les arrêts de dégradé
                for (let i = 0; i < n; i++) {
                    // Calcule les positions de début et de fin pour chaque couleur dans le dégradé
                    const start = ((100 * i) / n).toFixed(2) + '%';
                    const end = ((100 * (i + 1)) / n).toFixed(2) + '%';
                    stops.push(`${colors[i]} ${start}, ${colors[i]} ${end}`);
                }
                // Crée un dégradé linéaire avec les couleurs calculées
                const gradient = `linear-gradient(90deg, ${stops.join(', ')})`;
                span.style.backgroundImage = gradient; // Applique le dégradé comme image de fond
            }
        }
        
        // ───────────────────────────────
        // ▌ Gestion du cache des lexiques
        // ───────────────────────────────
        /**
         * Met à jour le cache des lexiques
         * @returns {Promise<boolean>} true si la mise à jour est réussie, false sinon
         */
        async function updateLexiconCache() {
            log("updateLexiconCache - Début avec contexte:", {
                authToken: !!window.authToken,
                getAllLexiconWords: !!window.getAllLexiconWords,
                activeLexiconIds: Array.from(window.activeLexiconIds)
            });
            let allWords;
            try {
                if (!window.authToken) {
                    throw new Error("Pas de token d'authentification");
                }
                if (typeof window.getAllLexiconWords !== 'function') {
                    log("️getAllLexiconWords n'est pas une fonction");
                    log("Type de getAllLexiconWords:", typeof window.getAllLexiconWords);
                    log("Contenu de window.getAllLexiconWords:", window.getAllLexiconWords);
                    throw new Error("getAllLexiconWords n'est pas disponible");
                }
                log("Appel de getAllLexiconWords...");
                // Appelle la fonction pour récupérer tous les mots de lexique
                allWords = await window.getAllLexiconWords(window.authToken);
                log("Réponse de getAllLexiconWords:", allWords);
                if (!allWords || typeof allWords !== 'object') {
                    throw new Error(`Format de données invalide: ${JSON.stringify(allWords)}`);
                }
                lexiconWordsCache.clear();
                if (Object.keys(allWords).length === 0) {
                    log("️Aucun lexique reçu de getAllLexiconWords");
                    return false;
                }
                // Traite chaque lexique reçu
                for (const [lexiconName, words] of Object.entries(allWords)) {
                    if (!Array.isArray(words)) {
                        console.warn(`️ Format invalide pour le lexique ${lexiconName}:`, words);
                        continue;
                    }
                    // Extrait l'ID du lexique 
                    const lexiconId = lexiconName.match(/\[(\d+)\]$/)?.[1];
                    if (!lexiconId) {
                        console.warn(`️ Impossible d'extraire l'ID du lexique depuis: ${lexiconName}`);
                        continue;
                    }
                    log(`Traitement du lexique ${lexiconName} (ID: ${lexiconId})`);
                    // Si l'ID du lexique est actif, met à jour le cache
                    if (window.activeLexiconIds.has(Number(lexiconId))) {
                        lexiconWordsCache.set(lexiconId, new Set(words));
                        log(`Lexique ${lexiconId} chargé avec ${words.length} mots`);
                    }
                }
                log("Cache des lexiques mis à jour:",
                    Object.fromEntries([...lexiconWordsCache.entries()].map(([id, words]) => [id, [...words]])));
                return true;
            } catch (error) {
                log("Erreur dans updateLexiconCache:", {
                    message: error.message,
                    stack: error.stack,
                    authTokenExists: !!window.authToken,
                    getAllLexiconWordsType: typeof window.getAllLexiconWords,
                    response: allWords
                });
                throw error;
            }
        }
        
        // ───────────────────────────────
        // ▌ Vérification d'appartenance d'un mot à un lexique
        // ───────────────────────────────
        /**
         * Vérifie si un mot appartient à un lexique spécifié
         * @param {string} lexiconId - L'identifiant du lexique
         * @param {string} word - Le mot à vérifier
         * @returns {boolean} true si le mot appartient au lexique, false sinon
         */
        function wordIsInLexicon(lexiconId, word) {
            const wordsSet = lexiconWordsCache.get(String(lexiconId));
            return wordsSet ? wordsSet.has(word.toLowerCase()) : false;
        }
        
        // ───────────────────────────────
        // ▌ Mise à jour incrémentale des surlignages pour un nouveau lexique
        // ───────────────────────────────
        /**
         * Met à jour les surlignages pour un nouveau lexique
         * @param {string} newLexiconId - L'identifiant du nouveau lexique
         * @returns {Promise<void>}
         */
        async function updateHighlightsForNewLexicon(newLexiconId) {
            const spans = document.querySelectorAll('.lexicon-highlight');
            // Parcourt chaque élément surligné
            for (let span of spans) {
                const word = span.textContent; 
                // Vérifie si le mot appartient au nouveau lexique
                if (wordIsInLexicon(newLexiconId, word)) {
                    let lexIds = [];
                    try {
                        lexIds = JSON.parse(span.getAttribute('data-lexicons'));
                    } catch (e) {
                        lexIds = []; // Si une erreur se produit, initialise lexIds comme un tableau vide
                    }
                    // Vérifie si le nouvel identifiant de lexique n'est pas déjà présent
                    if (!lexIds.includes(newLexiconId)) {
                        lexIds.push(newLexiconId); // Ajoute le nouvel identifiant de lexique
                        span.setAttribute('data-lexicons', JSON.stringify(lexIds));
                        // Met à jour le style de surlignage pour l'élément
                        await updateHighlightStyle(span, lexIds);
                    }
                }
            }
        }
        
        // ───────────────────────────────
        // ▌ Fonctions principales : démarrage et arrêt du surlignage
        // ───────────────────────────────
        /**
         * Démarre le surlignage pour un lexique spécifié
         * @param {string} lexiconId - L'identifiant du lexique à surligner
         * @returns {Promise<boolean>} true si le surlignage est démarré, false sinon
         */
        async function startHighlighting(lexiconId) {
            try {
                await initAuthToken();
                if (!window.authToken) {
                    throw new Error("Pas de token d'authentification disponible");
                }
                // Vérifie si un identifiant de lexique a été fourni
                if (lexiconId) {
                    // Vérifie si le lexique n'est pas déjà actif
                    if (!window.activeLexiconIds.has(lexiconId)) {
                        window.activeLexiconIds.add(lexiconId);
                        const activeLexicons = Array.from(window.activeLexiconIds);
                        // Sauvegarde les lexiques actifs dans le stockage local
                        await browser.storage.local.set({ activeLexicons });
                        log("Lexiques actifs sauvegardés:", activeLexicons);
                        // Mise à jour de la cache pour inclure le nouveau lexique
                        await updateLexiconCache();
                        // Mise à jour immédiate des éléments surlignés
                        await updateHighlightsForNewLexicon(lexiconId);
                    }
                }
                // Active le surlignage
                window.highlightingActive = true;
                highlightingActive = true;
                highlightVisibleContent();
                // Attache un observateur de mutations pour surveiller les changements dans le DOM
                attachMutationObserver();
                return true;
            } catch (error) {
                log("Erreur lors du démarrage du surlignage:", error);
                window.highlightingActive = false;
                highlightingActive = false;
                throw error;
            }
        }
        
        /**
         * Arrête le surlignage pour un lexique spécifié
         * @param {string} lexiconId - L'identifiant du lexique à arrêter
         * @returns {Promise<boolean>} true si l'arrêt est réussi, false sinon
         */
        async function stopHighlighting(lexiconId) {
            try {
                if (lexiconId) {
                    window.activeLexiconIds.delete(lexiconId);
                    const activeLexicons = Array.from(window.activeLexiconIds);
                    await browser.storage.local.set({ activeLexicons });
                    if (window.activeLexiconIds.size === 0) {
                        window.highlightingActive = false;
                        highlightingActive = false;
                        removeAllHighlights();
                        detachMutationObserver();
                    } else {
                        removeAllHighlights();
                        await updateLexiconCache();
                        highlightVisibleContent();
                    }
                } else {
                    window.highlightingActive = false;
                    highlightingActive = false;
                    window.activeLexiconIds.clear();
                    removeAllHighlights();
                    detachMutationObserver();
                }
                return true;
            } catch (error) {
                log("Erreur lors de l'arrêt du surlignage:", error);
                throw error;
            }
        }
        
        // ───────────────────────────────
        // ▌ Surlignage du contenu visible
        // ───────────────────────────────
        /**
         * Surligne le contenu visible de la page
         */
        function highlightVisibleContent() {
            // Vérifie si le surlignage est actif
            if (!highlightingActive) {
                log("⏸️ Surlignage inactif, sortie");
                return;
            }
            log("Début du surlignage du contenu visible");
            const BATCH_SIZE = 100; // Nombre d'éléments à traiter par lot
            const BATCH_DELAY = 10; // Délai entre les traitements de lots en millisecondes
            const textNodes = []; // Tableau pour stocker les nœuds de texte trouvés
            // Crée un TreeWalker pour parcourir les nœuds de texte dans le document
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        const parent = node.parentElement;
                        // Vérifie si le nœud doit être accepté ou rejeté
                        if (!parent || parent.closest('script, style, .lexicon-highlight') || !node.textContent.trim() || getComputedStyle(parent).display === 'none') {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                }
            );
            let node;
            // Parcourt tous les nœuds de texte et les ajoute au tableau
            while (node = walker.nextNode()) {
                textNodes.push(node);
            }
            log(`${textNodes.length} nœuds de texte trouvés à traiter`);
            // Fonction pour traiter le prochain lot de nœuds de texte
            const processNextBatch = (startIndex) => {
                // Vérifie si le surlignage est toujours actif et si des nœuds restent à traiter
                if (!highlightingActive || startIndex >= textNodes.length) {
                    return; // Sort de la fonction si le surlignage n'est pas actif ou si tous les nœuds ont été traités
                }
                const endIndex = Math.min(startIndex + BATCH_SIZE, textNodes.length); // Calcule l'index de fin du lot
                const batch = textNodes.slice(startIndex, endIndex); // Extrait le lot de nœuds à traiter
                batch.forEach(processTextNode); // Traite chaque nœud du lot
                // Si des nœuds restent à traiter, planifie le traitement du prochain lot
                if (endIndex < textNodes.length) {
                    setTimeout(() => processNextBatch(endIndex), BATCH_DELAY);
                }
            };
            processNextBatch(0); // Démarre le traitement à partir du premier nœud
        }
        
        // ───────────────────────────────
        // ▌ Traitement d'un "nœud de texte" pour le surlignage
        // ───────────────────────────────
        /**
         * Traite un "nœud de texte" pour le surlignage
         * @param {Node} textNode - Le nœud de texte à traiter
         */
        function processTextNode(textNode) {
            if (window.activeLexiconIds.size === 0) {
                log("️ Aucun lexique actif, sortie du processTextNode");
                return;
            }
            const text = textNode.textContent; // Récupère le texte du nœud
            log(`Traitement du texte: "${text.substring(0, 50)}..."`); 
            let lastIndex = 0; // Index de la dernière correspondance trouvée
            let fragments = []; // Tableau pour stocker les parties de texte
            const allWords = new Set(); // Ensemble pour stocker tous les mots à rechercher
            const matchedLexiconIdsMap = new Map(); // Map pour associer les mots aux identifiants de lexiques

            // Parcourt chaque lexique dans le cache
            for (const [lexiconId, words] of lexiconWordsCache.entries()) {
                const numericId = parseInt(lexiconId); // Convertit l'ID du lexique en nombre
                log(`Vérification du lexique ${lexiconId} (ID: ${numericId})`);
                // Vérifie si le lexique est actif
                if (window.activeLexiconIds.has(numericId)) {
                    log(`Lexique ${lexiconId} actif, ajout de ${words.size} mots`);
                    // Ajoute chaque mot à l'ensemble des mots à rechercher
                    words.forEach(word => allWords.add(word));
                    // Associe chaque mot à son identifiant de lexique
                    words.forEach(word => {
                        const lowerCaseWord = word.toLowerCase();
                        if (!matchedLexiconIdsMap.has(lowerCaseWord)) {
                            matchedLexiconIdsMap.set(lowerCaseWord, []);
                        }
                        matchedLexiconIdsMap.get(lowerCaseWord).push(lexiconId);
                    });
                }
            }
            log(`Nombre total de mots à rechercher: ${allWords.size}`);
            // Vérifie si des mots sont disponibles pour la recherche
            if (allWords.size === 0) {
                log("️ Aucun mot à rechercher dans les lexiques actifs");
                return;
            }
            // Crée une expression régulière pour rechercher les mots
            const wordsPattern = Array.from(allWords)
                .sort((a, b) => b.length - a.length) // Trie les mots par longueur décroissante
                .map(escapeRegExp) // Échappe les caractères spéciaux
                .join("|"); // Joint les mots avec un séparateur "ou"
            // Vérifie si le motif de recherche est valide
            if (!wordsPattern) {
                log("️ Aucun mot à rechercher, sortie");
                return;
            }
            const regex = new RegExp(`\\b(${wordsPattern})\\b`, "gi"); // Crée l'expression régulière
            let match; // Variable pour stocker les correspondances
            let matchCount = 0; // Compteur de correspondances trouvées
            // Recherche les correspondances dans le texte
            while ((match = regex.exec(text)) !== null) {
                matchCount++; // Incrémente le compteur de correspondances
                // Ajoute le texte avant la correspondance au tableau de parties
                if (match.index > lastIndex) {
                    fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
                }
                const span = document.createElement("span");
                span.textContent = match[0];
                span.className = "lexicon-highlight";
                span.style.display = "inline-block";
                
                // Récupère les identifiants de lexiques associés à la correspondance
                const matchedLexiconIds = matchedLexiconIdsMap.get(match[0].toLowerCase()) || [];
                span.setAttribute('data-lexicons', JSON.stringify(matchedLexiconIds));
                
                // Applique le style de surlignage
                if (matchedLexiconIds.length === 0) {
                    span.style.backgroundColor = "rgba(255, 255, 0, 0.3)";
                } else {
                    updateHighlightStyle(span, matchedLexiconIds);
                }
                fragments.push(span); // Ajoute le span au tableau de parties
                lastIndex = regex.lastIndex; // Met à jour l'index de la dernière correspondance
            }
            if (matchCount > 0) {
                log(`${matchCount} correspondances trouvées dans le nœud`);
            }
            // Ajoute le texte restant après la dernière correspondance
            if (lastIndex < text.length) {
                fragments.push(document.createTextNode(text.slice(lastIndex)));
            }
            // Insère les parties dans le DOM
            if (fragments.length > 0) {
                const parent = textNode.parentNode; // Récupère le parent du nœud de texte
                fragments.forEach(fragment => parent.insertBefore(fragment, textNode)); // Insère chaque partie avant le nœud de texte
                parent.removeChild(textNode); // Supprime le nœud de texte original
            }
        }
        
        // ───────────────────────────────
        // ▌ Gestion des mutations DOM
        // ───────────────────────────────
        /**
         * Attache un observateur de mutations DOM
         */
        function attachMutationObserver() {
            log("Attachement de l'observateur de mutations");
            let debounceTimer = null;
            const DEBOUNCE_DELAY = 250; // ms
            observer = new MutationObserver((mutations) => {
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                // Définit un nouveau timer 
                debounceTimer = setTimeout(() => {
                    log(`Traitement groupé de ${mutations.length} mutations DOM`);
                    let shouldHighlight = false;
                    for (const mutation of mutations) {
                        // Vérifie si la mutation concerne des nœuds enfants
                        if (mutation.type === 'childList') {
                            // Parcourt les nœuds ajoutés
                            for (const node of mutation.addedNodes) {
                                // Vérifie si le nœud est un élément et n'est pas déjà surligné
                                if (node.nodeType === Node.ELEMENT_NODE && 
                                    !node.closest('.lexicon-highlight') && 
                                    node.textContent.trim()) {
                                    shouldHighlight = true; // Indique qu'un surlignage est nécessaire
                                    break; // Sort de la boucle si un nœud à surligner est trouvé
                                }
                            }
                        }
                        if (shouldHighlight) break;
                    }
                    // Si un surlignage est nécessaire, appelle la fonction pour surligner le contenu visible
                    if (shouldHighlight) {
                        highlightVisibleContent();
                    }
                }, DEBOUNCE_DELAY);
            });
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
        /**
         * Détache un observateur de mutations DOM
         */
        function detachMutationObserver() {
            if (observer) {
                log("Détachement de l'observateur de mutations");
                observer.disconnect();
                observer = null;
            }
        }
        
        // ───────────────────────────────
        // ▌ Gestion des messages du background
        // ───────────────────────────────
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            log("Message reçu:", message, "Context:", {
                highlightingActive,
                activeLexiconIds: Array.from(window.activeLexiconIds),
                hasAuthToken: !!window.authToken,
                hasGetAllLexiconWords: !!window.getAllLexiconWords
            });
            
            // Vérifie si la commande est pour activer le surlignage
            if (message.command === "activate-highlighting") {
                log(`Activation du surlignage pour le lexique ${message.lexiconId}`);
                // Démarre le surlignage pour le lexique spécifié
                startHighlighting(message.lexiconId)
                    .then(() => {
                        window.highlightingActive = true; // Met à jour l'état du surlignage
                        sendResponse(true); // Envoie une réponse de succès
                    })
                    .catch(error => {
                        log("Erreur lors de l'activation:", error);
                        sendResponse(false);
                    });
                return true;
            }
            
            // Vérifie si la commande est pour désactiver le surlignage
            if (message.command === "deactivate-highlighting") {
                log(`Désactivation du surlignage pour le lexique ${message.lexiconId}`);
                // Arrête le surlignage pour le lexique spécifié
                stopHighlighting(message.lexiconId)
                    .then(() => {
                        // Vérifie si aucun lexique n'est actif
                        if (window.activeLexiconIds.size === 0) {
                            window.highlightingActive = false;
                        }
                        sendResponse(true);
                    })
                    .catch(error => {
                        log("Erreur lors de la désactivation:", error);
                        sendResponse(false);
                    });
                return true;
            }
            
            return false;
        });
        
        // ───────────────────────────────
        // ▌ Restauration de l'état du surlignage au chargement
        // ───────────────────────────────
        /**
         * Vérifie et restaure l'état du surlignage au chargement
         */
        async function checkAndRestoreHighlightingState() {
            try {
                // Récupère les lexiques actifs depuis le stockage local
                const { activeLexicons } = await browser.storage.local.get("activeLexicons");
                // Vérifie si des lexiques actifs ont été trouvés
                if (!activeLexicons || !Array.isArray(activeLexicons) || activeLexicons.length === 0) {
                    window.highlightingActive = false; // Désactive le surlignage
                    highlightingActive = false; // Met à jour l'état local
                    return; // Sort de la fonction si aucun lexique actif
                }
                log("État des lexiques trouvé:", activeLexicons);
                for (const lexiconId of activeLexicons) {
                    await startHighlighting(lexiconId); // Démarre le surlignage pour chaque lexique
                }
            } catch (error) {
                log("Erreur lors de la restauration de l'état:", error);
                window.highlightingActive = false;
                highlightingActive = false;
            }
        }
        
        window.updateLexiconCache = updateLexiconCache;
        window.highlightVisibleContent = highlightVisibleContent;
        window.attachMutationObserver = attachMutationObserver;
        window.detachMutationObserver = detachMutationObserver;
        window.startHighlighting = startHighlighting;
        window.stopHighlighting = stopHighlighting;
        

        // Démarrage initial de la restauration de l'état
        checkAndRestoreHighlightingState();
        
    } catch (error) {
        log("Erreur critique dans l'IIFE:", error);
    }
})();
