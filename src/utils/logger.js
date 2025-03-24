/**
 * Ce script définit une fonction de log qui s'active en mode debug.
 * Si la variable DEBUG est définie sur true, les messages de log seront affichés dans la console.
 * Sinon, ils seront masqués.
 * En mode debug, les identifiants (id) des lexiques de l'utilisateur sont affichés.
 */

(function () {
  // Vérifie si le code s'exécute dans un environnement de navigateur
  if (typeof window !== 'undefined') {
    if (typeof window.DEBUG === 'undefined') {
      window.DEBUG = true; // true en mode debug
    }
    if (!window.log) {
      function log(...args) {
        if (window.DEBUG) {
          console.log(...args);
        }
      }
      window.log = log; // Assigne la fonction log à l'objet window
    }
  } 
  // Vérifie si le code s'exécute dans un environnement worker
  else if (typeof self !== 'undefined') {
    if (typeof self.DEBUG === 'undefined') {
      self.DEBUG = true; // true en mode debug
    }
    if (!self.log) {
      function log(...args) {
        if (self.DEBUG) {
          console.log(...args);
        }
      }
      self.log = log; // Assigne la fonction log à l'objet self
    }
  }
})();
