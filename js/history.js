/**
 * history.js
 * Handles game history storage and replay functionality
 */

class GameHistory {
    constructor() {
        this.storageKey = 'windsurfChessGameHistory';
        this.games = this.loadGames();
        
        // DOM elements
        this.elements = {
            gamesList: document.getElementById('games-list'),
            replayBoard: document.getElementById('replay-board'),
            prevMove: document.getElementById('prev-move'),
            nextMove: document.getElementById('next-move'),
            autoReplay: document.getElementById('auto-replay'),
            replayInfo: document.getElementById('replay-info')
        };
        
        // Replay state
        this.replay = {
            game: null,
            chess: null,
            board: null,
            currentMoveIndex: -1,
            autoPlayTimer: null,
            autoPlaying: false
        };
        
        // Initialize
        this.initReplayBoard();
        this.bindEvents();
    }
    
    /**
     * Initialize the replay board
     */
    initReplayBoard() {
        this.replay.chess = new Chess();
        this.replay.board = new ChessBoard('replay-board', {
            showCoordinates: true,
            pieceTheme: 'https://lichess1.org/assets/piece/cburnett/{piece}.svg'
        });
    }
    
    /**
     * Bind event listeners
     */
    bindEvents() {
        if (this.elements.prevMove) {
            this.elements.prevMove.addEventListener('click', () => this.showPreviousMove());
        }
        
        if (this.elements.nextMove) {
            this.elements.nextMove.addEventListener('click', () => this.showNextMove());
        }
        
        if (this.elements.autoReplay) {
            this.elements.autoReplay.addEventListener('click', () => this.toggleAutoReplay());
        }
    }
    
    /**
     * Load games from localStorage
     * @returns {Array} Array of saved games
     */
    loadGames() {
        const savedGames = localStorage.getItem(this.storageKey);
        
        if (savedGames) {
            try {
                return JSON.parse(savedGames);
            } catch (e) {
                console.error('Error loading game history:', e);
                return [];
            }
        }
        
        return [];
    }
    
