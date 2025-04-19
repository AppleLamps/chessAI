/**
 * chessboard.js
 * Handles rendering and interaction with the chess board in the DOM
 */

class ChessBoard {
    constructor(elementId, options = {}) {
        this.element = document.getElementById(elementId);
        this.options = {
            showCoordinates: options.showCoordinates || false,
            pieceTheme: options.pieceTheme || 'assets/pieces/{piece}.svg'
        };
        
        this.board = []; // 2D array to store DOM elements
        this.pieces = {}; // Map of pieces by position
        this.selectedSquare = null;
        this.orientation = 'white'; // 'white' or 'black'
        
        // Initialize the board
        this._createBoard();
    }
    
    /**
     * Create the chess board in the DOM
     * @private
     */
    _createBoard() {
        // Clear any existing board
        this.element.innerHTML = '';
        this.board = [];
        
        // Create 8x8 grid of squares
        for (let row = 7; row >= 0; row--) {
            const boardRow = [];
            for (let col = 0; col < 8; col++) {
                const square = document.createElement('div');
                const isWhite = (row + col) % 2 === 0;
                square.className = `square ${isWhite ? 'white-square' : 'black-square'}`;
                square.dataset.row = row;
                square.dataset.col = col;
                square.dataset.position = this._indexToPosition(row, col);
                
                // Add coordinates if option is enabled
                if (this.options.showCoordinates) {
                    if (col === 0) {
                        const rankCoord = document.createElement('div');
                        rankCoord.className = 'coordinate rank';
                        rankCoord.textContent = row + 1;
                        square.appendChild(rankCoord);
                    }
                    if (row === 0) {
                        const fileCoord = document.createElement('div');
                        fileCoord.className = 'coordinate file';
                        fileCoord.textContent = String.fromCharCode(97 + col); // 'a' through 'h'
                        square.appendChild(fileCoord);
                    }
                }
                
                this.element.appendChild(square);
                boardRow.push(square);
            }
            this.board.unshift(boardRow); // Add row to the beginning to match chess notation
        }
    }
    
    /**
     * Convert row, col indices to algebraic position (e.g., 'e4')
     * @param {number} row - Row index (0-7)
     * @param {number} col - Column index (0-7)
     * @returns {string} Position in algebraic notation
     * @private
     */
    _indexToPosition(row, col) {
        const file = String.fromCharCode(97 + col); // 'a' through 'h'
        const rank = row + 1;
        return `${file}${rank}`;
    }
    
    /**
     * Convert algebraic position to row, col indices
     * @param {string} position - Position in algebraic notation (e.g., 'e4')
     * @returns {Object} Object with row and col properties
     * @private
     */
    _positionToIndex(position) {
        const file = position.charCodeAt(0) - 97; // 'a' is 97 in ASCII
        const rank = parseInt(position.charAt(1), 10) - 1;
        return { row: rank, col: file };
    }
    
    /**
     * Set the board position based on a FEN string
     * @param {string} fen - FEN string
     */
    setPosition(fen) {
        // Clear existing pieces
        this.pieces = {};
        
        // Remove all piece elements from the board
        const pieceElements = this.element.querySelectorAll('.piece');
        pieceElements.forEach(piece => piece.remove());
        
        // Parse FEN position (first part before the first space)
        const fenPosition = fen.split(' ')[0];
        let row = 7;
        let col = 0;
        
        for (let i = 0; i < fenPosition.length; i++) {
            const char = fenPosition.charAt(i);
            
            if (char === '/') {
                row--;
                col = 0;
            } else if ('12345678'.indexOf(char) !== -1) {
                col += parseInt(char, 10);
            } else {
                this.addPiece(char, this._indexToPosition(row, col));
                col++;
            }
        }
    }
    
