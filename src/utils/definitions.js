// ─────────────────────────────────────────────────────────────────────────────
// ▌ Fonctions pour récupérer/afficher les définitions
// ─────────────────────────────────────────────────────────────────────────────

window.lexiconMap = new Map();

/**
 * Récupère les définitions d'un mot dans les lexiques de l'utilisateur.
 * @param {string} word - Le mot dont on veut les définitions.
 * @returns {Promise<object[]>} - Un tableau d'objets contenant les définitions.
 */
async function fetchLexiconDefinitions(word) {
  try {
    log(`Recherche des définitions de '${word}' dans les lexiques de l'utilisateur...`);

    if (!authToken) {
      console.warn("Aucun token disponible, impossible de requêter l'API protégée.");
      return [];
    }

    // 1) Récupérer la liste complète des lexiques de l'utilisateur
    const lexUrl = `https://babalex.lezinter.net/api/lexicon/search?`;
    const lexResponse = await fetch(lexUrl, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!lexResponse.ok) {
      throw new Error(`Erreur API lors de la récupération des lexiques: ${lexResponse.statusText}`);
    }
    const userLexicons = await lexResponse.json();
    log("Lexiques de l'utilisateur :", userLexicons);

    if (!Array.isArray(userLexicons) || userLexicons.length === 0) {
      console.warn("️ Aucun lexique trouvé pour cet utilisateur.");
      return [];
    }

    // Mise à jour de lexiconMap avec des libellés uniques (ajout de l'ID)
    lexiconMap.clear();
    userLexicons.forEach((lex) => {
      const lexiconName =
        lex.category === "User"
          ? `Lexique personnel : ${lex.user?.pseudo || "Inconnu"}`
          : `Lexique de groupe : ${lex.group?.name || "Inconnu"}`;
      lexiconMap.set(lex.id, lexiconName);
    });
    log("LexiconMap :", lexiconMap);

    // 2) Pour chaque lexique, rechercher le mot en ajoutant target_lex
    const definitionsPromises = userLexicons.map(async (lex) => {
      const searchUrl = `https://babalex.lezinter.net/api/entry/search?graphy=${encodeURIComponent(word)}&language=fr&target_lex=${lex.id}`;
      log(`Appel API pour le lexique ${lex.id} avec l'URL : ${searchUrl}`);

      const searchResponse = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (!searchResponse.ok) {
        console.warn(`️ Erreur pour le lexique ${lex.id} : ${searchResponse.statusText}`);
        return { lexiconId: lex.id, entries: [] };
      }
      const entries = await searchResponse.json();
      log("Entrées récupérées :", entries);

      // Filtrage côté client : ne garder que les entrées dont entry.lexicon.id correspond exactement à lex.id
      const filteredEntries = entries.filter(entry => {
        if (!entry.lexicon) return false;
        return Number(entry.lexicon.id) === Number(lex.id);
      });

      log(`Pour le lexique ${lex.id} (${lexiconMap.get(lex.id)}), entrées filtrées :`, filteredEntries);

      return { lexiconId: lex.id, entries: filteredEntries };
    });

    const results = await Promise.all(definitionsPromises);

    // 3) Parcourir les résultats et extraire les définitions + prononciations
    let allDefinitions = [];
    results.forEach(result => {
      log(`Pour le lexique ${result.lexiconId}, entrées filtrées :`, result.entries);
      const lexiconId = result.lexiconId;
      const sourceName = lexiconMap.get(lexiconId) || `Lexique #${lexiconId}`;

      result.entries.forEach(entry => {
        if (!entry.lexicon || Number(entry.lexicon.id) !== Number(lexiconId)) return;

        let items = entry.attributes?.Items;
        if (!Array.isArray(items)) {
          if (typeof items === 'object' && items !== null) {
            items = Object.values(items);
          } else {
            return;
          }
        }

        const balexId = entry.internal_id || null;

        items.forEach(item => {
          const definitionsArray = item.Sense?.Definitions;
          const pronunciationsArray = item.Sense?.Pronunciations;

          let pronunciations = [];
          if (Array.isArray(pronunciationsArray)) {
            pronunciations = pronunciationsArray.map(p => p.Transcription).filter(p => p);
          }

          if (!Array.isArray(definitionsArray)) return;

          definitionsArray.forEach(defObj => {
            if (defObj.Def) {
              allDefinitions.push({
                source: sourceName,
                text: defObj.Def,
                internal_id: balexId,  
                pronunciations: pronunciations,
                lexiconId: lexiconId
              });
            }
          });
        });
      });
    });
    log("Résultats filtré depuis les lexiques utilisateurs :", allDefinitions);
        return allDefinitions;
      } catch (error) {
        log("Erreur générale lors de la récupération des définitions :", error);
        return [];
      }
    }

