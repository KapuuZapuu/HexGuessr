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
                
        this.initializeElements();
        this.setupEventListeners();
        this.updateColorPicker();
        this.initializeTimerText(); // Initialize the timer text
        this.buildGrid();
        this.setupOnScreenKeyboard();
        // keyboard input
        document.addEventListener('keydown', this.handleKeydown)

        // Info button listener will be handled by modal system
    }

    initializeElements() {
        this.colorDisplay = document.getElementById('colorDisplay');
        this.guessesContainer = document.getElementById('guessesContainer');
        this.gameOverDiv = document.getElementById('gameOver');
        this.gameResult = document.getElementById('gameResult');
        this.correctAnswer = document.getElementById('correctAnswer');
        this.restartBtn = document.getElementById('restartBtn');
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
        if (this.gameOver) return;
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
            el.classList.toggle('visible', idx === this.currentRow);
        });
    }
    attachPasteHandlers() {
        this.pasteButtons.forEach((btn, idx) => {
            btn.onclick = async () => {
                if (this.gameOver || idx !== this.currentRow) return;
                try {
                    const text = await navigator.clipboard.readText();
                    const hex = (text || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 6);
                    if (!hex) return;
                    for (let i = 0; i < this.gridCols; i++) {
                        const ch = hex[i] || ''; this.setCell(this.currentRow, i, ch);
                    }
                    const lastCol = Math.min(hex.length, this.gridCols);
                    this.currentCol = Math.max(0, lastCol);
                    this.updateCaret();
                    safeFocus(this.gridEl);
                } catch (e) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Clipboard access failed');
                    }
                }
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
            if (this.gameOver) return;
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
        this.restartBtn.addEventListener('click', () => this.restartGame());
                
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
                
        setTimeout(() => {
            if (!this.gameOver) {
                this.colorDisplay.classList.add('hidden');
                this.colorDisplay.textContent = 'Submit a guess to reveal again!';
                this.colorVisible = false;
                // Keep timer bar empty after color is hidden
                this.timerFill.style.transition = '';
                this.timerFill.style.width = '0%';
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
        if (this.gameOver) return;
        // Do not allow guesses while the reveal timer is active
        if (this.colorVisible) {
            if (typeof window.showToast === 'function') {
                window.showToast('Wait for color reveal to complete');
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

        // lock the row UI
        this.lockCurrentRow();
                
        // Reset reveal ability for next attempt
        this.hasRevealedThisAttempt = false;
        this.colorDisplay.classList.remove('disabled');
        if (!this.colorVisible) {
            this.colorDisplay.textContent = 'Click to reveal color!';
        }
                
        this.processGuess(guess);
        this.colorizeRowLabel(this.currentRow, guess);
        this.clearCurrentRowBuffer();

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
        
        // Calculate animation completion time
        // 6 cells × 140ms delay + 360ms animation = ~1200ms total
        const animationDelay = (6 * 140) + 360 + 100; // Add 100ms buffer
        
        // Delay color reveal until animations complete
        setTimeout(() => {
            this.colorDisplay.style.background = `#${this.targetColor}`;
            this.colorDisplay.classList.remove('hidden');
            this.colorDisplay.textContent = `#${this.targetColor}`;
            this.colorDisplay.classList.add('game-ended');
            
            this.gameResult.textContent = won ? '🎉 Congratulations! You won!' : '😔 Game Over!';
            this.correctAnswer.textContent = `The correct color was: #${this.targetColor}`;
            this.gameOverDiv.style.display = 'block';
            
            // Show random win/loss message
            if (typeof window.showToast === 'function') {
                const message = this.getRandomGameMessage(won, this.currentAttempt);
                window.showToast(message, 3000);
            }
        }, animationDelay);
        
        // Update statistics
        this.updateGameStats(won);
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
        const savedStats = localStorage.getItem('gameStats');
        let stats = savedStats ? JSON.parse(savedStats) : {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            currentStreak: 0,
            maxStreak: 0,
            totalGuesses: 0,
            totalColorError: 0,
            totalErrorReduction: 0
        };

        stats.gamesPlayed++;
        
        if (won) {
            stats.gamesWon++;
            stats.currentStreak++;
            stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
            stats.totalGuesses += this.currentAttempt;
        } else {
            stats.gamesLost++;
            stats.currentStreak = 0;
        }

        // Calculate color error (simple RGB distance for now)
        const lastGuess = this.getCurrentGuess() || this.targetColor;
        const colorError = this.calculateColorError(lastGuess, this.targetColor);
        stats.totalColorError += colorError;

        // Track error reduction per guess (simplified)
        if (this.currentAttempt > 0) {
            stats.totalErrorReduction += (255 / this.currentAttempt); // Simplified metric
        }

        localStorage.setItem('gameStats', JSON.stringify(stats));
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
        // In daily mode, keep the same daily color; in unlimited pick a new one
        if (this.mode === 'unlimited') {
            this.targetColor = this.generateRandomColor();
        }
        this.currentAttempt = 1;
        this.gameOver = false;
        this.colorVisible = false;
        this.hasRevealedThisAttempt = false;
                
        this.colorDisplay.classList.add('hidden');
        this.colorDisplay.classList.remove('disabled');
        this.colorDisplay.textContent = 'Click to reveal color!';
        if (this.currentAttemptSpan) {
            this.currentAttemptSpan.textContent = '1';
        }
        this.guessesContainer.innerHTML = '';
        this.gameOverDiv.style.display = 'none';
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
    if (MODE === 'unlimited') {
        new HexColorWordle({ mode: 'unlimited' });
    } 
    else {
        try {
            const dailyHex = await fetchDailyHex();
            new HexColorWordle({ mode: 'daily', targetColor: dailyHex });
        } 
        catch {
            // graceful fallback if the API isn't reachable in dev
            new HexColorWordle({ mode: 'unlimited' });
        }
    }

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

    function openModal(content) {
        if (!modal || !modalBody) return;
        modalBody.innerHTML = content;
        modal.style.display = 'flex';
        
        // Attach close button handler (now inside modal content)
        const modalClose = modalBody.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', closeModal);
        }
        
        // Trigger animation on next frame
        requestAnimationFrame(() => {
            modal.classList.add('open');
        });
    }

    function closeModal() {
        if (!modal) return;
        modal.classList.remove('open');
        // Wait for animation to finish before hiding
        setTimeout(() => {
            modal.style.display = 'none';
        }, 200); // matches transition duration
    }

    // Overlay click handler
    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeModal);
    }

    // ESC key handler
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal?.style.display === 'flex') {
            closeModal();
        }
    });

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
            showStatsModal();
        });
    }

    function showStatsModal() {
        const stats = getStats();
        const mode = 'daily'; // TODO: detect actual mode
        
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
                <div class="stats-grid">
                    ${createStatCell(stats.gamesPlayed, 'Games Played')}
                    ${createStatCell(stats.gamesWon, 'Games Won')}
                    ${createStatCell(stats.gamesLost, 'Games Lost')}
                    ${createStatCell(stats.winPercentage + '%', 'Win %')}
                    ${createStatCell(stats.currentStreak, 'Current Streak')}
                    ${createStatCell(stats.maxStreak, 'Max Streak')}
                    ${createStatCell(stats.avgGuesses, 'Avg Guesses')}
                    ${createStatCell(stats.avgColorError, 'Avg Color Error')}
                    ${createStatCell(stats.guessEfficiency, 'Guess Efficiency')}
                </div>
                <button class="stats-button" onclick="window.closeModalAndPlay()">PLAY NOW</button>
                <p class="stats-note">* Statistics shown for ${mode} mode</p>
            </div>
        `;
        openModal(statsContent);
    }

    function createStatCell(value, label) {
        return `
            <div class="stat-cell">
                <span class="stat-value">${value}</span>
                <span class="stat-label">${label}</span>
            </div>
        `;
    }

    function getStats() {
        const savedStats = localStorage.getItem('gameStats');
        const defaultStats = {
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            winPercentage: 0,
            currentStreak: 0,
            maxStreak: 0,
            avgGuesses: '--',
            avgColorError: '--',
            guessEfficiency: '--'
        };
        
        if (!savedStats) return defaultStats;
        
        try {
            const stats = JSON.parse(savedStats);
            // Calculate derived stats
            stats.winPercentage = stats.gamesPlayed > 0 
                ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) 
                : 0;
            stats.avgGuesses = stats.gamesWon > 0 
                ? (stats.totalGuesses / stats.gamesWon).toFixed(1)
                : '--';
            stats.avgColorError = stats.gamesPlayed > 0
                ? Math.round(stats.totalColorError / stats.gamesPlayed)
                : '--';
            stats.guessEfficiency = stats.totalGuesses > 0
                ? (stats.totalErrorReduction / stats.totalGuesses).toFixed(1)
                : '--';
            return stats;
        } catch (e) {
            return defaultStats;
        }
    }

    function saveStats(stats) {
        localStorage.setItem('gameStats', JSON.stringify(stats));
    }

    window.closeModalAndPlay = function() {
        closeModal();
        // Optionally start a new game or focus on the game
    };

    // Make stats functions globally accessible
    window.showStatsModal = showStatsModal;
    window.getStats = getStats;
    window.saveStats = saveStats;
});
