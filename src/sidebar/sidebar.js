// ─────────────────────────────────────────────────────────────────────────────
// ▌ Variables globales et logs
// ─────────────────────────────────────────────────────────────────────────────
log("sidebar.js chargé.");
let authToken = window.authToken; // Token d'authentification de l'utilisateur
window.authToken = authToken; // Stockage du token dans l'objet window
let isUpdatingLexicons = false; // Indicateur pour savoir si les lexiques sont en cours de mise à jour

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Fonctions liées à la connexion et à l'activation de l'analyse
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Récupère le token d'authentification depuis le stockage local.
 * @returns {Promise<string|null>} Le token d'authentification ou null si non trouvé.
 */
async function getAuthTokenFromStorage() {
  try {
    const { accessToken } = await browser.storage.local.get("accessToken");
    if (accessToken) {
      log(`Token récupéré depuis le stockage local : [${accessToken}]`);
      authToken = accessToken;
      window.authToken = accessToken; 
      return authToken;
    }
    log("️ Aucun token trouvé dans le stockage local.");
  } catch (error) {
    log("Erreur lors de la récupération du token :", error);
  }
  return null;
}

/**
 * Gère le clic sur le bouton d'authentification.
 * Envoie un message pour basculer l'état d'authentification et actualise l'interface.
 */
async function handleAuthButtonClick() {
  await browser.runtime.sendMessage({ action: "toggleAuth" });
  await refreshSidebarState();
  const messageContainer = document.getElementById("messageContainer");
  if (messageContainer) {
    messageContainer.style.display = "block";
    messageContainer.innerHTML = "Veuillez vous connecter pour utiliser l'extension.";
  }
}

/**
 * Vérifie l'état d'activation de l'extension.
 * @returns {Promise<boolean>} L'état d'activation de l'extension.
 */
