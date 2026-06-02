/**
 * app.js
 * Logica UI, OCR (Tesseract.js), Conversione PDF (PDF.js), Generazione PDF (jsPDF)
 * e coordinamento delle operazioni offline con IndexedDB.
 */

// Array dei nomi dei mesi in Italiano
const MONTH_NAMES_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

// Stato dell'applicazione
const GEMINI_API_KEY = window.GEMINI_API_KEY || "";
let cropperInstance = null;

const AppState = {
  currentDate: new Date("2026-06-02"), // Tempo corrente ancorato al valore di sistema fornito
  activeTab: 'dashboard',              // Tab attivo: 'dashboard' o 'storico'
  expenses: [],                        // Lista di tutte le spese registrate nel database
  selectedExpense: null,               // Spesa correntemente visualizzata nei dettagli
  isEditing: false,                    // Stato del form (nuovo vs modifica)
  historyFilter: 'all',                // Filtro storico: 'all', 'Cartaceo', 'Digitale'
  historySearch: ''                    // Query di ricerca testuale per il filtro note
};

// Selettori DOM principali
const DOM = {
  connectionStatus: document.getElementById('connectionStatus'),
  
  // Bottoni Navigazione Tab
  navDashboardBtn: document.getElementById('navDashboardBtn'),
  navStoricoBtn: document.getElementById('navStoricoBtn'),
  openFormBtn: document.getElementById('openFormBtn'),
  
  // Viste dei Tab
  tabDashboard: document.getElementById('tabDashboard'),
  tabStorico: document.getElementById('tabStorico'),
  
  // Elementi Dashboard Mese
  prevMonthBtn: document.getElementById('prevMonthBtn'),
  nextMonthBtn: document.getElementById('nextMonthBtn'),
  currentMonthDisplay: document.getElementById('currentMonthDisplay'),
  currentYearDisplay: document.getElementById('currentYearDisplay'),
  monthlyTotalDisplay: document.getElementById('monthlyTotalDisplay'),
  monthlyCountDisplay: document.getElementById('monthlyCountDisplay'),
  countCartaceo: document.getElementById('countCartaceo'),
  countDigitale: document.getElementById('countDigitale'),
  monthListingLabel: document.getElementById('monthListingLabel'),
  monthlyExpensesList: document.getElementById('monthlyExpensesList'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  
  // Elementi Storico
  historyTotalCount: document.getElementById('historyTotalCount'),
  filterAllBtn: document.getElementById('filterAllBtn'),
  filterCartaceoBtn: document.getElementById('filterCartaceoBtn'),
  filterDigitaleBtn: document.getElementById('filterDigitaleBtn'),
  searchInput: document.getElementById('searchInput'),
  historyExpensesList: document.getElementById('historyExpensesList'),
  
  // Elementi Bottom Sheet Form
  formBackdrop: document.getElementById('formBackdrop'),
  formSheet: document.getElementById('formSheet'),
  formTitle: document.getElementById('formTitle'),
  expenseForm: document.getElementById('expenseForm'),
  expenseId: document.getElementById('expenseId'),
  expenseImageBase64: document.getElementById('expenseImageBase64'),
  amountInput: document.getElementById('amountInput'),
  typeCartaceo: document.getElementById('typeCartaceo'),
  typeDigitale: document.getElementById('typeDigitale'),
  radioCartaceoLabel: document.getElementById('radioCartaceoLabel'),
  radioDigitaleLabel: document.getElementById('radioDigitaleLabel'),
  dateInput: document.getElementById('dateInput'),
  startTimeInput: document.getElementById('startTimeInput'),
  endTimeInput: document.getElementById('endTimeInput'),
  noteInput: document.getElementById('noteInput'),
  cancelFormBtn: document.getElementById('cancelFormBtn'),
  saveExpenseBtn: document.getElementById('saveExpenseBtn'),
  
  // Upload ed OCR
  dropZone: document.getElementById('dropZone'),
  fileFileInput: document.getElementById('fileFileInput'),
  cameraInput: document.getElementById('cameraInput'),
  uploadPrompt: document.getElementById('uploadPrompt'),
  uploadPreview: document.getElementById('uploadPreview'),
  formImagePreview: document.getElementById('formImagePreview'),
  removeImgBtn: document.getElementById('removeImgBtn'),
  cropAndAnalyzeBtn: document.getElementById('cropAndAnalyzeBtn'),
  ocrLoader: document.getElementById('ocrLoader'),
  ocrStatusMsg: document.getElementById('ocrStatusMsg'),
  ocrProgressBar: document.getElementById('ocrProgressBar'),
  
  // Elementi Modale Dettaglio
  detailBackdrop: document.getElementById('detailBackdrop'),
  detailModal: document.getElementById('detailModal'),
  closeDetailModalBtn: document.getElementById('closeDetailModalBtn'),
  detailImageContainer: document.getElementById('detailImageContainer'),
  detailImage: document.getElementById('detailImage'),
  detailNoImage: document.getElementById('detailNoImage'),
  detailAmount: document.getElementById('detailAmount'),
  detailType: document.getElementById('detailType'),
  detailDate: document.getElementById('detailDate'),
  detailStartTime: document.getElementById('detailStartTime'),
  detailEndTime: document.getElementById('detailEndTime'),
  detailNote: document.getElementById('detailNote'),
  deleteExpenseBtn: document.getElementById('deleteExpenseBtn'),
  editExpenseBtn: document.getElementById('editExpenseBtn'),
  
  // Canvas PDF
  pdfRenderCanvas: document.getElementById('pdfRenderCanvas')
};

/* ==========================================================================
   1. INIZIALIZZAZIONE & EVENT LISTENERS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();
  await refreshData();
  updateMonthPickerUI();
  initUIEvents();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('[App] Service Worker registrato correttamente con scope:', registration.scope);
      })
      .catch((error) => {
        console.error('[App] Errore di registrazione del Service Worker:', error);
      });
  }
}

function updateOnlineStatus() {
  if (navigator.onLine) {
    DOM.connectionStatus.classList.add('hidden');
  } else {
    DOM.connectionStatus.classList.remove('hidden');
  }
}

async function refreshData() {
  try {
    if (window.ParkingDB) {
      AppState.expenses = await window.ParkingDB.getAllExpenses();
      renderDashboard();
      renderStorico();
    }
  } catch (error) {
    console.error("Errore nel refresh dei dati:", error);
  }
}

function initUIEvents() {
  DOM.navDashboardBtn.addEventListener('click', () => switchTab('dashboard'));
  DOM.navStoricoBtn.addEventListener('click', () => switchTab('storico'));
  DOM.openFormBtn.addEventListener('click', () => openExpenseForm());
  DOM.cancelFormBtn.addEventListener('click', closeExpenseForm);
  DOM.formBackdrop.addEventListener('click', (e) => {
    if (e.target === DOM.formBackdrop) closeExpenseForm();
  });
  DOM.saveExpenseBtn.addEventListener('click', handleSaveExpense);
  DOM.prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
  DOM.nextMonthBtn.addEventListener('click', () => navigateMonth(1));
  DOM.exportPdfBtn.addEventListener('click', handlePdfExport);
  DOM.closeDetailModalBtn.addEventListener('click', closeDetailModal);
  DOM.detailBackdrop.addEventListener('click', (e) => {
    if (e.target === DOM.detailBackdrop) closeDetailModal();
  });
  DOM.deleteExpenseBtn.addEventListener('click', handleDeleteSelectedExpense);
  DOM.editExpenseBtn.addEventListener('click', handleEditSelectedExpense);
  DOM.filterAllBtn.addEventListener('click', () => setHistoryFilter('all'));
  DOM.filterCartaceoBtn.addEventListener('click', () => setHistoryFilter('Cartaceo'));
  DOM.filterDigitaleBtn.addEventListener('click', () => setHistoryFilter('Digitale'));
  DOM.searchInput.addEventListener('input', (e) => {
    AppState.historySearch = e.target.value;
    renderStorico();
  });
  initUploadEvents();
  DOM.typeCartaceo.addEventListener('change', updateRadioStyles);
  DOM.typeDigitale.addEventListener('change', updateRadioStyles);
}

/* ==========================================================================
   2. GESTIONE NAVIGAZIONE & VISUALIZZAZIONE TAB
   ========================================================================== */

function switchTab(tabId) {
  if (tabId === AppState.activeTab) return;
  AppState.activeTab = tabId;

  if (tabId === 'dashboard') {
    DOM.navDashboardBtn.classList.add('text-blue-600', 'font-bold');
    DOM.navDashboardBtn.classList.remove('text-slate-400', 'font-medium');
    DOM.navStoricoBtn.classList.add('text-slate-400', 'font-medium');
    DOM.navStoricoBtn.classList.remove('text-blue-600', 'font-bold');

    DOM.tabDashboard.classList.remove('hidden');
    DOM.tabStorico.classList.add('hidden');
    renderDashboard();
  } else {
    DOM.navStoricoBtn.classList.add('text-blue-600', 'font-bold');
    DOM.navStoricoBtn.classList.remove('text-slate-400', 'font-medium');
    DOM.navDashboardBtn.classList.add('text-slate-400', 'font-medium');
    DOM.navDashboardBtn.classList.remove('text-blue-600', 'font-bold');

    DOM.tabStorico.classList.remove('hidden');
    DOM.tabDashboard.classList.add('hidden');
    renderStorico();
  }
}

/* ==========================================================================
   3. GESTIONE DATA E FILTRI MENSILE (DASHBOARD)
   ========================================================================== */

function updateMonthPickerUI() {
  const currentMonth = AppState.currentDate.getMonth();
  const currentYear = AppState.currentDate.getFullYear();
  DOM.currentMonthDisplay.textContent = MONTH_NAMES_IT[currentMonth];
  DOM.currentYearDisplay.textContent = currentYear;
  DOM.monthListingLabel.textContent = `${MONTH_NAMES_IT[currentMonth]} ${currentYear}`;
}

function navigateMonth(direction) {
  AppState.currentDate.setMonth(AppState.currentDate.getMonth() + direction);
  updateMonthPickerUI();
  renderDashboard();
}

function renderDashboard() {
  const selectedMonth = AppState.currentDate.getMonth(); 
  const selectedYear = AppState.currentDate.getFullYear();

  const monthlyExpenses = AppState.expenses.filter(exp => {
    if (!exp.date) return false;
    const expDate = new Date(exp.date);
    return expDate.getMonth() === selectedMonth && expDate.getFullYear() === selectedYear;
  });

  let totalAmount = 0;
  let cartaceoCount = 0;
  let digitaleCount = 0;

  monthlyExpenses.forEach(exp => {
    const val = typeof exp.amount === 'number' ? exp.amount : parseFloat(exp.amount.toString().replace(',', '.'));
    if (!isNaN(val)) totalAmount += val;
    if (exp.type === 'Digitale') digitaleCount++;
    else cartaceoCount++;
  });

  DOM.monthlyTotalDisplay.textContent = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(totalAmount);
  DOM.monthlyCountDisplay.textContent = `${monthlyExpenses.length} ${monthlyExpenses.length === 1 ? 'sosta' : 'soste'}`;
  DOM.countCartaceo.textContent = cartaceoCount;
  DOM.countDigitale.textContent = digitaleCount;
  DOM.monthlyExpensesList.innerHTML = '';

  if (monthlyExpenses.length === 0) {
    DOM.monthlyExpensesList.innerHTML = `
      <div class="bg-white rounded-3xl p-8 text-center border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
        <span class="material-symbols-rounded text-4xl text-slate-300 mb-2">receipt_long</span>
        <p class="text-sm font-medium">Nessuna spesa salvata per questo mese.</p>
        <p class="text-xs mt-1">Carica uno scontrino o inseriscila manualmente cliccando sul FAB centrale!</p>
      </div>
    `;
    return;
  }

  monthlyExpenses.forEach(exp => {
    const card = createExpenseCard(exp);
    DOM.monthlyExpensesList.appendChild(card);
  });
}

function createExpenseCard(exp) {
  const card = document.createElement('div');
  card.className = 'bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between hover:border-blue-100 transition-all cursor-pointer expense-card-shadow';
  card.id = `exp-card-${exp.id}`;
  
  const iconStr = exp.type === 'Digitale' ? 'laptop_mac' : 'payments';
  const iconColor = exp.type === 'Digitale' ? 'text-indigo-600 bg-indigo-50 border-indigo-100/50' : 'text-emerald-600 bg-emerald-50 border-emerald-100/50';
  const timeInfo = exp.startTime && exp.endTime ? `${exp.startTime} - ${exp.endTime}` : (exp.startTime || exp.endTime || 'Orario sosta non inserito');
  const noteSnippet = exp.note ? exp.note : `Sosta del ${formatDateLabel(exp.date)}`;
  const formattedPrice = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(exp.amount);

  card.innerHTML = `
    <div class="flex items-center gap-3 min-w-0">
      <div class="w-10 h-10 rounded-xl ${iconColor} border flex items-center justify-center shrink-0">
        <span class="material-symbols-rounded text-xl font-bold">${iconStr}</span>
      </div>
      <div class="min-w-0">
        <p class="text-xs font-semibold text-slate-400 font-mono tracking-wide">${timeInfo}</p>
        <h5 class="text-sm font-bold text-slate-800 truncate leading-tight">${noteSnippet}</h5>
      </div>
    </div>
    <div class="flex items-center gap-2 pl-2">
      <span class="text-base font-extrabold text-slate-900 font-outfit shrink-0">${formattedPrice}</span>
      <span class="material-symbols-rounded text-slate-400 text-lg">chevron_right</span>
    </div>
  `;

  card.addEventListener('click', () => openDetailModal(exp));
  return card;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

/* ==========================================================================
   4. SEZIONE STORICO COMPLETO (RICERCA E FILTRI CHIP)
   ========================================================================== */

function renderStorico() {
  let filtered = [...AppState.expenses];

  if (AppState.historyFilter !== 'all') {
    filtered = filtered.filter(exp => exp.type === AppState.historyFilter);
  }

  if (AppState.historySearch.trim() !== '') {
    const q = AppState.historySearch.toLowerCase();
    filtered = filtered.filter(exp => 
      (exp.note && exp.note.toLowerCase().includes(q)) || 
      (exp.date && exp.date.includes(q)) ||
      (exp.amount && exp.amount.toString().includes(q))
    );
  }

  DOM.historyTotalCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'spesa' : 'spese'}`;
  DOM.historyExpensesList.innerHTML = '';

  if (filtered.length === 0) {
    DOM.historyExpensesList.innerHTML = `
      <div class="bg-white rounded-3xl p-10 text-center border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
        <span class="material-symbols-rounded text-4xl text-slate-300 mb-2">find_in_page</span>
        <p class="text-sm font-medium">Nessuna corrispondenza trovata.</p>
        <p class="text-xs mt-1">Prova a cambiare i filtri chip o la stringa di ricerca!</p>
      </div>
    `;
    return;
  }

  let lastHeader = '';
  filtered.forEach(exp => {
    const expDate = new Date(exp.date);
    const monthYearHeader = `${MONTH_NAMES_IT[expDate.getMonth()]} ${expDate.getFullYear()}`;
    
    if (monthYearHeader !== lastHeader) {
      const headerDiv = document.createElement('div');
      headerDiv.className = 'text-xs font-bold uppercase tracking-wider text-slate-400 pt-4 pb-1 pl-1 font-outfit';
      headerDiv.textContent = monthYearHeader;
      DOM.historyExpensesList.appendChild(headerDiv);
      lastHeader = monthYearHeader;
    }

    const card = createExpenseCard(exp);
    DOM.historyExpensesList.appendChild(card);
  });
}

function setHistoryFilter(filterType) {
  AppState.historyFilter = filterType;
  const buttons = [
    { btn: DOM.filterAllBtn, type: 'all' },
    { btn: DOM.filterCartaceoBtn, type: 'Cartaceo' },
    { btn: DOM.filterDigitaleBtn, type: 'Digitale' }
  ];

  buttons.forEach(({ btn, type }) => {
    if (type === filterType) {
      btn.className = 'flex-1 py-2 text-xs font-bold rounded-xl bg-white shadow-sm text-blue-600 transition-all cursor-pointer';
    } else {
      btn.className = 'flex-1 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 transition-all cursor-pointer';
    }
  });

  renderStorico();
}

/* ==========================================================================
   5. BOTTOM SHEET DI INSERIMENTO / MODIFICA SPESA
   ========================================================================== */

function updateRadioStyles() {
  if (DOM.typeCartaceo.checked) {
    DOM.radioCartaceoLabel.className = 'flex-1 flex items-center justify-center gap-2 py-3 border border-blue-500 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all font-bold text-sm text-blue-700 bg-blue-50/50 shadow-sm';
    DOM.radioDigitaleLabel.className = 'flex-1 flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all font-medium text-sm text-slate-700 bg-white';
  } else {
    DOM.radioDigitaleLabel.className = 'flex-1 flex items-center justify-center gap-2 py-3 border border-blue-500 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all font-bold text-sm text-blue-700 bg-blue-50/50 shadow-sm';
    DOM.radioCartaceoLabel.className = 'flex-1 flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-all font-medium text-sm text-slate-700 bg-white';
  }
}

function openExpenseForm(expense = null) {
  DOM.expenseForm.reset();
  DOM.expenseId.value = '';
  DOM.expenseImageBase64.value = '';
  
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  
  DOM.uploadPreview.classList.add('hidden');
  DOM.dropZone.classList.remove('hidden');
  DOM.formImagePreview.src = '';
  DOM.ocrLoader.classList.add('hidden');
  DOM.ocrProgressBar.style.width = '0%';
  DOM.uploadPrompt.classList.remove('hidden');
  if (DOM.cropAndAnalyzeBtn) {
    DOM.cropAndAnalyzeBtn.classList.add('hidden');
  }

  if (expense) {
    AppState.isEditing = true;
    DOM.formTitle.textContent = "Modifica Spesa";
    DOM.expenseId.value = expense.id;
    DOM.amountInput.value = expense.amount;
    DOM.dateInput.value = expense.date;
    DOM.startTimeInput.value = expense.startTime || '';
    DOM.endTimeInput.value = expense.endTime || '';
    DOM.noteInput.value = expense.note || '';

    if (expense.type === 'Digitale') DOM.typeDigitale.checked = true;
    else DOM.typeCartaceo.checked = true;

    if (expense.imageBase64) {
      DOM.expenseImageBase64.value = expense.imageBase64;
      DOM.formImagePreview.src = expense.imageBase64;
      DOM.uploadPreview.classList.remove('hidden');
      DOM.dropZone.classList.add('hidden');
      DOM.uploadPrompt.classList.add('hidden');
    }
  } else {
    AppState.isEditing = false;
    DOM.formTitle.textContent = "Aggiungi Spesa";
    const todayStr = new Date().toISOString().substring(0, 10);
    DOM.dateInput.value = todayStr;
    DOM.typeCartaceo.checked = true;
  }

  updateRadioStyles();
  DOM.formBackdrop.classList.remove('pointer-events-none');
  DOM.formBackdrop.classList.add('backdrop-active');
  DOM.formSheet.classList.add('sheet-active');
  document.body.style.overflow = 'hidden';
}

function closeExpenseForm() {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  DOM.formSheet.classList.remove('sheet-active');
  DOM.formBackdrop.classList.remove('backdrop-active');
  DOM.formBackdrop.classList.add('pointer-events-none');
  DOM.ocrLoader.classList.add('hidden');
  DOM.dropZone.classList.remove('hidden');
  document.body.style.overflow = '';
}

async function handleSaveExpense() {
  if (!DOM.amountInput.value || !DOM.dateInput.value) {
    alert("Per favore, compila tutti i campi obbligatori (Importo e Data).");
    return;
  }

  const amountVal = parseFloat(DOM.amountInput.value);
  if (isNaN(amountVal) || amountVal <= 0) {
    alert("Inserire un importo valido e maggiore di zero.");
    return;
  }

  const expense = {
    id: DOM.expenseId.value || Date.now().toString(),
    date: DOM.dateInput.value,
    startTime: DOM.startTimeInput.value,
    endTime: DOM.endTimeInput.value,
    amount: amountVal,
    type: DOM.typeCartaceo.checked ? 'Cartaceo' : 'Digitale',
    note: DOM.noteInput.value,
    imageBase64: DOM.expenseImageBase64.value || ''
  };

  try {
    if (window.ParkingDB) {
      await window.ParkingDB.saveExpense(expense);
      closeExpenseForm();
      await refreshData();
    } else {
      console.error("IndexedDB non inizializzato correttamente.");
    }
  } catch (error) {
    console.error("Impossibile salvare la spesa sosta:", error);
    alert("Errore nel salvataggio dei dati offline.");
  }
}

/* ==========================================================================
   6. FILE UPLOAD ED OCR INTEGRATO (Tesseract.js & PDF.js)
   ========================================================================== */

function initUploadEvents() {
  DOM.fileFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processSelectedFile(e.target.files[0]);
  });

  DOM.cameraInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) processSelectedFile(e.target.files[0]);
  });

  DOM.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.add('dragover');
  });

  DOM.dropZone.addEventListener('dragleave', () => {
    DOM.dropZone.classList.remove('dragover');
  });

  DOM.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) processSelectedFile(e.dataTransfer.files[0]);
  });

  DOM.removeImgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
    DOM.expenseImageBase64.value = '';
    DOM.formImagePreview.src = '';
    DOM.uploadPreview.classList.add('hidden');
    DOM.dropZone.classList.remove('hidden');
    DOM.uploadPrompt.classList.remove('hidden');
  });

  DOM.cropAndAnalyzeBtn.addEventListener('click', async () => {
    if (!cropperInstance) return;
    
    // Ottiene l'immagine ritagliata in formato Base64 ad alta qualità
    const canvas = cropperInstance.getCroppedCanvas({ maxWidth: 1024, maxHeight: 1024 });
    const croppedBase64 = canvas.toDataURL('image/jpeg', 0.85);
    
    // Aggiorna lo stato e l'anteprima visiva con l'immagine ritagliata
    DOM.expenseImageBase64.value = croppedBase64;
    cropperInstance.destroy();
    cropperInstance = null;
    
    // Sostituisce l'immagine nell'anteprima con quella finale ritagliata e nasconde i tasti di crop
    DOM.formImagePreview.src = croppedBase64;
    DOM.cropAndAnalyzeBtn.classList.add('hidden');
    
    // Converte il canvas ritagliato in Blob per passarlo al sistema di analisi esistente
    canvas.toBlob((blob) => {
      if (blob) {
        // Avvia l'analisi (Gemini/Tesseract) solo sulla porzione ritagliata
        processSelectedFile(blob, true); 
      }
    }, 'image/jpeg', 0.85);
  });
}

async function processSelectedFile(file, isAlreadyCropped = false) {
  if (!isAlreadyCropped) {
    try {
      let imageSrc = '';
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        imageSrc = await convertPdfToImage(file);
      } else {
        imageSrc = await readAsDataURL(file);
      }

      DOM.expenseImageBase64.value = imageSrc;
      DOM.formImagePreview.src = imageSrc;
      DOM.uploadPrompt.classList.add('hidden');
      DOM.uploadPreview.classList.remove('hidden');
      DOM.dropZone.classList.add('hidden');
      DOM.cropAndAnalyzeBtn.classList.remove('hidden');

      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }
      
      // Delay initialization slightly to ensure the image container is fully displayed and dimensioned
      setTimeout(() => {
        cropperInstance = new Cropper(DOM.formImagePreview, { 
          viewMode: 1, 
          autoCropArea: 0.8, 
          responsive: true 
        });
      }, 100);

    } catch (err) {
      console.error("Errore caricamento file per crop:", err);
    }
    return;
  }

  // Se isAlreadyCropped è true, passa direttamente alla routine di scansione
  DOM.ocrLoader.classList.remove('hidden');
  DOM.ocrStatusMsg.textContent = "Acquisizione del documento...";
  DOM.ocrProgressBar.style.width = '10%';

  try {
    const imageSrc = DOM.expenseImageBase64.value; // l'immagine ritagliata Base64
    DOM.ocrProgressBar.style.width = '30%';

    // PRIMO TENTATIVO: INTELLIGENZA ARTIFICIALE (GEMINI)
    if (navigator.onLine && GEMINI_API_KEY !== "") {
      try {
        DOM.ocrStatusMsg.textContent = "L'AI di Gemini sta analizzando lo scontrino...";
        DOM.ocrProgressBar.style.width = '50%';

        const base64Data = imageSrc.split(',')[1];
        const mimeType = imageSrc.split(',')[0].split(':')[1].split(';')[0];
        
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { inlineData: { mimeType: mimeType, data: base64Data } },
            "Analizza questa immagine di un biglietto o scontrino di parcheggio ed estrai i dati in questo formato JSON puro, senza blocchi markdown: { 'amount': numero (es 2.50), 'date': 'AAAA-MM-DD', 'startTime': 'HH:MM', 'endTime': 'HH:MM', 'note': 'Breve descrizione del gestore o luogo' }"
          ],
        });

        const cleanJson = response.text.trim().replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJson);

        if (data.amount) DOM.amountInput.value = data.amount;
        if (data.date) DOM.dateInput.value = data.date;
        if (data.startTime) DOM.startTimeInput.value = data.startTime;
        if (data.endTime) DOM.endTimeInput.value = data.endTime;
        if (data.note) DOM.noteInput.value = data.note;

        // Modifica per feedback Gemini permanente fino al salvataggio/annullamento
        DOM.ocrStatusMsg.innerHTML = `<span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-200 flex items-center gap-1 justify-center w-fit mx-auto"><span class="material-symbols-rounded text-sm">auto_awesome</span> Elaborato con AI Gemini</span>`;
        DOM.ocrProgressBar.style.width = '100%';
        // NOTA: Non nascondere il loader (rimuovi il DOM.ocrLoader.classList.add('hidden')) per lasciare il badge visibile nel form.
        return; // Uscita pulita se Gemini funziona

      } catch (geminiError) {
        console.warn("Gemini fallito o timeout, eseguo fallback su Tesseract locale:", geminiError);
      }
    }

    // SECONDO TENTATIVO (FALLBACK): TESSERACT LOCALE OFFLINE
    DOM.ocrStatusMsg.textContent = "Sei offline. Avvio scansione locale (Tesseract)...";
    DOM.ocrProgressBar.style.width = '60%';

    if (typeof Tesseract === 'undefined') throw new Error("Tesseract non disponibile.");

    const result = await Tesseract.recognize(imageSrc, 'ita+eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const percent = Math.round(m.progress * 30) + 60;
          DOM.ocrProgressBar.style.width = `${percent}%`;
        }
      }
    });

    // Parsing classico con le vecchie RegEx
    parseAndPrepopulateForm(result.data.text);
    
    // Modifica per feedback Tesseract permanente fino al salvataggio/annullamento
    DOM.ocrStatusMsg.innerHTML = `<span class="bg-amber-100 text-amber-800 text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-200 flex items-center gap-1 justify-center w-fit mx-auto"><span class="material-symbols-rounded text-sm">wifi_off</span> Elaborato in Locale (Offline)</span>`;
    DOM.ocrProgressBar.style.width = '100%';

  } catch (err) {
    console.error("Errore totale di scansione:", err);
    DOM.ocrStatusMsg.textContent = "Scansione fallita. Inserisci i dati manualmente.";
    DOM.ocrProgressBar.style.width = '100%';
    setTimeout(() => DOM.ocrLoader.classList.add('hidden'), 2500);
  }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

function convertPdfToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async function() {
      try {
        const typedarray = new Uint8Array(this.result);
        if (typeof pdfjsLib !== 'undefined') {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1.6 });
          const context = DOM.pdfRenderCanvas.getContext('2d');
          
          DOM.pdfRenderCanvas.height = viewport.height;
          DOM.pdfRenderCanvas.width = viewport.width;
          
          const renderContext = { canvasContext: context, viewport: viewport };
          await page.render(renderContext).promise;
          
          const dataUrl = DOM.pdfRenderCanvas.toDataURL('image/jpeg', 0.9);
          resolve(dataUrl);
        } else {
          reject(new Error("Libreria PDF.js non caricata via CDN"));
        }
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

async function scanImageOCR(imageSrc) {
  if (typeof Tesseract === 'undefined') {
    throw new Error("Libreria Tesseract.js non disponibile offline.");
  }
  const result = await Tesseract.recognize(
    imageSrc,
    'ita+eng',
    {
      logger: m => {
        if (m.status === 'recognizing text') {
          const percent = Math.round(m.progress * 50) + 40; 
          DOM.ocrProgressBar.style.width = `${percent}%`;
          DOM.ocrStatusMsg.textContent = `Analisi caratteri: ${percent}%...`;
        }
      }
    }
  );
  return result.data.text;
}