    /**
     * Add a piece to the board
     * @param {string} piece - Piece character from FEN notation (e.g., 'P', 'n')
     * @param {string} position - Position in algebraic notation (e.g., 'e4')
     */
    addPiece(piece, position) {
        const { row, col } = this._positionToIndex(position);
        
        // Map FEN piece characters to piece codes
        // Lowercase = black, Uppercase = white
        const pieceMapping = {
            'p': 'bp', 'r': 'br', 'n': 'bn', 'b': 'bb', 'q': 'bq', 'k': 'bk',
            'P': 'wp', 'R': 'wr', 'N': 'wn', 'B': 'wb', 'Q': 'wq', 'K': 'wk'
        };
        
        // Get piece code (e.g., 'wp' for white pawn)
        const pieceCode = pieceMapping[piece];
        if (!pieceCode) {
            console.error(`Invalid piece character: ${piece}`);
            return;
        }
        
        // Create the piece element
        const pieceElement = document.createElement('div');
        pieceElement.className = 'piece';
        pieceElement.dataset.piece = piece;
        pieceElement.dataset.position = position;
        
        // Set the piece image
        const pieceImage = this.options.pieceTheme.replace('{piece}', pieceCode);
        pieceElement.style.backgroundImage = `url(${pieceImage})`;
        
        // Log the piece URL for debugging
        console.log(`Adding piece ${piece} at ${position} with image: ${pieceImage}`);
        
        // Add piece to the board
        this.board[row][col].appendChild(pieceElement);
        
        // Track the piece
        this.pieces[position] = {
            element: pieceElement,
            piece: piece
        };
    }
    
    /**
     * Remove a piece from the board
     * @param {string} position - Position in algebraic notation (e.g., 'e4')
     */
    removePiece(position) {
        if (this.pieces[position]) {
            this.pieces[position].element.remove();
            delete this.pieces[position];
        }
    }
    
    /**
     * Move a piece on the board
     * @param {string} from - Starting position (e.g., 'e2')
     * @param {string} to - Ending position (e.g., 'e4')
     * @param {string} promotion - Piece to promote to, if applicable (e.g., 'q')
     */
    movePiece(from, to, promotion = null) {
        if (!this.pieces[from]) {
            console.error(`No piece at position ${from}`);
            return;
        }
        
        // Remove any piece at the destination
        this.removePiece(to);
        
        const piece = this.pieces[from].piece;
        const { row: toRow, col: toCol } = this._positionToIndex(to);
        
        // Handle promotion
        if (promotion) {
            const color = piece.toLowerCase() === piece ? 'b' : 'w';
            this.removePiece(from);
            this.addPiece(color === 'w' ? promotion.toUpperCase() : promotion, to);
        } else {
            // Update the piece's position
            const pieceElement = this.pieces[from].element;
            pieceElement.dataset.position = to;
            this.board[toRow][toCol].appendChild(pieceElement);
            
            // Update tracking
            this.pieces[to] = this.pieces[from];
            delete this.pieces[from];
        }
    }
    
    /**
     * Highlight a square on the board
     * @param {string} position - Position in algebraic notation (e.g., 'e4')
     * @param {string} className - CSS class to add for highlighting
     */
    highlightSquare(position, className = 'highlight') {
        const { row, col } = this._positionToIndex(position);
        this.board[row][col].classList.add(className);
    }
    
    /**
     * Remove highlighting from all squares
     * @param {string} className - CSS class to remove
     */
    clearHighlights(className = 'highlight') {
        const squares = this.element.querySelectorAll(`.square.${className}`);
        squares.forEach(square => square.classList.remove(className));
    }
    
    /**
     * Flip the board orientation
     */
    flip() {
        this.orientation = this.orientation === 'white' ? 'black' : 'white';
        this.element.classList.toggle('flipped');
    }
    
    /**
     * Apply visual effect for check
     * @param {string} kingPosition - Position of the king in check
     */
    showCheck(kingPosition) {
        this.highlightSquare(kingPosition, 'check');
    }
    
    /**
     * Apply visual effect for checkmate or draw
     * @param {string} result - 'checkmate' or 'draw'
     */
    showGameOver(result) {
        this.element.classList.add('game-over');
        this.element.classList.add(result);
    }
    
    /**
     * Clear all game over effects
     */
    clearGameOver() {
        this.element.classList.remove('game-over', 'checkmate', 'draw');
    }
    
    /**
     * Create and add piece images for board initialization
     * This preloads the piece images for smoother display
     */
    preloadPieceImages() {
        const pieces = ['wk', 'wq', 'wr', 'wb', 'wn', 'wp', 'bk', 'bq', 'br', 'bb', 'bn', 'bp'];
        const preloadDiv = document.createElement('div');
        preloadDiv.style.display = 'none';
        
        pieces.forEach(piece => {
            const img = document.createElement('img');
            img.src = this.options.pieceTheme.replace('{piece}', piece);
            preloadDiv.appendChild(img);
        });
        
        document.body.appendChild(preloadDiv);
        setTimeout(() => preloadDiv.remove(), 1000); // Remove after images are likely loaded
    }
}
