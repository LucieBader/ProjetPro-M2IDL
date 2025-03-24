importScripts("../utils/logger.js");
log("pyodide_worker.js chargé avec succès !");

// ─────────────────────────────────────────────────────────────
// ▌ Constantes et variables globales
// ─────────────────────────────────────────────────────────────
const LATEST_BASE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";

let pyodide = null;
let pyodideLoaded = false;      // Indique si Pyodide est chargé
let simplemmaLoaded = false;    // Indique si simplemma est installé
let storedFrequencies = {};     // Stockage des fréquences accumulées
// Préférences et configuration utilisateur
let autoAddEnabled = false;     // Ajout automatique désactivé par défaut
let isAuthenticated = false;    // Non connecté par défaut
let userThreshold = 10;         // Seuil par défaut
let trackedLanguages = [];      // Aucune langue suivie par défaut
let notifiedWords = {};         // Mots déjà notifiés (pour éviter les doublons)
let includeStopwords = false;   // Stocker l'état de l'inclusion des mots outils
let stoplistsByLang = {};       // Objet stockant les stoplists par langue
let userLexicons = []           // Contient les lexiques et leurs ID (lexiques personnels)
let authToken = null;           // Stockage local du token

// --- Attente de la mise à jour de la stoplist ---
let stoplistsReady = new Promise((resolve) => resolve()); 