/**
 * Analizza la stringa OCR con logiche RegEx e precompila il form parcheggio.
 */
function parseAndPrepopulateForm(text) {
  if (!text) return;
  console.log("--- OCR TESTO RILEVATO --- \n", text);

  const lowerText = text.toLowerCase();
  
  // Riconoscimento ed estrazione mirata per ricevute EasyPark
  if (lowerText.includes('easypark') || lowerText.includes('easy park')) {
    let easyParkNote = "EasyPark";
    let date = null;
    let startTime = null;
    let endTime = null;
    let amount = null;
    
    const totalMatch = text.match(/Totale[\s\S]*?([0-9]+[\.,][0-9]{2})/i);
    if (totalMatch) {
      amount = parseFloat(totalMatch[1].replace(',', '.'));
    }
    
    const dateTimeRegex = /(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})\s+(\d{2}[:\.\-]\d{2})/g;
    const matches = [...text.matchAll(dateTimeRegex)];
    
    if (matches.length >= 1) {
      const d1 = matches[0];
      date = `${d1[3]}-${d1[2]}-${d1[1]}`; 
      startTime = d1[4].replace(/[\.\-]/, ':');
    }
    
    if (matches.length >= 2) {
      const d2 = matches[1];
      endTime = d2[4].replace(/[\.\-]/, ':');
      
      const textAfterEnd = text.substring(d2.index + d2[0].length);
      const gestoreMatch = textAfterEnd.match(/^\s*([a-zA-Z\s]+?)(?=\s+\d{3,}|\s+\d+[\.,]\d{2})/);
      
      if (gestoreMatch && gestoreMatch[1].trim().length > 2) {
        easyParkNote = `EasyPark - ${gestoreMatch[1].trim()}`;
      }
    }
    
    if (!amount) amount = parseOcrAmount(text);
    if (!date) date = parseOcrDate(text);
    if (!startTime || !endTime) {
      const genericTimes = parseOcrTimes(text);
      if (!startTime) startTime = genericTimes.startTime;
      if (!endTime) endTime = genericTimes.endTime;
    }
    
    if (amount) DOM.amountInput.value = amount;
    if (startTime) DOM.startTimeInput.value = startTime;
    if (endTime) DOM.endTimeInput.value = endTime;
    if (date) DOM.dateInput.value = date;
    
    DOM.noteInput.value = easyParkNote;
    
    return; 
  }

  // LOGICA DI ESTRAZIONE GENERICA
  const extractedAmount = parseOcrAmount(text);
  if (extractedAmount) DOM.amountInput.value = extractedAmount;

  const extractedTimes = parseOcrTimes(text);
  if (extractedTimes.startTime) DOM.startTimeInput.value = extractedTimes.startTime;
  if (extractedTimes.endTime) DOM.endTimeInput.value = extractedTimes.endTime;

  const extractedDate = parseOcrDate(text);
  if (extractedDate) DOM.dateInput.value = extractedDate;
}

