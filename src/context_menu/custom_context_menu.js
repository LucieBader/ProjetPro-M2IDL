// ─────────────────────────────────────────────────────────────────────────────
// ▌ Variables globales et logs
// ─────────────────────────────────────────────────────────────────────────────
log("custom_context_menu.js chargé.");
const CUSTOM_CONTEXT_MENU = "customContextMenu";

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Fonctions utilitaires
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Envoie une notification via le background.
 * @param {string} title - Le titre de la notification.
 * @param {string} message - Le message de la notification.
 * @param {string} iconPath - Le chemin de l'icône de la notification.
 */
function sendNotification(title, message, iconPath) {
  browser.runtime.sendMessage({
    action: "showNotification",
    title,
    message,
    iconPath
  });
}

/**
 * Récupère le token depuis le stockage local et le stocke dans authToken.
 */
async function loadAuthToken() {
  try {
    const result = await browser.storage.local.get("accessToken");
    authToken = result.accessToken || null;
    log("Token chargé :", authToken);
  } catch (error) {
    log("Erreur lors de la récupération du token :", error);
    authToken = null;
  }
}

/**
 * Récupère le texte affiché dans #selectedWord.
 * @returns {string} - Le mot sélectionné ou une chaîne vide.
 */
function getSelectedWord() {
  const selectedWordElement = document.getElementById("selectedWord");
  return selectedWordElement ? selectedWordElement.textContent.trim() : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Fonctions liées au menu contextuel
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Crée le menu contextuel personnalisé (customContextMenu) s'il n'existe pas déjà.
 * @returns {HTMLElement} - Le menu contextuel créé ou récupéré.
 */
function injectCustomContextMenu() {
  // Récupère le menu contextuel existant par son ID
  let customContextMenu = document.getElementById(CUSTOM_CONTEXT_MENU);
  
  // Si le menu n'existe pas, on le crée
  if (!customContextMenu) {
    customContextMenu = document.createElement("div");
    customContextMenu.id = CUSTOM_CONTEXT_MENU;
    customContextMenu.style.position = "absolute";
    customContextMenu.style.zIndex = "9999";
    customContextMenu.style.backgroundColor = "#fff";
    customContextMenu.style.border = "1px solid #ccc";
    customContextMenu.style.padding = "5px";
    customContextMenu.style.borderRadius = "4px";
    customContextMenu.style.boxShadow = "0px 2px 10px rgba(0,0,0,0.2)";
    const addLexiconPath = browser.runtime.getURL("src/assets/icons/ajout_lexique.png");
    const getDefinitionPath = browser.runtime.getURL("src/assets/icons/definition.png");
    const loginPath = browser.runtime.getURL("src/assets/icons/connexion.png");

    // Construction du HTML du menu contextuel
    customContextMenu.innerHTML = `
      <p id="selectedWord" style="margin: 0; padding: 0;">Mot sélectionné : Aucun</p>
      <hr style="border: 0; height: 1px; background-color: #323046; margin: 8px 0;">
      <div style="display: flex; flex-wrap: wrap; justify-content: center;">
        <!-- Bouton : Ajouter au lexique -->
        <div class="icon-container" title="Ajouter ce mot à un lexique">
          <img src="${addLexiconPath}" alt="Ajouter au lexique" class="icon" id="addLexiconButton">
        </div>
        <!-- Bouton : Obtenir une définition -->
        <div class="icon-container" title="Obtenir la définition">
          <img src="${getDefinitionPath}" alt="Obtenir la définition" class="icon" id="getDefinitionButton">
        </div>
        <!-- Bouton : Connexion -->
        <div class="icon-container" title="Connectez-vous à BaLex">
          <img src="${loginPath}" alt="Se connecter" class="icon" id="loginButton" style="display: none;">
        </div>
      </div>
    `;
    
    // Ajoute le menu contextuel au corps du document
    document.body.appendChild(customContextMenu);
    
    // Configure les actions des boutons du menu contextuel
    setupCustomContextMenuActions();
  }
  customContextMenu.addEventListener("mouseup", (e) => {
    e.stopPropagation();
  });
  
  return customContextMenu;
}

/**
 * Renvoie le customContextMenu s'il existe, ou le crée.
 * @returns {HTMLElement} - Le menu contextuel.
 */
function getOrCreateCustomContextMenu() {
  return document.getElementById(CUSTOM_CONTEXT_MENU) || injectCustomContextMenu();
}

/**
 * Configure les actions des boutons du menu contextuel.
 */
function setupCustomContextMenuActions() {
  const addLexiconBtn = document.getElementById("addLexiconButton");
  const getDefinitionBtn = document.getElementById("getDefinitionButton");
  const loginBtn = document.getElementById("loginButton");

  // Tooltips
  if (loginBtn) {
    loginBtn.title = "En vous connectant, vous pourrez accéder à vos lexiques personnels ainsi qu'aux fonctionnalités d'ajout automatique et de statistiques d'utilisation.";
  }
  // Bouton : Ajouter le mot au lexique
  addLexiconBtn.onclick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    const selectedText = getSelectedWord().trim();
    log("Bouton Ajouter au lexique cliqué avec le mot :", selectedText);
    if (!selectedText) return;
    if (authToken) {
      browser.runtime.sendMessage({ action: "openLexiconBlock" });
      showPicker(e, selectedText);
    } else {
      alert("Vous devez être connecté pour ajouter un mot.");
    }
  };

  // Bouton : Obtenir une définition
  getDefinitionBtn.onclick = () => {
    const selectedText = getSelectedWord().trim();
    if (selectedText) {
      browser.runtime.sendMessage({
        action: "getDefinition",
        selectedText
      });
    }
  };

  // Bouton : Connexion
  loginBtn.onclick = () => {
    browser.runtime.sendMessage({ action: "toggleAuth" });
  };
}

