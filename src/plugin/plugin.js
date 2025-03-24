log("plugin.js chargé.");

/**
 * Récupère le token d'accès depuis le stockage local.
 * @returns {Promise<string>} Le token d'accès.
 */
async function getAccessToken() {
  const { accessToken } = await browser.storage.local.get("accessToken");
  return accessToken;
}

/**
 * Actualise l'extension en fonction des valeurs du local storage
 */
async function updateExtension() {
  states = await fetchExtensionState();  
  updateUI(states); 
}

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
 * Récupère les valeurs du local storage
 * @returns {Promise<Object>} - Un objet contenant les valeurs
 */
async function fetchExtensionState() {
  const accessToken = await getAccessToken();
  const storedValues = await browser.storage.local.get([
      "extensionActive",
      "isTrackingActive",
      "autoAdd",
      "threshold",
      "pyodideSimplemmaReady",
      "includeStopwords"
  ]);
  return {
      isLoggedIn: !!accessToken,
      extensionActive: storedValues.extensionActive ?? false,
      isTrackingActive: storedValues.isTrackingActive ?? false,
      autoAdd: storedValues.autoAdd ?? false,
      threshold: storedValues.threshold ?? 10,
      pyodideSimplemmaReady: storedValues.pyodideSimplemmaReady ?? false,
      includeStopwords: storedValues.includeStopwords ?? false 
  };
}

/**
 * Met à jour l'interface utilisateur en fonction des états
 * @param {Object} states - Les états de l'extension
 */
async function updateUI(states) {
  await updateConnectionButton(states.isLoggedIn); //Actualisation du bouton de connexion
  await updateToggleExtensionButton(states.isLoggedIn, states.extensionActive, states.autoAdd, states.isTrackingActive,  states.pyodideSimplemmaReady,  states.includeStopwords);
  await updateLanguageSelection();
  await updateStopwordsOption(states.includeStopwords);
  document.getElementById("threshold").value = states.threshold;
  log("Interface mise à jour :", states);
}

/**
 * Configure les écouteurs d'évènements
 */
function setupEventListeners() {
  // Bouton Connexion / Déconnexion
  document.getElementById("auth-button")?.addEventListener("click", handleAuthToggle);

  // Bouton activer l'extension
  document.getElementById("toggleExtensionBtn")?.addEventListener("click", handleToggleExtension);

  // Bouton de gestion des statistiques
  document.getElementById("toggleStatsBtn")?.addEventListener("click", handleStatsToggle);

  // Gestion de l'ajout automatique
  document.getElementById("auto-add")?.addEventListener("change", handleAutoAddToggle);
  
  //Activation/désactivation des stopwords
  document.getElementById("include-stopwords")?.addEventListener("change", handleStopwordsToggle);
  
  // Sauvegarde des options
  document.getElementById("save-options")?.addEventListener("click", handleSaveOptions);

  // Ouverture de la page des statistiques via le bouton "Afficher les statistiques"
  document.getElementById("open-stats")?.addEventListener("click", () => {
    openStatsPage();
  });
  
  // Ouverture de la page des statistiques via le bouton "Désactiver les statistiques"
  document.getElementById("toggleStatsBtn")?.addEventListener("click", async () => {
    const { isTrackingActive } = await browser.storage.local.get({ isTrackingActive: false });
    if (isTrackingActive) {
      openStatsPage().catch(err =>
        console.error("Erreur lors de l'ouverture de stats.html :", err)
      );
    }
  });
}

/**
 * Ouverture de la fenêtre de stats
 */
function openStatsPage() {
  return new Promise((resolve, reject) => {
    try {
      const newWindow = window.open("stats.html");
      if (!newWindow) {
        reject(new Error("L'ouverture de stats.html a échoué (pop-up peut-être bloquée)"));
      } else {
        log("Ouverture de la page de statistiques");
        resolve(newWindow);
      }
    } catch (err) {
      reject(err);
    }
  });
}


/**
 * Gestion de la connexion / déconnexion
 */