function parseOcrAmount(text) {
  const cleanText = text.toLowerCase();
  const lines = cleanText.split('\n');
  const keywords = ['totale', 'total', 'euro', 'eur', '€', 'pagato', 'importo', 'somma', 'sosta', 'cassa', 'tariffa', 'paga'];
  
  for (const line of lines) {
    if (keywords.some(k => line.includes(k))) {
      const amountRegex = /\b\d+[\.,]\d{2}\b/;
      const match = line.match(amountRegex);
      if (match) {
        const val = parseFloat(match[0].replace(',', '.'));
        if (val > 0 && val < 500) return val;
      }
    }
  }

  const allAmountsRegex = /\b\d+[\.,]\d{2}\b/g;
  const matches = cleanText.match(allAmountsRegex);
  if (matches) {
    const candidates = matches
      .map(m => parseFloat(m.replace(',', '.')))
      .filter(v => v > 0.4 && v < 150); 
    
    if (candidates.length > 0) {
      candidates.sort((a, b) => b - a);
      return candidates[0];
    }
  }
  return null;
}

function parseOcrTimes(text) {
  const timeRegex = /\b([0-2]?[0-9])[:\.\-]([0-5][0-9])\b/g;
  const matches = [];
  let match;
  
  while ((match = timeRegex.exec(text)) !== null) {
    const hh = parseInt(match[1]);
    const mm = parseInt(match[2]);
    if (hh >= 0 && hh < 24 && mm >= 0 && mm < 60) {
      const formatted = `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
      if (!matches.includes(formatted)) matches.push(formatted);
    }
  }

  if (matches.length >= 2) {
    matches.sort();
    return { startTime: matches[0], endTime: matches[matches.length - 1] };
  } else if (matches.length === 1) {
    return { startTime: matches[0], endTime: "" };
  }
  return { startTime: "", endTime: "" };
}

function parseOcrDate(text) {
  const dateRegex = /\b([0-3]?[0-9])[\/\.\-]([0-1]?[0-9])[\/\.\-](20[2-3][0-9])\b/;
  const match = text.match(dateRegex);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`; 
  }
  return null;
}

/* ==========================================================================
   7. MODALE DI VISUALIZZAZIONE DETTAGLIO SPESA (ELIMINAZIONE / MODIFICA)
   ========================================================================== */

function openDetailModal(expense) {
  AppState.selectedExpense = expense;
  DOM.detailAmount.textContent = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(expense.amount);
  DOM.detailType.textContent = expense.type;
  DOM.detailDate.textContent = formatDateLabel(expense.date);
  DOM.detailStartTime.textContent = expense.startTime || '--:--';
  DOM.detailEndTime.textContent = expense.endTime || '--:--';
  DOM.detailNote.textContent = expense.note ? expense.note : 'Nessuna nota aggiunta.';

  if (expense.imageBase64) {
    DOM.detailImage.src = expense.imageBase64;
    DOM.detailImage.classList.remove('hidden');
    DOM.detailNoImage.classList.add('hidden');
  } else {
    DOM.detailImage.src = '';
    DOM.detailImage.classList.add('hidden');
    DOM.detailNoImage.classList.remove('hidden');
  }

  DOM.detailBackdrop.classList.remove('pointer-events-none');
  DOM.detailBackdrop.classList.add('backdrop-active');
  DOM.detailModal.classList.add('modal-active');
  document.body.style.overflow = 'hidden';
}

function closeDetailModal() {
  DOM.detailModal.classList.remove('modal-active');
  DOM.detailBackdrop.classList.remove('backdrop-active');
  DOM.detailBackdrop.classList.add('pointer-events-none');
  document.body.style.overflow = '';
}

async function handleDeleteSelectedExpense() {
  if (!AppState.selectedExpense || !AppState.selectedExpense.id) {
    console.error("Errore: Spesa non identificata.");
    return;
  }

  // Primo click: attiva lo stato di conferma visiva sul pulsante (evita confirm nativi)
  if (!DOM.deleteExpenseBtn.hasAttribute('data-confirm')) {
    DOM.deleteExpenseBtn.setAttribute('data-confirm', 'true');
    DOM.deleteExpenseBtn.innerHTML = `<span class="material-symbols-rounded text-lg">warning</span> Confermi?`;
    DOM.deleteExpenseBtn.className = "flex-1 bg-rose-600 text-white py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md relative z-10";
    
    // Reset automatico dopo 3 secondi se l'utente ci ripensa e non clicca di nuovo
    setTimeout(() => {
      if (DOM.deleteExpenseBtn && DOM.deleteExpenseBtn.hasAttribute('data-confirm')) {
        DOM.deleteExpenseBtn.removeAttribute('data-confirm');
        DOM.deleteExpenseBtn.innerHTML = `<span class="material-symbols-rounded text-lg">delete</span> Elimina`;
        DOM.deleteExpenseBtn.className = "flex-1 bg-rose-50 text-rose-600 hover:bg-rose-100 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-rose-100 relative z-10";
      }
    }, 3000);
    return;
  }

  // Secondo click: esegue la cancellazione reale
  try {
    if (window.ParkingDB) {
      await window.ParkingDB.deleteExpense(AppState.selectedExpense.id);
      AppState.expenses = AppState.expenses.filter(exp => String(exp.id) !== String(AppState.selectedExpense.id));
      
      // Ripristina l'aspetto del bottone per le prossime aperture
      DOM.deleteExpenseBtn.removeAttribute('data-confirm');
      DOM.deleteExpenseBtn.innerHTML = `<span class="material-symbols-rounded text-lg">delete</span> Elimina`;
      DOM.deleteExpenseBtn.className = "flex-1 bg-rose-50 text-rose-600 hover:bg-rose-100 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-rose-100 relative z-10";

      closeDetailModal();
      renderDashboard();
      renderStorico();
    }
  } catch (error) {
    console.error("Errore durante l'eliminazione sul database:", error);
  }
}

function closeDetailModal() {
  DOM.detailModal.classList.remove('modal-active');
  DOM.detailBackdrop.classList.remove('backdrop-active');
  DOM.detailBackdrop.classList.add('pointer-events-none');
  document.body.style.overflow = '';
  
  // Forza il reset del testo e dello stato del bottone elimina alla chiusura della modale
  if (DOM.deleteExpenseBtn) {
    DOM.deleteExpenseBtn.removeAttribute('data-confirm');
    DOM.deleteExpenseBtn.innerHTML = `<span class="material-symbols-rounded text-lg">delete</span> Elimina`;
    DOM.deleteExpenseBtn.className = "flex-1 bg-rose-50 text-rose-600 hover:bg-rose-100 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-rose-100 relative z-10";
  }
}

function handleEditSelectedExpense() {
  if (!AppState.selectedExpense) return;
  const expToEdit = AppState.selectedExpense;
  closeDetailModal();
  setTimeout(() => openExpenseForm(expToEdit), 250);
}

/* ==========================================================================
   8. ESPORTAZIONE PDF AVANZATA (jsPDF impaginazione a griglia/dima 2x3)
   ========================================================================== */

function getImageDimensions(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 500 });
    img.onerror = () => resolve({ width: 400, height: 500 });
    img.src = base64;
  });
}

