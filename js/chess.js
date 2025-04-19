/**
 * chess.js - Wrapper for the chess.js library
 * 
 * This file wraps the chess.js library loaded from CDN with additional
 * helper methods needed for the Windsurf Chess application.
 */

// The global Chess class is already defined by the chess.js library loaded from CDN
// This wrapper adds some additional convenience methods

/**
 * Check if the current position is a draw (stalemate, insufficient material, etc.)
 * @returns {boolean} true if draw
 */
Chess.prototype.isDraw = function() {
    return this.in_stalemate() || 
           this.in_threefold_repetition() || 
           this.insufficient_material() || 
           this.in_draw();
};

/**
 * Check if the current position is checkmate
 * @returns {boolean} true if checkmate
 */
Chess.prototype.isCheckmate = function() {
    return this.in_checkmate();
};

/**
 * Check if the king is in check
 * @returns {boolean} true if the current player's king is in check
 */
Chess.prototype.inCheck = function() {
    return this.in_check();
};

/**
 * Get the current game status
 * @returns {string} "checkmate", "draw", "check", or "normal"
 */
Chess.prototype.getStatus = function() {
    if (this.isCheckmate()) {
        return 'checkmate';
    } else if (this.isDraw()) {
        return 'draw';
    } else if (this.inCheck()) {
        return 'check';
    } else {
        return 'normal';
    }
};

// Note: These wrapper methods align the official Chess.js library methods
// with the method names used in our application code.