/**
* Récupère la définition d'un mot depuis le Wiktionnaire (fr).
* Retourne un tableau d'objets : [{ source: 'Wiktionnaire', text: '...' }]
*/
async function fetchWiktionaryDefinition(word) {
  try {
    const result = await browser.storage.local.get("accessToken");
    authToken = result.accessToken;

    // Initialisation d'une structure vide pour éviter les erreurs
    let formattedData = {
      definitions: [],
      pronunciations: [],
      definitionsByPOS: {}  // Pour stocker les définitions triées par POS
    };

    if (!authToken) {
      log(`Requête Wiktionnaire pour "${word}"...`);
      if (!word || word.trim() === "") {
        throw new Error(`Mot vide, impossible d'envoyer la requête.`);
      }
      
      const wiktionaryURL = `https://fr.wiktionary.org/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=true&redirects=1&titles=${encodeURIComponent(word)}`;
      const response = await fetch(wiktionaryURL);
      if (!response.ok) {
        throw new Error(`Erreur API Wiktionnaire: ${response.statusText}`);
      }
      const data = await response.json();
      log("Réponse API (Wiktionnaire) :", data);

      const pages = data.query?.pages;
      const page = pages ? Object.values(pages)[0] : null;

      formattedData.definitions = page && page.extract
        ? [page.extract.trim()]
        : ["Aucune définition trouvée sur le Wiktionnaire."];

      log("Définition Wiktionnaire extraite :", formattedData.definitions);

      return [
        {
          source: "Wiktionnaire",
          text: formattedData.definitions.join(" | "),
          pronunciations: formattedData.pronunciations,
          definitionsByPOS: formattedData.definitionsByPOS
        }
      ];
    } else {
      log(` Recherche de la définition pour : ${word}`);

      // Récupération des données depuis l'API
      const apiResponse = await wikiApiResponse(word);
      log("Réponse brute de l'API :", apiResponse);

      if (!Array.isArray(apiResponse) || apiResponse.length === 0) {
        console.warn(`Aucune définition trouvée pour "${word}"`);
        return [];  // Retourne un tableau vide si aucune définition
      }

      // Formatage des données récupérées
      formattedData = formatDefinitionData(apiResponse);
      log(" Données formatées :", formattedData);

      // Vérification avant retour
      if (!formattedData.definitions) {
        formattedData.definitions = []; //
      }
      if (!formattedData.pronunciations) {
        formattedData.pronunciations = []; //
      }
      if (!formattedData.definitionsByPOS) {
        formattedData.definitionsByPOS = {}; //
      }

      return [
        {
          source: "Wiktionnaire",
          text: formattedData.definitions.length > 0 ? formattedData.definitions.join(" | ") : "Aucune définition disponible.",
          pronunciations: formattedData.pronunciations,
          definitionsByPOS: formattedData.definitionsByPOS
        }
      ];
    }
  } catch (error) {
    log("Erreur lors de la récupération de la définition :", error);
    return [{ 
      source: "Wiktionnaire", 
      text: "Erreur lors de la récupération sur le Wiktionnaire.", 
      pronunciations: [],
      definitionsByPOS: {} 
    }];
  }
}

