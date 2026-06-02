/**
 * db.js
 * Gestione IndexedDB nativa con Promises per l'app di Tracciamento Spese Parcheggi.
 * Salva i dati offline, comprese le immagini in formato Base64.
 */

const DB_NAME = 'ParkingExpensesDB';
const DB_VERSION = 1;
const STORE_NAME = 'expenses';

/**
 * Inizializza e apre il database IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("Errore nell'apertura di IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    // Creazione dello store se il database viene creato o aggiornato
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // Creiamo l'object store con una chiave primaria auto-incrementante 'id'
        // oppure usiamo l'id fornito (timestamp o UUID)
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        console.log("Object store 'expenses' creato con successo.");
      }
    };
  });
}

/**
 * Salva o aggiorna una spesa nel database.
 * @param {Object} expense Oggetto spesa completo
 * @returns {Promise<string|number>} L'ID del record salvato
 */
async function saveExpense(expense) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Se non c'è l'id, lo generiamo
    if (!expense.id) {
      expense.id = Date.now().toString();
    }

    const request = store.put(expense);

    request.onsuccess = () => {
      resolve(expense.id);
    };

    request.onerror = (event) => {
      console.error("Errore nel salvataggio della spesa:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Ottiene tutte le spese salvate.
 * @returns {Promise<Array<Object>>} Lista di tutte le spese
 */
async function getAllExpenses() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Ordiniamo per data (dalla più recente alla più vecchia) e poi per ora
      const sorted = request.result.sort((a, b) => {
        const dateA = `${a.date}T${a.startTime || '00:00'}`;
        const dateB = `${b.date}T${b.startTime || '00:00'}`;
        return dateB.localeCompare(dateA);
      });
      resolve(sorted);
    };

    request.onerror = (event) => {
      console.error("Errore nel recupero delle spese:", event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Elimina una spesa tramite ID.
 * @param {string} id ID della spesa da eliminare
 * @returns {Promise<void>}
 */
async function deleteExpense(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Elimina l'ID in tutti i formati possibili (Nativo, Stringa, Numero)
    store.delete(id);
    store.delete(String(id));
    if (!isNaN(Number(id))) {
      store.delete(Number(id));
    }

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = (event) => {
      console.error("Errore nell'eliminazione della spesa:", event.target.error);
      reject(event.target.error);
    };
  });
}

// Esporta le funzioni globalmente per app.js
window.ParkingDB = {
  saveExpense,
  getAllExpenses,
  deleteExpense
};