/**
 * Met à jour la visibilité des boutons du menu selon l'authentification.
 */
function updateMenuVisibility() {
  getOrCreateCustomContextMenu();
  const addLexiconBtn = document.getElementById("addLexiconButton");
  const getDefinitionBtn = document.getElementById("getDefinitionButton");
  const loginBtn = document.getElementById("loginButton");

  if (!addLexiconBtn || !getDefinitionBtn || !loginBtn) {
    console.warn("️ Un des boutons n'a pas été trouvé dans le DOM.");
    return;
  }

  if (authToken) {
    addLexiconBtn.style.display = "inline-block";
    getDefinitionBtn.style.display = "inline-block";
    loginBtn.style.display = "none";
  } else {
    hideCustomContextMenu();
    addLexiconBtn.style.display = "none";
    getDefinitionBtn.style.display = "inline-block";
    loginBtn.style.display = "inline-block";
  }
}

/**
 * Affiche le menu contextuel à la position du clic.
 * @param {MouseEvent} event - L'événement de clic.
 * @param {string} selectedText - Le texte sélectionné.
 */
async function showCustomContextMenu(event, selectedText) {
  const { extensionActive } = await browser.storage.local.get("extensionActive") || { extensionActive: false };
  if (!extensionActive || !authToken) {
    hideCustomContextMenu();
    return;
  }
  const customContextMenu = getOrCreateCustomContextMenu();
  const selectedWordElement = document.getElementById("selectedWord");
  selectedWordElement.textContent = selectedText;

  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const top = rect.bottom + window.scrollY;
  const left = rect.right + window.scrollX;

  customContextMenu.style.left = left + "px";
  customContextMenu.style.top = top + "px";
  customContextMenu.style.display = "block";

  log("Affichage du menu contextuel avec le mot :", selectedText);
  updateMenuVisibility();
}

/**
 * Masque le menu contextuel personnalisé.
 */
