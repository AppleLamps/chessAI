/**
 * game.js
 * Handles the game logic and AI orchestration for Windsurf Chess
 */

class Game {
    constructor() {
        // Chess game state
        // Initialize with the starting FEN string
        this.chess = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); 
        console.log('[Debug] Inside constructor, this.chess:', this.chess);
        console.log('[Debug] Constructor - typeof this.chess.game_over:', typeof this.chess.game_over);
        
        // UI elements - Using external chessboard.js library
        this.board = Chessboard('chess-board', {
            draggable: false, // AI makes moves, not user
            position: 'start', // Initialize with starting position
            pieceTheme: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg', // Use lichess pieces
            showNotation: true
        });
        
        // Log to console for debugging
        console.log('External chessboard.js initialized');
        console.log('Current FEN:', this.chess.fen()); // FEN from chess.js engine
        
        // DOM elements
        this.elements = {
            chessBoard: document.getElementById('chess-board'),
            startGame: document.getElementById('start-game'),
            pauseGame: document.getElementById('pause-game'),
            resetGame: document.getElementById('reset-game'),
            movesContainer: document.getElementById('moves-container'),
            gameStatus: document.getElementById('game-status'),
            thinkingContent: document.getElementById('thinking-content'),
            whiteThinking: document.getElementById('white-thinking'),
            blackThinking: document.getElementById('black-thinking'),
            whiteModel: document.getElementById('white-model'),
            blackModel: document.getElementById('black-model')
        };
        
        // Game state
        this.gameState = {
            status: 'idle', // 'idle', 'running', 'paused', 'finished'
            currentPlayer: 'white',
            moveHistory: [],
            winner: null,
            result: null
        };
        
        // Settings
        this.settings = null;
        
        // Timers
        this.moveTimer = null;
        
        // AI state
        this.retryCount = 0;
        
