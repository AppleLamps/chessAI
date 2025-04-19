/**
 * main.js
 * Main application script for Windsurf Chess
 * Handles initialization and navigation
 */

// Main application class
class WindsurfChessApp {
    constructor() {
        // App components
        this.settings = null;
        this.game = null;
        this.gameHistory = null;
        
        // DOM elements
        this.elements = {
            // Tab navigation
            gameTab: document.getElementById('game-tab'),
            settingsTab: document.getElementById('settings-tab'),
            historyTab: document.getElementById('history-tab'),
            
            // Sections
            gameSection: document.getElementById('game-section'),
            settingsSection: document.getElementById('settings-section'),
            historySection: document.getElementById('history-section')
        };
        
        // Initialize
        this.init();
    }
    
    /**
     * Initialize the application
     */
    init() {
        // Initialize components
        this.initializeComponents();
        
        // Bind navigation events
        this.bindNavigationEvents();
        
        // Add CSS class to indicate app is loaded
        document.body.classList.add('app-loaded');
    }
    
    /**
     * Initialize application components
     */
    initializeComponents() {
        // Initialize settings
        this.settings = new Settings();
        
        // Initialize game
        this.game = new Game();
        this.game.initialize(this.settings);
        
        // Initialize game history
        this.gameHistory = new GameHistory();
        this.gameHistory.updateGamesList();
    }
    
    /**
     * Bind navigation events
     */
    bindNavigationEvents() {
        // Tab navigation
        this.elements.gameTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.navigateTo('game');
        });
        
        this.elements.settingsTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.navigateTo('settings');
        });
        
        this.elements.historyTab.addEventListener('click', (e) => {
            e.preventDefault();
            this.navigateTo('history');
        });
    }
    
    /**
     * Navigate to a section
     * @param {string} section - Section name ('game', 'settings', or 'history')
     */
    navigateTo(section) {
        // Update active tab
        document.querySelectorAll('nav a').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.getElementById(`${section}-tab`).classList.add('active');
        
        // Hide all sections
        document.querySelectorAll('main section').forEach(sec => {
            sec.classList.remove('active-section');
            sec.classList.add('hidden-section');
        });
        
        // Show the selected section
        const sectionElement = document.getElementById(`${section}-section`);
        sectionElement.classList.remove('hidden-section');
        sectionElement.classList.add('active-section');
        
        // Additional actions when navigating
        if (section === 'history') {
            this.gameHistory.updateGamesList();
        } else if (section === 'game') {
            // Refresh the game display to show updated settings
            console.log('Navigating to game section, refreshing player info');
            this.game.updatePlayerInfo();
        } else if (section === 'settings') {
            // Make sure the settings form is up to date
            console.log('Navigating to settings section, refreshing form');
            this.settings.updateFormFromSettings();
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add a CSS class to indicate app is loading
    document.body.classList.add('app-loading');
    
    // Create notification container
    const notificationContainer = document.createElement('div');
    notificationContainer.className = 'notification-container';
    document.body.appendChild(notificationContainer);
    
    // Add global CSS variables
    document.documentElement.style.setProperty('--primary-color', '#3498db');
    document.documentElement.style.setProperty('--secondary-color', '#2c3e50');
    document.documentElement.style.setProperty('--success-color', '#2ecc71');
    document.documentElement.style.setProperty('--warning-color', '#f39c12');
    document.documentElement.style.setProperty('--danger-color', '#e74c3c');
    
    // Initialize application
    window.app = new WindsurfChessApp();
    
    // Add a small delay to allow initial rendering
    setTimeout(() => {
        document.body.classList.remove('app-loading');
    }, 500);
});
