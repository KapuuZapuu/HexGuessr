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
});

class HexColorWordle {
    constructor() {
        this.targetColor = this.generateRandomColor();
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

        // Info button listener
        this.infoBtn = document.getElementById('infoButton');
        this.infoBtn.addEventListener('click', () => {
            alert(
                '🎨 Hex Color Wordle Instructions:\n\n' +
                '1) Click the square to briefly reveal the target color.\n' +
                '2) Enter your 6‑digit HEX guess and press Submit.\n' +
                '3) Green = correct digit, Yellow = off by 1, Red = wrong.\n' +
                '4) You have 6 attempts – good luck!'
            );
        });
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
        this.gridEl.focus();
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
            // Block submitting while the color is revealed & timer is running
            if (this.colorVisible) { e.preventDefault(); return; }
            this.submitGuess();
            e.preventDefault();
        }
    }

    setCell(r, c, ch) {
        const cell = this.gridCellRefs[r][c];
        cell.textContent = ch;
        if (ch) cell.classList.add('filled')
        else cell.classList.remove('filled');
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
                    this.gridEl.focus();
                } catch (e) {
                    alert('Clipboard access failed. Try HTTPS and grant permission.');
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
                // Block submitting while the color is revealed & timer is running
                if (this.colorVisible) return;
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
        this.copyBtn.addEventListener('click', () => {
            const hexValue = (this.hexInputField.value || '')
            .toUpperCase()
            .replace(/[^0-9A-F]/g, '')
            .slice(0, 6);

            navigator.clipboard.writeText(hexValue).catch(() => {
                // Fallback for older browsers (execCommand is deprecated but works on old Safari)
                const ta = document.createElement('textarea');
                ta.value = hexValue;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            });
        });
                
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
        if (this.colorVisible) return;
        const guess = this.getCurrentGuess();
        if (guess.length !== 6 || !/^[0-9A-F]{6}$/.test(guess)) {
            alert('Please enter a valid 6-digit hex color (0-9, A-F)');
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
        for (let i = 0; i < 6; i++) {
            const cell = rowCells[i];
            // clear any old status classes
            cell.classList.remove('correct','close','wrong');
            if (guess[i] === this.targetColor[i]) {
                cell.classList.add('correct');
            } else if (this.isClose(guess[i], this.targetColor[i])) {
                cell.classList.add('close');
            } else {
                cell.classList.add('wrong');
            }
        }
    }

    isClose(guessChar, targetChar) {
        const guessValue = parseInt(guessChar, 16);
        const targetValue = parseInt(targetChar, 16);
        return Math.abs(guessValue - targetValue) <= 1;
    }

    endGame(won) {
        this.gameOver = true;
        this.colorDisplay.style.background = `#${this.targetColor}`;
        this.colorDisplay.classList.remove('hidden');
        this.colorDisplay.textContent = `#${this.targetColor}`;
        this.colorDisplay.classList.add('game-ended');
        this.timerText.textContent = '';
                
        this.gameResult.textContent = won ? '🎉 Congratulations! You won!' : '😔 Game Over!';
        this.correctAnswer.textContent = `The correct color was: #${this.targetColor}`;
        this.gameOverDiv.style.display = 'block';        
    }

    updateColorPicker() {
        // Initialize with default color
        this.updateFromHex('FF5733');
    }

    restartGame() {
        this.targetColor = this.generateRandomColor();
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

// Start the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    // Start the game
    new HexColorWordle();

    // Dark mode toggle (no icon swapping needed with SVG)
    const darkModeBtn  = document.getElementById("darkModeToggle");
    darkModeBtn.addEventListener("click", () => {
        const isDark = document.body.classList.toggle("dark");
        darkModeBtn.setAttribute(
            "aria-label",
            isDark ? "Light Mode" : "Dark Mode"
        );
    });

    // Animation pause/resume
    const toggleAnimationsBtn = document.getElementById("toggleAnimations");
    toggleAnimationsBtn.addEventListener("click", () => {
        const isPaused = document.body.classList.toggle("paused");
        toggleAnimationsBtn.setAttribute(
            "aria-label",
            isPaused ? "Resume Animations" : "Pause Animations"
        );
    });
});
