# Extension Firefox - ff2balex
Un projet de plugin Firefox qui interagit avec [BaLex](https://balex.liris.cnrs.fr/). Ce projet s'inscrit dans la continuité du projet [Lex:gaMe](https://aslan.universite-lyon.fr/projet-lex-game-233220.kjsp).

Toutes les informations sur **le fonctionnement et l'utilisation** de cette extension sont disponibles à partir de [cette page](https://gitlab.liris.cnrs.fr/lex-game/balex2ff/-/wikis/home).

L'extension doit être installée comme un module complémentaire temporaire. La procédure d'**installation** manuelle est détaillée [ici](https://gitlab.liris.cnrs.fr/lex-game/balex2ff/-/wikis/Documentation/Utilisation-de-l'extension/Installation).

### Ressources
* [Documentation officielle des extensions Firefox](https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions)
* [Tutoriels sur les extensions Firefox](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension)
* [Solution pour échanger avec un script Python](https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions/Native_messaging)
* [A-t-on besoin de scripts de contenu ?](https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions/Content_scripts)
* [Comment récupérer les informations des onglets du navigateur](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/query#syntax)
* [Informations sur l'extension et l'environnement dans lequel elle fonctionne](https://developer.mozilla.org/fr/docs/Mozilla/Add-ons/WebExtensions/API/runtime)


### Crédits

**Bibliothèques et dépendances**  
Ce projet intègre plusieurs bibliothèques open-source qui ont permis son développement :  
* **[Pyodide](https://github.com/pyodide/pyodide)** : permet d'installer et de configurer des bibliothèques Python dans le navigateur, et de mélanger facilement les languages JavaScript et Python.  

* **[Simplemma](https://github.com/adbar/simplemma)** : lemmatiseur multilingue (Python)  
Barbaresi, A. (2024). Simplemma (v1.1.2). Zenodo. https://doi.org/10.5281/zenodo.14187363

**Police utilisée : Luciole**  
Conçue spécifiquement pour les personnes malvoyantes.  
© Laurent Bourcellier & Jonathan Perez – Distribuée gratuitement sous la [Licence Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode.fr).  
Source : [Luciole Vision](https://luciole-vision.com/)


**Icônes**  
Icône de lien vers BaLex : [`link_to_balex.svg`](/src/assets/icons/Link_to_balex.svg) MIT https://www.svgrepo.com/svg/450128/external-link-s  
  
Création des icônes d'options sur [icones8](https://icones8.fr/icons)

**Autres**  
Ce projet a bénéficé de l'assistance de ChatGPT, notamment pour la correction de bugs, la recherche de solutions pertinentes (ex : les bibliothèques les plus adaptées) et l'optimisation de code (structure, efficacité).  
ChatGPT (Versions GPT-4o et o3-mini). (2023). OpenAI. Retrieved February 23, 2025, from https://chat.openai.com  