/**
 * Récupère la réponse de l'API Wiktionnaire pour un mot donné.
 * @param {string} word - Le mot à rechercher.
 * @returns {Promise<object>} - La réponse de l'API.
 */
async function wikiApiResponse(word) {
  const result = await browser.storage.local.get("accessToken");
  authToken = result.accessToken;
  // Construire l'URL de l'API avec le mot sélectionné
  const wiktionaryApiUrl = `https://babalex.lezinter.net/api/wiktionary/search?graphy=${encodeURIComponent(word)}&language=fr`;

  try {
    const response = await fetch(wiktionaryApiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`, 
        'Content-Type': 'application/json', 
      },
    });

    if (!response.ok) {
      throw new Error(`Erreur lors de la récupération de la définition depuis le Wiktionnaire : ${response.statusText}`);
    }

    
    const data = await response.json();
    log(`Résultats du Wiktionnaire pour le mot "${word}" :`, data);
    return data;
  } catch (error) {
    log('Erreur lors de la récupération de la définition depuis le Wiktionnaire :', error);
    throw error; 
  }
}

/**
 * Formate les données de la réponse de l'API Wiktionnaire.
 * @param {object} apiResponse - La réponse de l'API.
 * @returns {object} - Les données formatées.
 */
function formatDefinitionData(apiResponse) {
  let formattedData = {
      word: apiResponse[0]?.id.split("-").slice(2).join("-") || "",
      pronunciations: new Set(),  //  Utilisation d'un Set pour éviter les doublons
      definitionsByPOS: {}  //  Organisation par catégorie grammaticale
  };

  apiResponse.forEach(entry => {
      const wordData = entry[entry.id.split(".").slice(-1)[0]]; // Accès aux données via clé dynamique
      const pos = wordData.pos || "Autre";  // Définit le POS ou "Autre" si absent

      if (!formattedData.definitionsByPOS[pos]) {
          formattedData.definitionsByPOS[pos] = {
              definitions: [],
              examples: [],
              pronunciations: new Set()
          };
      }

      // Ajout des prononciations globales en extrayant les transcriptions valides
      if (wordData.pronunciations) {
          wordData.pronunciations.forEach(pron => {
              if (pron.transcript) {
                  formattedData.pronunciations.add(pron.transcript);
              }
          });
      }

      // Ajout des prononciations spécifiques au POS
      if (wordData.pronunciations) {
          wordData.pronunciations.forEach(pron => {
              if (pron.transcript) {
                  formattedData.definitionsByPOS[pos].pronunciations.add(pron.transcript);
              }
          });
      }

      // Ajout des définitions et des exemples
      if (wordData.senses) {
          for (let senseKey in wordData.senses) {
              let sense = wordData.senses[senseKey];

              if (sense.Definitions) {
                  formattedData.definitionsByPOS[pos].definitions.push(
                      ...sense.Definitions.map(d => d.definition)
                  );
              }
              if (sense.Examples) {
                  formattedData.definitionsByPOS[pos].examples.push(
                      ...sense.Examples.map(e => e.example)
                  );
              }
          }
      }
  });

  //  Convertir les Sets en Arrays
  formattedData.pronunciations = [...formattedData.pronunciations];
  Object.keys(formattedData.definitionsByPOS).forEach(pos => {
      formattedData.definitionsByPOS[pos].pronunciations = [...formattedData.definitionsByPOS[pos].pronunciations];
  });

  return formattedData;
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Affichage des définitions dans la barre latérale
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LENGTH = 300;

/**
* Affiche les définitions dans la barre latérale.
*/
function displayDefinitions(definitions) {
  log("Affichage des définitions reçues :", definitions);
  if (!Array.isArray(definitions)) return;
  const mesLexiquesList = document.getElementById("mesLexiquesList");
  const wiktionnaireList = document.getElementById("wiktionnaireList");
  const noLexiconDefinitionsContainer = document.getElementById("noLexiconDefinitionsContainer");
  const noWiktionaryDefinitionsContainer = document.getElementById("noWiktionaryDefinitionsContainer");

  const internalIdMap = new Map();  // Dictionnaire pour stocker internal_id par lexique

  // Nettoyage des listes existantes
  mesLexiquesList.innerHTML = "";
  wiktionnaireList.innerHTML = "";

  // Masquer les sections vides par défaut
  if (noLexiconDefinitionsContainer) noLexiconDefinitionsContainer.style.display = "none";
  if (noWiktionaryDefinitionsContainer) noWiktionaryDefinitionsContainer.style.display = "none";

  let hasLexiconDefinitions = false;
  let hasWiktionaryDefinitions = false;
  const lexiconGroups = {};

  definitions.forEach(({ source, text, internal_id, definitionsByPOS }) => {
        if (!source || !text) return;
        log(`Traitement de ${source}, internal_id:`, internal_id);

        const definitionContainer = document.createElement("div");
        definitionContainer.classList.add("definition-item");

        // Gestion des définitions des lexiques
        if (!definitionsByPOS) {
            // C'est une définition provenant des lexiques utilisateur
            const li = document.createElement("li");
            li.textContent = text;
            definitionContainer.appendChild(li);

            // Stocker le premier `internal_id` trouvé pour chaque lexique
            if (!internalIdMap.has(source) && internal_id) {
              internalIdMap.set(source, internal_id);
            }
            // Ajout dans le bon groupe
            if (!lexiconGroups[source]) {
                lexiconGroups[source] = [];
            }
            lexiconGroups[source].push(definitionContainer);
            hasLexiconDefinitions = true;

        } else {
            // C'est une définition provenant du Wiktionnaire
            log(`Traitement des définitions du Wiktionnaire pour "${source}"`);

            // 2. Affichage des prononciations globales si disponibles
            const allPronunciations = new Set();
            Object.values(definitionsByPOS).forEach(posData => {
                posData.pronunciations.forEach(pron => allPronunciations.add(pron));
            });

            if (allPronunciations.size > 0) {
                const pronDiv = document.createElement("div");
                pronDiv.style.marginBottom = "5px";
                pronDiv.style.fontSize = "13px";
                pronDiv.textContent = "Prononciations possibles :";
                pronDiv.style.marginBottom = "10px";
                definitionContainer.appendChild(pronDiv);

                // Création d'un conteneur pour les prononciations
                const pronContainer = document.createElement("div");
                pronContainer.style.display = "flex";
                pronContainer.style.justifyContent = "center";
                pronContainer.style.flexWrap = "wrap";
                allPronunciations.forEach(pron => {
                    const pronSpan = document.createElement("span");
                    pronSpan.textContent = pron;
                    pronSpan.style.marginRight = "25px"; 
                    pronSpan.style.fontSize = "15px";
                    pronSpan.style.alignItems = "center";
                    pronSpan.style.justifyContent = "center";
                    pronContainer.appendChild(pronSpan);
                });
                definitionContainer.appendChild(pronContainer);
            }
            

            // 3. Affichage des définitions triées par POS
            Object.entries(definitionsByPOS).forEach(([pos, posData]) => {
              if (posData.definitions.length === 0) return;  // Évite les POS vides
          
              // Création d'un conteneur dédié pour ce POS
              const posContainer = document.createElement("div");
          
              // Titre du POS
              const posTitle = document.createElement("h4");
              posTitle.style.marginTop = "10px";
              posTitle.style.color = "#FFFFFF";
              posTitle.textContent = pos.toUpperCase();
              posContainer.appendChild(posTitle);
          
              // Prononciations spécifiques au POS
              if (posData.pronunciations.length > 0) {
                  const posPronDiv = document.createElement("div");
                  posPronDiv.style.fontStyle = "italic";
                  posPronDiv.style.color = "#94608a";
                  // posPronDiv.textContent = posData.pronunciations.join(", ");
                  posContainer.appendChild(posPronDiv);
              }
              // Récupération des définitions complètes
              const fullDefinitions = posData.definitions.map(def => def.trim());
              // Concaténation de toutes les définitions dans un seul texte (séparées par un espace)
              const concatenatedText = fullDefinitions.join(" ");
              
              // Création de la liste des définitions pour ce POS
              const defList = document.createElement("ul");
              defList.style.margin = "0";
              defList.style.paddingLeft = "20px";
              
              const li = document.createElement("li");
              if (concatenatedText.length > MAX_LENGTH) {
                  // Affichage tronqué pour l'ensemble du bloc de définitions
                  const truncatedText = concatenatedText.slice(0, MAX_LENGTH) + "... ";
                  li.textContent = truncatedText;
                  
                  // Bouton "Lire la suite" pour afficher le contenu complet
                  const readMoreLink = document.createElement("a");
                  readMoreLink.href = "#";
                  readMoreLink.textContent = "[Lire la suite]";
                  readMoreLink.style.marginLeft = "5px";
                  readMoreLink.style.color = "#8d5c70";
                  readMoreLink.style.textDecoration = "underline";
                  readMoreLink.style.cursor = "pointer";
                  readMoreLink.addEventListener("click", (event) => {
                      event.preventDefault();
                      // Construction du contenu complet pour ce POS en préservant la structure
                      let popupContent = `<h4 style="margin-top:10px; color:#FFFFFF;">${pos.toUpperCase()}</h4>`;
                      if (posData.pronunciations.length > 0) {
                          popupContent += `<div style="font-style:italic; color:#94608a;">${posData.pronunciations.join(", ")}</div>`;
                      }
                      popupContent += "<ul style='margin:0; padding-left:20px;'>";
                      fullDefinitions.forEach(text => {
                          popupContent += `<li>${text}</li>`;
                      });
                      popupContent += "</ul>";
                      openDefinitionPopup(popupContent);
                  });
                  li.appendChild(readMoreLink);
              } else {
                  li.textContent = concatenatedText;
              }
              
              defList.appendChild(li);
              posContainer.appendChild(defList);
              definitionContainer.appendChild(posContainer);
          });
          
          wiktionnaireList.appendChild(definitionContainer);
          hasWiktionaryDefinitions = true;
      }
  });

  // 5. Gestion des groupes de lexiques personnels
  Object.entries(lexiconGroups).forEach(([lexiconName, definitionItems]) => {
    const lexiconContainer = document.createElement("div");
    lexiconContainer.className = "lexicon-section";
  
    const headerContainer = document.createElement("div");
    headerContainer.className = "header-container";
    headerContainer.style.position = "relative"; 
    headerContainer.style.cursor = "pointer";
  
    const lexiconHeader = document.createElement("div");
    lexiconHeader.className = "lexicon-header";
    
    const titleSpan = document.createElement("span");
    titleSpan.textContent = lexiconName;
    lexiconHeader.appendChild(titleSpan);
  
    headerContainer.appendChild(lexiconHeader);
  
    const balexButton = createBaLexButton(lexiconName, internalIdMap);
    if (balexButton) {
      balexButton.style.position = "absolute";
      balexButton.style.top = "50%";
      balexButton.style.transform = "translateY(-50%)";
      balexButton.style.right = "5px"; 
  
      balexButton.addEventListener("click", (e) => e.stopPropagation());
      headerContainer.appendChild(balexButton);
    }
  
    headerContainer.addEventListener("click", () => {
      lexiconContent.classList.toggle("hidden");
    });
  
    const lexiconContent = document.createElement("div");
    lexiconContent.className = "lexicon-content hidden";
    definitionItems.forEach(item => lexiconContent.appendChild(item));
  
    lexiconContainer.appendChild(headerContainer);
    lexiconContainer.appendChild(lexiconContent);
    mesLexiquesList.appendChild(lexiconContainer);
  });
    

  // 6. Gestion des sections vides
  if (!hasLexiconDefinitions && noLexiconDefinitionsContainer) {
      noLexiconDefinitionsContainer.style.display = "block";
  }
  if (!hasWiktionaryDefinitions && noWiktionaryDefinitionsContainer) {
      noWiktionaryDefinitionsContainer.style.display = "block";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Gestion du popup pour afficher la définition complète du Wiktionnaire
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Ouvre le popup pour afficher la définition complète du Wiktionnaire
 * @param {string} fullText - Le texte complet à afficher dans le popup.
 */
function openDefinitionPopup(fullText) {
  const modalOverlay = document.getElementById("modalOverlay");
  const modalFullText = document.getElementById("modalFullText");
  if (!modalOverlay || !modalFullText) {
    log("Modal elements not found!");
    return;
  }
  modalFullText.innerHTML = "<p>" + fullText.replace(/\n/g, "<br>") + "</p>";
  modalOverlay.style.display = "flex";
}

/**
* Ferme le popup et nettoie le contenu
*/
function closeDefinitionPopup() {
  const modalOverlay = document.getElementById("modalOverlay");
  const modalFullText = document.getElementById("modalFullText");
  if (!modalOverlay || !modalFullText) return;
  modalOverlay.style.display = "none";
  modalFullText.innerHTML = "";
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Affichage des définitions Babalex + Wiktionnaire
// ─────────────────────────────────────────────────────────────────────────────

/**
* Récupère en parallèle :
*   - les définitions des lexiques de l'utilisateur (fetchLexiconDefinitions)
*   - la définition Wiktionnaire (fetchWiktionaryDefinition)
* Puis fusionne les résultats.
*/
async function combineDefinitions(word) {
  log(`[combineDefinitions] Récupération des définitions pour "${word}"...`);

  const results = await Promise.allSettled([
    fetchLexiconDefinitions(word),
    fetchWiktionaryDefinition(word)
  ]);

  const lexiconDefinitions =
    results[0].status === "fulfilled" ? results[0].value : [];
  const wiktionaryDefinitions =
    results[1].status === "fulfilled" ? results[1].value : [];

  const allDefinitions = [...lexiconDefinitions, ...wiktionaryDefinitions];

  log("[combineDefinitions] Résultat fusionné :", allDefinitions);

  return allDefinitions;
}

/**
 * Récupère et affiche toutes les définitions (lexiques + Wiktionnaire).
 * @param {string} word - Le mot dont on veut les définitions.
 */
async function showDefinitions(word) {
  log(`[showDefinitions] Recherche + affichage pour "${word}"...`);

  const noDefinitionsContainer = document.getElementById("noDefinitionsContainer");
  if (noDefinitionsContainer) {
    noDefinitionsContainer.textContent = "Chargement des définitions...";
    noDefinitionsContainer.style.display = "block";
  }

  try {
    const allDefinitions = await combineDefinitions(word);

    log("[showDefinitions] Définitions récupérées :", allDefinitions);

    if (!allDefinitions || allDefinitions.length === 0) {
      if (noDefinitionsContainer) {
        noDefinitionsContainer.textContent = "️Aucune définition trouvée.";
      }
      return;
    }

    displayDefinitions(allDefinitions);

    if (noDefinitionsContainer) {
      noDefinitionsContainer.style.display = "none";
    }
    return allDefinitions;

  } catch (error) {
    log("[showDefinitions] Erreur : ", error);

    if (noDefinitionsContainer) {
      noDefinitionsContainer.textContent =
        "Une erreur est survenue lors de la récupération des définitions.";
      noDefinitionsContainer.style.display = "block";
    }
    return [];
  }
}

/**
 * Appel direct pour récupérer les définitions d'un mot uniquement via l'API
 * (sans Wiktionnaire), puis gérer l'affichage d'erreur ou non.
 * @param {string} word - Le mot dont on veut la définition.
 */
async function fetchDefinition(word) {
  log(`Recherche de la définition pour '${word}'...`);

  const noDefinitionsContainer = document.getElementById("noDefinitionsContainer");
  if (!noDefinitionsContainer) {
    log("Élément #noDefinitionsContainer introuvable.");
    return;
  }

  try {
    const definition = await fetchLexiconDefinitions(word);
    log("Résultat API :", definition);

    if (!definition || definition.length === 0) {
      console.warn(`️ Aucune définition trouvée pour '${word}'`);
      noDefinitionsContainer.style.display = "block";
      return;
    }

    noDefinitionsContainer.style.display = "none";
  } catch (error) {
    log("Erreur lors de la récupération de la définition :", error);
    noDefinitionsContainer.style.display = "block";
  }
}

/**
 * Affiche les lexiques où le mot sélectionné est présent.
 * @param {object[]} lexicons - Les lexiques où le mot est présent.
*/
function displayLexiconResults(lexicons) {
  const resultDiv = document.getElementById("lexiconResult");
  if (!resultDiv) return; 

  resultDiv.innerHTML = "";

  if (!lexicons || lexicons.length === 0) {
    resultDiv.textContent = "Ce mot n'est présent dans aucun lexique.";
    return;
  }
  const title = document.createElement("p");
  title.innerHTML = "Ce mot est présent dans le(s) lexique(s) suivant(s) :";
  title.style.fontSize = "12px";
  resultDiv.appendChild(title);

  const ul = document.createElement("ul");
  ul.style.paddingLeft = "20px";

  lexicons.forEach((lexicon) => {
    if (!lexicon) {
      console.warn("️Lexique incorrect :", lexicon);
      return;
    }
    if (!lexicon.id) {
      console.warn("ID non défini :", lexicon.id);
      return;
    }

    const lexiconName = lexicon.name || `Lexique #${lexicon.id}`;
    const li = document.createElement("li");
    li.innerHTML = `<strong>${lexiconName}</strong>`;
    ul.appendChild(li);

    log(`Lexique ajouté : ${lexiconName} (ID: ${lexicon.id})`);
  });

  resultDiv.appendChild(ul);
}

