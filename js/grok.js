/**
 * grok.js - Handles interactions with X.AI's Grok API
 * Supports both grok-3-latest and grok-3-mini-beta models with proper error handling
 */

// Create a global namespace for Grok functionality
window.GrokModels = window.GrokModels || {};

// Constants
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

/**
 * Sends a request to the Grok API and handles the response with robust error checking
 * @param {string} apiKey - X.AI API key
 * @param {string} model - Either 'grok-3-mini-beta' or 'grok-3-latest'
 * @param {string|Array} messages - Either a single message or conversation history
 * @param {Object} options - Additional options like temperature, max_tokens, etc.
 * @param {boolean} stream - Whether to stream the response (default: false)
 * @returns {Promise<Object>} The parsed response with content (and reasoning for mini model)
 * @throws {Error} If the request fails or returns an error
 */
async function sendGrokRequest(apiKey, model, messages, options = {}, stream = false) {
    // Validate required parameters
    if (!apiKey) {
        throw new Error('API key is required');
    }
    
    if (!model || (model !== 'grok-3-mini-beta' && model !== 'grok-3-latest')) {
        throw new Error('Invalid model specified. Use either "grok-3-mini-beta" or "grok-3-latest"');
    }
    
    // Check for chess-specific context
    const isChessContext = checkIfChessContext(messages);
    
    // Convert single message to proper format if needed
    const formattedMessages = Array.isArray(messages) 
        ? messages 
        : [{ role: 'user', content: messages }];
    
    // Basic validation
    if (!formattedMessages.length) {
        throw new Error('At least one message is required');
    }
    
    // Clean up messages to ensure they match the expected format exactly
    const cleanedMessages = formattedMessages.map(msg => {
        // Create a clean message with only the required properties
        const cleanMsg = { 
            role: msg.role,
            content: msg.content
        };
        
        // Only include reasoning_content for assistant messages in mini model
        if (model === 'grok-3-mini-beta' && msg.role === 'assistant' && msg.reasoning_content) {
            cleanMsg.reasoning_content = msg.reasoning_content;
        }
        
        return cleanMsg;
    });
    
    // Build a minimal, compliant request body
    const requestBody = {
        model: model,
        messages: cleanedMessages
    };
    
    // Only add optional parameters if they have valid values
    if (options.temperature !== undefined && options.temperature !== null) {
        requestBody.temperature = options.temperature;
    }
    
    if (options.max_tokens !== undefined && options.max_tokens !== null) {
        requestBody.max_tokens = options.max_tokens;
    }
    
    // Always include stream parameter as a boolean
    requestBody.stream = Boolean(stream);
    
    // Add reasoning_effort only for the mini model
    if (model === 'grok-3-mini-beta') {
        requestBody.reasoning_effort = options.reasoning_effort || 'high';
    }
    
    // Log the exact request we're sending to help with debugging
    console.log(`[Grok API Request] Sending to ${GROK_API_URL}:`, JSON.stringify(requestBody, null, 2));
    
    try {
        const response = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        // Debug logging for the response
        console.log(`[Grok API Response] Status: ${response.status} ${response.statusText}`);
        
        // Handle HTTP error responses
        if (!response.ok) {
            let errorText = '';
            let errorMessage = '';
            
            try {
                // Get the raw error text first for logging
                errorText = await response.text();
                console.log(`[Grok Error Response] ${errorText}`);
                
                // Try to parse as JSON if possible
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error?.message || 
                                  errorData.error?.details || 
                                  errorData.detail || 
                                  `HTTP error! Status: ${response.status}`;
                } catch (jsonError) {
                    // If we can't parse JSON, use the raw text
                    errorMessage = errorText || `HTTP error! Status: ${response.status}`;
                }
            } catch (e) {
                // If we can't even get the response text
                errorMessage = `API Error: ${response.status} ${response.statusText}`;
            }
            
            throw new Error(errorMessage);
        }
        
        // Parse the response data
        const data = await response.json();
        
        // Check for error response in a valid JSON structure
        if (data.error) {
            const errorMessage = data.error.message || data.error.details || JSON.stringify(data.error);
            // Check if it's an authentication error
            if (errorMessage.toLowerCase().includes('auth') || 
                errorMessage.toLowerCase().includes('api key') || 
                errorMessage.toLowerCase().includes('认证失败')) {
                throw new Error(`Authentication Error: ${errorMessage}`);
            }
            throw new Error(`API Error: ${errorMessage}`);
        }
        
        // Validate expected response structure
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Invalid response format from API');
        }
        
        // Process the response based on model type
        if (model === 'grok-3-mini-beta') {
            // Extract content and reasoning from mini model
            let responseContent = data.choices[0].message.content || '';
            let reasoningContent = data.choices[0].message.reasoning_content || '';
            
            // For chess contexts, try to extract a valid move
            if (isChessContext) {
                responseContent = extractValidChessMove(responseContent, reasoningContent);
            }
            
            return {
                response: responseContent,
                reasoning: reasoningContent,
                rawResponse: data
            };
        } else {
            // Standard response from regular model
            let responseContent = data.choices[0].message.content || '';
            
            // For chess contexts, try to extract a valid move
            if (isChessContext) {
                responseContent = extractValidChessMove(responseContent);
            }
            
            return {
                response: responseContent,
                rawResponse: data
            };
        }
        
    } catch (error) {
        // Enhance error message for common errors
        let enhancedError;
        
        if (error.message.includes('认证失败') || 
            error.message.includes('authentication failed') || 
            error.message.includes('401') || 
            error.message.includes('unauthorized')) {
            enhancedError = new Error(`Authentication failed: Please check your X.AI API key. ${error.message}`);
        } else if (error.message.includes('invalid model') || error.message.includes('not found')) {
            enhancedError = new Error(`Invalid model: ${model}. ${error.message}`);
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
            enhancedError = new Error(`Rate limit exceeded: Please try again later. ${error.message}`);
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            enhancedError = new Error(`Request timed out: The API took too long to respond. ${error.message}`);
        } else if (error.message.includes('400') || error.message.includes('Bad Request')) {
            enhancedError = new Error(`Bad Request: Check API key and parameters. ${error.message}`);
            console.error('[Grok API Error] Request that caused 400:', JSON.stringify(requestBody, null, 2));
        } else {
            enhancedError = error;
        }
        
        console.error('Error calling Grok API:', enhancedError);
        throw enhancedError;
    }
}