async function handleAuthToggle() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    log("Connexion demandée...");
    await browser.runtime.sendMessage({ action: "toggleAuth" });
  } else {
    log("Déconnexion demandée...");
    await browser.storage.local.set({
      accessToken: null,
      autoAdd: false,
      includeStopwords: false,
      isTrackingActive: false
    });
    browser.runtime.sendMessage({
      command: "update-preferences",
      autoAdd: false,
      includeStopwords: false,
      isTrackingActive: false
    });
    log("Paramètres réinitialisés après déconnexion.");

    notifyAllTabs({ command: "deactivate-highlighting" });
    log("Message envoyé pour désactiver le surlignage");
  }
  await updateExtension();
}

/**
 * Gestion du bouton des statistiques
 */
async function handleStatsToggle() {
  const accessToken = await getAccessToken();
  if (!accessToken) return;
  // Récupérer l'état actuel des statistiques
  const { isTrackingActive } = await browser.storage.local.get({ isTrackingActive: false });
  const newState = !isTrackingActive;
  // Mise à jour uniquement de `isTrackingActive`
  await browser.storage.local.set({ isTrackingActive: newState });
  log("Nouvel état des statistiques :", newState);
  // Envoi du message de mise à jour
  browser.runtime.sendMessage({ command: "toggle-stats", isActive: newState });
  // Exécution de Pyodide si nécessaire
  if (newState) {
    browser.runtime.sendMessage({ command: "pyodide-simplemma" });
    // Si on active le suivi, ouvrir la page des statistiques
  } else {
    // Désactivation : envoyer le message de désactivation à l'onglet actif
    notifyAllTabs({ command: "deactivate-stats" });
  }
}

/**
 * Gestion du bouton d'activation de l'extension
 */
async function handleToggleExtension() {
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  const { extensionActive, isTrackingActive } = await browser.storage.local.get({ extensionActive: false, isTrackingActive: false });
  const newState = !extensionActive;

  await browser.storage.local.set({ extensionActive: newState });

  if (!newState) {
    await browser.storage.local.set({ isTrackingActive: false });
    // if (isTrackingActive) window.open("stats.html", "_blank"); //Si on désactive l'analyse, on ouvre la page de stats
    notifyAllTabs({ command: "deactivate-highlighting" });
    log("Message envoyé pour désactiver le surlignage");
    browser.runtime.sendMessage({ action: "closeSidebarBlocks" });
  }

  browser.runtime.sendMessage({ action: "toggleExtension", isActive: newState });
  await updateExtension();
  
  browser.runtime.sendMessage({ action: "closeAllBlocks" });
}


/**
 * Gestion du bouton d'ajout automatique
 */
async function handleAutoAddToggle() {
  const autoAddCheckbox = document.getElementById("auto-add");
  const autoAddOptions = document.getElementById("auto-add-options");
  const saveOptionsBtn = document.getElementById("save-options");

  if (!autoAddCheckbox || !autoAddOptions || !saveOptionsBtn) return;

  const isAutoAddEnabled = autoAddCheckbox.checked;

  // Vérifier si Pyodide et Simplemma sont prêts
  const { pyodideSimplemmaReady } = await browser.storage.local.get("pyodideSimplemmaReady");
    
  if (isAutoAddEnabled && !pyodideSimplemmaReady) {
    log("L'ajout automatique nécessite Pyodide et Simplemma : Chargement en cours...");
    browser.runtime.sendMessage({ command: "pyodide-simplemma" });
  }

  // Juste afficher ou cacher les options, mais ne pas sauvegarder dans le local storage
  autoAddOptions.classList.toggle("hidden", !isAutoAddEnabled);
  saveOptionsBtn.classList.toggle("hidden", !isAutoAddEnabled);

  // Si on décoche, désactiver immédiatement et forcer la sauvegarde
  if (!isAutoAddEnabled) {
    browser.storage.local.set({ autoAdd: false, includeStopwords: false });
    document.getElementById("include-stopwords").checked = false;
    log("Ajout automatique désactivé → Stopwords désactivés immédiatement.");
  }
}

/**
 * Gestion de l'activation/désactivation des stopwords
 */
function handleStopwordsToggle() {
  const stopwordsCheckbox = document.getElementById("include-stopwords");
  if (!stopwordsCheckbox) return;

  // Si décoché, forcer immédiatement la mise à jour du local storage
  if (!stopwordsCheckbox.checked) {
    browser.storage.local.set({ includeStopwords: false });
    log("Stopwords désactivés immédiatement.");
  }
}


