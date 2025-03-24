(function () {
    if (window.hasRunStats) {
        return;
    }
    window.hasRunStats = true;
    let workerPort = null; // Port unique vers le WebWorker
    // ─────────────────────────────────────────────────────────────────────────────
    // Connexion/Transmission des données avec le WebWorker
    // ─────────────────────────────────────────────────────────────────────────────
    /**
     * Connexion au port
     */
    function connectToWorker() {
        if (!workerPort) {
            log("[Stats] Connexion au WebWorker...");
            workerPort = browser.runtime.connect({ name: "stats-worker-port" });
            workerPort.onMessage.addListener((message) => {
                log("[Stats] Message reçu du Worker :", message);
                if (message.command === "update-frequencies") {
                    log("[Stats] Fréquences mises à jour :", message.frequencies);
                }
                if (message.command === "threshold-exceeded") {
                    log("[Stats] Mots dépassant le seuil tentative d'ajout :", message.wordsAboveThreshold);
                
                    if (typeof message.wordsAboveThreshold !== "object" || message.wordsAboveThreshold === null) {
                        return;
                    }
                    let notificationText = "Dépassement du seuil, tentative d'ajout :\n";
                    let wordsList = [];
                    for (const [lang, words] of Object.entries(message.wordsAboveThreshold)) {
                        if (!Array.isArray(words) || words.length === 0) continue;
                
                        words.forEach(word => {
                            wordsList.push(`${lang.toUpperCase()} : ${word}`);
                        });
                    }
                    if (wordsList.length === 0) {
                        log("[Stats] Aucun mot à afficher dans la notification.");
                        return;
                    }
                    notificationText += wordsList.join("\n");
                
                    // Afficher une notification
                    if (Notification.permission === "granted") {
                        new Notification("Ajout automatique", {
                            body: notificationText,
                            icon: browser.runtime.getURL("icons/border-48.png")
                        });
                    } else if (Notification.permission !== "denied") {
                        Notification.requestPermission().then(permission => {
                            if (permission === "granted") {
                                new Notification("Ajout automatique", { body: notificationText });
                            }
                        });
                    }
                }
            });
            workerPort.onDisconnect.addListener(() => {
                log("[Stats] Déconnexion du WebWorker.");
                workerPort = null;
            });
        }
    }
    /**
     * Envoi du texte directement au Worker
     * @param {string} text - Le texte à envoyer.
     */
    function sendTextToWorker(text) {
        if (!workerPort) {
            connectToWorker();
        }
        if (workerPort) {
            log("[Stats] Envoi du texte au Worker :", text);
            workerPort.postMessage({ command: "process-text", text: text });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Gestion des messages envoyés depuis le background 
    // ─────────────────────────────────────────────────────────────────────────────
    browser.runtime.onMessage.addListener((message) => {
        log("[Stats] Message reçu :", message);
        if (message.command === "activate-stats") {
            startTracking();
        }
        if (message.command === "deactivate-stats") {
            stopTracking();
        }
    });

    //Enregistrement manuel auprès du background pour écouter activate-stats
    browser.runtime.sendMessage({ command: "register-stats-script" });

    // ─────────────────────────────────────────────────────────────────────────────
    // Extraction du texte sur les pages
    // ─────────────────────────────────────────────────────────────────────────────
    let scrollListenerAttached = false;
    const READING_SPEED_MS_PER_WORD = 250; // Seuil de lecture 
    // Stockage des chronos et des éléments lus
    const readingTimers = new Map();
    const readContent = new Set();
    let userIsActive = false;  // Indique si l'utilisateur est actif sur la page

    // Détecte l'activité utilisateur pour éviter les fausses lectures
    document.addEventListener("mousemove", () => userIsActive = true);
    document.addEventListener("keydown", () => userIsActive = true);
    setInterval(() => userIsActive = false, 60000); // Reset toutes les minutes

    // Arrête tous les chronomètres lorsque l'utilisateur change d'onglet
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            // log("[Stats] Changement d'onglet détecté");
            resetAllTimers();
        } else {
            // Vérifie si les statistiques sont désactivées et retire la bordure si nécessaire
            if (!window.hasRunStats) {
                removeViewportBorder();
            }
        }
    });

    /**
     * Fonction pour extraire le texte visible
     */
    function trackVisibleContent() {
        let selectors = "p, h1, h2, h3, h4, h5, h6, ul, ol, li, table, tr, td, th, blockquote, span, b";

        // Sélecteurs spécifiques à exclure sur Wikipedia et d'autres sites
        let excludeSelectors = [
            "#p-lang", "#footer", ".navbox", ".infobox", ".sidebar", "script", "style", ".interlanguage-link"
        ];


        document.querySelectorAll(selectors).forEach((element) => {
            if (excludeSelectors.some(sel => element.closest(sel))) {
                return; // Ignore les éléments exclus
            }
    
            const rect = element.getBoundingClientRect();
            const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
            let text = cleanText(element.innerText);
            let wordCount = text.split(/\s+/).length;
            let minReadTime = wordCount * READING_SPEED_MS_PER_WORD;
    
            if (text.length < 3) return; // Ignore les petits éléments
    
            if (isVisible) {
                if (!readContent.has(text)) {
                    startReadingTimer(element, text, minReadTime);
                }
            } else {
                stopReadingTimer(element, text);
            }
        });
    }
    
    
    /**
     * Démarre un chronomètre pour vérifier si l'élément est lu
     */
    function startReadingTimer(element, text, minReadTime) {
        if (!readingTimers.has(element)) {
            let elapsedTime = 0;
            let counter = null;

          // Créer l'indicateur uniquement si on est en mode debug
          if (DEBUG) {
            counter = document.createElement("div");
            counter.classList.add("reading-counter");
            counter.style.position = "absolute";
            counter.style.background = "black";
            counter.style.color = "white";
            counter.style.padding = "4px 6px";
            counter.style.borderRadius = "5px";
            counter.style.fontSize = "12px";
            counter.style.zIndex = "9999";
            document.body.appendChild(counter);
          }

          let interval = setInterval(() => {
                elapsedTime += 1000;
    
                // Vérifie si l'utilisateur est actif et si le temps minimum est atteint
                if (userIsActive && elapsedTime >= minReadTime) {
                    log(`[Stats] Élément lu : ${text}`);
                    readContent.add(text);
                    sendTextToWorker(text);
                    stopReadingTimer(element, text);
                }
    
            // Mise à jour de la position et du contenu du compteur si en debug
            if (DEBUG && counter) {
                let rect = element.getBoundingClientRect();
                counter.style.top = `${rect.top + window.scrollY - 20}px`;
                counter.style.left = `${rect.left + window.scrollX + rect.width + 10}px`;
                counter.innerText = `⏳ ${Math.floor(elapsedTime / 1000)}s`;
              }
            }, 1000);
        
            readingTimers.set(element, { interval, counter, elapsedTime });
          }
        }

    
    /**
     * Arrête le chronomètre et supprime l'affichage du temps de lecture
     */
    function stopReadingTimer(element, text) {
        if (readingTimers.has(element)) {
            let { interval, counter } = readingTimers.get(element);
            clearInterval(interval);
            if (counter) {
            counter.remove();
        }
            readingTimers.delete(element);
        }
    }
    /**
     * Réinitialise tous les chronomètres lors du changement d'onglet
     */
    function resetAllTimers() {
        for (let [element, { interval, counter }] of readingTimers) {
            clearInterval(interval);
            if (counter) {
                counter.remove();
            }
        }
        readingTimers.clear();
    }

    /**
     * Supprime l'indicateur de lecture
     */
    function removeReadingIndicator(element) {
        if (readingTimers.has(element)) {
            let { counter } = readingTimers.get(element);            
            if (counter) {
                counter.remove();
            }
        }
    }
    /**
     * Fonction pour prétraiter le texte 
     */
    function cleanText(text) {
        text = text.replace(/[\u2022\u00b7•·■◆▪▸▹▶►▻⇨]/g, " ");  // Supprime puces et flèches
        text = text.replace(/[\t\n\r]+/g, " "); // Supprime les sauts de ligne inutiles
        text = text.replace(/\s{2,}/g, " "); // Remplace plusieurs espaces par un seul
        text = text.replace(/(\||\t)+/g, " "); // Remplace les séparateurs de tableau par un espace
        text = text.replace(/(\s*-+\s*)+/g, " "); // Supprime les lignes de séparation des tableaux
        text = text.trim();
        return text;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Gestion de l'activation/désactivation des statistiques
    // ─────────────────────────────────────────────────────────────────────────────
    /**
     * Démarre le suivi des statistiques
     */
    function startTracking() {
            log("[Stats] Suivi des statistiques activé.");
            addViewportBorder();
            attachScrollListener();
    }

    /**
     * Désactive le suivi des statistiques
     */
    function stopTracking() {
        log("[Stats] Suivi des statistiques désactivé.");
        removeViewportBorder();
        detachScrollListener();
    }

    /**
     * Attache l'écouteur de défilement
     */
    function attachScrollListener() {
        if (!scrollListenerAttached) {
            window.addEventListener("scroll", trackVisibleContent);
            scrollListenerAttached = true;
            log("[Stats] Écouteur de défilement attaché.");
        }
    }

    /**
     * Détache l'écouteur de défilement
     */
    function detachScrollListener() {
        if (scrollListenerAttached) {
            window.removeEventListener("scroll", trackVisibleContent);
            scrollListenerAttached = false;
            log("[Stats] Écouteur de défilement détaché.");
        }
    }

    /**
     * Injecte la bordure
     */
    function injectBorder() {
        const css = `
        #border-svg {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            pointer-events: none;
            z-index: 999999;
        }
        @keyframes dashAnimation {
            from {
            stroke-dashoffset: 400;
            }
            to {
            stroke-dashoffset: 0;
            }
        }
        `;
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
    
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("id", "border-svg");
        svg.setAttribute("viewBox", "0 0 100 100");
        svg.setAttribute("preserveAspectRatio", "none");

        const defs = document.createElementNS(svgNS, "defs");
        const linearGradient = document.createElementNS(svgNS, "linearGradient");
        linearGradient.setAttribute("id", "border-gradient");
        linearGradient.setAttribute("x1", "0%");
        linearGradient.setAttribute("y1", "0%");
        linearGradient.setAttribute("x2", "100%");
        linearGradient.setAttribute("y2", "0%");
        const stop1 = document.createElementNS(svgNS, "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", "#DDD6F3");
        const stop2 = document.createElementNS(svgNS, "stop");
        stop2.setAttribute("offset", "50%");
        stop2.setAttribute("stop-color", "#784BA0");
        const stop3 = document.createElementNS(svgNS, "stop");
        stop3.setAttribute("offset", "100%");
        stop3.setAttribute("stop-color", "#2B86C5");
        
        linearGradient.appendChild(stop1);
        linearGradient.appendChild(stop2);
        linearGradient.appendChild(stop3);
        defs.appendChild(linearGradient);
        svg.appendChild(defs);

        const rect = document.createElementNS(svgNS, "rect");
        rect.setAttribute("x", "0.5");
        rect.setAttribute("y", "0.5");
        rect.setAttribute("width", "98");
        rect.setAttribute("height", "98");
        rect.setAttribute("fill", "none");
        rect.setAttribute("stroke", "url(#border-gradient)");
        rect.setAttribute("stroke-width", "0.5");
        rect.setAttribute("stroke-dasharray", "200 200");
        rect.setAttribute("stroke-dashoffset", "400");
        rect.style.animation = "dashAnimation 20s ease-in-out infinite";
    
        svg.appendChild(rect);
        document.body.appendChild(svg);
    }
    
    /**
     * Ajoute la bordure
     */
    function addViewportBorder() {
        if (window.hasRunStats) {
            if (!document.getElementById("border-svg")) {
                injectBorder();
            }
        }
    }
    /**
     * Retire la bordure
     */
    function removeViewportBorder() {
        const svg = document.getElementById("border-svg");
        if (svg) {
        svg.remove();
        }
    }
})();