async function checkAnalysisStatus() {
  const { extensionActive } = await browser.storage.local.get("extensionActive");
  return extensionActive; 
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Mise à jour de l'interface utilisateur (UI)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Met à jour le texte du bouton d'authentification en fonction de l'état de connexion.
 * @param {boolean} isLoggedIn - Indique si l'utilisateur est connecté.
 */
function updateAuthButton(isLoggedIn) {
  const authButton = document.getElementById("auth-button");
  if (authButton) {
    authButton.textContent = isLoggedIn ? "Se déconnecter" : "Se connecter";
    log("Bouton d'authentification mis à jour :", authButton.textContent);
  } else {
    console.warn("️ Bouton d'authentification (#auth-button) introuvable.");
  }
}

/**
 * Bascule la visibilité des éléments en fonction de l'état de connexion.
 * @param {boolean} isLoggedIn - Indique si l'utilisateur est connecté.
 */
function toggleElementsVisibility(isLoggedIn) {
  const elementsToShowOrHide = [
    { id: "add-to-lexiques", shouldShow: isLoggedIn },
    { id: "possible-definitions", shouldShow: isLoggedIn },
    { id: "mesLexiquesContainer", shouldShow: isLoggedIn },
  ];

  elementsToShowOrHide.forEach(({ id, shouldShow }) => {
    const element = document.getElementById(id);
    if (element) {
      element.style.display = shouldShow ? "block" : "none";
      log(`Élément #${id} ${shouldShow ? "affiché" : "masqué"}.`);
    } else {
      console.warn(`️ Élément #${id} introuvable.`);
    }
  });
}

/**
 * Affichage ou non le message de surlignage en fonction de l'état de connexion.
 * @param {boolean} isLoggedIn - Indique si l'utilisateur est connecté.
 */
function toggleHighlightMessage(isLoggedIn) {
  const highlightNote = document.getElementById("highlight-note");
  if (highlightNote) {
    highlightNote.style.display = isLoggedIn ? "block" : "none";
  }
}

/**
 * Met à jour l'état global de la barre latérale (bouton d'authentification, etc.)
 */
async function refreshSidebarState() {
  log("Début de l'actualisation de la barre latérale...");
  
  // Récupère le token d'authentification et détermine si l'utilisateur est connecté
  const token = await getAuthTokenFromStorage();
  const isLoggedIn = !!token;

  // Met à jour l'état du bouton d'authentification et la visibilité des éléments
  updateAuthButton(isLoggedIn);
  toggleElementsVisibility(isLoggedIn);
  toggleHighlightMessage(isLoggedIn);

  // Vérifie si l'analyse est activée
  const isAnalysisEnabled = await checkAnalysisStatus();

  if (isLoggedIn) {
    // Si l'utilisateur est connecté, gère l'affichage des blocs et récupère les lexiques
    hideBlocks(!isAnalysisEnabled);

    // Met à jour les couleurs des lexiques si ce n'est pas déjà fait
    if (!window.lexiconColorsUpdated) {
      await updateLexiconColors(authToken);
      window.lexiconColorsUpdated = true;
    }
    await fetchLexicons();
  } else {
    // Si l'utilisateur n'est pas connecté, masque les blocs et affiche un message
    hideBlocks(true); 

    const lexiquesContainer = document.getElementById("lexiques");
    if (lexiquesContainer) {
      lexiquesContainer.textContent = "Veuillez vous connecter pour voir vos lexiques.";
      lexiquesContainer.style.textAlign = "center";
      lexiquesContainer.style.fontStyle = "italic";
    }
    const lexiconResultElement = document.getElementById("lexiconResult");
    if (lexiconResultElement) {
      lexiconResultElement.innerHTML = "";
    }
  }

  // Affiche un message d'activation de l'analyse selon le statut de connexion
  const messageContainer = document.getElementById("messageContainer");
  if (!isLoggedIn) {
    if (messageContainer) {
      messageContainer.style.display = "block";
      messageContainer.innerHTML = "Veuillez vous connecter pour utiliser l'extension.";
    }
  } else if (!isAnalysisEnabled) {
    if (messageContainer) {
      messageContainer.style.display = "block";
      messageContainer.innerHTML = "L'analyse est <strong>désactivée</strong>.<br>Pour utiliser l'extension, cliquez sur le bouton <strong>Activer l'analyse</strong> dans le menu d'extension.";
    }
  } else {
    if (messageContainer) {
      messageContainer.style.display = "none"; 
    }
  }

  // Désactivation (ou activation) des boutons de surlignage selon l'état de l'analyse
  const highlightButtons = document.querySelectorAll('.lexique-highlight-toggle');
  highlightButtons.forEach(button => {
    if (!isLoggedIn || !isAnalysisEnabled) {
      button.disabled = true;
      button.style.pointerEvents = 'none';
      button.classList.remove('active'); // retire l'état actif si présent
      button.dataset.active = "false";
    } else {
      button.disabled = false;
      button.style.pointerEvents = 'auto';
    }
  });

  log("Barre latérale actualisée. Utilisateur connecté :", isLoggedIn);
}


// ─────────────────────────────────────────────────────────────────────────────
// ▌ Gestion des blocs (Affichage)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Bascule l'affichage d'un bloc.
 * @param {string} blockId - L'ID du conteneur à basculer.
 * @param {HTMLElement} btn - Le bouton qui déclenche la bascule, pour mettre à jour son texte.
 */
function toggleBlock(blockId, btn) {
  const block = document.getElementById(blockId);
  if (block) {
    if (block.classList.contains("hidden")) {
      block.classList.remove("hidden");
      if (btn) btn.textContent = "–";
    } else {
      block.classList.add("hidden");
      if (btn) btn.textContent = "+";
    }
  }
}

/**
 * Ouvre un bloc s'il est fermé et met à jour le bouton de bascule.
 * @param {string} blockId - L'ID du conteneur à ouvrir.
 * @param {HTMLElement} [btn] - (Optionnel) Le bouton de bascule à mettre à jour.
 */
function openBlock(blockId, btn) {
  const block = document.getElementById(blockId);
  if (block && block.classList.contains("hidden")) {
    block.classList.remove("hidden");
    
    if (btn) {
      btn.textContent = "–";
    } else {
      const header = block.previousElementSibling;
      if (header) {
        const toggleBtn = header.querySelector(".toggle-btn");
        if (toggleBtn) {
          toggleBtn.textContent = "–";
        }
      }
    }
  }
}

/**
 * Ferme un bloc s'il est ouvert et met à jour le bouton de bascule.
 * @param {string} blockId - L'ID du conteneur à fermer.
 * @param {HTMLElement} [btn] - (Optionnel) Le bouton de bascule à mettre à jour.
 */
function closeBlock(blockId, btn) {
  const block = document.getElementById(blockId);
  if (block && !block.classList.contains("hidden")) {
    block.classList.add("hidden");
    
    if (btn) {
      btn.textContent = "+";
    } else {
      const header = block.previousElementSibling;
      if (header) {
        const toggleBtn = header.querySelector(".toggle-btn");
        if (toggleBtn) {
          toggleBtn.textContent = "+";
        }
      }
    }
  }
}

/**
 * Masque ou affiche les blocs en fonction de l'état spécifié.
 * @param {boolean} shouldHide - Indique si les blocs doivent être masqués.
 */
function hideBlocks(shouldHide) {
  const blockIds = ["menu", "etat", "definitionContainer"];
  blockIds.forEach(blockId => {
    const block = document.getElementById(blockId);
    if (block) {
      if (shouldHide) {
        block.classList.add("hidden"); 
      } else {
        block.classList.remove("hidden");
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Gestion de l'affichage des lexiques et du surlignage
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Récupère les lexiques depuis l'API.
 */
async function fetchLexicons() {
  try {
    log("Début de la récupération des lexiques...");
    log("Token utilisé :", authToken);

    // Vérifie si le token d'authentification est disponible
    if (!authToken) {
      throw new Error("️ Aucun token disponible. Veuillez vous connecter.");
    }

    // Récupère les lexiques depuis l'API
    const lexicons = await getLexicons(authToken);
    log("Réponse brute de l'API :", lexicons);

    // Vérifie si la réponse est un tableau et s'il contient des lexiques
    if (!Array.isArray(lexicons) || lexicons.length === 0) {
      throw new Error("️ Aucun lexique trouvé.");
    }

    // Vide la carte des lexiques existants
    lexiconMap.clear();
    lexicons.forEach((lex) => {
      let lexiconName = "";
      // Crée le nom du lexique en fonction de sa catégorie
      if (lex.category === "User") {
        lexiconName = DEBUG 
          ? `Lexique personnel : ${lex.user?.pseudo || "Inconnu"} (${lex.id})`
          : `Lexique personnel : ${lex.user?.pseudo || "Inconnu"}`;
        if (lex.language) {
          lexiconName += ` [${lex.language}]`;
        }
      } else if (lex.category === "Group") {
        lexiconName = DEBUG 
          ? `Lexique de groupe : ${lex.group?.name || "Inconnu"} (${lex.id})`
          : `Lexique de groupe : ${lex.group?.name || "Inconnu"}`
      } else {
        lexiconName = DEBUG ? `Lexique : ${lex.id}` : "Lexique" ;
      }
      // Ajoute le lexique à la carte avec son ID comme clé
      lexiconMap.set(lex.id, lexiconName);
    });

    // Affiche les lexiques avec des checkboxes
    await displayLexiconsWithCheckbox(lexicons.map((lex) => ({
      lexiconName:
        lex.category === "User"
          ? DEBUG
            ? `Lexique personnel : ${lex.user?.pseudo || "Inconnu"} (${lex.id})${(lex.language) ? ` [${lex.language}]` : ""}`
            : `Lexique personnel : ${lex.user?.pseudo || "Inconnu"}${(lex.language) ? ` [${lex.language}]` : ""}`
          : DEBUG
            ? `Lexique de groupe : ${lex.group?.name || "Inconnu"} (${lex.id})${(lex.language) ? ` [${lex.language}]` : ""}`
            : `Lexique de groupe : ${lex.group?.name || "Inconnu"}${(lex.language) ? ` [${lex.language}]` : ""}`,
      lexiconId: lex.id,
      active: lex.active || false,
    })));
    

    // Restaure l'état des boutons de surlignage
    await restoreHighlightingState();
  } catch (error) {
    // Gère les erreurs lors du chargement des lexiques
    log("Erreur lors du chargement des lexiques :", error.message);
    const lexiquesContainer = document.getElementById("lexiques");
    if (lexiquesContainer) {
      lexiquesContainer.textContent = error.message || "Erreur lors du chargement des lexiques.";
    }
  }
}

/**
 * Affiche la liste des lexiques avec des checkboxes dans la barre latérale.
 * @param {Array} lexicons - Liste des lexiques à afficher.
 */
async function displayLexiconsWithCheckbox(lexicons) {
  const lexiquesContainer = document.getElementById("lexiques");
  if (!lexiquesContainer) {
    console.warn("Élément #lexiques introuvable.");
    return;
  }
  
  // Vide le conteneur avant d'afficher les nouveaux lexiques
  lexiquesContainer.innerHTML = "";
  
  if (lexicons.length === 0) {
    log("Aucun lexique à afficher.");
    lexiquesContainer.textContent = "Aucun lexique disponible.";
    return;
  }
  
  // Récupère l'état d'activation de l'analyse et le token d'authentification
  const { extensionActive, accessToken } = await browser.storage.local.get(["extensionActive", "accessToken"]);
  const isAnalysisEnabled = !!extensionActive;
  const isLoggedIn = !!accessToken;
  
  // Parcourt chaque lexique pour créer et afficher les éléments correspondants
  for (const { lexiconName, lexiconId } of lexicons) {
    // Si ce lexique est déjà affiché, on passe au suivant
    if (lexiquesContainer.querySelector(`div[data-lexicon-id="${lexiconId}"]`)) {
      continue; 
    }
    
    // Crée le conteneur principal pour le lexique
    const lexiqueDiv = document.createElement("div");
    lexiqueDiv.className = "lexique-item";
    lexiqueDiv.dataset.lexiconId = lexiconId;
    
    // Crée l'icône de couleur associée au lexique
    const color = await getColorForLexicon(lexiconId);
    const circleIcon = createColorCircle(color, 24);
    const iconDiv = document.createElement("div");
    iconDiv.className = "lexique-icon";
    iconDiv.appendChild(circleIcon);
    
    // Crée le label affichant le nom du lexique
    const labelSpan = document.createElement("span");
    labelSpan.className = "lexique-label";
    labelSpan.textContent = lexiconName;
    
    // Crée le conteneur de la checkbox avec tooltip
    const checkboxContainer = document.createElement("label");
    checkboxContainer.className = "tooltip-container lexique-checkbox-container";
    const addCheckbox = document.createElement("input");
    addCheckbox.type = "checkbox";
    addCheckbox.className = "lexique-checkbox";
    addCheckbox.dataset.lexiconId = lexiconId;
    const checkboxTooltip = document.createElement("span");
    checkboxTooltip.className = "tooltip";
    checkboxTooltip.textContent = "Ajouter le mot à ce lexique";
    checkboxContainer.appendChild(addCheckbox);
    checkboxContainer.appendChild(checkboxTooltip);
    
    // Crée le bouton de surlignage avec tooltip
    const highlightButton = document.createElement("button");
    highlightButton.className = "tooltip-container lexique-highlight-toggle";
    highlightButton.dataset.lexiconId = lexiconId;
    
    if (!isAnalysisEnabled || !isLoggedIn) {
      highlightButton.disabled = true;
      highlightButton.style.pointerEvents = "none";
      highlightButton.classList.remove("active");
      highlightButton.dataset.active = "false";
    } else {
      highlightButton.disabled = false;
      highlightButton.style.pointerEvents = "auto";
      highlightButton.classList.remove("active");
      highlightButton.dataset.active = "false";
    }
    
    const feutreIcon = document.createElement("img");
    feutreIcon.src = "../assets/icons/feutre.png";
    feutreIcon.alt = "Feutre";
    feutreIcon.className = "feutre-icon";
    
    const highlightTooltip = document.createElement("span");
    highlightTooltip.className = "tooltip";
    highlightTooltip.textContent = "Activer/Désactiver le surlignage des mots du lexique";
    
    // Gestion du clic sur le bouton de surlignage
    highlightButton.addEventListener("click", async () => {
      let currentState = highlightButton.dataset.active === "true";
      let newState = !currentState;
      try {
        await toggleLexiconHighlight(lexiconId, newState);
        highlightButton.dataset.active = newState ? "true" : "false";
        highlightButton.classList.toggle("active", newState);
        
        // Sauvegarde l'état dans le stockage local
        const activeLexicons = Array.from(document.querySelectorAll('.lexique-highlight-toggle[data-active="true"]'))
          .map(btn => parseInt(btn.dataset.lexiconId));
        await browser.storage.local.set({ activeLexicons });
      } catch (error) {
        log("Erreur lors du toggle de surlignage pour le lexique", lexiconId, ":", error);
      }
    });
    
    // Assemble les éléments et ajoute le lexique au conteneur
    highlightButton.appendChild(feutreIcon);
    highlightButton.appendChild(highlightTooltip);
    lexiqueDiv.appendChild(iconDiv);
    lexiqueDiv.appendChild(labelSpan);
    lexiqueDiv.appendChild(checkboxContainer);
    lexiqueDiv.appendChild(highlightButton);
    lexiquesContainer.appendChild(lexiqueDiv);
  }
  
  // Ajuste la position des tooltips après un court délai
  setTimeout(() => {
    const menu = document.getElementById("menu");
    if (!menu) return;
    const menuRect = menu.getBoundingClientRect();
    const containers = document.querySelectorAll('.tooltip-container');
    
    containers.forEach(container => {
      const tooltip = container.querySelector('.tooltip');
      if (!tooltip) return;
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translateX(-50%) translateY(-5px)';
      
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.left < menuRect.left) {
        const overflowLeft = menuRect.left - tooltipRect.left;
        tooltip.style.transform = `translateX(calc(-100% + ${overflowLeft}px)) translateY(-5px)`;
      } else if (tooltipRect.right > menuRect.right) {
        const overflowRight = tooltipRect.right - menuRect.right;
        tooltip.style.transform = `translateX(calc(-100% - ${overflowRight}px)) translateY(-5px)`;
      }
    });
  }, 100);
}




/**
 * Met à jour l'affichage des lexiques.
 */
async function updateLexiconsDisplay() {
  const token = await getAuthTokenFromStorage(); 
  if (!token) {
    console.warn("️ Aucun token d'authentification disponible.");
    return;
  }

  const lexicons = await getLexicons(token);
  await displayLexiconsWithCheckbox(lexicons);
}

/**
 * Restaure l'état des boutons de surlignage au chargement.
 */
async function restoreHighlightingState() {
  try {
    const { activeLexicons } = await browser.storage.local.get("activeLexicons");
    if (activeLexicons && Array.isArray(activeLexicons)) {
      const buttons = document.querySelectorAll('.lexique-highlight-toggle');
      buttons.forEach(button => {
        const lexiconId = parseInt(button.dataset.lexiconId);
        const isActive = activeLexicons.includes(lexiconId);
        button.dataset.active = isActive ? "true" : "false";
        button.classList.toggle("active", isActive);
      });
    }
  } catch (error) {
    log("Erreur lors de la restauration de l'état des boutons:", error);
  }
}

/**
 * Initialise la boîte modale pour l'affichage des définitions.
 */
function initModal() {
  log("initModal appelé");
  const modalOverlay = document.getElementById("modalOverlay");
  const modalFullText = document.getElementById("modalFullText");
  const closeModalBtn = document.getElementById("closeModalBtn");

  log("closeModalBtn =", closeModalBtn);

  if (!modalOverlay || !modalFullText || !closeModalBtn) {
    log("Les éléments modaux ne sont pas trouvés !");
    return;
  }

  closeModalBtn.addEventListener("click", () => {
    log("clic sur closeModalBtn !");
    closeDefinitionPopup();
  });
  modalOverlay.addEventListener("click", (event) => {
    if (event.target === modalOverlay) closeDefinitionPopup();
  });
}
document.addEventListener("DOMContentLoaded", initModal);

/**
 * Bascule l'état de surlignage d'un lexique.
 * @param {number} lexiconId - L'ID du lexique à basculer.
 * @param {boolean} isActive - Indique si le surlignage doit être activé ou désactivé.
 */
async function toggleLexiconHighlight(lexiconId, isActive) {
  try {
    const button = document.querySelector(`button[data-lexicon-id="${lexiconId}"]`);
    if (button) {
      button.dataset.active = isActive.toString();
      button.classList.toggle('active', isActive);
    }

    await browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      browser.tabs.sendMessage(tabs[0].id, {
        command: isActive ? "activate-highlighting" : "deactivate-highlighting",
        lexiconId: lexiconId
      });
    });

    log(`Surlignage ${isActive ? 'activé' : 'désactivé'} pour le lexique ${lexiconId}`);
  } catch (error) {
    log(`Erreur lors du toggle du surlignage pour le lexique ${lexiconId}:`, error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Ajout d'un mot au(x) lexique(s)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Gère le clic sur le bouton d'ajout de mot.
 * Vérifie le token et le mot sélectionné, puis ajoute le mot aux lexiques sélectionnés.
 */
async function handleAddWordClick() {
  openBlock("menuContent");
  
  // 1) Vérifier la présence du token et du mot
  if (!authToken) {
    console.warn("️Pas de token d'authentification : impossible d'ajouter le mot.");
    return;
  }

  const selectedWordElement = document.getElementById("motSelectionne");
  const lexiconResultElement = document.getElementById("lexiconResult");

  // Vérifie si l'élément contenant le mot sélectionné existe
  if (!selectedWordElement) {
    console.warn("️Élément #motSelectionne introuvable.");
    return;
  }
  
  // Récupère le mot sélectionné et le "nettoie"
  const selectedWord = selectedWordElement.textContent.trim();
  if (!selectedWord || selectedWord === "Aucun mot sélectionné") {
    console.warn("️Aucun mot à ajouter.");
    if (lexiconResultElement) lexiconResultElement.textContent = "Aucun mot à ajouter.";
    return;
  }

  // 2) Récupérer les IDs des lexiques sélectionnés
  const checkboxList = document.querySelectorAll("#lexiques .lexique-checkbox:checked");
  const selectedLexiconIds = Array.from(checkboxList).map(cb => parseInt(cb.dataset.lexiconId, 10));

  // Vérifie si au moins un lexique a été sélectionné
  if (selectedLexiconIds.length === 0) {
    console.warn("️Aucun lexique sélectionné.");
    if (lexiconResultElement) lexiconResultElement.textContent = "Veuillez cocher au moins un lexique.";
    return;
  }

  // 3) Vérifier si le mot existe déjà dans l'un des lexiques sélectionnés
  let definitions = [];
  try {
    definitions = await fetchLexiconDefinitions(selectedWord);
  } catch (error) {
    log("Erreur lors de la récupération des définitions pour vérification :", error);
  }

  const existingLexiconIds = new Set();
  // Vérifie si le mot existe déjà dans les lexiques sélectionnés
  if (Array.isArray(definitions)) {
    for (const def of definitions) {
      if (selectedLexiconIds.includes(def.lexiconId)) {
        existingLexiconIds.add(def.lexiconId);
      }
    }
  }

  // 4) Déterminer les lexiques où ajouter le mot 
  const lexiconsToAdd = selectedLexiconIds.filter(id => !existingLexiconIds.has(id));

  // Si le mot existe déjà dans certains lexiques, on affiche le message
  if (existingLexiconIds.size > 0) {
    const existingLexiconsNames = Array.from(existingLexiconIds)
      .map(id => lexiconMap.get(id) || id)
      .join(", ");
    if (lexiconResultElement) {
      lexiconResultElement.innerHTML =
        "Le mot <strong>" + selectedWord + "</strong> existe déjà dans le(s) lexique(s) : " +
        "<strong>" + existingLexiconsNames + "</strong>.";
    }
  }

  // Si aucun lexique n'est disponible pour ajouter le mot, on sort de la fonction
  if (lexiconsToAdd.length === 0) {
    return; 
  }

  // Construction du message de succès avec les noms des lexiques où le mot va être ajouté
  const lexiconsNames = lexiconsToAdd
    .map(id => lexiconMap.get(id) || id)
    .join(", ");

  // 5) Envoi d'une seule requête pour tous les lexiques restants
  try {
    log(`Envoi de l'ajout du mot "${selectedWord}" dans les lexiques :`, lexiconsToAdd);
    const result = await window.AddWord(authToken, selectedWord, lexiconsToAdd, false);
    
    log("Réponse API :", result);

    // Rafraîchir l'UI et la liste des entrées
    await new Promise(resolve => setTimeout(resolve, 300));
    browser.runtime.sendMessage({ action: "refreshUI" });

    // 6) Affichage du message de succès
    if (lexiconResultElement) {
      lexiconResultElement.innerHTML +=
        "<br>✅ Mot <strong>" + selectedWord + "</strong> ajouté avec succès dans : " +
        lexiconsNames + ".";
    }

  } catch (error) {
    log("Erreur lors de l'ajout du mot :", error);
    if (lexiconResultElement) {
      lexiconResultElement.textContent = "Erreur lors de l'ajout : " + error.message;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Réception des messages
// ─────────────────────────────────────────────────────────────────────────────
let refreshTimeout = null;
browser.runtime.onMessage.addListener(async (message) => {
  log("Message reçu dans sidebar.js :", message);
  
  // Vérifie si le message contient une action
  if (message.action)
    switch (message.action) {
      case "refreshUI":
        if (refreshTimeout) {
          clearTimeout(refreshTimeout);
        }
        refreshTimeout = setTimeout(async () => {
          await refreshSidebarState();
          refreshTimeout = null;
        }, 500);
        break;

      case "closeAllBlocks":
        closeBlock("menuContent");
        closeBlock("etatContent");
        closeBlock("definitionContent");
        break;

      case "mot_selectionne":
        // Gère le mot sélectionné
        if (message.selectedText) {
          log("️ Mot sélectionné :", message.selectedText);
          const selectedWordElement = document.getElementById("motSelectionne");
          if (selectedWordElement) {
            selectedWordElement.textContent = message.selectedText;
          } else {
            console.warn("️ Élément #motSelectionne introuvable.");
          }
          const lexiconResultElement = document.getElementById("lexiconResult");
          if (lexiconResultElement) {
            lexiconResultElement.innerHTML = "";
          }
          openBlock("etatContent");
        }
        break;

      case "getDefinition":
        // Recherche des définitions pour le mot sélectionné
        if (message.selectedText) {
          log("Recherche des définitions pour :", message.selectedText);
          openBlock("definitionContent");
          await window.showDefinitions(message.selectedText);
        }
        break;

      case "showDefinitions":
        // Affiche les définitions reçues
        if (Array.isArray(message.definitions)) {
          window.displayDefinitions(message.definitions);
        }
        break;

      case "fetchWiktionaryDefinitionResponse":
        // Gère la réponse de définition du Wiktionnaire
        if (message.selectedText) {
          log(`Réception de la définition du Wiktionnaire pour '${message.selectedText}'`);
          window.displayDefinitions(message.definitions);
        }
        break;

      case "showLexiconResult":
        // Affiche le résultat des lexiques reçus
        log("Résultat des lexiques reçus :", message.lexicons);
        window.displayLexiconResults(message.lexicons);
        break;
      
      case "addWordResult":
        // Met à jour le résultat de l'ajout de mot
        const lexiconResultElement = document.getElementById("lexiconResult");
        if (lexiconResultElement) {
          lexiconResultElement.innerHTML = message.lexicons;
        }
        break;

      case "addToLexicon":
        // Gère l'ajout d'un mot au lexique
        handleAddWordClick();
        break;
      
      case "openLexiconBlock":
        // Ouvre le bloc des lexiques
        openBlock("menuContent");
        break;
        
      case "toggleAuth":
        break;

      case "authStatusChanged":
        break;

      case "updateUI":
        // Met à jour l'interface utilisateur en fonction de l'état de l'extension
        if (!message.extensionActive) {
          hideBlocks(true);
        } else {
          hideBlocks(false);
          await refreshSidebarState();
        }
        break;

      case "pyodide-simplemma-ready":
        return;

      case "saveToken":
        // Sauvegarde le token d'authentification
        authToken = message.token;
        break;

      case "closeSidebarBlocks":
        // Masque les blocs de la barre latérale
        hideBlocks(true);
        break;
    }
  

  // Vérifie si le message contient une commande
  if (message.command) {
    switch (message.command) {
      case "activate-highlighting":
        // Active le surlignage pour le lexique spécifié
        const highlightButton = document.querySelector(`button[data-lexicon-id="${message.lexiconId}"]`);
        if (highlightButton) {
          highlightButton.dataset.active = "true";
          highlightButton.classList.add("active");
        }
        break;
        
      case "deactivate-highlighting":
        // Désactive le surlignage pour le lexique spécifié
        const highlightButtonOff = document.querySelector(`button[data-lexicon-id="${message.lexiconId}"]`);
        if (highlightButtonOff) {
          highlightButtonOff.dataset.active = "false";
          highlightButtonOff.classList.remove("active");
        }
        break;

      case "register-stats-script":
        break;

      case "register-highlighting-script":
        // Enregistre le script de surlignage et met à jour le token d'authentification
        log("Script de surlignage enregistré");
        browser.runtime.sendMessage({ 
          command: "updateAuthToken", 
          token: authToken 
        });
        break;

      case "updateAuthToken":
        // Met à jour le token d'authentification
        authToken = message.token;
        window.authToken = message.token;
        break;

      default:
        // Gère les actions inconnues
        console.warn("️ Action inconnue reçue :", message.command);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ▌ DOMContentLoaded
// ─────────────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  log("DOM entièrement chargé. Initialisation de la sidebar.");
  
  // Récupère le token d'authentification et l'assigne à l'objet window
  authToken = await getAuthTokenFromStorage();
  window.authToken = authToken;
  
  // Actualise l'état de la barre latérale
  await refreshSidebarState();

  // Gère le clic sur le bouton d'authentification
  const authButton = document.getElementById("auth-button");
  if (authButton) {
    authButton.addEventListener("click", handleAuthButtonClick);
  }

  // Gère le clic sur le bouton de recherche de définition
  const chercherDefButton = document.querySelector("#chercherDef");
  if (chercherDefButton) {
    chercherDefButton.addEventListener("click", async () => {
      openBlock("definitionContent");
      const selectedWord = document.getElementById("motSelectionne")?.textContent?.trim();
      if (selectedWord && selectedWord !== "Aucun mot sélectionné") {
        log(`Recherche des définitions pour '${selectedWord}'`);
        await window.showDefinitions(selectedWord);
      } else {
        console.warn("️Aucun mot sélectionné pour la recherche.");
      }
    });
    log("Bouton #chercherDef détecté dans le DOM.");
    chercherDefButton.style.pointerEvents = "auto";
    chercherDefButton.style.display = "block";
    chercherDefButton.style.visibility = "visible";
    chercherDefButton.disabled = false;
  } else {
    log("ERREUR : Bouton #chercherDef introuvable.");
  }

  // Écouteur pour la case à cocher "toggle-definitions"
  const toggleCheckbox = document.getElementById("toggle-definitions");
  if (toggleCheckbox) {
    toggleCheckbox.addEventListener("change", (event) => {
      const showAll = event.target.checked;
      const lexiconContents = document.querySelectorAll("#mesLexiquesList .lexicon-content");
      lexiconContents.forEach(content => {
        if (showAll) {
          content.classList.remove("hidden");
        } else {
          content.classList.add("hidden");
        }
      });
    });
  }

  // Gère le clic sur le bouton "Ajouter le mot sélectionné"
  const addWordButton = document.getElementById("add-word-button");
  if (addWordButton) {
    addWordButton.addEventListener("click", handleAddWordClick);
  } else {
    console.warn("️ Bouton #add-word-button introuvable dans le DOM.");
  }

  // Gère les boutons de bascule pour afficher/masquer les blocs
  const toggleButtons = document.querySelectorAll(".toggle-btn");
  toggleButtons.forEach((btn) => {
    if (!btn.textContent.trim()) {
      btn.textContent = "-";
      btn.style.fontSize = "15px";
    }
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const header = btn.parentElement;
      const content = header.nextElementSibling;
      if (content) {
        content.classList.toggle("hidden");
        btn.textContent = content.classList.contains("hidden") ? "+" : "–";
      }
    });

    // Masque tous les blocs au chargement
    document.querySelectorAll('.block-content').forEach(block => {
      block.classList.add('hidden');
    });
  
    // Réinitialise les boutons de bascule
    document.querySelectorAll('.toggle-btn').forEach(btn => {
      btn.textContent = '+';
      btn.style.fontSize = '15px';
  
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const header = btn.parentElement;
        const content = header.nextElementSibling;
        if (content) {
          content.classList.toggle('hidden');
          btn.textContent = content.classList.contains('hidden') ? '+' : '–';
        }
      });
    });
  });
});

// Gère les clics sur les boutons de bascule
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const blockContent = this.parentElement.nextElementSibling;
    if (blockContent.classList.contains('hidden')) {
      blockContent.classList.remove('hidden');
      this.textContent = '–'; 
    } else {
      blockContent.classList.add('hidden');
      this.textContent = '+';
    }
  });
});