/**
 * Sauvegarde des options utilisateur
 */
async function handleSaveOptions() {
  const autoAddCheckbox = document.getElementById("auto-add");
  const stopwordsCheckbox = document.getElementById("include-stopwords");
  const threshold = parseInt(document.getElementById("threshold").value, 10);
  const selectedLanguages = Array.from(document.querySelectorAll("#language-selection .lang-option.selected"))
    .map(option => option.dataset.value);

  const errorMessage = document.getElementById("error-message");

  if (autoAddCheckbox.checked && selectedLanguages.length === 0) {
    errorMessage?.classList.remove("hidden");
    return;
  }
  errorMessage?.classList.add("hidden");

  // Seule la validation met à jour le stockage local
  await browser.storage.local.set({
    autoAdd: autoAddCheckbox.checked,
    includeStopwords: stopwordsCheckbox.checked,
    threshold,
    trackedLanguages: selectedLanguages
  });

  browser.runtime.sendMessage({
    command: "update-preferences",
    autoAdd: autoAddCheckbox.checked,
    includeStopwords: stopwordsCheckbox.checked
  });

  if (autoAddCheckbox.checked) {
    const { isTrackingActive } = await browser.storage.local.get("isTrackingActive");
    if (!isTrackingActive) {
      log("Activation automatique des statistiques après validation.");
      await browser.storage.local.set({ isTrackingActive: true });
      browser.runtime.sendMessage({ command: "toggle-stats", isActive: true });
    }
  }

  await updateExtension();
  log("Options sauvegardées.");

}


/**
 * Met à jour le bouton de connexion
 */
async function updateConnectionButton() {
  const accessToken = await getAccessToken();
  const button = document.getElementById("auth-button");
  if (!button) {
    console.error("Le bouton de connexion n'a pas été trouvé.");
    return;
  }
  if (accessToken) {
    button.textContent = "Se déconnecter";
    button.style.position = "relative";
    button.className = "tooltip-container";
    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.textContent = "En vous déconnectant, vous perdrez l'accès à vos lexiques personnels, ainsi qu'aux fonctionnalités d'ajout automatique et de statistiques d'utilisation.";
    button.appendChild(tooltip);
  } else {
    button.textContent = "Se connecter";
    button.style.position = "relative";
    button.className = "tooltip-container";
    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.textContent = "En vous connectant, vous pourrez accéder à vos lexiques personnels, ainsi qu'aux fonctionnalités d'ajout automatique et de statistiques d'utilisation.";
    button.appendChild(tooltip);
  }

  // Gestion du clic sur le bouton
  button.onclick = async () => {
    await browser.runtime.sendMessage({ action: "toggleAuth" }); // Envoi d'un message pour changer l'état d'authentification
    await updateConnectionButton(); // Mise à jour du bouton après le changement d'état
  };
}

/**
 * Met à jour la sélection des langues.
 */
async function updateLanguageSelection() {
  const languageSelection = document.getElementById("language-selection");
  languageSelection.innerHTML = "<p id='loading-languages' style='color: gray;'>Chargement...</p>";

  const storedData = await browser.storage.local.get("lexicons");
  const lexicons = storedData.lexicons || []; // Ne pas utiliser JSON.parse()

  if (!Array.isArray(lexicons) || lexicons.length === 0) {
    log("Lexiques non trouvés, attente de la mise à jour...");
    languageSelection.innerHTML = "<p style='color: gray;'>En attente des lexiques...</p>";

    // Écouteur pour détecter quand les lexiques sont stockés
    const listener = (changes, area) => {
      if (area === "local" && changes.lexicons) {
        log("Lexiques détectés dans le stockage, mise à jour de la sélection !");
        browser.storage.onChanged.removeListener(listener);
        updateLanguageSelection(); // Recharger l'affichage des langues
      }
    };
    browser.storage.onChanged.addListener(listener);
    return;
  }

  // Extraire les langues uniques
  const userLanguages = [...new Set(lexicons.map(lex => lex.language))];

  // Récupérer les langues suivies depuis le stockage
  const { trackedLanguages } = (await browser.storage.local.get("trackedLanguages")) || { trackedLanguages: [] };

  // Affichage des langues sous forme de boutons
  languageSelection.innerHTML = "";
  userLanguages.forEach(lang => {
    const langButton = document.createElement("div");
    langButton.classList.add("lang-option");
    langButton.textContent = lang.toUpperCase();
    langButton.dataset.value = lang;
    // Vérification si la langue est suivie
    if (trackedLanguages && trackedLanguages.includes(lang)) {
      langButton.classList.add("selected");
    }
    // Gestion du clic sur le bouton de langue
    langButton.addEventListener("click", () => {
      langButton.classList.toggle("selected");
    });
    languageSelection.appendChild(langButton);
  });

  log("Sélection des langues mise à jour avec :", userLanguages);
}