function hideCustomContextMenu() {
  const customContextMenu = document.getElementById(CUSTOM_CONTEXT_MENU);
  if (customContextMenu) {
    customContextMenu.style.display = "none";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions pour l'ajout d'un mot via le sélecteur
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Affiche le sélecteur pour choisir le lexique dans lequel ajouter le mot.
 * @param {MouseEvent} event - L'événement de clic.
 * @param {string} selectedText - Le texte sélectionné.
 */
async function showPicker(event, selectedText) {
  // Récupère le sélecteur de lexique existant par son ID
  let picker = document.getElementById("lexiconPicker");
  
  // Si le sélecteur n'existe pas, on le crée
  if (!picker) {
    picker = document.createElement("div");
    picker.id = "lexiconPicker";
    picker.addEventListener("mouseup", (e) => e.stopPropagation());
    document.body.appendChild(picker);
  }
  
  picker.innerHTML = ""; 
  const selectedLexicons = new Set(); // Ensemble pour stocker les lexiques sélectionnés

  try {
    // Récupère les lexiques disponibles en utilisant le token d'authentification
    const lexicons = await getLexicons(authToken);
    log("Lexicons récupérés :", lexicons);

    const lexiconDescriptions = {}; // Objet pour stocker les descriptions des lexiques

    // Vérifie si des lexiques ont été récupérés
    if (!Array.isArray(lexicons) || lexicons.length === 0) {
      picker.innerHTML = "<p style='color:#333;'>Aucun lexique trouvé.</p>";
    } else {
      // Parcourt chaque lexique récupéré
      for (const lex of lexicons) {
        const id = lex.id; // Récupère l'ID du lexique
        let name = ""; // Initialise le nom du lexique
        // Définit le nom en fonction de la catégorie du lexique
        if (lex.category === "User") {
          name = DEBUG
            ? `Lexique personnel : ${lex.user?.pseudo || "Inconnu"} (${lex.id})`
            : `Lexique personnel : ${lex.user?.pseudo || "Inconnu"}`;
        } else {
          name = DEBUG
            ? `Lexique de groupe : ${lex.group?.name || "Inconnu"} (${lex.id})`
            : `Lexique de groupe : ${lex.group?.name || "Inconnu"}`;
        }
        if (lex.language) {
          name += ` [${lex.language}]`; // Ajoute la langue si disponible
        }
        lexiconDescriptions[id] = name; // Stocke la description du lexique
        const color = await getColorForLexicon(id); // Récupère la couleur du lexique
        const circleIcon = await createColorCircle(color, 28); 
        
        // Crée un conteneur pour l'icône du lexique
        const iconContainer = document.createElement("div");
        iconContainer.className = "lexicon-option";
        iconContainer.dataset.lexiconId = id;
        iconContainer.title = name;

        iconContainer.addEventListener("click", () => {
          if (selectedLexicons.has(id)) {
            selectedLexicons.delete(id); 
            iconContainer.classList.remove("selected"); 
          } else {
            selectedLexicons.add(id); 
            iconContainer.classList.add("selected"); 
          }
        });
        iconContainer.appendChild(circleIcon); 
        picker.appendChild(iconContainer); 
      }

      // Crée le bouton de confirmation pour ajouter le mot
      const confirmButton = document.createElement("button");
      confirmButton.className = "confirmButton";
      confirmButton.textContent = "Ajouter le mot";
      confirmButton.addEventListener("click", async () => {
        if (selectedLexicons.size === 0) {
          alert("Veuillez sélectionner au moins un lexique.");
          return;
        }
        log(`Vérification si le mot "${selectedText}" existe déjà dans les lexiques sélectionnés...`);
        let definitions = [];
        try {
          definitions = await fetchLexiconDefinitions(selectedText); 
        } catch (error) {
          log("Erreur lors de la récupération des définitions :", error);
        }
        const existingLexiconIds = new Set(); 
        if (Array.isArray(definitions)) {
          for (const def of definitions) {
            if (selectedLexicons.has(def.lexiconId)) {
              existingLexiconIds.add(def.lexiconId); 
            }
          }
        }
        // Alerte si le mot existe déjà dans les lexiques sélectionnés
        if (existingLexiconIds.size > 0) {
          alert(`Le mot "${selectedText}" existe déjà dans les lexiques suivants : ${Array.from(existingLexiconIds).map(id => lexiconDescriptions[id]).join(", ")}`);
        }
        const lexiconsToAdd = [...selectedLexicons].filter(id => !existingLexiconIds.has(id)); // Filtre les lexiques à ajouter
        if (lexiconsToAdd.length === 0) {
          return; 
        }
        try {
          log(`Ajout du mot "${selectedText}" dans les lexiques :`, lexiconsToAdd);
          const result = await AddWord(authToken, selectedText, lexiconsToAdd, false); 
          log("Réponse API :", result);
          await new Promise(resolve => setTimeout(resolve, 300));
          browser.runtime.sendMessage({ action: "refreshUI" }); // Rafraîchit l'interface utilisateur
          const successMsg = `✅ Mot ajouté avec succès dans : ${lexiconsToAdd.map(id => lexiconDescriptions[id]).join(", ")}`; // Message de succès
          picker.innerHTML = `<p style="color: green;">${successMsg}</p>`;
          setTimeout(() => picker.style.display = "none", 2000);
          browser.runtime.sendMessage({
            action: "addWordResult",
            lexicons: successMsg
          });
        } catch (error) {
          log("Erreur lors de l'ajout du mot :", error);
          const errorMsg = `Erreur lors de l'ajout du mot : ${error.message}`;
          picker.innerHTML = `<p style="color: red;">${errorMsg}</p>`;
          setTimeout(() => picker.style.display = "none", 3000);
          browser.runtime.sendMessage({
            action: "addWordResult",
            lexicons: errorMsg
          });
        }
      });
      picker.appendChild(confirmButton); // Ajoute le bouton de confirmation au sélecteur
    }

    // Calcule et définit la largeur et la position du sélecteur
    const lexiconCount = Array.isArray(lexicons) ? lexicons.length : 0; 
    const baseWidthPerLexicon = 40;
    const extraPadding = 20; 
    const calculatedWidth = lexiconCount * baseWidthPerLexicon + extraPadding; 
    picker.style.width = calculatedWidth + "px"; 
    picker.style.left = event.pageX + "px";
    picker.style.top = event.pageY + "px";
    picker.style.display = "flex";
  } catch (error) {
    log("Erreur lors de la récupération des lexiques :", error);
    picker.innerHTML = "<p style='color:#333;'>Erreur lors du chargement des lexiques.</p>";
    picker.style.display = "block";
  }
}

/**
 * Masque le sélecteur de lexique.
 */
function hideLexiconPicker() {
  const picker = document.getElementById("lexiconPicker");
  if (picker) {
    picker.style.display = "none";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ▌ Écouteurs d'événements
// ─────────────────────────────────────────────────────────────────────────────
// Écouteur global pour la sélection de texte et la gestion des clics
document.addEventListener("mouseup", (event) => {
  const customContextMenu = document.getElementById(CUSTOM_CONTEXT_MENU); // Récupère le menu contextuel
  const picker = document.getElementById("lexiconPicker"); // Récupère le sélecteur de lexique

  // Vérifie si le clic est à l'intérieur du menu contextuel, si oui, ne fait rien
  if (event.target.closest("#customContextMenu")) return;

  // Masque le menu contextuel si le clic est en dehors de celui-ci
  if (customContextMenu && !customContextMenu.contains(event.target)) {
    hideCustomContextMenu();
  }
  // Masque le sélecteur si le clic est en dehors de celui-ci
  if (picker && !picker.contains(event.target)) {
    hideLexiconPicker();
  }

  // Récupère le texte sélectionné
  const selectedText = window.getSelection().toString().trim();
  if (selectedText) {
    log("Texte sélectionné :", selectedText); // Log le texte sélectionné
    getOrCreateCustomContextMenu(); // Récupère ou crée le menu contextuel
    showCustomContextMenu(event, selectedText); // Affiche le menu contextuel avec le texte sélectionné
    // Envoie un message au runtime avec le texte sélectionné
    browser.runtime.sendMessage({
      action: "mot_selectionne",
      selectedText,
    });
  } else {
    hideCustomContextMenu();
  }
});

// Écoute des messages entrants
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "refreshUI") {
    log("Mise à jour du menu contextuel personnalisé.");
    loadAuthToken().then(updateMenuVisibility);
  }
});

// Initialisation au démarrage
loadAuthToken().then(() => {
  getOrCreateCustomContextMenu(); // Récupère ou crée le menu contextuel
  updateMenuVisibility(); // Met à jour la visibilité des boutons
});

// Écoute des changements dans le stockage
browser.storage.onChanged.addListener((changes) => {
  // Vérifie si le token d'accès a changé
  if (changes.accessToken) {
    log("Token modifié dans le stockage, mise à jour du menu contextuel.");
    loadAuthToken().then(updateMenuVisibility); // Recharge le token et met à jour la visibilité
  }
});