/**
 * Streaming version of the Grok API request
 * @param {string} apiKey - X.AI API key
 * @param {string} model - Either 'grok-3-mini-beta' or 'grok-3-latest'
 * @param {string|Array} messages - Either a single message or conversation history
 * @param {function} onUpdate - Callback function that receives content updates
 * @param {Object} options - Additional options like temperature, max_tokens, etc.
 * @returns {Promise<Object>} The final complete response
 */
async function streamGrokResponse(apiKey, model, messages, onUpdate, options = {}) {
    if (!apiKey) {
        throw new Error('API key is required');
    }
    
    if (typeof onUpdate !== 'function') {
        throw new Error('onUpdate callback is required for streaming');
    }
    
    // Convert single message to proper format if needed
    const formattedMessages = Array.isArray(messages) 
        ? messages 
        : [{ role: 'user', content: messages }];
    
    // Clean up messages to ensure they match the expected format exactly
    const cleanedMessages = formattedMessages.map(msg => {
        // Create a clean message with only the required properties
        const cleanMsg = { 
            role: msg.role,
            content: msg.content
        };
        
        // Only include reasoning_content for assistant messages in mini model
        if (model === 'grok-3-mini-beta' && msg.role === 'assistant' && msg.reasoning_content) {
            cleanMsg.reasoning_content = msg.reasoning_content;
        }
        
        return cleanMsg;
    });
    
    // Build a minimal, compliant request body
    const requestBody = {
        model: model,
        messages: cleanedMessages,
        stream: true // Force streaming for this function
    };
    
    // Only add optional parameters if they have valid values
    if (options.temperature !== undefined && options.temperature !== null) {
        requestBody.temperature = options.temperature;
    }
    
    if (options.max_tokens !== undefined && options.max_tokens !== null) {
        requestBody.max_tokens = options.max_tokens;
    }
    
    // Add reasoning_effort only for the mini model
    if (model === 'grok-3-mini-beta') {
        requestBody.reasoning_effort = options.reasoning_effort || 'high';
    }
    
    // Log the exact request we're sending to help with debugging
    console.log(`[Grok API Streaming] Sending to ${GROK_API_URL}:`, JSON.stringify(requestBody, null, 2));
    
    try {
        const response = await fetch(GROK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        // Debug logging for the response
        console.log(`[Grok API Streaming Response] Status: ${response.status} ${response.statusText}`);
        
        // Handle HTTP error responses
        if (!response.ok) {
            let errorText = '';
            let errorMessage = '';
            
            try {
                // Get the raw error text first for logging
                errorText = await response.text();
                console.log(`[Grok Error Response] ${errorText}`);
                
                // Try to parse as JSON if possible
                try {
                    const errorData = JSON.parse(errorText);
                    errorMessage = errorData.error?.message || 
                                   errorData.error?.details || 
                                   errorData.detail || 
                                   `HTTP error! Status: ${response.status}`;
                } catch (jsonError) {
                    // If we can't parse JSON, use the raw text
                    errorMessage = errorText || `HTTP error! Status: ${response.status}`;
                }
            } catch (e) {
                // If we can't even get the response text
                errorMessage = `API Error: ${response.status} ${response.statusText}`;
            }
            
            throw new Error(errorMessage);
        }
        
        // Handle the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        let fullContent = '';
        let fullReasoning = '';
        
        // Loop through the stream
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Decode the chunk
            const chunk = decoder.decode(value, { stream: true });
            
            // Process the chunk as Server-Sent Events
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6); // Remove 'data: ' prefix
                    
                    // Check if this is the end of the stream
                    if (data === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        // Check for errors
                        if (parsed.error) {
                            throw new Error(`API Error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
                        }
                        
                        // Extract delta content if it exists
                        if (parsed.choices && parsed.choices[0].delta) {
                            const delta = parsed.choices[0].delta;
                            
                            // Append to the full content
                            if (delta.content) {
                                fullContent += delta.content;
                                onUpdate({ content: fullContent });
                            }
                            
                            // For mini model, also track reasoning
                            if (model === 'grok-3-mini-beta' && delta.reasoning_content) {
                                fullReasoning += delta.reasoning_content;
                                onUpdate({ content: fullContent, reasoning: fullReasoning });
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing streaming response:', e, data);
                    }
                }
            }
        }
        
        // Return the final full response
        const isChessContext = checkIfChessContext(messages);
        
        if (model === 'grok-3-mini-beta') {
            // For chess contexts, try to extract a valid move
            let responseContent = fullContent;
            if (isChessContext) {
                responseContent = extractValidChessMove(fullContent, fullReasoning);
            }
            
            return {
                response: responseContent,
                reasoning: fullReasoning
            };
        } else {
            // For chess contexts, try to extract a valid move
            let responseContent = fullContent;
            if (isChessContext) {
                responseContent = extractValidChessMove(fullContent);
            }
            
            return {
                response: responseContent
            };
        }
        
    } catch (error) {
        // Enhance error message for common errors
        let enhancedError;
        
        if (error.message.includes('认证失败') || 
            error.message.includes('authentication failed') || 
            error.message.includes('401') || 
            error.message.includes('unauthorized')) {
            enhancedError = new Error(`Authentication failed: Please check your X.AI API key. ${error.message}`);
        } else if (error.message.includes('invalid model') || error.message.includes('not found')) {
            enhancedError = new Error(`Invalid model: ${model}. ${error.message}`);
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
            enhancedError = new Error(`Rate limit exceeded: Please try again later. ${error.message}`);
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            enhancedError = new Error(`Request timed out: The API took too long to respond. ${error.message}`);
        } else if (error.message.includes('400') || error.message.includes('Bad Request')) {
            enhancedError = new Error(`Bad Request: Check API key and parameters. ${error.message}`);
            console.error('[Grok API Error] Streaming request that caused 400:', JSON.stringify(requestBody, null, 2));
        } else {
            enhancedError = error;
        }
        
        console.error('Error streaming from Grok API:', enhancedError);
        throw enhancedError;
    }
}

/**
 * Check if the message context is related to chess
 * @param {Array|string} messages - Messages to check for chess context
 * @returns {boolean} - True if chess context is detected
 */
function checkIfChessContext(messages) {
    if (!messages) return false;
    
    // Convert to array if it's a single message
    const messageArray = Array.isArray(messages) ? messages : [{ role: 'user', content: messages }];
    
    // Look for chess-related keywords in messages
    const chessKeywords = ['chess', 'FEN', 'move', 'algebraic notation', 'board state'];
    
    for (const message of messageArray) {
        const content = message.content || '';
        if (chessKeywords.some(keyword => content.includes(keyword))) {
            return true;
        }
    }
    
    return false;
}

/**
 * Extract a valid chess move from the response text
 * @param {string} responseText - The primary response text
 * @param {string} reasoningText - Optional reasoning text (for mini model)
 * @param {Array} legalMoves - Optional array of legal moves to validate against
 * @returns {string} - A cleaned up chess move
 */
function extractValidChessMove(responseText, reasoningText = '', legalMoves = null) {
    if (!responseText && !reasoningText) return '';
    
    // Clean up the response text
    let cleanedResponse = responseText.trim();
    
    // Error patterns to check in response
    const errorPatterns = [
        /error/i,
        /invalid/i,
        /illegal/i,
        /cannot/i,
        /not allowed/i,
        /认证失败/i,  // Chinese error message from previous memory
        /authentication failed/i,
        /unauthorized/i,
        /api key/i,
        /token/i
    ];
    
    // If the response contains error patterns, return empty to trigger retry
    for (const pattern of errorPatterns) {
        if (pattern.test(cleanedResponse) || (reasoningText && pattern.test(reasoningText))) {
            console.log('[Grok] Error detected in response:', cleanedResponse);
            return '';
        }
    }
    
    // Array to collect all potential moves found in the text
    const potentialMoves = [];
    
    // If the response is very short, it might already be just the move
    if (cleanedResponse.length < 6 && /^[a-h][1-8]|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|O-O(-O)?$/.test(cleanedResponse)) {
        potentialMoves.push(cleanedResponse);
    }
    
    // Look for moves in the standard algebraic notation with advanced regex
    // This regex handles various forms of chess notation including castling and captures
    const moveRegexPatterns = [
        // Standard algebraic notation with piece, like "Nf3" or "Qxd4+"
        /\b([KQRBN][a-h]?[1-8]?x?[a-h][1-8][\+#]?)\b/,
        
        // Pawn moves like "e4" or "d5"
        /\b([a-h][1-8][\+#]?)\b/,
        
        // Pawn captures like "exd5" or "cxb4"
        /\b([a-h]x[a-h][1-8][\+#]?)\b/,
        
        // Castling
        /\b(O-O(?:-O)?[\+#]?)\b/
    ];
    
    // Function to extract moves from text using regex patterns
    const extractMovesFromText = (text) => {
        for (const regex of moveRegexPatterns) {
            const matches = text.match(new RegExp(regex, 'g')) || [];
            potentialMoves.push(...matches);
        }
    };
    
    // Extract from primary response
    extractMovesFromText(cleanedResponse);
    
    // Extract from reasoning if provided
    if (reasoningText) {
        extractMovesFromText(reasoningText);
    }
    
    // Look for moves with contextual phrases
    const contextPatterns = [
        /\b(play|move|choose|select|best|recommend|suggest)s?\s+([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)/i,
        /best move (is|would be) ([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)/i,
        /I('ll| will) (play|move|choose|select) ([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8]|O-O(?:-O)?)/i
    ];
    
    const combinedText = cleanedResponse + ' ' + reasoningText;
    for (const pattern of contextPatterns) {
        const match = combinedText.match(pattern);
        if (match) {
            // The move is in the last capturing group
            const moveIndex = match.length - 1;
            if (match[moveIndex]) {
                potentialMoves.push(match[moveIndex]);
            }
        }
    }
    
    // If we have legal moves, filter potential moves to only include legal ones
    if (legalMoves && legalMoves.length > 0 && potentialMoves.length > 0) {
        console.log('[Grok] Filtering potential moves against legal moves:', potentialMoves, legalMoves);
        const legalPotentialMoves = potentialMoves.filter(move => 
            legalMoves.includes(move) || 
            // Also check case-insensitive
            legalMoves.some(legalMove => legalMove.toLowerCase() === move.toLowerCase())
        );
        
        if (legalPotentialMoves.length > 0) {
            console.log('[Grok] Found legal moves:', legalPotentialMoves);
            // Return the first legal move found
            return legalPotentialMoves[0];
        }
    }
    
    // If we have potential moves but none are legal (or no legal moves provided)
    if (potentialMoves.length > 0) {
        // Return the first potential move found
        return potentialMoves[0];
    }
    
    // If we still couldn't find a valid move, return the first line
    // This is a last resort and might be more useful than empty string
    const firstLine = cleanedResponse.split('\n')[0].trim();
    if (firstLine.length > 0 && firstLine.length < 10) {
        return firstLine;
    }
    
    // Nothing found, return the original (but trimmed) response
    return cleanedResponse;
}

// Expose the functions globally via the namespace
window.GrokModels.sendGrokRequest = sendGrokRequest;
window.GrokModels.streamGrokResponse = streamGrokResponse;
