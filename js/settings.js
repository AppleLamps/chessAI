/**
 * settings.js
 * Handles the settings for the Windsurf Chess application
 * including player configuration and settings persistence
 */

class Settings {
    constructor() {
        // Default settings
        this.defaults = {
            white: {
                provider: '',
                model: '',
                apiKey: '',
                streaming: true,
                temperature: 0.7,
                maxTokens: 1024
            },
            black: {
                provider: '',
                model: '',
                apiKey: '',
                streaming: true,
                temperature: 0.7,
                maxTokens: 1024
            },
            general: {
                maxRetries: 3,
                moveDelay: 1000
            }
        };
        
        // Current settings
        this.settings = JSON.parse(JSON.stringify(this.defaults));
        
        // DOM elements
        this.elements = {
            // White player settings
            whiteProvider: document.getElementById('white-provider'),
            whiteModelSelect: document.getElementById('white-model-select'),
            whiteApiKey: document.getElementById('white-api-key'),
            whiteStreaming: document.getElementById('white-streaming'),
            whiteTemperature: document.getElementById('white-temperature'),
            whiteTemperatureValue: document.getElementById('white-temperature-value'),
            whiteMaxTokens: document.getElementById('white-max-tokens'),
            
            // Black player settings
            blackProvider: document.getElementById('black-provider'),
            blackModelSelect: document.getElementById('black-model-select'),
            blackApiKey: document.getElementById('black-api-key'),
            blackStreaming: document.getElementById('black-streaming'),
            blackTemperature: document.getElementById('black-temperature'),
            blackTemperatureValue: document.getElementById('black-temperature-value'),
            blackMaxTokens: document.getElementById('black-max-tokens'),
            
            // General settings
            maxRetries: document.getElementById('max-retries'),
            moveDelay: document.getElementById('move-delay'),
            
            // Buttons
            saveSettings: document.getElementById('save-settings'),
            resetSettings: document.getElementById('reset-settings'),
            togglePasswordButtons: document.querySelectorAll('.toggle-password')
        };
        
        // Initialize
        this.loadSettings();
        this.bindEvents();
        this.updateFormFromSettings();
    }
    