        // Bind events
        this.bindEvents();
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        this.elements.startGame.addEventListener('click', () => this.startGame());
        this.elements.pauseGame.addEventListener('click', () => this.pauseGame());
        this.elements.resetGame.addEventListener('click', () => this.resetGame());
    }
    
    /**
     * Initialize the game
     * @param {Settings} settings - Settings instance
     */
    initialize(settings) {
        this.settings = settings;
        this.resetGame();
        this.updatePlayerInfo();
    }
    
    /**
     * Start the game
     */
    startGame() {
        // Validate settings
        const validation = this.settings.validateSettings();
        if (!validation.valid) {
            const errorMessage = 'Cannot start game: ' + validation.errors.join(', ');
            this.settings.showNotification(errorMessage, 'error');
            return;
        }
        
        if (this.gameState.status === 'idle' || this.gameState.status === 'paused') {
            this.gameState.status = 'running';
            this.updateControlButtons();
            this.updateGameStatus('Game started');
            
            // Start game if it's new
            if (this.gameState.moveHistory.length === 0) {
                this.makeNextMove();
            }
        }
    }
    
    /**
     * Pause the game
     */
    pauseGame() {
        if (this.gameState.status === 'running') {
            this.gameState.status = 'paused';
            this.updateControlButtons();
            this.updateGameStatus('Game paused');
            
            // Clear any pending move
            if (this.moveTimer) {
                clearTimeout(this.moveTimer);
                this.moveTimer = null;
            }
        }
    }
    
    /**
     * Reset the game
     */
    resetGame() {
        // Clear any pending move
        if (this.moveTimer) {
            clearTimeout(this.moveTimer);
            this.moveTimer = null;
        }
        
        // Reset game state
        this.chess.reset();
        this.gameState = {
            status: 'idle',
            currentPlayer: 'white',
            moveHistory: [],
            winner: null,
            result: null
        };
        
        // Reset UI
        this.board.position('start');
        this.elements.movesContainer.innerHTML = '';
        this.elements.thinkingContent.textContent = '';
        this.updateControlButtons();
        this.updateGameStatus('Game reset');
        
        // Hide thinking indicators
        this.elements.whiteThinking.classList.remove('active');
        this.elements.blackThinking.classList.remove('active');
        
        // Reset retry counter
        this.retryCount = 0;
    }
    
    /**
     * Make the next AI move
     */
    async makeNextMove() {
        if (this.gameState.status !== 'running') {
            return;
        }
        
        const player = this.gameState.currentPlayer;
        let playerSettings = this.settings.getPlayerSettings(player);
        const generalSettings = this.settings.getGeneralSettings();
        
        // Show thinking indicator
        this.elements[`${player}Thinking`].classList.add('active');
        
        // Clear previous thinking content
        this.elements.thinkingContent.textContent = '';
        
        // Update game status
        this.updateGameStatus(`${player.charAt(0).toUpperCase() + player.slice(1)} to move...`);
        
        try {
            // Call AI model to get the move
            const currentFen = this.chess.fen();
            console.log(`[AI Call - ${player}] Sending FEN: ${currentFen}`);
            
            // Get all legal moves in the current position
            const legalMoves = this.chess.moves();
            
            // Check if we need to provide legal moves in the prompt (on retry)
            if (this.retryCount > 0) {
                console.log(`[Enhanced Prompt] Providing legal moves to AI on retry ${this.retryCount}`);
            }
            
            // Get move history
            const moveHistory = this.gameState.moveHistory.map(m => m.san);
            
            // Call the AI model
            const aiResponse = await callAIModel(
                playerSettings.provider,
                this.chess,
                moveHistory,
                {
                    apiKey: playerSettings.apiKey,
                    model: playerSettings.model,
                    temperature: generalSettings.temperature || 0.7,
                    maxTokens: generalSettings.maxTokens || 2048,
                    streaming: generalSettings.streaming,
                    userPrompt: playerSettings.customPrompt,
                    retryCount: this.retryCount,
                    // Always pass legal moves to the AI model
                    legalMoves: legalMoves
                }
            );
            
            console.log(`[AI Response - ${player}] Received:`, aiResponse);
            
            // Extract the move
            const moveString = aiResponse.move;
            
            // Validate and make the move
            const moveResult = this.chess.move(moveString);
            console.log(`[Move Validation - ${player}] Attempting move: '${moveString}'. Result:`, moveResult);
            
            if (moveResult) {
                // Valid move, update the board and history
                this.board.position(this.chess.fen());
                this.updateMoveHistory(moveResult, player);
                this.gameState.moveHistory.push(moveResult);
                
                // Check if the game is over
                this.checkGameStatus();
                
                // Switch player
                this.gameState.currentPlayer = player === 'white' ? 'black' : 'white';
                
                // Reset retry count
                this.retryCount = 0;
                
                // Hide thinking indicator
                this.elements[`${player}Thinking`].classList.remove('active');
                
                // If game is still running, schedule the next move with a delay
                if (this.gameState.status === 'running') {
                    this.moveTimer = setTimeout(() => {
                        this.makeNextMove();
                    }, generalSettings.moveDelay || 1000);
                }
            } else {
                // Invalid move, handle it
                console.log(` [${player.toUpperCase()} AI Error] Invalid move returned: ${moveString}. Retrying...`);
                this.handleInvalidMove(player, moveString);
            }
        } catch (error) {
            console.error(`[${player.toUpperCase()} AI Error]`, error);
            
            // Hide thinking indicator
            // Get a user-friendly error message
            let errorMessage = error.message || 'Unknown error';
            
            // Handle different types of errors
            if (errorMessage.toLowerCase().includes('authentication') || 
                errorMessage.toLowerCase().includes('api key') || 
                errorMessage.toLowerCase().includes('认证失败') ||
                errorMessage.toLowerCase().includes('unauthorized') ||
                errorMessage.toLowerCase().includes('token')) {
                // Authentication error
                console.warn(`${player} player authentication error detected:`, errorMessage);
                this.updateGameStatus(`${player} API authentication error - Please check your API key in settings`);
                this.settings.showNotification('Authentication failed. Please verify your API key in settings.', 'error');
            } else if (errorMessage.toLowerCase().includes('rate limit') || 
                       errorMessage.toLowerCase().includes('too many requests')) {
                // Rate limit error
                console.warn(`${player} player rate limit error:`, errorMessage);
                this.updateGameStatus(`${player} API rate limit reached - Please wait a moment before retrying`);
                this.settings.showNotification('Rate limit reached. Please wait a moment before continuing.', 'warning');
            } else {
                // Other API errors
                console.error(`${player} AI error:`, errorMessage);
                this.updateGameStatus(`${player} AI Error: ${errorMessage}`);
                this.settings.showNotification('An error occurred while making the move. Please try again.', 'error');
            }
            
            // Pause the game so user can address the issue
            this.gameState.status = 'paused';
            this.updateControlButtons();
            
            // Hide thinking indicator
            this.elements[`${player}Thinking`].classList.remove('active');
        }
    }
    
    /**
     * Handle an invalid move from AI
     * @param {string} player - 'white' or 'black'
     * @param {string} moveString - The attempted move
     */
    handleInvalidMove(player, moveString) {
        const generalSettings = this.settings.getGeneralSettings();
        const playerSettings = this.settings.getPlayerSettings(player);
        
        // Log detailed debugging information
        console.log(`[Invalid Move Debug] Player: ${player}, Attempted move: '${moveString}'`);
        console.log(`[Invalid Move Debug] Current FEN: ${this.chess.fen()}`);
        
        // Get simplified legal moves for better logging
        const legalMoves = this.chess.moves({verbose: true});
        const simpleLegalMoves = this.chess.moves();
        console.log(`[Invalid Move Debug] Legal moves:`, legalMoves);
        console.log(`[Invalid Move Debug] Available moves: ${simpleLegalMoves.join(', ')}`);
        
        // Increment retry counter
        this.retryCount++;
        
        // Check if we've reached the max retries
        if (this.retryCount >= generalSettings.maxRetries) {
            this.elements[`${player}Thinking`].classList.remove('active');
            this.updateGameStatus(`${player} made too many invalid moves. Game paused.`);
            this.gameState.status = 'paused';
            this.updateControlButtons();
            this.retryCount = 0;
            return;
        }
        
        // For complex positions, modify request on subsequent retries
        if (this.retryCount > 1) {
            // Increase temperature to get more diverse moves
            playerSettings.temperature = Math.min(playerSettings.temperature + 0.3, 1.0);
            
            // Increase max tokens for more detailed reasoning
            playerSettings.maxTokens = Math.min(playerSettings.maxTokens + 500, 4096);
            
            console.log(`[Retry Strategy] Adjusted parameters: temperature=${playerSettings.temperature}, maxTokens=${playerSettings.maxTokens}`);
        }
        
        // Enrich the prompt with legal moves info for next attempt
        const currentFEN = this.chess.fen();
        const piecePositions = this.describeBoardState();
        
        // Override the default provider request for the next attempt to include board description
        playerSettings.customPrompt = `Current board state (FEN): ${currentFEN}\n\nPiece positions: ${piecePositions}\n\nPrevious invalid move: ${moveString}\n\nLegal moves: ${simpleLegalMoves.join(', ')}\n\nPlease select a valid move from the list of legal moves provided.`;
        
        // Try again with enhanced parameters
        this.updateGameStatus(`${player} made invalid move (${moveString}). Retrying with detailed board information...`);
        this.moveTimer = setTimeout(() => {
            this.makeNextMove();
        }, 1000);
    }
    
    /**
     * Generate a human-readable description of the current board state
     * @returns {string} Description of piece positions
     */
    describeBoardState() {
        const board = this.chess.board();
        let description = [];
        
        // Go through each piece on the board
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece) {
                    const square = String.fromCharCode(97 + col) + (8 - row);
                    const pieceName = this.getPieceName(piece.type, piece.color);
                    description.push(`${pieceName} at ${square}`);
                }
            }
        }
        
        return description.join(', ');
    }
    
    /**
     * Get the full name of a piece based on type and color
     * @param {string} type - Piece type (p, n, b, r, q, k)
     * @param {string} color - Piece color (w, b)
     * @returns {string} Full piece name
     */
    getPieceName(type, color) {
        const colorName = color === 'w' ? 'White' : 'Black';
        let pieceName;
        
        switch (type) {
            case 'p': pieceName = 'pawn'; break;
            case 'n': pieceName = 'knight'; break;
            case 'b': pieceName = 'bishop'; break;
            case 'r': pieceName = 'rook'; break;
            case 'q': pieceName = 'queen'; break;
            case 'k': pieceName = 'king'; break;
            default: pieceName = 'unknown';
        }
        
        return `${colorName} ${pieceName}`;
    }
    
    /**
     * Check the current game status
     */
    checkGameStatus() {
        console.log('[Debug] Inside checkGameStatus, this.chess:', this.chess);
        console.log('[Debug] CheckStatus - typeof this.chess.game_over:', typeof this.chess.game_over);
        if (this.chess.game_over()) {
            this.gameState.status = 'finished';
            this.updateControlButtons();

            // Determine if it was checkmate or draw
            if (this.chess.in_checkmate()) {
                // The player whose turn it *was* is the loser,
                // so the *other* player is the winner.
                const winner = this.gameState.currentPlayer === 'white' ? 'black' : 'white';
                this.gameState.winner = winner;
                this.gameState.result = 'checkmate';
                this.updateGameStatus(`Checkmate! ${winner.charAt(0).toUpperCase() + winner.slice(1)} wins.`);
            } else {
                // Must be a draw (stalemate, threefold repetition, insufficient material, 50-move rule)
                this.gameState.result = 'draw';
                let reason = "Draw";
                if (this.chess.in_stalemate()) reason = "Draw (Stalemate)";
                else if (this.chess.in_threefold_repetition()) reason = "Draw (Threefold Repetition)";
                else if (this.chess.insufficient_material()) reason = "Draw (Insufficient Material)";
                // Note: chess.js v0.10.x doesn't have a specific 50-move rule check, isDraw() covers it.
                this.updateGameStatus(reason);
            }
            return; // Game is over, no need to check for 'in check'
        }
        
        // Check for check (only if game is not over)
        if (this.chess.in_check()) {
            const playerInCheck = this.gameState.currentPlayer; // The player whose turn it is is in check
            this.updateGameStatus(`${playerInCheck.charAt(0).toUpperCase() + playerInCheck.slice(1)} is in check.`);
        } else {
            // Clear status if not in check and game not over
            // Optional: Keep the 'Player to move...' status instead
            // this.updateGameStatus(`${this.gameState.currentPlayer.charAt(0).toUpperCase() + this.gameState.currentPlayer.slice(1)} to move...`);
        }
    }
    
    /**
     * Update the move history display
     * @param {Object} move - Move object from chess.js
     * @param {string} player - 'white' or 'black'
     */
    updateMoveHistory(move, player) {
        const moveCount = Math.ceil(this.gameState.moveHistory.length / 2);
        let moveRow;
        
        if (player === 'white') {
            // Create a new row for white's move
            moveRow = document.createElement('div');
            moveRow.className = 'move-row';
            
            const moveNumber = document.createElement('div');
            moveNumber.className = 'move-number';
            moveNumber.textContent = moveCount + '.';
            
            const whiteMove = document.createElement('div');
            whiteMove.className = 'white-move current-move';
            whiteMove.textContent = move.san;
            whiteMove.dataset.move = JSON.stringify(move);
            
            const blackMove = document.createElement('div');
            blackMove.className = 'black-move';
            blackMove.textContent = '';
            
            moveRow.appendChild(moveNumber);
            moveRow.appendChild(whiteMove);
            moveRow.appendChild(blackMove);
            
            this.elements.movesContainer.appendChild(moveRow);
        } else {
            // Add to the existing row for black's move
            const rows = this.elements.movesContainer.querySelectorAll('.move-row');
            moveRow = rows[rows.length - 1];
            
            if (moveRow) {
                const blackMove = moveRow.querySelector('.black-move');
                const whiteMove = moveRow.querySelector('.white-move');
                
                if (blackMove && whiteMove) {
                    // Remove current-move class from white move
                    whiteMove.classList.remove('current-move');
                    
                    // Update black move
                    blackMove.classList.add('current-move');
                    blackMove.textContent = move.san;
                    blackMove.dataset.move = JSON.stringify(move);
                }
            }
        }
        
        // Scroll to the bottom of the moves container
        this.elements.movesContainer.scrollTop = this.elements.movesContainer.scrollHeight;
    }
    
    /**
     * Update the game status display
     * @param {string} status - Status message
     */
    updateGameStatus(status) {
        this.elements.gameStatus.textContent = status;
    }
    
    /**
     * Update control buttons based on game state
     */
    updateControlButtons() {
        switch (this.gameState.status) {
            case 'idle':
                this.elements.startGame.disabled = false;
                this.elements.pauseGame.disabled = true;
                this.elements.resetGame.disabled = false;
                break;
            case 'running':
                this.elements.startGame.disabled = true;
                this.elements.pauseGame.disabled = false;
                this.elements.resetGame.disabled = false;
                break;
            case 'paused':
                this.elements.startGame.disabled = false;
                this.elements.pauseGame.disabled = true;
                this.elements.resetGame.disabled = false;
                break;
            case 'finished':
                this.elements.startGame.disabled = true;
                this.elements.pauseGame.disabled = true;
                this.elements.resetGame.disabled = false;
                break;
        }
    }
    
    /**
     * Update player info display
     */
    updatePlayerInfo() {
        if (!this.settings) {
            console.error('Settings not available when trying to update player info');
            return;
        }
        
        console.log('Updating player info with settings:', this.settings.getSettings());
        
        const whiteSettings = this.settings.getPlayerSettings('white');
        const blackSettings = this.settings.getPlayerSettings('black');
        
        console.log('White settings:', whiteSettings);
        console.log('Black settings:', blackSettings);
        
        // Get provider and model display names
        let whiteProvider = 'Not set';
        let blackProvider = 'Not set';
        
        if (whiteSettings.provider && AI_MODELS[whiteSettings.provider]) {
            whiteProvider = AI_MODELS[whiteSettings.provider].displayName;
        } else {
            console.warn('Invalid white provider:', whiteSettings.provider);
        }
        
        if (blackSettings.provider && AI_MODELS[blackSettings.provider]) {
            blackProvider = AI_MODELS[blackSettings.provider].displayName;
        } else {
            console.warn('Invalid black provider:', blackSettings.provider);
        }
        
        // Get model display names
        let whiteModelName = 'Not set';
        let blackModelName = 'Not set';
        
        if (whiteSettings.provider && whiteSettings.model) {
            const whiteModels = getModelsForProvider(whiteSettings.provider);
            console.log('White models available:', whiteModels);
            const whiteModelObj = whiteModels.find(m => m.id === whiteSettings.model);
            if (whiteModelObj) {
                whiteModelName = whiteModelObj.name;
                console.log('Found white model name:', whiteModelName);
            } else {
                console.warn('Could not find white model with ID:', whiteSettings.model);
            }
        }
        
        if (blackSettings.provider && blackSettings.model) {
            const blackModels = getModelsForProvider(blackSettings.provider);
            console.log('Black models available:', blackModels);
            const blackModelObj = blackModels.find(m => m.id === blackSettings.model);
            if (blackModelObj) {
                blackModelName = blackModelObj.name;
                console.log('Found black model name:', blackModelName);
            } else {
                console.warn('Could not find black model with ID:', blackSettings.model);
            }
        }
        
        // Update display
        console.log(`Setting white model display to: ${whiteProvider} - ${whiteModelName}`);
        console.log(`Setting black model display to: ${blackProvider} - ${blackModelName}`);
        this.elements.whiteModel.textContent = `${whiteProvider} - ${whiteModelName}`;
        this.elements.blackModel.textContent = `${blackProvider} - ${blackModelName}`;
    }
    
    /**
     * Save the completed game to history
     */
    saveGameToHistory() {
        const gameHistory = new GameHistory();
        
        // Create game record
        const game = {
            id: Date.now().toString(),
            date: new Date().toISOString(),
            moves: this.gameState.moveHistory,
            finalPosition: this.chess.fen(),
            result: this.gameState.result,
            winner: this.gameState.winner,
            white: {
                provider: this.settings.getPlayerSettings('white').provider,
                model: this.settings.getPlayerSettings('white').model
            },
            black: {
                provider: this.settings.getPlayerSettings('black').provider,
                model: this.settings.getPlayerSettings('black').model
            }
        };
        
        // Save to history
        gameHistory.addGame(game);
    }
    
    /**
     * Get the current game state
     * @returns {Object} Current game state
     */
    getGameState() {
        return this.gameState;
    }
}
