// --- Start of helper functions ---

// Prevent FOUC: Show body only after fonts load
(function() {
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            document.documentElement.classList.add('fonts-loaded');
            document.body.classList.add('fonts-loaded');
        });
    } else {
        // Fallback for browsers without Font Loading API
        window.addEventListener('load', () => {
            document.documentElement.classList.add('fonts-loaded');
            document.body.classList.add('fonts-loaded');
        });
    }
    
    // Timeout fallback: show content after 1s regardless of font status
    setTimeout(() => {
        if (!document.body.classList.contains('fonts-loaded')) {
            document.documentElement.classList.add('fonts-loaded');
            document.body.classList.add('fonts-loaded');
        }
    }, 1000);
})();

// ASCII title animation - toggle on click
document.addEventListener("DOMContentLoaded", () => {
    const pre   = document.querySelector(".ascii-title");
    const lines = pre.textContent.split("\n");
    pre.innerHTML = ""; // clear out the raw ASCII

    lines.forEach((line, row) => {
        Array.from(line).forEach((ch, col) => {
            const span = document.createElement("span");
            span.textContent = ch;
            // keep only the column index for the RGB wave
            span.style.setProperty("--col", col);
            pre.appendChild(span);
        });
        // re–insert a newline so your <pre> stays multi-line
        if (row < lines.length - 1) {
            pre.appendChild(document.createTextNode("\n"));
        }
    });

    // Toggle animation on click
    pre.addEventListener("click", () => {
        pre.classList.toggle("animating");
    });
});

// Prevent focusing on element from scrolling the page
function safeFocus(el) {
  if (!el || !el.focus) return;
  try { el.focus({ preventScroll: true }); }  // modern browsers
  catch { el.focus(); }                        // older Safari
}

// Re-triggerable "pop" (uses existing .land-pop CSS)
function triggerPop(cell) {
  if (!cell) return;

  // Respect reduced motion
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  // Restart the animation if it's already running
  cell.classList.remove('land-pop');
  void cell.offsetWidth; // force reflow to re-trigger
  cell.classList.add('land-pop');

  // Clean up after the animation (~120ms)
  clearTimeout(cell._popTO);
  cell._popTO = setTimeout(() => {
    cell.classList.remove('land-pop');
  }, 140);
}

