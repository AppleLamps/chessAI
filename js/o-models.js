/**
 * o-models.js
 * Handles OpenAI's "o" series models (o3-mini, o4-mini) which use a different API structure
 * These models use the "reasoning" API with different parameters and response format
 */

// List of model IDs that should be handled by this module
const O_SERIES_MODELS = [
    'o3-mini-high',
    'o4-mini'
];

/**
 * Check if a model should be handled by this module
 * @param {string} modelId - The OpenAI model ID 
 * @returns {boolean} True if this is an O-series model
 */
function isOSeriesModel(modelId) {
    return O_SERIES_MODELS.includes(modelId) || modelId.startsWith('o3-') || modelId.startsWith('o4-');
}

/**
 * Generate a request for O-series models
 * @param {object} boardState - Chess.js board state
 * @param {array} moveHistory - Array of previous moves
 * @param {object} config - Configuration (apiKey, model, maxTokens, etc)
 * @returns {object} Request data for fetch call
 */
function generateOModelRequest(boardState, moveHistory, config) {
    // For o-series models, we'll use the chat completions endpoint but with a simplified format
    const userContent = config.userPrompt || 
        `Current board state (FEN): ${boardState.fen()}\n\nMove history: ${moveHistory.join(", ")}\n\nProvide your next move in standard algebraic notation (e.g., 'e4', 'Nf3').`;

    return {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                {
                    role: "system",
                    content: "You are a chess engine. Your task is to analyze the current board position and make the best move possible. Respond ONLY with your chosen move in standard algebraic notation. Valid examples: 'e4', 'Nf3', 'cxd4', 'O-O', 'Qxb7+', etc. Be extremely careful to verify that your move is legal in the current position. For complex positions, consider checks, pins, and material threats carefully. For captures, explicitly use notation like 'cxd4' instead of just 'd4'."
                },
                {
                    role: "user",
                    content: userContent
                }
            ],
            // O-series models require max_completion_tokens instead of max_tokens
            // and don't support custom temperature values
            max_completion_tokens: config.maxTokens || 150 // Don't need large values for single move responses
        })
    };
}

/**
 * Parse response from O-series model
 * @param {Response} response - Fetch API response
 * @param {object} config - Configuration
 * @returns {Promise<object>} Promise resolving to move data
 */
async function parseOModelResponse(response, config) {
    // Parse the response as JSON
    const data = await response.json();
    console.log('[O-API Response]', data);

    // Check for error cases
    if (data.error) {
        throw new Error(`API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    // Chat completions API format
    if (data.choices && data.choices.length > 0) {
        const content = data.choices[0].message?.content || '';
        console.log('[O-API] Output content:', content);
        
        // Try to extract a valid chess move using regex
        const moveMatch = content.match(/\b([a-h][1-8]|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)\b/);
        const move = moveMatch ? moveMatch[0] : '';
        
        return {
            move: move,
            thinking: content || ""
        };
    }
    
    // Fallback for unexpected response format
    console.warn('[O-API Warning] Unexpected response format:', data);
    return {
        move: "",
        thinking: ""
    };
}

/**
 * Main function to call an O-series model
 * @param {object} boardState - Chess.js board state
 * @param {array} moveHistory - Array of previous moves
 * @param {object} config - Configuration (apiKey, model, etc.)
 * @returns {Promise<object>} Promise resolving to move data
 */
async function callOModel(boardState, moveHistory, config) {
    // Generate the request
    const requestData = generateOModelRequest(boardState, moveHistory, config);
    
    try {
        // Make the API call to the correct endpoint for o-series models
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: requestData.method,
            headers: requestData.headers,
            body: requestData.body
        });
        
        // Check for HTTP errors
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 401) {
                throw new Error(`API authentication failed: ${errorData.error?.message || 'Invalid API key'}`);
            }
            throw new Error(`API error ${response.status}: ${errorData.error?.message || response.statusText}`);
        }
        
        // Parse the response
        return await parseOModelResponse(response, config);
    } catch (error) {
        console.error("Error calling O-series model:", error);
        throw error;
    }
}

// Export the module functions
window.OModels = {
    isOSeriesModel,
    callOModel
};
