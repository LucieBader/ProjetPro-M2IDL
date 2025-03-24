document.addEventListener("DOMContentLoaded", async () => {
  /**
   * Met à jour le résumé des statistiques
   * @returns {Promise<Object>} - Un objet contenant les statistiques
   */
  async function updateStatsSummary() {
    // log("[Stats Page] Mise à jour du résumé des statistiques...");
    
    const { 
      lemmaFrequencies = {}, 
      trackedLanguages = [], 
      wordsAdded = {} 
    } = await browser.storage.local.get([
      "lemmaFrequencies",
      "trackedLanguages",
      "wordsAdded"
    ]);
  
    let totalWords = 0, totalUniqueWords = 0;
    const languages = {};
  
    for (const [lang, words] of Object.entries(lemmaFrequencies)) {
      if (!trackedLanguages.length || trackedLanguages.includes(lang)) {
        let wordCount = 0;
        let uniqueWordCount = 0;
        for (const count of Object.values(words)) {
          wordCount += count;
          uniqueWordCount++;
        }
        languages[lang] = { totalWords: wordCount, uniqueWords: uniqueWordCount };
        totalWords += wordCount;
        totalUniqueWords += uniqueWordCount;
      }
    }
  
    const summary = {
      totalWords,
      totalUniqueWords,
      languages,
      wordsAdded
    };
  
    // log("[Stats Page] Résumé des statistiques mis à jour:", summary);
    await browser.storage.local.set({ statsSummary: summary });
    return { summary, lemmaFrequencies, trackedLanguages };
  }
  
  /**
   * Génère le HTML du résumé global
   * @param {Object} summary - Les statistiques
   * @returns {string} - Le HTML du résumé
   */
  function generateSummaryHTML(summary) {
    if (summary.totalWords === 0) {
      return `<h2>Résumé des statistiques</h2>
              <p>Aucune statistique disponible pour le moment.</p>`;
    }
    return `
      <h2>Résumé des statistiques</h2>
      <p>Date : ${new Date().toLocaleDateString()}</p>
      <p>Total de mots analysés : ${summary.totalWords}</p>
      <p>Total de mots uniques : ${summary.totalUniqueWords}</p>
    `;
  }
  
  /**
   * Génère le HTML du contrôle de tri
   * @param {string} currentSortOrder - L'ordre de tri actuel
   * @returns {string} - Le HTML du contrôle de tri
   */
  function generateSortControlHTML(currentSortOrder) {
    return `
      <div id="sort-container">
        <label for="sort-order">Trier par fréquence : </label>
        <select id="sort-order">
          <option value="desc" ${currentSortOrder === "desc" ? "selected" : ""}>Décroissante</option>
          <option value="asc" ${currentSortOrder === "asc" ? "selected" : ""}>Croissante</option>
        </select>
      </div>
    `;
  }
  
  /**
   * Génère le HTML détaillé pour chaque langue avec le total par langue
   * @param {Object} lemmaFrequencies - Les fréquences des mots
   * @param {Array} trackedLanguages - Les langues suivies
   * @param {string} sortOrder - L'ordre de tri
   * @returns {string} - Le HTML détaillé
   */
  function generateDetailedFrequenciesHTML(lemmaFrequencies, trackedLanguages, sortOrder) {
    let detailsHTML = `<div id="detailed-frequencies">`;
    let hasData = false;
  
    for (const [lang, words] of Object.entries(lemmaFrequencies)) {
      if (!trackedLanguages.length || trackedLanguages.includes(lang)) {
        let wordEntries = Object.entries(words);
        if (wordEntries.length === 0) {
          detailsHTML += `<h4>${lang.toUpperCase()}</h4>
                          <p>Aucune donnée pour cette langue.</p>`;
        } else {
          hasData = true;
          // Calculer le total pour cette langue
          const totalForLang = wordEntries.reduce((acc, curr) => acc + curr[1], 0);
          // Trier les mots par fréquence
          wordEntries.sort((a, b) => sortOrder === "asc" ? a[1] - b[1] : b[1] - a[1]);
          detailsHTML += `<h4>${lang.toUpperCase()} (Total: ${totalForLang} mots)</h4>`;
          detailsHTML += `<div class="table-container">
                          <table>
                            <tr>
                              <th>Mot</th>
                              <th>Fréquence</th>
                            </tr>`;
          for (const [word, freq] of wordEntries) {
            detailsHTML += `<tr>
                              <td>${word}</td>
                              <td>${freq}</td>
                            </tr>`;
          }
          detailsHTML += `</table>
                          </div>`;
        }
      }
    }
  
    if (!hasData) {
      detailsHTML += `<p>Aucune donnée de fréquence à afficher.</p>`;
    }
    detailsHTML += `</div>`;
    return detailsHTML;
  }
  
  const container = document.getElementById("stats-container");
  let currentSortOrder = "desc";
  
  const { summary, lemmaFrequencies, trackedLanguages } = await updateStatsSummary();
  container.innerHTML = generateSummaryHTML(summary) +
                        generateSortControlHTML(currentSortOrder) +
                        generateDetailedFrequenciesHTML(lemmaFrequencies, trackedLanguages, currentSortOrder);
  
  // Écouteur pour mettre à jour l'affichage lorsque l'utilisateur change l'ordre de tri
  document.getElementById("sort-order").addEventListener("change", async (e) => {
    currentSortOrder = e.target.value;
    const data = await updateStatsSummary();
    const detailedHTML = generateDetailedFrequenciesHTML(data.lemmaFrequencies, data.trackedLanguages, currentSortOrder);
    const detailedContainer = document.getElementById("detailed-frequencies");
    if (detailedContainer) {
      detailedContainer.outerHTML = detailedHTML;
    } else {
      container.innerHTML = generateSummaryHTML(data.summary) +
                            generateSortControlHTML(currentSortOrder) +
                            detailedHTML;
    }
  });
});