async function handlePdfExport() {
  const selectedMonth = AppState.currentDate.getMonth();
  const selectedYear = AppState.currentDate.getFullYear();
  const labelMese = MONTH_NAMES_IT[selectedMonth];

  const itemsToExport = AppState.expenses.filter(exp => {
    if (!exp.date) return false;
    const expDate = new Date(exp.date);
    return expDate.getMonth() === selectedMonth && expDate.getFullYear() === selectedYear;
  });

  if (itemsToExport.length === 0) {
    alert(`Nessuna spesa da esportare per il mese di ${labelMese} ${selectedYear}.`);
    return;
  }

  const exportBtnOriginalText = DOM.exportPdfBtn.innerHTML;
  DOM.exportPdfBtn.innerHTML = `<span class="material-symbols-rounded spinner-icon text-base">sync</span> Creo PDF...`;
  DOM.exportPdfBtn.disabled = true;

  try {
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
      throw new Error("Libreria jsPDF non disponibile.");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const cardWidth = 85; 
    const cardHeight = 82;
    const columnSpacing = 10;
    const rowSpacing = 8;
    const startX = 15;
    const startY = 25; 

    let globalIndex = 0;

    for (let i = 0; i < itemsToExport.length; i++) {
      const exp = itemsToExport[i];

      if (globalIndex > 0 && globalIndex % 6 === 0) {
        doc.addPage();
        globalIndex = 0;
      }

      if (globalIndex === 0) {
        const pageNum = Math.floor(i / 6) + 1;
        doc.setFillColor(248, 250, 252); 
        doc.rect(10, 10, 190, 10, 'F');
        doc.setFont('Helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 41, 59); 
        doc.text(`NOTA SPESE PARCHEGGI - ${labelMese.toUpperCase()} ${selectedYear}`, 15, 16.5);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); 
        doc.text(`Pagina ${pageNum}`, 180, 16.5);
      }

      const cellIndexOnPage = globalIndex;
      const row = Math.floor(cellIndexOnPage / 2);
      const col = cellIndexOnPage % 2;
      const x = startX + col * (cardWidth + columnSpacing);
      const y = startY + row * (cardHeight + rowSpacing);

      doc.setDrawColor(226, 232, 240); 
      doc.setFillColor(255, 255, 255); 
      doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, 'FD');

      if (exp.imageBase64) {
        try {
          const dims = await getImageDimensions(exp.imageBase64);
          const maxW = cardWidth - 10; 
          const maxH = 52; 
          const ratio = Math.min(maxW / dims.width, maxH / dims.height);
          const finalW = dims.width * ratio;
          const finalH = dims.height * ratio;
          const offsetX = x + 5 + (maxW - finalW) / 2;
          const offsetY = y + 5 + (maxH - finalH) / 2;
          doc.addImage(exp.imageBase64, 'JPEG', offsetX, offsetY, finalW, finalH);
        } catch (imgError) {
          console.warn("Impossibile allegare l'immagine", imgError);
          drawReceiptPlaceholder(doc, x + 5, y + 5, cardWidth - 10, 52);
        }
      } else {
        drawReceiptPlaceholder(doc, x + 5, y + 5, cardWidth - 10, 52, exp.type);
      }

      doc.setLineDashPattern([1, 1], 0);
      doc.setDrawColor(203, 213, 225); 
      doc.line(x + 5, y + 59, x + cardWidth - 5, y + 59);
      doc.setLineDashPattern([], 0); 

      // 2. Inserimento testi della sosta con estetica pulita e allineamento (Helvetica)
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85); // text-slate-700
      
      const dateText = formatDateLabel(exp.date);
      const timeText = exp.startTime && exp.endTime ? `${exp.startTime} - ${exp.endTime}` : (exp.startTime || exp.endTime || 'N/A');
      
      // Riga 1: Data e Orario
      doc.text(`Data: ${dateText}`, x + 5, y + 64);
      doc.text(`Orario: ${timeText}`, x + 45, y + 64);
      
      // Riga 2: Solo le note (senza etichetta)
      const noteTxt = exp.note ? (exp.note.length > 50 ? exp.note.substring(0, 47) + "..." : exp.note) : '---';
      doc.text(noteTxt, x + 5, y + 70);

      // Riga 3: Importo in grassetto
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); // slate-900
      const priceTxt = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(exp.amount);
      doc.text(`Importo: ${priceTxt}`, x + 5, y + 77);

      globalIndex++;
    }

    doc.save(`Nota_Spese_Parcheggio_${labelMese}_${selectedYear}.pdf`);

  } catch (error) {
    console.error("Errore nella generazione del documento PDF:", error);
    alert("Errore nell'esportazione PDF. Per favore ritenta.");
  } finally {
    DOM.exportPdfBtn.innerHTML = exportBtnOriginalText;
    DOM.exportPdfBtn.disabled = false;
  }
}

function drawReceiptPlaceholder(doc, x, y, width, height, type = 'Cartaceo') {
  doc.setFillColor(241, 245, 249); 
  doc.roundedRect(x, y, width, height, 2, 2, 'F');
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184); 
  
  if (type === 'Digitale') {
    doc.text('RICEVUTA DIGITALE', x + width / 2, y + height / 2 - 2, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Nessuna immagine allegata', x + width / 2, y + height / 2 + 3, { align: 'center' });
  } else {
    doc.text('FOTO NON PRESENTE', x + width / 2, y + height / 2 - 2, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('Scontrino cartaceo senza scansione', x + width / 2, y + height / 2 + 3, { align: 'center' });
  }
}