// Daily color: fetch from server (no client algorithm)
async function fetchDailyHex() {
  const res = await fetch('/api/daily-color', { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch daily color');
  const { hex } = await res.json();
  return hex;
}

// --- End of helper functions ---

class HexColorWordle {
    constructor(opts = {}) {
        this.mode = opts.mode || 'unlimited';
        this.targetColor = (opts.targetColor || this.generateRandomColor());
        this.currentAttempt = 1;
        
        this.maxAttempts = 6;
        this.gameOver = false;
        this.colorVisible = false;
        this.hasRevealedThisAttempt = false;
        this.baseDuration = 1000; // 1 second for first attempt
        this.isAnimating = false; // Track if guess animation is playing
        
        // Track all guesses and their errors for statistics
        this.guessHistory = []; // Array of {hex, colorError}
        
        // Check if daily puzzle is already completed
        if (this.mode === 'daily') {
            const completionData = this.checkDailyCompletion();
            if (completionData.completed) {
                this.gameOver = true;
                this.dailyAlreadyCompleted = true;
                // Will show stats modal after initialization
            }
        }
                
        this.initializeElements();
        this.setupEventListeners();
        this.updateColorPicker();
        this.initializeTimerText(); // Initialize the timer text
        this.buildGrid();
        this.setupOnScreenKeyboard();
        
        // Restore daily game state AFTER grid is built
        if (this.mode === 'daily') {
            this.loadDailyGameState();
        }
        // keyboard input
        document.addEventListener('keydown', this.handleKeydown);
        
        // Document-level paste listener as fallback (catches paste even when grid isn't focused)
        document.addEventListener('paste', (e) => {
            // Only handle if we're not in an input field and game is active
            const active = document.activeElement;
            const isInInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
            if (!isInInput && !this.gameOver && !this.isAnimating) {
                this.handlePaste(e);
            }
        })

        // Info button listener will be handled by modal system
        
        // Show stats modal if daily puzzle already completed
        if (this.dailyAlreadyCompleted) {
            setTimeout(() => {
                if (typeof window.showStatsModal === 'function') {
                    window.showStatsModal(true); // true = already completed
                }
            }, 2000); // Small delay for page load
        }
    }

    initializeElements() {
        this.colorDisplay = document.getElementById('colorDisplay');
        this.guessesContainer = document.getElementById('guessesContainer');
        this.timerText = document.getElementById('timerText');
        this.timerBar  = document.getElementById('timerBar');
        this.timerFill = document.getElementById('timerFill');
                
        // Custom color picker elements
        this.colorCanvas = document.getElementById('colorCanvas');
        this.canvasCursor = document.getElementById('canvasCursor');
        this.hueSlider = document.getElementById('hueSlider');
        this.hueCursor = document.getElementById('hueCursor');
        this.colorPreview = document.getElementById('colorPreview');
        this.hexInputField = document.getElementById('hexInputField');
        this.copyBtn = document.getElementById('copyBtn');
    }
            
    buildGrid() {
        // build 6x6 grid
        this.gridRows = 6;
        this.gridCols = 6;
        this.currentRow = 0;
        this.currentCol = 0;
        this.gridEl = document.getElementById('hexGrid');
        this.gridEl.innerHTML = '';
        this.gridCellRefs = [];

        this.rowLabels = [];
        this.rowActions = [];
        this.pasteButtons = [];
        for (let r = 0; r < this.gridRows; r++) {
            const rowEl = document.createElement('div');
            rowEl.className = 'hex-grid-row';
            // left hashtag label
            const label = document.createElement('div');
            label.className = 'row-label';
            label.textContent = '#';
            rowEl.appendChild(label);
            this.rowLabels.push(label);
            const rowCells = [];
            for (let c = 0; c < this.gridCols; c++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                rowEl.appendChild(cell);
                rowCells.push(cell);
            }

            // right-side paste action
            const action = document.createElement('div');
            action.className = 'row-action';
            const pasteBtn = document.createElement('button');
            pasteBtn.type = 'button';
            pasteBtn.className = 'paste-btn has-tooltip';
            pasteBtn.setAttribute('aria-label','Paste');
            const svgNS = 'http://www.w3.org/2000/svg';
            const pasteSvg = document.createElementNS(svgNS, 'svg');
            pasteSvg.setAttribute('class', 'icon icon--sm');
            pasteSvg.setAttribute('viewBox', '0 0 15 15');
            const use = document.createElementNS(svgNS, 'use');
            use.setAttribute('href', '#icon-paste');
            pasteSvg.appendChild(use);
            pasteBtn.appendChild(pasteSvg);
            action.appendChild(pasteBtn);
            rowEl.appendChild(action);
            this.rowActions.push(action);
            this.pasteButtons.push(pasteBtn);

            this.gridEl.appendChild(rowEl);
            this.gridCellRefs.push(rowCells);
        }
        this.updateCaret();
        this.updateRowLabels();
        this.updatePasteAction();
        this.attachPasteHandlers();
        // focus handling: click grid focuses keyboard capture
        this.gridEl.tabIndex = 0;
        this.gridEl.addEventListener('focus', () => { this.gridFocused = true; });
        this.gridEl.addEventListener('blur',  () => { this.gridFocused = false; });
        // paste event listener for all paste operations (Ctrl+V, right-click, menu, etc.)
        // Remove old listener first to prevent duplicates
        this.gridEl.removeEventListener('paste', this.handlePaste);
        this.gridEl.addEventListener('paste', this.handlePaste);
        safeFocus(this.gridEl);
    }

    updateCaret() {
        // highlight current cell
        this.gridCellRefs.flat().forEach(cell => cell.classList.remove('grid-current'));
        if (this.currentRow < this.gridRows && this.currentCol < this.gridCols) {
            this.gridCellRefs[this.currentRow][this.currentCol].classList.add('grid-current');
        }
    }

    handleKeydown = (e) => {
        if (this.gameOver || this.isAnimating) return;
        // accept input anywhere; if user is typing in another field, ignore
        const active = document.activeElement;
        const isTypingInInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (isTypingInInput && active !== this.gridEl) return;

        const key = e.key.toUpperCase();
        if (/^[0-9A-F]$/.test(key)) {
            if (this.currentCol < this.gridCols) {
                this.setCell(this.currentRow, this.currentCol, key);
                this.currentCol++;
                if (this.currentCol >= this.gridCols) this.currentCol = this.gridCols;
                this.updateCaret();
            }
            e.preventDefault();
        } 
        else if (e.key === 'Backspace') {
            if (this.currentCol > 0) {
                this.currentCol--;
                this.setCell(this.currentRow, this.currentCol, '');
                this.updateCaret();
            }
            e.preventDefault();
        } 
        else if (e.key === 'Enter') {
            this.submitGuess();
            e.preventDefault();
        }
    }

    handlePaste = async (e) => {
        if (this.gameOver || this.isAnimating) return;
        
        // Prevent default paste behavior
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        
        try {
            let text;
            // Try to get text from paste event first, fallback to clipboard API
            if (e && e.clipboardData) {
                text = e.clipboardData.getData('text');
            } else {
                text = await navigator.clipboard.readText();
            }
            
            const hex = (text || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 6);
            if (!hex) return;
            
            // Fill the current row with the pasted hex
            for (let i = 0; i < this.gridCols; i++) {
                const ch = hex[i] || '';
                this.setCell(this.currentRow, i, ch);
            }
            
            // Update cursor position to end of pasted content
            const lastCol = Math.min(hex.length, this.gridCols);
            this.currentCol = Math.max(0, lastCol);
            this.updateCaret();
            safeFocus(this.gridEl);
        } catch (err) {
            if (typeof window.showToast === 'function') {
                window.showToast('Clipboard access failed');
            }
        }
    }

    setCell(r, c, ch) {
        const cell = this.gridCellRefs[r][c];

        // Ensure there is a <span class="char"> inside the cell
        let span = cell.querySelector('.char');
        if (!span) {
            span = document.createElement('span');
            span.className = 'char';
            // keep existing text if any
            const existing = cell.textContent || '';
            cell.textContent = '';
            span.textContent = existing;
            cell.appendChild(span);
        }

        const prev = span.textContent || '';
        span.textContent = ch || '';

        if (ch) {
            cell.classList.add('filled');
        } 
        else {
            cell.classList.remove('filled');
        }

        // Pop only when typing/pasting a NEW non-empty char
        if (ch && ch !== prev) {
            triggerPop(cell);
        }
    }

    getCurrentGuess() {
        const chars = [];
        for (let c = 0; c < this.gridCols; c++) {
            chars.push(this.gridCellRefs[this.currentRow][c].textContent || '');
        }
        return chars.join('');
    }

    lockCurrentRow() {
        const rowCells = this.gridCellRefs[this.currentRow];
        rowCells.forEach(cell => cell.parentElement.classList.add('grid-row-locked'));
    }
    
    lockRow(rowIndex) {
        const rowCells = this.gridCellRefs[rowIndex];
        if (rowCells) {
            rowCells.forEach(cell => cell.parentElement.classList.add('grid-row-locked'));
        }
    }
    
    showWaitForRevealNotification() {
        // Show toast notification
        if (typeof window.showToast === 'function') {
            window.showToast('Wait for color reveal to finish!');
        }
        // Shake the current row
        const currentRowEl = this.gridCellRefs[this.currentRow]?.[0]?.parentElement;
        if (currentRowEl) {
            currentRowEl.classList.remove('shake');
            // Force reflow to restart animation
            void currentRowEl.offsetWidth;
            currentRowEl.classList.add('shake');
            setTimeout(() => {
                currentRowEl.classList.remove('shake');
            }, 500);
        }
    }

    clearCurrentRowBuffer() {
        // nothing to clear visually; advance to next row
        this.currentRow++;
        this.currentCol = 0;
        this.updateCaret();
        this.updateRowLabels();
        this.updatePasteAction();
    }

    updateRowLabels() {
        // Hide non-colored labels
        this.rowLabels.forEach((lbl) => {
            if (!lbl.classList.contains('colored')) {
                lbl.classList.remove('visible');
            }
        });
        // Show current row's label
        if (this.currentRow < this.rowLabels.length) {
            const lbl = this.rowLabels[this.currentRow];
            lbl.classList.add('visible');
            lbl.style.color = ''; // reset to default
        }
    }
    colorizeRowLabel(rowIndex, hex) {
        if (rowIndex < 0 || rowIndex >= this.rowLabels.length) return;
        const lbl = this.rowLabels[rowIndex];
        lbl.classList.add('visible', 'colored');
        lbl.style.color = `#${hex}`;
    }
    
    updatePasteAction() {
        this.rowActions.forEach((el, idx) => {
            // Hide paste button if game is over, otherwise show for current row
            el.classList.toggle('visible', idx === this.currentRow && !this.gameOver);
        });
    }
    attachPasteHandlers() {
        this.pasteButtons.forEach((btn, idx) => {
            btn.onclick = async () => {
                if (this.gameOver || this.isAnimating || idx !== this.currentRow) return;
                await this.handlePaste();
            };
        });
    }

    initializeTimerText() {
        // Set the initial timer text to show the duration for the current attempt
        const duration = this.baseDuration + (this.currentAttempt - 1) * 500;
        const seconds = (duration / 1000).toFixed(1);
        this.timerText.textContent = `Color reveal will be visible for ${seconds}s`;
    }

    setupOnScreenKeyboard() {
        this.keyboardEl = document.getElementById('hexKeyboard');
        if (!this.keyboardEl) return;
        this.keyboardEl.addEventListener('click', (e) => {
            if (this.gameOver || this.isAnimating) return;
            const btn = e.target.closest('.key-btn');
            if (!btn) return;
            const action = btn.dataset.action || '';
            const key = (btn.dataset.key || '').toUpperCase();
            
            if (action === 'enter') {
                this.submitGuess();
                return;
            }
            if (action === 'backspace') {
                   if (this.currentCol > 0) {
                    this.currentCol--;
                    this.setCell(this.currentRow, this.currentCol, '');
                    this.updateCaret();
                }
                return;
            }
            if (/^[0-9A-F]$/.test(key)) {
                if (this.currentCol < this.gridCols) {
                    this.setCell(this.currentRow, this.currentCol, key);
                    this.currentCol = Math.min(this.currentCol + 1, this.gridCols);
                    this.updateCaret();
                }
            }
        });
    }

    setupEventListeners() {
        this.colorDisplay.addEventListener('click', () => this.showColor());
                
        // Custom color picker event listeners
        this.setupColorPickerListeners();
    }
            
    setupColorPickerListeners() {
        // Canvas click/drag
        let isDraggingCanvas = false;
        this.colorCanvas.addEventListener('mousedown', (e) => {
            isDraggingCanvas = true;
            this.updateCanvasPosition(e);
        });
                
        document.addEventListener('mousemove', (e) => {
            if (isDraggingCanvas) {
                this.updateCanvasPosition(e);
            }
            if (isDraggingHue) {
                this.updateHuePosition(e);
            }
        });
                
        document.addEventListener('mouseup', () => {
            isDraggingCanvas = false;
            isDraggingHue = false;
        });
                
        // Hue slider click/drag
        let isDraggingHue = false;
        this.hueSlider.addEventListener('mousedown', (e) => {
            isDraggingHue = true;
            this.updateHuePosition(e);
        });

        // 1) Block bad keys _before_ they ever enter the field
        this.hexInputField.addEventListener("keydown", e => {
            // allow navigation / copy-paste etc.
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            // only block single‐char keys that aren't 0–9 or A–F
            if (e.key.length === 1 && !/^[0-9A-Fa-f]$/.test(e.key)) {
                e.preventDefault();
            }
        });

        // Hex input field
        this.hexInputField.addEventListener('input', (e) => {
            const input = e.target;
            // save where the caret was
            const pos = input.selectionStart;
            // filter + uppercase
            const filtered = input.value
                .replace(/[^0-9A-Fa-f]/g, '')
                .toUpperCase();
            input.value = filtered;
            // put the caret back where it was
            input.setSelectionRange(pos, pos);

            if (filtered.length === 6) {
                this.updateFromHex(filtered);
            }
        });
                
        // Copy button
        // --- helpers for tooltip text swap ---
        function setCopied(btn, text = "Copied!") {
            // remember prior label so we can restore it later
            if (!btn.dataset.prevLabel) {
                btn.dataset.prevLabel = btn.getAttribute("aria-label") || "Copy";
            }
            btn.setAttribute("aria-label", text);

            // show tooltip even if the user isn't hovering (keyboard click)
            btn.classList.add("show-tooltip");
        }
        function restoreLabel(btn) {
            btn.classList.remove("show-tooltip");
            btn.setAttribute("aria-label", btn.dataset.prevLabel || "Copy");
            delete btn.dataset.prevLabel;
        }
        // --- inside setupColorPickerListeners ---
        this.copyBtn.addEventListener('click', async () => {
            const hexValue = (this.hexInputField.value || '')
                .toUpperCase()
                .replace(/[^0-9A-F]/g, '')
                .slice(0, 6);
            const text = hexValue.startsWith('#') ? hexValue : ('#' + hexValue);
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(text);
                    setCopied(this.copyBtn, "Copied!");
                    return;
                }
                throw new Error('Clipboard API unavailable');
            } 
            catch {
                // Fallback only if needed (may be deprecated, but still works today)
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    // Avoid scroll jump on focus
                    try { ta.focus({ preventScroll: true }); } catch { ta.focus(); }
                    ta.select();
                    // eslint-disable-next-line deprecation/deprecation
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    setCopied(this.copyBtn, "Copied!");
                } 
                catch {
                    setCopied(this.copyBtn, "Press ⌘C / Ctrl+C");
                }
            }
        });
        // Revert only when the user stops hovering or the button loses focus
        this.copyBtn.addEventListener("pointerleave", () => restoreLabel(this.copyBtn));
        this.copyBtn.addEventListener("blur", () => restoreLabel(this.copyBtn));
                
        // Initialize color picker
        this.currentHue = 0;
        this.currentSaturation = 1;
        this.currentValue = 1;
        this.updateColorPicker();
    }
            
    updateCanvasPosition(e) {
        const rect = this.colorCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                
        this.canvasCursor.style.left = x + 'px';
        this.canvasCursor.style.top = y + 'px';
                
        // Calculate saturation and brightness (value)
        this.currentSaturation = x / rect.width;
        this.currentValue = 1 - (y / rect.height);
                
        this.updateColorFromHSV();
    }
            
    updateHuePosition(e) {
        const rect = this.hueSlider.getBoundingClientRect();
        const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
                
        this.hueCursor.style.top = y + 'px';
                
        // Calculate hue (0-360)
        this.currentHue = (y / rect.height) * 360;
                
        // Update canvas background
        const hueColor = `hsl(${this.currentHue}, 100%, 50%)`;
        this.colorCanvas.style.background = `linear-gradient(to right, #fff, ${hueColor})`;
                
        this.updateColorFromHSV();
    }
            
    updateColorFromHSV() {
        // Convert HSV to RGB
        const h = this.currentHue / 360;
        const s = this.currentSaturation;
        const v = this.currentValue;
                
        const c = v * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = v - c;
                
        let r, g, b;
        if (h < 1/6) {
            r = c; g = x; b = 0;
        } else if (h < 2/6) {
            r = x; g = c; b = 0;
        } else if (h < 3/6) {
            r = 0; g = c; b = x;
        } else if (h < 4/6) {
            r = 0; g = x; b = c;
        } else if (h < 5/6) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }
                
        r = (r + m);
        g = (g + m);
        b = (b + m);
                
        // Convert to 0-255 range
        r = Math.round(r * 255);
        g = Math.round(g * 255);
        b = Math.round(b * 255);
                
        // Convert to hex
        const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
                
        // Update UI
        this.colorPreview.style.backgroundColor = `#${hex}`;
        this.hexInputField.value = hex;
    }
            
    updateFromHex(hex) {
        // Convert hex to RGB
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;
                
        // Convert RGB to HSV
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
                
        let h, s, v = max;
                
        if (delta === 0) {
            h = 0;
            s = 0;
        } else {
            s = delta / max;
                    
            switch (max) {
                case r: h = (g - b) / delta + (g < b ? 6 : 0); break;
                case g: h = (b - r) / delta + 2; break;
                case b: h = (r - g) / delta + 4; break;
            }
            h /= 6;
        }
                
        // Update internal state
        this.currentHue = h * 360;
        this.currentSaturation = s;
        this.currentValue = v;
                
        // Update UI positions
        const huePos = (this.currentHue / 360) * this.hueSlider.offsetHeight;
        this.hueCursor.style.top = huePos + 'px';
                
        const canvasX = this.currentSaturation * this.colorCanvas.offsetWidth;
        const canvasY = (1 - this.currentValue) * this.colorCanvas.offsetHeight;
        this.canvasCursor.style.left = canvasX + 'px';
        this.canvasCursor.style.top = canvasY + 'px';
                
        // Update canvas background
        const hueColor = `hsl(${this.currentHue}, 100%, 50%)`;
        this.colorCanvas.style.background = `linear-gradient(to right, #fff, ${hueColor})`;
                
        // Update preview
        this.colorPreview.style.backgroundColor = `#${hex}`;
    }

    generateRandomColor() {
        return Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0').toUpperCase();
    }

    showColor() {
        if (this.colorVisible || this.gameOver || this.hasRevealedThisAttempt) return;
                
        this.colorVisible = true;
        this.hasRevealedThisAttempt = true;
        this.colorDisplay.style.background = `#${this.targetColor}`;
        this.colorDisplay.classList.remove('hidden');
        this.colorDisplay.textContent = '';
        this.colorDisplay.classList.add('disabled');
                
        // Calculate duration: increases with each attempt
        const duration = this.baseDuration + (this.currentAttempt - 1) * 500;
                
        // Clear timer text after clicking
        this.timerText.textContent = '';
                
        this.startTimer(duration);
        
        // Save state immediately after revealing color
        if (this.mode === 'daily') {
            this.saveDailyGameState();
        }
                
        setTimeout(() => {
            if (!this.gameOver) {
                this.colorDisplay.classList.add('hidden');
                this.colorDisplay.textContent = 'Submit a guess to reveal again!';
                this.colorVisible = false;
                // Keep timer bar empty after color is hidden
                this.timerFill.style.transition = '';
                this.timerFill.style.width = '0%';
                
                // Save state after timer expires
                if (this.mode === 'daily') {
                    this.saveDailyGameState();
                }
            }
        }, duration);
    }

    startTimer(duration) {
        this.timerFill.style.transition = `width ${duration}ms linear`;
        requestAnimationFrame(() => {
            this.timerFill.style.width = '0%';
        });
    }

    submitGuess() {
        if (this.gameOver || this.isAnimating) return;
        // Block submission if modal is open
        if (document.body.classList.contains('modal-open')) return;
        // Do not allow guesses while the reveal timer is active
        if (this.colorVisible) {
            this.showWaitForRevealNotification();
            return;
        }
        const guess = this.getCurrentGuess();
        
        // Validation with toast notification and shake animation
        if (guess.length < 6) {
            // Show toast notification
            if (typeof window.showToast === 'function') {
                window.showToast('Hexcode is too short');
            }
            // Shake the current row
            const currentRowEl = this.gridCellRefs[this.currentRow][0]?.parentElement;
            if (currentRowEl) {
                currentRowEl.classList.remove('shake');
                // Force reflow to restart animation
                void currentRowEl.offsetWidth;
                currentRowEl.classList.add('shake');
                // Remove shake class after animation completes
                setTimeout(() => {
                    currentRowEl.classList.remove('shake');
                }, 500);
            }
            return;
        }
        
        if (!/^[0-9A-F]{6}$/.test(guess)) {
            if (typeof window.showToast === 'function') {
                window.showToast('Invalid characters in hexcode');
            }
            // Shake the current row
            const currentRowEl = this.gridCellRefs[this.currentRow][0]?.parentElement;
            if (currentRowEl) {
                currentRowEl.classList.remove('shake');
                void currentRowEl.offsetWidth;
                currentRowEl.classList.add('shake');
                setTimeout(() => {
                    currentRowEl.classList.remove('shake');
                }, 500);
            }
            return;
        }
        
        // Calculate and store color error for this guess (after validation passes)
        const colorError = this.calculateColorError(guess, this.targetColor);
        this.guessHistory.push({
            hex: guess,
            colorError: colorError
        });

        // lock the row UI
        this.lockCurrentRow();
        
        // Set animation flag to prevent input during animation
        this.isAnimating = true;
                
        // Process the guess animation first
        this.processGuess(guess);
        
        // Reset reveal ability for next attempt AFTER animation completes
        // Animation timing: last cell starts at 5*140ms=700ms, animation duration is 360ms = 1060ms total
        setTimeout(() => {
            this.isAnimating = false; // Allow input again
            if (!this.gameOver) {
                this.hasRevealedThisAttempt = false;
                this.colorDisplay.classList.remove('disabled');
                if (!this.colorVisible) {
                    this.colorDisplay.textContent = 'Click to reveal color!';
                }
            }
        }, 1100); // Wait for all animations to complete
        this.colorizeRowLabel(this.currentRow, guess);
        this.clearCurrentRowBuffer();
        
        // Save game state after animations complete (colors are applied with delays)
        if (this.mode === 'daily') {
            // Wait for all cell animations to complete before saving
            // Last cell starts at 5 * 140ms = 700ms, then color applied at +180ms = 880ms
            setTimeout(() => {
                this.saveDailyGameState();
            }, 1000); // Wait 1 second to be safe
        }

        if (guess === this.targetColor) {
            this.endGame(true);
        } 
        else if (this.currentAttempt >= this.maxAttempts) {
            this.endGame(false);
        } 
        else {
            this.currentAttempt++;
            if (this.currentAttemptSpan) {
                this.currentAttemptSpan.textContent = this.currentAttempt;
            }
            // Update timer text for the new attempt
            const duration = this.baseDuration + (this.currentAttempt - 1) * 500;
            const seconds = (duration / 1000).toFixed(1);
            this.timerText.textContent = `Color reveal will be visible for ${seconds}s`;
            // Refill the timer bar for next attempt
            this.timerFill.style.transition = '';
            this.timerFill.style.width = '100%';
        }
    }

    processGuess(guess) {
        const rowCells = this.gridCellRefs[this.currentRow];

        // 1) Compute statuses up front, but don't apply yet
        const statuses = [];
        for (let i = 0; i < 6; i++) {
            const isCorrect = (guess[i] === this.targetColor[i]);
            const isClose   = this.isClose(guess[i], this.targetColor[i]);
            statuses.push(isCorrect ? 'correct' : (isClose ? 'close' : 'wrong'));
        }

        // 2) Ensure each cell's character is wrapped for crisp control (doesn't change visuals)
        rowCells.forEach((cell) => {
            const ch = cell.textContent || '';
            if (!cell.querySelector('.char')) {
                cell.textContent = '';
                const span = document.createElement('span');
                span.className = 'char';
                span.textContent = ch;
                cell.appendChild(span);
            }
        });

        // 3) Staggered jump + mid-air color swap
        const perCellDelay = 140;    // ms between tiles (retro snappiness)
        const animDuration = 360;    // must match CSS jump-8bit duration
        const swapAt       = Math.floor(animDuration * 0.5); // “coming down”

        rowCells.forEach((cell, i) => {
            // clean previous state classes
            cell.classList.remove('correct', 'close', 'wrong', 'reveal-jump', 'land-pop');

            setTimeout(() => {
                // start jump
                cell.classList.add('reveal-jump');

                // halfway down: apply status color
                setTimeout(() => {
                    cell.classList.remove('correct', 'close', 'wrong'); // safety
                    cell.classList.add(statuses[i]);
                }, swapAt);

                // end: clear jump, add a tiny landing pop (optional)
                setTimeout(() => {
                    cell.classList.remove('reveal-jump');
                    cell.classList.add('land-pop');
                    setTimeout(() => cell.classList.remove('land-pop'), 140); // clean up
                }, animDuration);
            }, i * perCellDelay);
        });
    }

    isClose(guessChar, targetChar) {
        const guessValue = parseInt(guessChar, 16);
        const targetValue = parseInt(targetChar, 16);
        return Math.abs(guessValue - targetValue) <= 1;
    }

    endGame(won) {
        this.gameOver = true;
        this.timerText.textContent = '';
        // Always empty the timer bar when game ends
        this.timerFill.style.transition = '';
        this.timerFill.style.width = '0%';
        // Hide paste actions
        this.updatePasteAction();
        
        // Calculate animation completion time
        // 6 cells × 140ms delay + 360ms animation = ~1200ms total
        const animationDelay = (6 * 140) + 360 + 100; // Add 100ms buffer
        
        // Delay color reveal until animations complete
        setTimeout(() => {
            this.colorDisplay.style.background = `#${this.targetColor}`;
            this.colorDisplay.classList.remove('hidden', 'disabled'); // Remove disabled to prevent gray text
            this.colorDisplay.textContent = `#${this.targetColor}`;
            this.colorDisplay.classList.add('game-ended');
            
            // Save state after setting the color
            if (this.mode === 'daily') {
                this.saveDailyGameState();
            }
            
            // Show random win/loss message
            if (typeof window.showToast === 'function') {
                const message = this.getRandomGameMessage(won, this.currentAttempt);
                window.showToast(message, 3000);
            }
            
            // Show stats modal after a short delay
            setTimeout(() => {
                if (typeof window.showStatsModal === 'function') {
                    // In daily mode, pass true to show timer instead of play button
                    const isDailyCompleted = this.mode === 'daily';
                    window.showStatsModal(isDailyCompleted);
                }
            }, 2500); // 2.5 second delay to see color and toast
        }, animationDelay);
        
        // Update statistics
        this.updateGameStats(won);
        
        // Save daily completion and final state if in daily mode
        if (this.mode === 'daily') {
            this.saveDailyCompletion(won);
            this.saveDailyGameState(); // Save final state with completed grid
        }
    }

    getRandomGameMessage(won, attempts) {
        if (won) {
            const winMessages = [
                'Genius!',
                'Magnificent!',
                'Impressive!',
                'Splendid!',
                'Great job!',
                'Well done!',
                'Perfect!',
                'Brilliant!',
                'Outstanding!',
                'Excellent!'
            ];
            
            // Special messages for attempts
            if (attempts === 1) return 'Unbelievable!';
            if (attempts === 2) return 'Incredible!';
            if (attempts === 6) return 'Phew! Close one!';
            
            return winMessages[Math.floor(Math.random() * winMessages.length)];
        } else {
            const lossMessages = [
                'Better luck next time!',
                'So close!',
                'Nice try!',
                "Don't give up!",
                'Almost!',
                'Practice makes perfect!',
                'Keep at it!',
                "You'll get it next time!"
            ];
            return lossMessages[Math.floor(Math.random() * lossMessages.length)];
        }
    }

    updateGameStats(won) {
        const storageKey = `gameStats_${this.mode}`;
        const savedStats = localStorage.getItem(storageKey);
        let stats = savedStats ? JSON.parse(savedStats) : {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            currentStreak: 0,
            maxStreak: 0,
            totalGuessesAllGames: 0,
            totalColorErrorAllGuesses: 0,
            totalErrorReduction: 0
        };

        stats.gamesPlayed++;
        
        if (won) {
            stats.gamesWon++;
            stats.currentStreak++;
            stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
        } else {
            stats.gamesLost++;
            stats.currentStreak = 0;
        }

        // Process all guesses from this game
        stats.totalGuessesAllGames += this.guessHistory.length;
        
        // Add up color error for every guess
        this.guessHistory.forEach(guess => {
            stats.totalColorErrorAllGuesses += guess.colorError;
        });

        // Calculate error reduction (improvement) between consecutive guesses
        for (let i = 1; i < this.guessHistory.length; i++) {
            const previousError = this.guessHistory[i - 1].colorError;
            const currentError = this.guessHistory[i].colorError;
            const reduction = previousError - currentError; // Positive = improvement, negative = getting worse
            stats.totalErrorReduction += reduction; // Allow negative values
        }

        localStorage.setItem(storageKey, JSON.stringify(stats));
    }

    calculateColorError(guess, target) {
        // Simple RGB distance calculation
        const r1 = parseInt(guess.substr(0, 2), 16);
        const g1 = parseInt(guess.substr(2, 2), 16);
        const b1 = parseInt(guess.substr(4, 2), 16);
        
        const r2 = parseInt(target.substr(0, 2), 16);
        const g2 = parseInt(target.substr(2, 2), 16);
        const b2 = parseInt(target.substr(4, 2), 16);
        
        return Math.sqrt(
            Math.pow(r2 - r1, 2) +
            Math.pow(g2 - g1, 2) +
            Math.pow(b2 - b1, 2)
        );
    }

    updateColorPicker() {
        // Initialize with default color
        this.updateFromHex('FF5733');
    }

    restartGame() {
        // In daily mode, don't allow restart if already completed today
        if (this.mode === 'daily' && this.dailyAlreadyCompleted) {
            return; // Already completed today, can't play again
        }
        
        // In unlimited mode, pick a new color
        if (this.mode === 'unlimited') {
            this.targetColor = this.generateRandomColor();
        }
        this.currentAttempt = 1;
        this.gameOver = false;
        this.colorVisible = false;
        this.hasRevealedThisAttempt = false;
        this.isAnimating = false; // Reset animation flag
        this.guessHistory = []; // Reset guess history for new game
                
        this.colorDisplay.classList.add('hidden');
        this.colorDisplay.classList.remove('disabled');
        this.colorDisplay.textContent = 'Click to reveal color!';
        if (this.currentAttemptSpan) {
            this.currentAttemptSpan.textContent = '1';
        }
        this.guessesContainer.innerHTML = '';
        this.colorDisplay.classList.remove('game-ended');
                
        // Rebuild grid
        this.buildGrid();
        this.updateRowLabels();
        this.updatePasteAction();
        this.setupOnScreenKeyboard();
                
        // Reset timer bar to full for new game
        this.timerFill.style.transition = '';
        this.timerFill.style.width = '100%';
                
        // Initialize timer text for new game
        this.initializeTimerText();
    }

    checkDailyCompletion() {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const saved = localStorage.getItem('dailyCompletion');
        
        if (!saved) return { completed: false };
        
        try {
            const data = JSON.parse(saved);
            return {
                completed: data.date === today,
                won: data.won || false
            };
        } catch (e) {
            return { completed: false };
        }
    }

    saveDailyCompletion(won) {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        localStorage.setItem('dailyCompletion', JSON.stringify({
            date: today,
            won: won
        }));
    }
    
    saveDailyGameState() {
        if (this.mode !== 'daily') return;
        
        const today = new Date().toISOString().split('T')[0];
        const gameState = {
            date: today,
            targetColor: this.targetColor,
            currentAttempt: this.currentAttempt,
            currentRow: this.currentRow,
            currentCol: this.currentCol,
            gameOver: this.gameOver,
            colorVisible: this.colorVisible,
            hasRevealedThisAttempt: this.hasRevealedThisAttempt,
            guessHistory: this.guessHistory,
            gridState: [] // Store the visual grid state
        };
        
        // Save grid state (all rows)
        for (let row = 0; row < this.maxAttempts; row++) {
            const rowState = [];
            for (let col = 0; col < 6; col++) {
                const cell = this.gridCellRefs[row]?.[col];
                if (cell) {
                    rowState.push({
                        text: cell.textContent,
                        class: cell.className
                    });
                }
            }
            gameState.gridState.push(rowState);
        }
        
        localStorage.setItem('dailyGameState', JSON.stringify(gameState));
    }
    
    loadDailyGameState() {
        if (this.mode !== 'daily') return;
        
        const saved = localStorage.getItem('dailyGameState');
        if (!saved) return;
        
        try {
            const gameState = JSON.parse(saved);
            const today = new Date().toISOString().split('T')[0];
            
            // Only restore if it's today's game
            if (gameState.date !== today) {
                localStorage.removeItem('dailyGameState');
                return;
            }
            
            // Restore game state
            this.targetColor = gameState.targetColor;
            this.currentAttempt = gameState.currentAttempt;
            this.currentRow = gameState.currentRow !== undefined ? gameState.currentRow : (this.currentAttempt - 1);
            this.currentCol = gameState.currentCol !== undefined ? gameState.currentCol : 0;
            this.gameOver = gameState.gameOver;
            this.colorVisible = gameState.colorVisible || false;
            this.hasRevealedThisAttempt = gameState.hasRevealedThisAttempt || false;
            this.guessHistory = gameState.guessHistory || [];
            
            // Restore grid visual state
            if (gameState.gridState) {
                for (let row = 0; row < gameState.gridState.length; row++) {
                    const rowState = gameState.gridState[row];
                    let hasContent = false;
                    
                    for (let col = 0; col < rowState.length; col++) {
                        const cell = this.gridCellRefs[row]?.[col];
                        const cellState = rowState[col];
                        if (cell && cellState) {
                            cell.textContent = cellState.text;
                            // Restore class but remove animation classes to prevent glitch
                            const cleanClass = cellState.class.replace(/\b(reveal-jump|land-pop)\b/g, '').trim();
                            cell.className = cleanClass;
                            if (cellState.text) hasContent = true;
                        }
                    }
                    
                    // Lock completed rows (rows before current row)
                    if (hasContent && row < this.currentRow) {
                        this.lockRow(row);
                    }
                }
            }
            
            // Restore row labels with colors
            for (let i = 0; i < this.guessHistory.length; i++) {
                const guess = this.guessHistory[i];
                if (guess && guess.hex) {
                    this.colorizeRowLabel(i, guess.hex);
                }
            }
            
            // Update UI to reflect loaded state
            if (this.currentAttemptSpan) {
                this.currentAttemptSpan.textContent = this.currentAttempt;
            }
            
            // Update caret position and row labels
            this.updateCaret();
            this.updateRowLabels();
            
            // Restore color display state
            if (this.gameOver) {
                this.colorDisplay.textContent = '#' + this.targetColor;
                this.colorDisplay.style.background = '#' + this.targetColor;
                this.colorDisplay.classList.remove('hidden');
                this.colorDisplay.classList.add('game-ended');
                // Ensure timer bar and text are empty for completed games
                this.timerFill.style.transition = '';
                this.timerFill.style.width = '0%';
                this.timerText.textContent = '';
                // Hide paste button for completed games
                this.updatePasteAction();
            } else if (this.colorVisible) {
                // Color was being shown when user left - hide it but keep revealed state
                this.colorDisplay.classList.add('hidden');
                this.colorDisplay.textContent = 'Submit a guess to reveal again!';
                this.colorDisplay.style.background = ''; // Clear background
                this.colorVisible = false; // Reset visible flag
                this.colorDisplay.classList.add('disabled');
                // Reset timer bar and text to empty
                this.timerFill.style.transition = '';
                this.timerFill.style.width = '0%';
                this.timerText.textContent = '';
            } else if (this.hasRevealedThisAttempt) {
                // User has already revealed color this attempt, disable the button
                this.colorDisplay.classList.add('disabled');
                this.colorDisplay.textContent = 'Submit a guess to reveal again!';
                this.colorDisplay.style.background = ''; // Clear background
                // Reset timer bar and text to empty since color was already revealed
                this.timerFill.style.transition = '';
                this.timerFill.style.width = '0%';
                this.timerText.textContent = '';
            }
        } catch (e) {
            console.error('Failed to load daily game state:', e);
            localStorage.removeItem('dailyGameState');
        }
    }
}