// Écouteur des messages reçus du background script
self.onmessage = async (event) => {
  const { command, ...data } = event.data;
  log("[WebWorker] Message reçu du Background:", command, data);

  switch (command) {

    case "pyodide-simplemma":
      if (pyodideLoaded && simplemmaLoaded) {
        log("[Worker] Pyodide et Simplemma déjà chargés.");
        self.postMessage({ type: "pyodide-simplemma", status: "already_loaded", message: "Pyodide et Simplemma déjà en mémoire" });
        return;
      }
      try {
        if (!pyodideLoaded) {
          log("[Worker] Chargement de Pyodide...");
          try {
            importScripts(`${LATEST_BASE_URL}pyodide.js`);
          } catch (err) {
            console.error("[Worker] Erreur lors de l'import de pyodide.js :", err);
            self.postMessage({ type: "pyodide-simplemma", status: "error", message: err.toString() });
            return;
          }
          pyodide = await loadPyodide({ indexURL: LATEST_BASE_URL });
          await pyodide.loadPackage("lzma");
          await pyodide.loadPackage("micropip");
          pyodideLoaded = true;
          log("[Worker] Pyodide chargé avec succès !");
        }

        if (!simplemmaLoaded) {
          log("[Worker] Installation de simplemma...");
          await pyodide.runPythonAsync(`
          import micropip
          import asyncio

          async def main():
              print("Installation de simplemma...")
              await micropip.install("simplemma")
              print("Installation réussie.")
              import simplemma
              print("simplemma importé avec succès.")
              # Test simple : extraction de tokens et lemmatisation
              import re
              def tokenize(text):
                  return re.findall(r"\\b\\w+\\b", text.lower())
              phrase = "Simplemma est prêt"
              tokens = tokenize(phrase)
              print("Tokens extraits :", tokens)
              lemmatized_tokens = [simplemma.lemmatize(token, lang="fr") for token in tokens]
              print("Tokens lemmatisés :", lemmatized_tokens)
              return lemmatized_tokens

          await main()
          `);
          simplemmaLoaded = true;
          log("[Worker] Simplemma installé avec succès !");
        }
        // Envoyer confirmation au background script
        self.postMessage({ type: "pyodide-simplemma", status: "success", message: "Pyodide et Simplemma chargés" });
      } catch (error) {
        console.error("[Worker] Erreur lors du chargement de Pyodide ou Simplemma :", error);
        self.postMessage({ type: "pyodide-simplemma", status: "error", message: error.toString() });
      }
      break;

    case "process-text":
      if (!pyodideLoaded) {
        log("[Worker] Pyodide non chargé.");
        self.postMessage({ type: "process-text", status: "error", message: "Pyodide pas encore chargé" });
        return;
      }

      log("[Worker] Texte reçu pour analyse :", data.text);
      try {
        const result = await pyodide.runPythonAsync(`
        import json
        import re
        import simplemma
        from simplemma import langdetect

        abrev_pat = re.compile(r"""\\b(
            p\\.ex|M\\.|MM\\.|cf\\.|e\\.g|etc\\.
        )\\b""", re.X)

        tokgrm = re.compile(r"""
            (?:etc\\.|p\\.ex\\.|cf\\.|M\\.)|
            (?:pomme de terre|pomme de pin|c'est-à-dire|peut-être|aujourd'hui|avant-hier|après-demain|tout-à-l’heure)|
            \\w+(?=(?:-(?:je|tu|ils?|elles?|nous|vous|leur|lui|les?|ce|t-|même|ci|là)))|
            [\\w\\-]+'?|
            [^\\d\\W]+
        """, re.X)

        def detect_language(text):
            lang_scores = simplemma.langdetect(text, lang=("fr", "en", "es", "de", "it", "pt"))
            return lang_scores[0][0] if lang_scores else "unk"

        def tokenize(text, lang):
            if lang == "fr":
                tokens = tokgrm.findall(text.lower())
                # Exclure nombres & ponctuation
                tokens = [t for t in tokens if not re.match(r"^[\\d.,:!?;]+$", t)]  
                return tokens
            return re.findall(r"\\b[a-zA-ZÀ-ÿ'-]+\\b", text.lower())

        text = """${data.text.replace(/\"/g, '\\"')}"""
        detected_lang = detect_language(text)
        if detected_lang == "unk":
            detected_lang = "other"

        tokens = tokenize(text, detected_lang)
        lemmatized_tokens = [simplemma.lemmatize(token, lang=detected_lang) for token in tokens]

        freq = {}
        for token in lemmatized_tokens:
            freq[token] = freq.get(token, 0) + 1

        json.dumps({"lang": detected_lang, "frequencies": freq}, ensure_ascii=False)
`);
          const parsedResult = JSON.parse(result);
          const detectedLang = parsedResult.lang;
          if (!storedFrequencies[detectedLang]) {
            storedFrequencies[detectedLang] = {};
          }
          for (const [word, count] of Object.entries(parsedResult.frequencies)) {
            storedFrequencies[detectedLang][word] = (storedFrequencies[detectedLang][word] || 0) + count;
          }
          self.postMessage({ type: "update-frequencies", frequencies: storedFrequencies });
          if (autoAddEnabled) {
            checkThreshold(detectedLang);
          }
      } catch (error) {
        console.error("[Worker] Erreur dans l'analyse du texte :", error);
      }
      break;

    case "update-preferences":
      userThreshold = data.threshold;
      trackedLanguages = data.trackedLanguages;
      autoAddEnabled = data.autoAdd;
      isAuthenticated = data.isAuthenticated;
      log("[Worker] Mise à jour des préférences :", { userThreshold, trackedLanguages, autoAddEnabled, isAuthenticated });
      break;
    
    case "update-lexicons":
      userLexicons = JSON.parse(data.lexicons)
      log("[Worker] Lexiques mis à jour :", userLexicons);
      break;
    
    case "update-auth-token":
      authToken = data.accessToken;
      log("[Worker] Token mis à jour :", authToken ? "Disponible" : "Aucun token reçu");
      break;

    case "update-stoplist":
      stoplistsReady = new Promise((resolve) => {
        if (data.stoplists && typeof data.stoplists === "object") {
          stoplistsByLang = {};
          for (const [lang, words] of Object.entries(data.stoplists)) {
            stoplistsByLang[lang] = new Set(words.map(word => word.toLowerCase().trim()));
            log(`[Worker] Stoplist mise à jour pour '${lang}' : ${stoplistsByLang[lang].size} mots.`);
          }
        } else {
          log("[Worker] Stoplists reçues incorrectes ou vides.");
        }
        resolve(); // Stoplist prête
      });
      break;

    case "update-include-stopwords":
      includeStopwords = data.includeStopwords;
      log(`[Worker] Mise à jour de includeStopwords : ${includeStopwords}`);
      break;
  }
};


// --- Vérification du seuil et notification ---
let pendingWords = {}; // Stocke temporairement les mots en attente d'ajout
let attemptedWords = {}; // Stocke les mots déjà tentés (ajout réussi ou non)
let addWordTimeout = null; // Timer pour regrouper les ajouts