    /**
     * Save games to localStorage
     */
    saveGames() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.games));
        } catch (e) {
            console.error('Error saving game history:', e);
        }
    }
    
    /**
     * Add a new game to history
     * @param {Object} game - Game object
     */
    addGame(game) {
        this.games.unshift(game); // Add to beginning of array
        
        // Limit the number of saved games (e.g., keep only the last 20)
        if (this.games.length > 20) {
            this.games = this.games.slice(0, 20);
        }
        
        this.saveGames();
        this.updateGamesList();
    }
    
    /**
     * Remove a game from history
     * @param {string} gameId - ID of the game to remove
     */
    removeGame(gameId) {
        this.games = this.games.filter(game => game.id !== gameId);
        this.saveGames();
        this.updateGamesList();
    }
    
    /**
     * Clear all game history
     */
    clearHistory() {
        if (confirm('Are you sure you want to clear all game history?')) {
            this.games = [];
            this.saveGames();
            this.updateGamesList();
        }
    }
    
    /**
     * Update the games list in the UI
     */
    updateGamesList() {
        if (!this.elements.gamesList) return;
        
        this.elements.gamesList.innerHTML = '';
        
        if (this.games.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-history';
            emptyMessage.textContent = 'No saved games yet.';
            this.elements.gamesList.appendChild(emptyMessage);
            return;
        }
        
        this.games.forEach(game => {
            const gameItem = document.createElement('div');
            gameItem.className = 'game-item';
            gameItem.dataset.gameId = game.id;
            
            // Format date
            const date = new Date(game.date);
            const formattedDate = date.toLocaleDateString() + ' ' + 
                                  date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Game result
            let resultText = 'Draw';
            if (game.result === 'checkmate' && game.winner) {
                resultText = game.winner.charAt(0).toUpperCase() + game.winner.slice(1) + ' won';
            }
            
            // Player info
            const whiteInfo = this.getPlayerDisplayInfo(game.white);
            const blackInfo = this.getPlayerDisplayInfo(game.black);
            
            gameItem.innerHTML = `
                <div class="game-date">${formattedDate}</div>
                <div class="game-players">
                    <div class="white-player">${whiteInfo}</div>
                    <div class="black-player">${blackInfo}</div>
                </div>
                <div class="game-result">${resultText}</div>
                <button class="delete-game" data-game-id="${game.id}">×</button>
            `;
            
            gameItem.addEventListener('click', (e) => {
                // Ignore clicks on the delete button
                if (e.target.classList.contains('delete-game')) {
                    e.stopPropagation();
                    this.removeGame(e.target.dataset.gameId);
                    return;
                }
                
                // Load the game
                this.loadGameForReplay(game.id);
                
                // Mark this game as selected
                const selectedGames = this.elements.gamesList.querySelectorAll('.game-item.selected');
                selectedGames.forEach(item => item.classList.remove('selected'));
                gameItem.classList.add('selected');
            });
            
            this.elements.gamesList.appendChild(gameItem);
        });
    }
    
    /**
     * Get display info for a player
     * @param {Object} player - Player object
     * @returns {string} Formatted player info
     */
    getPlayerDisplayInfo(player) {
        let providerName = 'Unknown';
        let modelName = 'Unknown';
        
        if (player.provider && AI_MODELS[player.provider]) {
            providerName = AI_MODELS[player.provider].displayName;
            
            if (player.model) {
                const models = getModelsForProvider(player.provider);
                const model = models.find(m => m.id === player.model);
                if (model) {
                    modelName = model.name;
                }
            }
        }
        
        return `${providerName} - ${modelName}`;
    }
    
    /**
     * Load a game for replay
     * @param {string} gameId - ID of the game to load
     */
    loadGameForReplay(gameId) {
        const game = this.games.find(g => g.id === gameId);
        
        if (!game) {
            console.error(`Game with ID ${gameId} not found`);
            return;
        }
        
        // Stop any existing auto-replay
        this.stopAutoReplay();
        
        // Set up replay state
        this.replay.game = game;
        this.replay.chess.reset();
        this.replay.board.setPosition(this.replay.chess.fen());
        this.replay.currentMoveIndex = -1;
        
        // Update replay info
        this.updateReplayInfo();
        
        // Enable/disable controls
        this.updateReplayControls();
    }
    
    /**
     * Show the next move in the replay
     */
    showNextMove() {
        if (!this.replay.game || 
            this.replay.currentMoveIndex >= this.replay.game.moves.length - 1) {
            return;
        }
        
        this.replay.currentMoveIndex++;
        const move = this.replay.game.moves[this.replay.currentMoveIndex];
        
        // Make the move on the chess board
        const moveResult = this.replay.chess.move(move);
        
        if (moveResult) {
            // Update the visual board
            this.replay.board.setPosition(this.replay.chess.fen());
            
            // Highlight the move
            this.replay.board.clearHighlights();
            this.replay.board.highlightSquare(moveResult.from, 'last-move-from');
            this.replay.board.highlightSquare(moveResult.to, 'last-move-to');
        }
        
        // Update info and controls
        this.updateReplayInfo();
        this.updateReplayControls();
    }
    
    /**
     * Show the previous move in the replay
     */
    showPreviousMove() {
        if (!this.replay.game || this.replay.currentMoveIndex < 0) {
            return;
        }
        
        // Go back one move
        this.replay.currentMoveIndex--;
        
        // Reset the board and play all moves up to the current index
        this.replay.chess.reset();
        this.replay.board.setPosition(this.replay.chess.fen());
        this.replay.board.clearHighlights();
        
        for (let i = 0; i <= this.replay.currentMoveIndex; i++) {
            const move = this.replay.game.moves[i];
            const moveResult = this.replay.chess.move(move);
            
            // If this is the last move, highlight it
            if (i === this.replay.currentMoveIndex && moveResult) {
                this.replay.board.highlightSquare(moveResult.from, 'last-move-from');
                this.replay.board.highlightSquare(moveResult.to, 'last-move-to');
            }
        }
        
        // Update the visual board
        this.replay.board.setPosition(this.replay.chess.fen());
        
        // Update info and controls
        this.updateReplayInfo();
        this.updateReplayControls();
    }
    
    /**
     * Toggle auto-replay
     */
    toggleAutoReplay() {
        if (this.replay.autoPlaying) {
            this.stopAutoReplay();
        } else {
            this.startAutoReplay();
        }
    }
    
    /**
     * Start auto-replaying the game
     */
    startAutoReplay() {
        if (!this.replay.game) return;
        
        this.replay.autoPlaying = true;
        this.elements.autoReplay.textContent = 'Pause';
        
        // If at the end, start over
        if (this.replay.currentMoveIndex >= this.replay.game.moves.length - 1) {
            this.replay.chess.reset();
            this.replay.board.setPosition(this.replay.chess.fen());
            this.replay.currentMoveIndex = -1;
            this.replay.board.clearHighlights();
        }
        
        // Auto-play function
        const autoPlay = () => {
            if (!this.replay.autoPlaying) return;
            
            this.showNextMove();
            
            // Continue if there are more moves
            if (this.replay.currentMoveIndex < this.replay.game.moves.length - 1) {
                this.replay.autoPlayTimer = setTimeout(autoPlay, 1000);
            } else {
                this.stopAutoReplay();
            }
        };
        
        // Start auto-play
        autoPlay();
    }
    
    /**
     * Stop auto-replaying the game
     */
    stopAutoReplay() {
        this.replay.autoPlaying = false;
        this.elements.autoReplay.textContent = 'Auto Replay';
        
        if (this.replay.autoPlayTimer) {
            clearTimeout(this.replay.autoPlayTimer);
            this.replay.autoPlayTimer = null;
        }
    }
    
    /**
     * Update the replay information display
     */
    updateReplayInfo() {
        if (!this.replay.game || !this.elements.replayInfo) return;
        
        const game = this.replay.game;
        const currentMove = this.replay.currentMoveIndex + 1;
        const totalMoves = game.moves.length;
        
        // Format date
        const date = new Date(game.date);
        const formattedDate = date.toLocaleDateString() + ' ' + 
                              date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Game result
        let resultText = 'Draw';
        if (game.result === 'checkmate' && game.winner) {
            resultText = game.winner.charAt(0).toUpperCase() + game.winner.slice(1) + ' won';
        }
        
        // Player info
        const whiteInfo = this.getPlayerDisplayInfo(game.white);
        const blackInfo = this.getPlayerDisplayInfo(game.black);
        
        // Current position evaluation
        let positionInfo = '';
        // Use our wrapper methods that match the chess.js library
        if (this.replay.chess.isCheckmate()) {
            positionInfo = 'Checkmate';
        } else if (this.replay.chess.isDraw()) {
            positionInfo = 'Draw';
        } else if (this.replay.chess.inCheck()) {
            positionInfo = 'Check';
        }
        
        // Update info
        this.elements.replayInfo.innerHTML = `
            <div class="replay-date">${formattedDate}</div>
            <div class="replay-players">
                <div>White: ${whiteInfo}</div>
                <div>Black: ${blackInfo}</div>
            </div>
            <div class="replay-progress">Move: ${currentMove}/${totalMoves}</div>
            <div class="replay-result">${resultText}</div>
            <div class="replay-position">${positionInfo}</div>
        `;
    }
    
    /**
     * Update replay controls based on current state
     */
    updateReplayControls() {
        if (!this.replay.game) return;
        
        // Enable/disable previous button
        if (this.elements.prevMove) {
            this.elements.prevMove.disabled = this.replay.currentMoveIndex < 0;
        }
        
        // Enable/disable next button
        if (this.elements.nextMove) {
            this.elements.nextMove.disabled = 
                this.replay.currentMoveIndex >= this.replay.game.moves.length - 1;
        }
    }
}
