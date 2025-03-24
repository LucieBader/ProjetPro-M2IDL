/**
 * Récupère les couleurs des lexiques de l'utilisateur.
 * Chaque lexique est censé posséder une propriété "rGB" contenant la couleur, par exemple "65, 148, 84".
 *
 * @param {string} authToken - Le token d'authentification.
 * @returns {Promise<Object>} - Un objet associant l'ID du lexique à sa couleur.
 */
async function getLexiconsColors(authToken) {
  const url = "https://babalex.lezinter.net/api/lexicon/search";

  try {
    const lexicons = await callApi(url, authToken);
    const colors = {};
    lexicons.forEach(lexicon => {
      colors[lexicon.id] = lexicon.rGB; // Associe l'ID du lexique à sa couleur rGB
    });
    
    log("Couleurs des lexiques récupérées :", colors);
    return colors; // Retourne l'objet contenant les couleurs des lexiques
  } catch (error) {
    log("Erreur lors de la récupération des couleurs des lexiques :", error);
    return {};
  }
}

/**
 * Convertit une chaîne de caractères "rGB" (ex: "65, 148, 84") en couleur hexadécimale.
 * @param {string} rgbString - La chaîne "rGB".
 * @returns {string} La couleur au format hexadécimal.
 */
function convertColor(rgbString) {
  const parts = rgbString.split(',').map(part => parseInt(part.trim(), 10));
  return "#" + parts.map(n => n.toString(16).padStart(2, '0')).join(''); // Convertit en hexadécimal
}

/**
 * Obtient (ou crée) la couleur associée à un lexique donné en utilisant browser.storage.local.
 * @param {string|number} lexiconId - L'identifiant du lexique.
 * @returns {Promise<string>} La couleur associée au lexique.
 */
async function getOrCreateLexiconColor(lexiconId) {
  // Récupère la correspondance stockée dans storage
  let { lexiconColors } = await browser.storage.local.get("lexiconColors");
  if (!lexiconColors || forceReset) {
    lexiconColors = {}; // Initialise un nouvel objet si aucune couleur n'est trouvée
  }
  if (window.authToken) {
    try {
      const apiColors = await window.getLexiconsColors(window.authToken);
      // Pour chaque lexique récupéré depuis l'API, on convertit la couleur rGB en hexadécimal
      for (const id in apiColors) {
        if (Object.prototype.hasOwnProperty.call(apiColors, id)) {
          lexiconColors[id] = convertColor(apiColors[id]); // Stocke la couleur convertie
        }
      }
    } catch (error) {
    log("Erreur lors de la récupération des couleurs via l'API :", error);
    }
  }
  return lexiconColors[String(lexiconId)]; // Retourne la couleur associée au lexique
}

/**
 * Crée un élément HTML (div) stylisé en cercle de la couleur donnée.
 * @param {string} color - Couleur au format "#RRGGBB".
 * @param {number} [size=32] - Taille (largeur et hauteur) en pixels.
 * @returns {HTMLElement} Le div stylisé en cercle.
 */
function createColorCircle(color, size = 32) {
  const circle = document.createElement("div");
  circle.className = "color-circle";
  circle.style.width = `${size}px`;
  circle.style.height = `${size}px`;
  circle.style.borderRadius = "50%";
  circle.style.backgroundColor = color;
  circle.style.border = "1px solid black";
  return circle;
}

/**
 * Récupère et met à jour les couleurs des lexiques dans le stockage local.
 * @param {string} authToken - Le token d'authentification.
 * @returns {Promise<Object>} La map des couleurs associant chaque ID de lexique à sa couleur hexadécimale.
 */
async function updateLexiconColors(authToken) {
  try {
    const apiColors = await getLexiconsColors(authToken);
    const colorMapping = {};
    for (const id in apiColors) {
      if (Object.prototype.hasOwnProperty.call(apiColors, id)) {
        colorMapping[id] = convertColor(apiColors[id]); // Convertit et stocke la couleur
      }
    }
    log("Mise à jour des couleurs des lexiques :", colorMapping);
    await browser.storage.local.set({ lexiconColors: colorMapping }); // Met à jour le stockage local
    return colorMapping; // Retourne la map des couleurs
  } catch (error) {
    log("Erreur lors de la mise à jour des couleurs :", error);
    return {};
  }
}

/**
 * Récupère la couleur associée à un lexique depuis le stockage local.
 * @param {string|number} lexiconId - L'identifiant du lexique.
 * @returns {Promise<string>} La couleur en hexadécimal ou une couleur par défaut.
 */
async function getColorForLexicon(lexiconId) {
  const { lexiconColors } = await browser.storage.local.get("lexiconColors");
  return (lexiconColors && lexiconColors[String(lexiconId)]) || "#cccccc";
}

/**
 * Convertit une couleur hexadécimale en une couleur RGBA.
 * @param {string} hex - La couleur en hexadécimal.
 * @param {number} opacity - La transparence (0-1).
 * @returns {string} La couleur RGBA.
 */
function hexToRgba(hex, opacity) {
  const bigint = parseInt(hex.replace('#', ''), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// Expose les fonctions globalement
window.updateLexiconColors = updateLexiconColors;
window.getColorForLexicon = getColorForLexicon;
window.convertColor = convertColor;
window.getOrCreateLexiconColor = getOrCreateLexiconColor;
window.createColorCircle = createColorCircle;
window.getLexiconsColors = getLexiconsColors;
window.hexToRgba = hexToRgba;