/**
 * Crée un bouton permettant d'ouvrir une entrée dans BaLex.
 * @param {string} lexiconName - Le nom du lexique.
 * @param {Map} internalIdMap - Une Map contenant les internal_id associés aux lexiques.
 * @returns {HTMLElement|null} - Un bouton HTML ou null si `internal_id` est manquant.
 */
function createBaLexButton(lexiconName, internalIdMap) {
  const balexServ = "babalex.lezinter.net";  
  const internal_id = internalIdMap.get(lexiconName) || null;

  log(`ID BaLex trouvé pour "${lexiconName}" :`, internal_id);

  // Vérifie si `internal_id` est valide
  if (!internal_id) {
      console.warn(`Aucun internal_id trouvé pour "${lexiconName}". Bouton non créé.`);
      return null;
  }

  const balexUrl = `https://${balexServ}/entry/${internal_id}/show`;

  // Création du bouton
  const balexButton = document.createElement("img");
  balexButton.src = "../assets/icons/Link_to_balex.svg";
  balexButton.classList.add("balex-icon");
  balexButton.alt = "Icône BaLex";
  balexButton.style.cursor = "help";
  balexButton.style.width = "15px"; 
  balexButton.style.height = "15px";
  balexButton.style.marginLeft = "10px";

  // Ajout du lien
  balexButton.addEventListener("click", (event) => {
    // event.stopPropagation(); 
    window.open(balexUrl, "_blank");
  });

  return balexButton;
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Utilisation des fonctions dans d'autres scripts
// ─────────────────────────────────────────────────────────────────────────────

window.fetchLexiconDefinitions = fetchLexiconDefinitions;
window.fetchWiktionaryDefinition = fetchWiktionaryDefinition;
window.displayDefinitions = displayDefinitions;
window.openDefinitionPopup = openDefinitionPopup;
window.closeDefinitionPopup = closeDefinitionPopup;
window.combineDefinitions = combineDefinitions;
window.showDefinitions = showDefinitions;
window.fetchDefinition = fetchDefinition;
window.displayLexiconResults = displayLexiconResults;