/**
 * Met à jour le bouton d'activation de l'extension
 */
async function updateToggleExtensionButton(isLoggedIn, extensionActive, autoAdd, isTrackingActive, pyodideSimplemmaReady, includeStopwords) {
  const toggleExtensionBtn = document.getElementById("toggleExtensionBtn");

  if (toggleExtensionBtn) {
    toggleExtensionBtn.textContent = extensionActive ? "Désactiver l'analyse" : "Activer l'analyse";
    toggleExtensionBtn.style.pointerEvents = isLoggedIn ? "auto" : "none";
    toggleExtensionBtn.disabled = !isLoggedIn;
    toggleExtensionBtn.style.position = "relative";
    toggleExtensionBtn.className = "tooltip-container";

    const existingTooltipExt = toggleExtensionBtn.querySelector('.tooltip');
    if (existingTooltipExt) {
      existingTooltipExt.remove();
    }
    const tooltipExt = document.createElement("span");
    tooltipExt.className = "tooltip";
    tooltipExt.style.opacity = "1 !important";
    if (!isLoggedIn) {
      tooltipExt.textContent = "Connectez-vous pour activer l'analyse";
      tooltipExt.style.display = "block";
    } else if (!extensionActive) {
      tooltipExt.textContent = "Activer les fonctionnalités de l'extension : affichage des mots et des définitions de vos lexiques, ajout de mots, etc.";
      tooltipExt.style.display = "block";
    } else {
      tooltipExt.style.display = "none";
    }
    toggleExtensionBtn.appendChild(tooltipExt);
  }

  // Mise à jour des options de statistiques
  const statsOptions = document.getElementById("stats-options");
  const toggleStatsBtn = document.getElementById("toggleStatsBtn");
  const openStats = document.getElementById("open-stats");
  if (statsOptions) {
    statsOptions.style.display = (isLoggedIn && extensionActive) ? "block" : "none";
  }

  // Mise à jour du bouton des statistiques
  if (toggleStatsBtn) {
    const isEnabled = isLoggedIn && extensionActive;
    toggleStatsBtn.textContent = isEnabled && isTrackingActive ? "Désactiver les statistiques" : "Activer les statistiques";
    toggleStatsBtn.style.pointerEvents = isEnabled ? "auto" : "none";
    toggleStatsBtn.disabled = !isEnabled;
    toggleStatsBtn.style.position = "relative";
    toggleStatsBtn.className = "tooltip-container";
    const existingTooltipStats = toggleStatsBtn.querySelector('.tooltip');
    if (existingTooltipStats) { existingTooltipStats.remove(); }
    const tooltipStats = document.createElement("span");
    tooltipStats.className = "tooltip";
    tooltipStats.style.opacity = "1 !important";
    if (!isLoggedIn) {
      tooltipStats.textContent = "Connectez-vous pour accéder aux statistiques";
      tooltipStats.style.display = "block";
    } else if (!extensionActive) {
      tooltipStats.textContent = "Veuillez activer l'analyse pour utiliser les statistiques";
      tooltipStats.style.display = "block";
    } else {
      tooltipStats.style.display = "none";
    }
    toggleStatsBtn.appendChild(tooltipStats);
  }
  if (openStats) {
    openStats.style.display = (isLoggedIn && extensionActive && isTrackingActive) ? "block" : "none";
  }

  // Mise à jour des options d'ajout automatique
  const autoAddContainer = document.getElementById("auto-add")?.parentElement;
  const autoAddCheckbox = document.getElementById("auto-add");
  const autoAddOptions = document.getElementById("auto-add-options");
  const saveOptionsBtn = document.getElementById("save-options");

  // Affichage ou masquage du conteneur d'ajout automatique
  if (autoAddContainer) {
    autoAddContainer.style.display = (isLoggedIn && extensionActive) ? "block" : "none";
  }

  // Mise à jour de l'état de la case à cocher d'ajout automatique
  if (autoAddCheckbox && isLoggedIn) {
    autoAddCheckbox.checked = autoAdd;
  }

  // Affichage ou masquage des options d'ajout automatique
  if (autoAddOptions) {
    autoAddOptions.classList.toggle("hidden", !autoAdd);
  }

  // Affichage ou masquage du bouton de sauvegarde des options
  if (saveOptionsBtn) {
    saveOptionsBtn.classList.toggle("hidden", !autoAdd);
  }

  // Mise à jour du message de chargement Pyodide
  const statusContainer = document.getElementById('pyodide-loading');
  if (statusContainer) {
    if (!isLoggedIn) {
      statusContainer.innerHTML = "";
    } else if (!pyodideSimplemmaReady && extensionActive && isTrackingActive) {
      statusContainer.innerHTML = "<p style='color: black; text-align: center; font-size: 11px;'>Chargement de l'extension en cours, veuillez patienter...</p>";
    } else if (pyodideSimplemmaReady && extensionActive && isTrackingActive) {
      statusContainer.innerHTML = "<p style='color: black; text-align: center; font-size: 11px;'>C'est prêt !</p>";
      setTimeout(() => {
        statusContainer.innerHTML = "";
      }, 2000);
    } else {
      statusContainer.innerHTML = "";
    }
  }

  // Mise à jour de la sélection des langues
  await updateLanguageSelection();

  log("Interface mise à jour complètement", {
    isLoggedIn,
    extensionActive,
    isTrackingActive,
    autoAdd,
    pyodideSimplemmaReady,
    includeStopwords
  });
}