    /**
     * Bind event listeners to form elements
     */
    bindEvents() {
        // Provider change events
        this.elements.whiteProvider.addEventListener('change', () => this.updateModelOptions('white'));
        this.elements.blackProvider.addEventListener('change', () => this.updateModelOptions('black'));
        
        // Temperature sliders
        this.elements.whiteTemperature.addEventListener('input', () => {
            this.elements.whiteTemperatureValue.textContent = this.elements.whiteTemperature.value;
        });
        
        this.elements.blackTemperature.addEventListener('input', () => {
            this.elements.blackTemperatureValue.textContent = this.elements.blackTemperature.value;
        });
        
        // Save settings
        this.elements.saveSettings.addEventListener('click', () => {
            this.updateSettingsFromForm();
            this.saveSettings();
            
            // Update game info immediately if we have access to the game object
            if (window.app && window.app.game) {
                console.log('Updating game player info after saving settings');
                window.app.game.updatePlayerInfo();
            }
            
            this.showNotification('Settings saved successfully');
        });
        
        // Reset settings
        this.elements.resetSettings.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all settings to default values?')) {
                this.resetToDefaults();
                this.showNotification('Settings reset to defaults');
            }
        });
        
        // Toggle password visibility
        this.elements.togglePasswordButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.getAttribute('data-target');
                const input = document.getElementById(targetId);
                
                if (input.type === 'password') {
                    input.type = 'text';
                    button.textContent = 'Hide';
                } else {
                    input.type = 'password';
                    button.textContent = 'Show';
                }
            });
        });
    }
    
    /**
     * Update model options based on selected provider
     * @param {string} player - 'white' or 'black'
     */
    updateModelOptions(player) {
        const providerSelect = this.elements[`${player}Provider`];
        const modelSelect = this.elements[`${player}ModelSelect`];
        const provider = providerSelect.value;
        
        console.log(`Updating model options for ${player} player with provider: ${provider}`);
        
        // Store current selection if exists
        const currentSelection = modelSelect.value;
        
        // Clear existing options
        modelSelect.innerHTML = '<option value="">Select Model</option>';
        
        // Disable if no provider selected
        if (!provider) {
            modelSelect.disabled = true;
            console.log(`No provider selected for ${player} player, disabling model select`);
            return;
        }
        
        // Get models for the selected provider
        const models = getModelsForProvider(provider);
        console.log(`Found ${models.length} models for provider ${provider}:`, models);
        
        // Add options for each model
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });
        
        // Enable the select
        modelSelect.disabled = false;
        
        // If we previously had a model selected, try to restore it
        if (currentSelection && models.some(m => m.id === currentSelection)) {
            modelSelect.value = currentSelection;
            console.log(`Restored previous model selection: ${currentSelection}`);
        } else {
            // Auto-select the first model if none was previously selected
            if (models.length > 0) {
                modelSelect.value = models[0].id;
                // Update the settings object immediately to reflect this change
                this.settings[player].model = models[0].id;
                console.log(`Auto-selected first model: ${models[0].id}`);
            }
        }
    }
    
    /**
     * Update form values from current settings
     */
    updateFormFromSettings() {
        console.log('Updating form from settings:', this.settings);
        
        // White player
        this.elements.whiteProvider.value = this.settings.white.provider;
        this.updateModelOptions('white');
        this.elements.whiteModelSelect.value = this.settings.white.model;
        this.elements.whiteApiKey.value = this.settings.white.apiKey;
        this.elements.whiteStreaming.checked = this.settings.white.streaming;
        this.elements.whiteTemperature.value = this.settings.white.temperature;
        this.elements.whiteTemperatureValue.textContent = this.settings.white.temperature;
        this.elements.whiteMaxTokens.value = this.settings.white.maxTokens;
        
        // Black player
        this.elements.blackProvider.value = this.settings.black.provider;
        this.updateModelOptions('black');
        this.elements.blackModelSelect.value = this.settings.black.model;
        this.elements.blackApiKey.value = this.settings.black.apiKey;
        this.elements.blackStreaming.checked = this.settings.black.streaming;
        this.elements.blackTemperature.value = this.settings.black.temperature;
        this.elements.blackTemperatureValue.textContent = this.settings.black.temperature;
        this.elements.blackMaxTokens.value = this.settings.black.maxTokens;
        
        // General settings
        this.elements.maxRetries.value = this.settings.general.maxRetries;
        this.elements.moveDelay.value = this.settings.general.moveDelay;
        
        // Print out current model selections for debugging
        console.log('White model select value:', this.elements.whiteModelSelect.value);
        console.log('Black model select value:', this.elements.blackModelSelect.value);
    }
    
    /**
     * Update settings object from form values
     */
    updateSettingsFromForm() {
        // White player
        this.settings.white.provider = this.elements.whiteProvider.value;
        this.settings.white.model = this.elements.whiteModelSelect.value;
        this.settings.white.apiKey = this.elements.whiteApiKey.value;
        this.settings.white.streaming = this.elements.whiteStreaming.checked;
        this.settings.white.temperature = parseFloat(this.elements.whiteTemperature.value);
        this.settings.white.maxTokens = parseInt(this.elements.whiteMaxTokens.value, 10);
        
        // Black player
        this.settings.black.provider = this.elements.blackProvider.value;
        this.settings.black.model = this.elements.blackModelSelect.value;
        this.settings.black.apiKey = this.elements.blackApiKey.value;
        this.settings.black.streaming = this.elements.blackStreaming.checked;
        this.settings.black.temperature = parseFloat(this.elements.blackTemperature.value);
        this.settings.black.maxTokens = parseInt(this.elements.blackMaxTokens.value, 10);
        
        // Log the settings to help debug
        console.log('Settings updated:', this.settings);
        
        // General settings
        this.settings.general.maxRetries = parseInt(this.elements.maxRetries.value, 10);
        this.settings.general.moveDelay = parseInt(this.elements.moveDelay.value, 10);
    }
    
    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const savedSettings = localStorage.getItem('windsurfChessSettings');
        
        if (savedSettings) {
            try {
                const parsed = JSON.parse(savedSettings);
                
                // Merge saved settings with defaults (to handle new settings)
                this.settings = {
                    white: { ...this.defaults.white, ...parsed.white },
                    black: { ...this.defaults.black, ...parsed.black },
                    general: { ...this.defaults.general, ...parsed.general }
                };
            } catch (e) {
                console.error('Error loading settings:', e);
                this.settings = JSON.parse(JSON.stringify(this.defaults));
            }
        }
    }
    
    /**
     * Save settings to localStorage
     */
    saveSettings() {
        try {
            localStorage.setItem('windsurfChessSettings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('Error saving settings:', e);
            this.showNotification('Error saving settings', 'error');
        }
    }
    
    /**
     * Reset settings to defaults
     */
    resetToDefaults() {
        this.settings = JSON.parse(JSON.stringify(this.defaults));
        this.updateFormFromSettings();
        this.saveSettings();
    }
    
    /**
     * Get current settings
     * @returns {Object} Current settings
     */
    getSettings() {
        return this.settings;
    }
    
    /**
     * Get settings for a specific player
     * @param {string} player - 'white' or 'black'
     * @returns {Object} Player settings
     */
    getPlayerSettings(player) {
        return this.settings[player];
    }
    
    /**
     * Get general settings
     * @returns {Object} General settings
     */
    getGeneralSettings() {
        return this.settings.general;
    }
    
    /**
     * Check if settings are valid to start a game
     * @returns {Object} Object with valid flag and any error messages
     */
    validateSettings() {
        const errors = [];
        
        // Check white player settings
        if (!this.settings.white.provider) {
            errors.push('White player: AI provider must be selected');
        }
        
        if (!this.settings.white.model) {
            errors.push('White player: AI model must be selected');
        }
        
        if (!this.settings.white.apiKey) {
            errors.push('White player: API key must be provided');
        } else if (this.settings.white.provider === 'xai' && !this.settings.white.apiKey.startsWith('xai-')) {
            errors.push('White player: xAI keys must start with "xai-"');
        }
        
        // Check black player settings
        if (!this.settings.black.provider) {
            errors.push('Black player: AI provider must be selected');
        }
        
        if (!this.settings.black.model) {
            errors.push('Black player: AI model must be selected');
        }
        
        if (!this.settings.black.apiKey) {
            errors.push('Black player: API key must be provided');
        } else if (this.settings.black.provider === 'xai' && !this.settings.black.apiKey.startsWith('xai-')) {
            errors.push('Black player: xAI keys must start with "xai-"');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    /**
     * Show notification message
     * @param {string} message - Message to display
     * @param {string} type - 'success' or 'error'
     */
    showNotification(message, type = 'success') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Remove after delay
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }, 3000);
    }
}