// Start the app when the page loads (server-driven daily color)
window.addEventListener('DOMContentLoaded', async () => {
    // --- Decide mode (path vs local file query) ---
    const isFile = location.protocol === 'file:';
    const pathIsUnlimited  = /\/unlimited\/?$/.test(location.pathname);
    const queryIsUnlimited = new URLSearchParams(location.search).get('mode') === 'unlimited';
    const MODE = isFile ? (queryIsUnlimited ? 'unlimited' : 'daily')
                        : (pathIsUnlimited ? 'unlimited' : 'daily');

    // --- Boot mode ---
    let gameInstance;
    if (MODE === 'unlimited') {
        gameInstance = new HexColorWordle({ mode: 'unlimited' });
    } 
    else {
        try {
            const dailyHex = await fetchDailyHex();
            gameInstance = new HexColorWordle({ mode: 'daily', targetColor: dailyHex });
        } 
        catch {
            // graceful fallback if the API isn't reachable in dev
            gameInstance = new HexColorWordle({ mode: 'unlimited' });
        }
    }
    
    // Make game instance globally accessible for restart
    window.gameInstance = gameInstance;

    // --- Mode buttons: navigate correctly in both environments ---
    const modeBtns = document.querySelectorAll('.mode-container .mode-btn');
    const [dailyBtn, unlimitedBtn] = [modeBtns[0], modeBtns[1]];
    if (dailyBtn && unlimitedBtn) {
        const toDaily = isFile ? 'index.html' : '/';
        const toUnlim = isFile ? 'unlimited/index.html' : '/unlimited';

        dailyBtn.addEventListener('click', (e) => { e.preventDefault(); location.href = toDaily; });
        unlimitedBtn.addEventListener('click', (e) => { e.preventDefault(); location.href = toUnlim; });

        dailyBtn.classList.toggle('active', MODE === 'daily');
        unlimitedBtn.classList.toggle('active', MODE === 'unlimited');

        if (MODE === 'daily') {
            dailyBtn.setAttribute('aria-current', 'page');
            unlimitedBtn.removeAttribute('aria-current');
        } 
        else {
            unlimitedBtn.setAttribute('aria-current', 'page');
            dailyBtn.removeAttribute('aria-current');
        }
    }

    // --- Dark mode toggle ---
    const darkModeBtn  = document.getElementById("darkModeToggle");
    if (darkModeBtn) {
        // Sync body with html on page load (in case html already has dark class from inline script)
        const htmlIsDark = document.documentElement.classList.contains('dark');
        if (htmlIsDark) {
            document.body.classList.add('dark');
            darkModeBtn.setAttribute("aria-label", "Light Mode");
        } else {
            darkModeBtn.setAttribute("aria-label", "Dark Mode");
        }

        darkModeBtn.addEventListener("click", () => {
            // Toggle both html and body
            const isDark = document.documentElement.classList.toggle("dark");
            document.body.classList.toggle("dark", isDark);
            
            // Save preference to localStorage
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            // Update aria-label
            darkModeBtn.setAttribute("aria-label", isDark ? "Light Mode" : "Dark Mode");
        });
    }

    // --- Toast Notification System ---
    const toastContainer = document.getElementById('toastContainer');
    
    function showToast(message, duration = 2000) {
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        
        toastContainer.appendChild(toast);
        
        // Force reflow to ensure initial state is rendered
        void toast.offsetWidth;
        
        // Trigger show animation
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        // Auto-hide after duration
        setTimeout(() => {
            toast.classList.remove('show');
            toast.classList.add('hide');
            
            // Remove from DOM after animation
            setTimeout(() => {
                toast.remove();
            }, 200);
        }, duration);
    }
    
    // Make showToast globally accessible
    window.showToast = showToast;

    // --- Reusable Modal System ---
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    const modalOverlay = modal?.querySelector('.modal-overlay');
    
    let focusTrapHandler = null;

    function setupFocusTrap() {
        // Remove old handler if exists
        if (focusTrapHandler) {
            document.removeEventListener('keydown', focusTrapHandler);
        }
        
        // Get all focusable elements within the modal
        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = modal.querySelectorAll(focusableSelectors);
        const focusableArray = Array.from(focusableElements).filter(el => {
            // Filter out hidden or disabled elements
            return el.offsetParent !== null && !el.disabled;
        });
        
        if (focusableArray.length === 0) return;
        
        const firstFocusable = focusableArray[0];
        const lastFocusable = focusableArray[focusableArray.length - 1];
        
        // Focus the first element
        firstFocusable.focus();
        
        // Create trap handler
        focusTrapHandler = (e) => {
            if (e.key !== 'Tab') return;
            
            const modalIsOpen = document.body.classList.contains('modal-open');
            if (!modalIsOpen) return;
            
            if (e.shiftKey) {
                // Shift+Tab: if on first element, wrap to last
                if (document.activeElement === firstFocusable) {
                    e.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                // Tab: if on last element, wrap to first
                if (document.activeElement === lastFocusable) {
                    e.preventDefault();
                    firstFocusable.focus();
                }
            }
        };
        
        document.addEventListener('keydown', focusTrapHandler);
    }

    function openModal(content) {
        if (!modal || !modalBody) return;
        modalBody.innerHTML = content;
        modal.style.display = 'flex';
        
        // Block background interactions
        document.body.classList.add('modal-open');
        
        // Attach close button handler (now inside modal content)
        const modalClose = modalBody.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', closeModal);
        }
        
        // Setup focus trap: find all focusable elements in modal
        setupFocusTrap();
        
        // Force reflow to ensure initial state is rendered
        void modal.offsetWidth;
        
        // Trigger animation on next frame
        requestAnimationFrame(() => {
            modal.classList.add('open');
        });
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('open');
        
        // Re-enable background interactions
        document.body.classList.remove('modal-open');
        
        // Remove focus trap handler
        if (focusTrapHandler) {
            document.removeEventListener('keydown', focusTrapHandler);
            focusTrapHandler = null;
        }
        
        // Wait for animation to finish before hiding
        setTimeout(() => {
            modal.style.display = 'none';
            // Refocus the grid after modal closes so paste works again
            if (window.gameInstance && window.gameInstance.gridEl) {
                safeFocus(window.gameInstance.gridEl);
            }
        }, 200); // matches transition duration
    }

    // Overlay click handler
    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeModal);
    }

    // Global keyboard event blocker for modal
    // Prevents all keyboard input to background when modal is open
    document.addEventListener('keydown', (e) => {
        const modalIsOpen = document.body.classList.contains('modal-open');
        
        if (modalIsOpen) {
            // Allow Escape to close modal from anywhere
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
                return;
            }
            
            // Check if the event target is inside the modal
            const isInsideModal = modal && modal.contains(e.target);
            
            // Special handling for Enter key - only allow if clicking a button/link inside modal
            if (e.key === 'Enter' && !isInsideModal) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // Also stop other listeners on same element
                return;
            }
            
            // Block all other keyboard events targeting elements outside the modal
            if (!isInsideModal) {
                e.preventDefault(); // Prevent default browser behavior (Tab navigation, Enter activation)
                e.stopPropagation(); // Prevent event from reaching game handlers
            }
        }
    }, true); // Use capture phase to intercept before game handlers
    
    // Also block paste events when modal is open
    document.addEventListener('paste', (e) => {
        const modalIsOpen = document.body.classList.contains('modal-open');
        if (modalIsOpen) {
            e.stopPropagation();
        }
    }, true); // Use capture phase
    
    // Block scroll/wheel events on background when modal is open
    document.addEventListener('wheel', (e) => {
        const modalIsOpen = document.body.classList.contains('modal-open');
        if (modalIsOpen && !modal.contains(e.target)) {
            e.preventDefault();
        }
    }, { passive: false, capture: true });

    // Info/Help button
    const infoBtn = document.getElementById('infoButton');
    if (infoBtn) {
        infoBtn.addEventListener('click', () => {
            const helpContent = `
                <div class="title">
                    HOW TO PLAY
                    <button class="modal-close" id="modalClose" aria-label="Close">
                        <svg class="icon" aria-hidden="true">
                            <use href="#icon-cancel"></use>
                        </svg>
                    </button>
                </div>
                <div style="font-size: 12px; line-height: 1.8;">
                    <p style="margin-bottom: 15px;"><strong>HexGuessr</strong> is a color guessing game based on Wordle using hexcodes.</p>
                    <p style="margin-bottom: 10px;"><span class="number-box">1</span> Click the square to briefly reveal the target color.</p>
                    <p style="margin-bottom: 10px;"><span class="number-box">2</span> Enter your 6-digit hexcode guess and press Enter.</p>
                    <p style="margin-bottom: 10px;"><span class="number-box">3</span> Color feedback:</p>
                    <ul class="color-list">
                        <li style="margin-bottom: 8px;"><span style="display: inline-block; width: 20px; height: 20px; background: #4CAF50; vertical-align: middle; margin-right: 8px;"></span> = Correct digit in correct position</li>
                        <li style="margin-bottom: 8px;"><span style="display: inline-block; width: 20px; height: 20px; background: #FFC107; vertical-align: middle; margin-right: 8px;"></span> = Digit is off by 1 (e.g. 7 or 9 when answer is 8)</li>
                        <li style="margin-bottom: 8px;"><span style="display: inline-block; width: 20px; height: 20px; background: #f44336; vertical-align: middle; margin-right: 8px;"></span> = Digit is off by more than 1</li>
                    </ul>
                    <p style="margin-bottom: 10px;"><span class="number-box">4</span> You have 6 attempts – good luck!</p>
                    <p style="margin-top: 20px; font-size: 10px; opacity: 0.7;">New to hexcodes? Click <a href="https://www.w3schools.com/html/html_colors_hex.asp" target="_blank" style="color: inherit; text-decoration: underline;">here</a>.</p>
                </div>
            `;
            openModal(helpContent);
        });
    }

    // Stats button
    const statsBtn = document.getElementById('statsButton');
    if (statsBtn) {
        statsBtn.addEventListener('click', () => {
            // Check if daily mode game is completed (either loaded as completed or just finished)
            const isDailyCompleted = window.gameInstance?.mode === 'daily' && window.gameInstance?.gameOver;
            showStatsModal(isDailyCompleted);
        });
    }

    function showStatsModal(dailyAlreadyCompleted = false) {
        const mode = window.gameInstance?.mode || 'daily';
        const stats = getStats(mode);
        const isGameOver = window.gameInstance?.gameOver || false;
        
        // Determine button content
        let buttonContent;
        if (dailyAlreadyCompleted && mode === 'daily') {
            // Show countdown timer for next daily color
            buttonContent = '<div id="nextColorTimer" class="stats-button" style="cursor: default;">Next Color: <span id="timerDisplay">--:--:--</span></div>';
        } else if (isGameOver) {
            // Game is over - show "PLAY AGAIN!" button that restarts
            buttonContent = '<button class="stats-button" onclick="window.closeModalAndPlay()">PLAY AGAIN!</button>';
        } else {
            // Game is in progress - show "PLAY!" button that just closes modal
            buttonContent = '<button class="stats-button" onclick="closeModal()">PLAY!</button>';
        }
        
        const statsContent = `
            <div class="title">
                STATISTICS
                <button class="modal-close" id="modalClose" aria-label="Close">
                    <svg class="icon" aria-hidden="true">
                        <use href="#icon-cancel"></use>
                    </svg>
                </button>
            </div>
            <div style="padding: 10px;">
                <div class="stats-grid" id="statsGrid">
                    ${createStatCell(stats.gamesPlayed, 'Games Played', 0)}
                    ${createStatCell(stats.gamesWon, 'Games Won', 1)}
                    ${createStatCell(stats.gamesLost, 'Games Lost', 2)}
                    ${createStatCell(stats.winPercentage + '%', 'Win Pct.', 3)}
                    ${createStatCell(stats.currentStreak, 'Current Streak', 4)}
                    ${createStatCell(stats.maxStreak, 'Max Streak', 5)}
                    ${createStatCell(stats.avgGuesses, 'Avg. Guesses', 6)}
                    ${createStatCell(stats.avgColorAccuracy, 'Guess Accuracy', 7)}
                    ${createStatCell(stats.guessEfficiency, 'Guess Efficiency', 8)}
                </div>
                ${buttonContent}
                <p class="stats-note">* Statistics shown for ${mode} mode</p>
            </div>
        `;
        openModal(statsContent);
        
        // Start countdown timer if daily already completed
        if (dailyAlreadyCompleted && mode === 'daily') {
            startNextColorTimer();
        }
        
        // Initialize easter egg
        initStatsGridEasterEgg();
    }
    
    function startNextColorTimer() {
        const timerDisplay = document.getElementById('timerDisplay');
        if (!timerDisplay) return;
        
        function updateTimer() {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCHours(24, 0, 0, 0); // Next midnight UTC
            
            const diff = tomorrow - now;
            
            // Check if new day has arrived (timer hit zero or went negative)
            if (diff <= 0) {
                // Replace timer with "PLAY NEW DAILY" button
                const timerContainer = document.getElementById('nextColorTimer');
                if (timerContainer) {
                    timerContainer.innerHTML = '<button class="stats-button" onclick="window.location.reload()">PLAY NEW DAILY COLOR!</button>';
                }
                
                // Stop the interval since we've shown the button
                clearInterval(interval);
                return;
            }
            
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            
            timerDisplay.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        
        // Clear interval when modal is closed
        const modal = document.getElementById('modal');
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style' && modal.style.display === 'none') {
                    clearInterval(interval);
                    observer.disconnect();
                }
            });
        });
        observer.observe(modal, { attributes: true });
    }

    function createStatCell(value, label, index) {
        return `
            <div class="stat-cell" data-index="${index}">
                <span class="stat-value">${value}</span>
                <span class="stat-label">${label}</span>
            </div>
        `;
    }
    
    function initStatsGridEasterEgg() {
        const grid = document.getElementById('statsGrid');
        if (!grid) return;
        
        const cells = grid.querySelectorAll('.stat-cell');
        if (cells.length !== 9) return;
        
        // Easter egg colors
        const colors = [
            '#F33800', // red
            '#FF8200', // orange
            '#FFC500', // yellow
            '#72CA00', // lime
            '#009442', // green
            '#00BFBD', // cyan
            '#006CAD', // blue
            '#5E2AA6', // indigo
            '#B40075'  // violet
        ];
        
        let usedColors = new Set();
        let isAnimating = false;
        
        cells.forEach((cell, idx) => {
            cell.style.cursor = 'pointer';
            
            cell.addEventListener('click', () => {
                if (isAnimating) return;
                isAnimating = true;
                usedColors.clear();
                
                // Start cascade from clicked cell and reset flag when done
                cascadeColors(idx, cells, colors, usedColors, () => {
                    isAnimating = false;
                });
            });
        });
    }
    
    function cascadeColors(startIndex, cells, colors, usedColors, onComplete) {
        const visited = new Set();
        const queue = [startIndex];
        visited.add(startIndex);
        
        function getAdjacentIndices(index) {
            const row = Math.floor(index / 3);
            const col = index % 3;
            const adjacent = [];
            
            // Up, down, left, right
            if (row > 0) adjacent.push(index - 3);
            if (row < 2) adjacent.push(index + 3);
            if (col > 0) adjacent.push(index - 1);
            if (col < 2) adjacent.push(index + 1);
            
            return adjacent;
        }
        
        // Build the full queue first using BFS
        let queueIndex = 0;
        while (queueIndex < queue.length) {
            const currentIndex = queue[queueIndex];
            const adjacent = getAdjacentIndices(currentIndex);
            
            adjacent.forEach(adjIndex => {
                if (!visited.has(adjIndex)) {
                    visited.add(adjIndex);
                    queue.push(adjIndex);
                }
            });
            
            queueIndex++;
        }
        
        // Now animate each cell in order with delays
        queue.forEach((index, i) => {
            const delay = i * 150;
            
            setTimeout(() => {
                const cell = cells[index];
                
                // Get available colors
                const availableColors = colors.filter(c => !usedColors.has(c));
                if (availableColors.length === 0) return;
                
                // Pick random color from available
                const color = availableColors[Math.floor(Math.random() * availableColors.length)];
                usedColors.add(color);
                
                // Change background color and add active class FIRST (instant)
                cell.style.background = color;
                cell.classList.add('easter-egg-active');
                
                // Then apply pop animation
                cell.classList.add('land-pop');
                setTimeout(() => cell.classList.remove('land-pop'), 120);
                
                // Call completion callback after last cell
                if (i === queue.length - 1) {
                    setTimeout(() => {
                        if (onComplete) onComplete();
                    }, 300);
                }
            }, delay);
        });
    }

    function getStats(mode = 'daily') {
        const storageKey = `gameStats_${mode}`;
        const savedStats = localStorage.getItem(storageKey);
        const defaultStats = {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            winPercentage: 0,
            currentStreak: 0,
            maxStreak: 0,
            avgGuesses: '--',
            avgColorAccuracy: '--',
            accuracyLabel: '',
            guessEfficiency: '--',
            efficiencyLabel: ''
        };
        
        if (!savedStats) return defaultStats;
        
        try {
            const stats = JSON.parse(savedStats);
            // Calculate derived stats
            stats.winPercentage = stats.gamesPlayed > 0 
                ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
                : 0;
            // Count all guesses across all games (wins and losses)
            stats.avgGuesses = stats.gamesPlayed > 0 
                ? (stats.totalGuessesAllGames / stats.gamesPlayed).toFixed(1)
                : '--';
            
            // Convert color error to accuracy percentage
            const maxColorDistance = 441.67; // sqrt(255^2 * 3)
            if (stats.totalGuessesAllGames > 0) {
                const avgError = stats.totalColorErrorAllGuesses / stats.totalGuessesAllGames;
                const accuracyPercent = ((1 - (avgError / maxColorDistance)) * 100);
                stats.avgColorAccuracy = accuracyPercent.toFixed(1) + '%';
                
                // Add descriptor
                if (accuracyPercent >= 95) stats.accuracyLabel = 'Extremely Accurate';
                else if (accuracyPercent >= 90) stats.accuracyLabel = 'Very Accurate';
                else if (accuracyPercent >= 80) stats.accuracyLabel = 'Accurate';
                else if (accuracyPercent >= 70) stats.accuracyLabel = 'Pretty Good';
                else if (accuracyPercent >= 60) stats.accuracyLabel = 'Decent';
                else stats.accuracyLabel = 'Needs Work';
            } else {
                stats.avgColorAccuracy = '--';
                stats.accuracyLabel = '';
            }
            
            // Convert error reduction to percentage improvement
            if (stats.totalGuessesAllGames > 1) {
                const avgReduction = stats.totalErrorReduction / (stats.totalGuessesAllGames - stats.gamesPlayed);
                const improvementPercent = ((avgReduction / maxColorDistance) * 100);
                const sign = improvementPercent > 0 ? '+' : '';
                stats.guessEfficiency = sign + improvementPercent.toFixed(1) + '%';
                
                // Add descriptor
                if (improvementPercent >= 5) stats.efficiencyLabel = 'Excellent Progress';
                else if (improvementPercent >= 3) stats.efficiencyLabel = 'Great Progress';
                else if (improvementPercent >= 2) stats.efficiencyLabel = 'Good Progress';
                else if (improvementPercent >= 1) stats.efficiencyLabel = 'Steady Progress';
                else if (improvementPercent > 0) stats.efficiencyLabel = 'Slow Progress';
                else stats.efficiencyLabel = 'Inconsistent';
            } else {
                stats.guessEfficiency = '--';
                stats.efficiencyLabel = '';
            }
            return stats;
        } catch (e) {
            return defaultStats;
        }
    }

    function saveStats(stats, mode = 'daily') {
        const storageKey = `gameStats_${mode}`;
        localStorage.setItem(storageKey, JSON.stringify(stats));
    }

    window.closeModalAndPlay = function() {
        closeModal();
        // Restart the game
        if (window.gameInstance && typeof window.gameInstance.restartGame === 'function') {
            window.gameInstance.restartGame();
        }
    };

    // Make stats and modal functions globally accessible
    window.showStatsModal = showStatsModal;
    window.getStats = getStats;
    window.saveStats = saveStats;
    window.closeModal = closeModal;
});