/**
 * Met à jour l'option des stopwords
 */
async function updateStopwordsOption(includeStopwords) {
  const stopwordsCheckbox = document.getElementById("include-stopwords");
  if (stopwordsCheckbox) {
    stopwordsCheckbox.checked = includeStopwords;
  }
}

/**
 * Mise à jour de l'extension au chargement de la page
 */
document.addEventListener("DOMContentLoaded", async () => {
  await updateExtension(); // Mise à jour de l'extension selon les valeurs du local storage
  setupEventListeners(); // Configuration des écouteurs d'événements
});

/**
 * Gère les messages reçus du worker.
 */
browser.runtime.onMessage.addListener(async (message) => {
  log("Message reçu dans popup.js :", message);
  if (message.action === "updateUI") {
    await updateExtension();
  } else if (message.action === "notify") {
    alert(message.message);
  }
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    updateExtension();
  }
});

/**
 * Affiche une notification.
 */
function showNotification(message) {
  const notificationBox = document.getElementById("extension-notification");
  const notificationText = document.getElementById("notification-text");
  const closeButton = document.getElementById("close-notification");

  if (notificationBox && notificationText && closeButton) {
    notificationText.textContent = message;
    notificationBox.classList.remove("hidden");
    closeButton.addEventListener("click", () => {
      notificationBox.classList.add("hidden");
    }, { once: true });
  } else {
    log("Impossible d'afficher la notification : élément manquant.");
  }
}

/**
 * Gère les messages reçus du worker.
 */
function handleWorkerMessage(event) {
  const data = event.data;
  log("[Background] Message du WebWorker :", data);
  
  if (data.type === "process-text" && data.status === "error") {
    browser.runtime.sendMessage({
      action: "notify",
      message: data.message
    });
    return;
  }}

/**
 * Ajoute le tooltip à l'option de langues
 */
document.addEventListener("DOMContentLoaded", () => {
  const optionRows = document.querySelectorAll('.option-row label');
  optionRows.forEach(label => {
    if (label.textContent.trim() === "Langues suivies") {
      label.classList.add("tooltip-container");

      const tooltip = document.createElement("span");
      tooltip.className = "tooltip tooltip-langues-suivies";
      tooltip.textContent = "Choisissez une ou plusieurs langues parmi celles de vos lexiques personnels";
      label.appendChild(tooltip);
    }
  });
});
  