async function checkThreshold(lang) {
  await stoplistsReady; // Attendre que les stoplists soient chargées

  if (!autoAddEnabled || !isAuthenticated) {
    log("[Worker] Auto-Add désactivé ou utilisateur non connecté.");
    return;
  }
  if (!trackedLanguages.includes(lang)) {
    log(`[Worker] La langue '${lang}' n'est pas suivie.`);
    return;
  }

  log(`[Worker] Vérification des fréquences pour la langue '${lang}'...`);
  const stoplist = stoplistsByLang[lang] || new Set();
  const shouldFilterStopwords = stoplist.size > 0 && !includeStopwords;

  log(`[Worker] Stoplist pour '${lang}' : ${shouldFilterStopwords ? "Appliquée" : "Non appliquée"}`);

  const wordsFrequencies = storedFrequencies[lang] || {};
  const notifiedSet = new Set(notifiedWords[lang] || []);

  // Filtrer les mots qui dépassent le seuil
  const exceededWords = Object.entries(wordsFrequencies)
    .filter(([word, count]) => count >= userThreshold && !notifiedSet.has(word))
    .map(([word]) => word);

  if (exceededWords.length === 0) {
    log(`[Worker] Aucun mot dépassant le seuil pour '${lang}'.`);
    return;
  }

  // Exclure les stopwords et les mots déjà tentés
  const finalWords = exceededWords.filter(word => {
    if (shouldFilterStopwords && stoplist.has(word)) {
      log(`[Worker] Mot "${word}" exclu (stoplist)`);
      return false;
    }
    if (attemptedWords[lang]?.has(word)) {
      log(`[Worker] Mot "${word}" déjà tenté, on l'ignore.`);
      return false;
    }
    return true;
  });

  if (finalWords.length === 0) {
    log(`[Worker] Aucun mot à ajouter après filtrage.`);
    return;
  }

  // Ajouter à notifiedWords pour éviter de les re-traiter immédiatement
  notifiedWords[lang] = notifiedWords[lang] || new Set();
  finalWords.forEach(word => notifiedWords[lang].add(word));

  log("Mots dépassant le seuil et à ajouter :", finalWords);
  self.postMessage({ type: "threshold-exceeded", wordsAboveThreshold: { [lang]: finalWords } });

  // Ajout aux mots en attente pour un envoi groupé
  pendingWords[lang] = pendingWords[lang] || [];
  pendingWords[lang].push(...finalWords);

  // Initialiser attemptedWords si nécessaire
  attemptedWords[lang] = attemptedWords[lang] || new Set();

  // Regrouper les ajouts en une seule tâche différée
  if (!addWordTimeout) {
    addWordTimeout = setTimeout(() => {
      addWordTimeout = null;
      processPendingWords();
    }, 3000);
  }
}

/**
 * Traite les ajouts groupés
 */
async function processPendingWords() {
  log("Traitement des mots en attente d'ajout...");

  if (!authToken) {
    log("Impossible d'ajouter les mots : Aucun token d'authentification.");
    return;
  }

  for (const lang in pendingWords) {
    const words = [...new Set(pendingWords[lang])];
    if (words.length === 0) continue;

    log(`Envoi des mots '${words.join(", ")}' pour la langue '${lang}'`);

    // Récupérer les lexiques pour la langue
    const targetLexicons = userLexicons
      .filter(lexicon => lexicon.language === lang && lexicon.category === "User")
      .map(lexicon => lexicon.id);

    if (targetLexicons.length === 0) {
      log(`⚠ Aucun lexique trouvé pour la langue '${lang}', envoi annulé.`);
      continue;
    }

    await autoAddWord(lang, authToken, words, targetLexicons);
  }
}

/**
 * Envoi des mots à l'API en évitant les doublons
 */
async function autoAddWord(lang, authToken, wordsArray, lexiconIds, force = false) {
  if (!authToken) {
    console.error("Aucun token d’authentification fourni.");
    return;
  }
  if (!Array.isArray(wordsArray) || wordsArray.length === 0) {
    console.error("Aucun mot spécifié pour l’ajout.");
    return;
  }
  if (!Array.isArray(lexiconIds) || lexiconIds.length === 0) {
    console.error("Aucun lexique sélectionné pour l’ajout.");
    return;
  }

  const url = "https://babalex.lezinter.net/api/entry/create";
  
  for (const word of wordsArray) {
    // Vérifier et initialiser attemptedWords[lang]
    if (!attemptedWords[lang]) attemptedWords[lang] = new Set();

    // Si le mot a déjà été tenté, on ne le retente pas
    if (attemptedWords[lang].has(word)) {
      log(`[Worker] Mot '${word}' déjà tenté, on l'ignore.`);
      continue;
    }

    // Ajouter immédiatement le mot à attemptedWords
    attemptedWords[lang].add(word);
    log(`[Worker] Liste des mots tentés pour '${lang}':`, Array.from(attemptedWords[lang]));

    const body = {
      graphy: word,
      force,
      target_lex: lexiconIds
    };

    log("Envoi de la requête API autoAddWord :", body);

    try {
      await new Promise(resolve => setTimeout(resolve, 3000)); // espacer les requêtes
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Erreur API (${response.status}): ${response.statusText}`);
      }

      log(`Mot '${word}' ajouté avec succès aux lexiques ${lexiconIds}`);
      attemptedWords[word] = "success"; // Marquer comme ajouté avec succès

    } catch (error) {
      console.error(`Erreur lors de l'ajout du mot '${word}':`, error);
      attemptedWords[word] = "failed"; // Marquer comme échec pour éviter la répétition
      log(attemptedWords)
      // Réessayer après 24H
      setTimeout(() => {
        delete attemptedWords[word]; // On retente après 24h
      }, 24 * 60 * 60 * 1000);
      
    }
  }
}
 